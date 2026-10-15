import type { ApiClient } from "./api"
import { CONSENT_FIELD_ELEMENT_NAME } from "./constants"
import type { Decisions } from "./decisions"
import { OverturoValidationError } from "./errors"
import { interceptSubmit, resolveForm } from "./forms/intercept"
import { decisionsFor, resolveControl } from "./forms/presentation"
import { sanitisedSnapshot } from "./forms/snapshot"
import type { DecisionToken, FormCaptureOptions, FormCaptureResult } from "./types"

/** 201 — the one-call capture endpoint. */
const CAPTURE_PATH = "/api/v1/decisions/capture"

interface CaptureResponse {
  capture: {
    sessionToken: string
    attestationId: string
    committed: boolean
    wordingVerdict?: string | null
    recordId?: string | null
  }
}

/** 202 — what the facade needs from `<overturo-consent-field>` (the field entry is loaded explicitly; the core never imports it). */
interface ConsentFieldLike extends HTMLElement {
  attachTo(form: HTMLFormElement, opts: FormCaptureOptions, client: { flowBaseUrl: string; publishableKey: string }): () => void
}

/**
 * 201 D4 Level B — Form Capture: the organisation keeps its form; Overturo
 * keeps the record. `attach` intercepts the form's submit, reads the mapped
 * consent controls (decision + presentation as shown), posts one capture
 * with the publishable key, writes the capture token into a hidden input and
 * lets the submission proceed. If Overturo is unreachable the form still
 * submits and `onError` fires. Writes nothing to client storage.
 *
 * @example
 * ```ts
 * overturo.forms.attach({
 *   flowId: "flw_...",
 *   form: "#signup",
 *   map: { marketing: "#marketing_opt_in", analytics: "#analytics" },
 *   subjectField: "#email",
 * })
 * ```
 */
export class FormsFacade {
  constructor(
    private readonly api: ApiClient,
    private readonly decisions: Decisions,
    private readonly flowBaseUrl: string,
    private readonly publishableKey: string
  ) {}

  /** Wires the capture onto the form; returns a detach function. */
  attach(opts: FormCaptureOptions): () => void {
    if (!opts.flowId) throw new OverturoValidationError("flowId is required")
    const form = resolveForm(opts.form)
    if (opts.field) return this.attachField(form, opts)
    const map = opts.map
    if (!map || Object.keys(map).length === 0) throw new OverturoValidationError("map must name at least one purpose (or pass field)")
    // What the person first saw: a control ticked by script at load counts as
    // shown ticked by default, whatever its HTML attribute says.
    const initiallyChecked = initialCheckedState(form, map)
    if (opts.wording) void this.writeWording(form, opts)
    return interceptSubmit(form, opts, async () => {
      const unresolved = Object.entries(map).filter(([, selector]) => !resolveControl(form, selector))
      if (unresolved.length) {
        throw new OverturoValidationError(`consent control not found for: ${unresolved.map(([p]) => p).join(", ")}`)
      }
      const body = this.buildCaptureBody(form, opts, initiallyChecked)
      const digests = await this.labelDigests(form, opts)
      if (digests) body.noticeHashes = digests
      const raw = await this.api.post<CaptureResponse>(CAPTURE_PATH, body)
      const result: FormCaptureResult = {
        token: raw.capture.sessionToken as DecisionToken,
        attestationId: raw.capture.attestationId,
        committed: raw.capture.committed,
        wordingVerdict: raw.capture.wordingVerdict ?? null,
        recordId: raw.capture.recordId ?? null,
      }
      opts.onCaptured?.(result)
      return { token: result.token }
    })
  }

  /**
   * 202 D9 — the embedded consent field: the control is Overturo-rendered
   * inside the form, so the element does the capture from its own frame. The
   * field entry (`@overturo/js/field` / `overturo-field.js`) must be loaded;
   * one field per flow per form.
   */
  private attachField(form: HTMLFormElement, opts: FormCaptureOptions): () => void {
    const element = resolveField(form, opts.field!)
    const flow = element.getAttribute("flow")
    if (flow && flow !== opts.flowId) throw new OverturoValidationError("the field's flow attribute must match flowId")
    const duplicate = Array.from(form.querySelectorAll(CONSENT_FIELD_ELEMENT_NAME)).some(
      (el) => el !== element && (el.getAttribute("flow") || opts.flowId) === opts.flowId
    )
    if (duplicate) throw new OverturoValidationError("duplicate_field: one consent field per flow per form")
    return element.attachTo(form, opts, { flowBaseUrl: this.flowBaseUrl, publishableKey: this.publishableKey })
  }

  /** Builds the capture body the way `attach` does — exposed for integrators who post themselves. */
  buildCaptureBody(
    form: HTMLFormElement,
    opts: FormCaptureOptions,
    initiallyChecked: Record<string, boolean> = {}
  ): Record<string, unknown> {
    const subject = resolveControl(form, opts.subjectField)
    const external = opts.externalIdField ? resolveControl(form, opts.externalIdField) : null
    const map = opts.map ?? {}
    const body: Record<string, unknown> = {
      flowId: opts.flowId,
      decisions: decisionsFor(form, map, initiallyChecked),
      subject: {
        email: subject?.value?.trim() || undefined,
        externalId: external?.value?.trim() || undefined,
      },
      snapshot: sanitisedSnapshot(form, Object.values(map)),
      pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
      formId: form.getAttribute("id") || undefined,
    }
    if (opts.commit) body.commit = true
    if (opts.locale) body.locale = opts.locale
    return body
  }

  /**
   * 201 D11 — the digest of each mapped label's text as the person saw it
   * (a 256-bit digest of the trimmed text — the algorithm the forms
   * documentation publishes), so the record can
   * say whether the form's wording matched the wording published for the flow.
   * Needs `labels` (purpose → label selector) and WebCrypto; otherwise nothing is attested.
   */
  async labelDigests(form: HTMLFormElement, opts: FormCaptureOptions): Promise<Record<string, string> | undefined> {
    const labels = opts.labels ?? opts.wording
    if (!labels || typeof crypto === "undefined" || !crypto.subtle) return undefined
    const out: Record<string, string> = {}
    for (const [purpose, selector] of Object.entries(labels)) {
      const text = form.querySelector(selector)?.textContent?.trim()
      if (!text) continue
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)) // audit-public-language: allow (the WebCrypto algorithm identifier)
      out[purpose] = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    }
    return Object.keys(out).length ? out : undefined
  }

  /** 201 D11 — writes the published wording into the labels the integrator names. */
  async writeWording(form: HTMLFormElement, opts: FormCaptureOptions): Promise<void> {
    if (!opts.wording) return
    try {
      const disclosures = await this.decisions.discover({ flowId: opts.flowId, locale: opts.locale })
      for (const [purpose, selector] of Object.entries(opts.wording)) {
        const target = form.querySelector(selector)
        const row = disclosures.purposes.find((p) => p.name === purpose)
        if (target && row) replaceText(target, row.description ?? row.label)
      }
    } catch (e) {
      opts.onError?.(e as Error)
    }
  }
}

/** Replaces the text of a label without removing a control nested inside it. */
function replaceText(target: Element, text: string): void {
  const textNodes = Array.from(target.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)
  if (textNodes.length === 0 || target.children.length === 0) {
    if (target.children.length === 0) target.textContent = text
    else target.appendChild(document.createTextNode(" " + text))
    return
  }
  textNodes.forEach((n, i) => {
    n.textContent = i === 0 ? text : ""
  })
}

function initialCheckedState(form: HTMLFormElement, map: Record<string, string>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [purpose, selector] of Object.entries(map)) {
    const control = resolveControl(form, selector)
    if (control) out[purpose] = control.checked
  }
  return out
}

function resolveField(form: HTMLFormElement, field: HTMLElement | string): ConsentFieldLike {
  const el = typeof field === "string" ? form.querySelector(field) || document.querySelector(field) : field
  if (!(el instanceof HTMLElement) || el.tagName.toLowerCase() !== CONSENT_FIELD_ELEMENT_NAME) {
    throw new OverturoValidationError(`field must resolve to an <${CONSENT_FIELD_ELEMENT_NAME}> element`)
  }
  if (typeof (el as ConsentFieldLike).attachTo !== "function") {
    throw new OverturoValidationError("field_entry_not_loaded: load @overturo/js/field (overturo-field.js) before attaching a field")
  }
  return el as ConsentFieldLike
}

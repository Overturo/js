// 202 — `<overturo-consent-field>`: an Overturo-rendered consent control
// placed inside the organisation's own form (Level C of 201 D4).
//
// Usage:
//   <script src="https://overturo.com/sdk/v1/overturo.js"></script>
//   <script src="https://overturo.com/sdk/v1/overturo-field.js"></script>
//   <form id="signup">
//     <input id="email" name="email">
//     <overturo-consent-field name="consent" flow="flw_…"></overturo-consent-field>
//   </form>
//   overturo.forms.attach({ flowId: "flw_…", form: "#signup", field: "overturo-consent-field", subjectField: "#email" })
//
// The element renders nothing itself: it mounts the field document (served
// by the trust host, no session) in a sandboxed frame, speaks the field-v1
// protocol with it, and is a form-associated control to the host form (its
// value is the capture token once captured). It never fetches anything.

import { FIELD_DOCUMENT_PATH, FIELD_ELEMENT_NAME, FIELD_MESSAGE_TYPES } from "./constants"
import { DEFAULT_BASE_URL } from "../constants"
import { encodeAppearance } from "./appearance"
import { fieldEnvelope, validateField, type FieldEnvelope } from "./protocol"
import { interceptSubmit } from "../forms/intercept"
import { resolveControl } from "../forms/presentation"
import type { FormCaptureOptions, FormCaptureResult, DecisionToken } from "../types"

export const FIELD_ALREADY_DEFINED_CODE = "OVERTURO_FIELD_ELEMENT_ALREADY_DEFINED"

export interface FieldCaptureRequest {
  subject?: { email?: string; external_id?: string }
  pageUrl?: string
  formId?: string
  submitter?: string | null
  commit?: boolean
}

export interface FieldCaptureResult {
  token: string
  committed: boolean
  recordId: string | null
}

export class FieldCaptureError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message || code)
    this.name = "FieldCaptureError"
    this.code = code
  }
}

interface PendingCapture {
  resolve: (result: FieldCaptureResult) => void
  reject: (error: Error) => void
}

export class ConsentFieldElement extends HTMLElement {
  static formAssociated = true
  static observedAttributes = ["flow", "purposes", "locale", "theme", "name", "appearance", "publishable-key", "base-url"]

  #internals: ElementInternals | null = null
  #shadow: ShadowRoot
  #iframe: HTMLIFrameElement | null = null
  #ac: AbortController | null = null
  #frameOrigin = ""
  #ready = false
  #value = ""
  #decisions: Record<string, "granted" | "declined"> = {}
  #pending: PendingCapture | null = null

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "open" })
    // jsdom (the unit tests) has no ElementInternals; the element still works, minus form association.
    if (typeof this.attachInternals === "function") {
      try {
        this.#internals = this.attachInternals()
      } catch {
        this.#internals = null
      }
    }
  }

  /** The capture token once captured; empty before. */
  get value(): string {
    return this.#value
  }

  /** The host form this control belongs to (form association), if any. */
  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? this.closest("form")
  }

  /** The last STATE the frame reported. */
  get decisions(): Record<string, "granted" | "declined"> {
    return { ...this.#decisions }
  }

  get ready(): boolean {
    return this.#ready
  }

  connectedCallback(): void {
    // A custom element is inline by default: its box would have no height and
    // the host form's following controls would overlap the frame (and swallow
    // clicks). The field takes the row it sits on.
    if (!this.style.display) this.style.display = "block"
    if (!this.hasAttribute("role")) this.setAttribute("role", "group")
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", this.getAttribute("name") || "Consent choices")
    this.setAttribute("aria-busy", "true")
    this.#mount()
  }

  disconnectedCallback(): void {
    this.#teardown()
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.isConnected) return
    if (name === "name") {
      // The accessible name only: the frame stays, a pending capture stays.
      this.setAttribute("aria-label", newValue || "Consent choices")
      if (this.#iframe) this.#iframe.title = newValue || "Consent choices"
      return
    }
    this.#teardown()
    this.#mount()
  }

  /** The facade's handoff: the trust-host base and the publishable key the client was built with. */
  configure(opts: { flowBaseUrl: string; publishableKey: string }): void {
    this.setAttribute("base-url", opts.flowBaseUrl.replace(/\/+$/, ""))
    this.setAttribute("publishable-key", opts.publishableKey)
    if (this.isConnected && !this.#iframe) this.#mount()
  }

  /** Asks the frame to capture; resolves on COMPLETE, rejects on ERROR. */
  capture(request: FieldCaptureRequest): Promise<FieldCaptureResult> {
    return new Promise<FieldCaptureResult>((resolve, reject) => {
      if (!this.#ready || !this.#frameOrigin) {
        reject(new FieldCaptureError("field_not_ready", "The consent field has not finished loading."))
        return
      }
      if (this.#pending) {
        reject(new FieldCaptureError("capture_in_flight", "A capture is already in progress; the first one answers."))
        return
      }
      this.#pending = { resolve, reject }
      this.#post(FIELD_MESSAGE_TYPES.CAPTURE, {
        subject: request.subject ?? {},
        page_url: request.pageUrl ?? null,
        form_id: request.formId ?? null,
        submitter: request.submitter ?? null,
        commit: request.commit === true,
      })
    })
  }

  /**
   * 202 D9 — the facade's handoff (`overturo.forms.attach({ field })` lands
   * here): the 201 submit interception is reused unchanged in shape, and the
   * capture is asked of this element instead of being read from the DOM.
   */
  attachTo(form: HTMLFormElement, opts: FormCaptureOptions, client: { flowBaseUrl: string; publishableKey: string }): () => void {
    if (!this.getAttribute("flow")) this.setAttribute("flow", opts.flowId)
    if (opts.locale && !this.getAttribute("locale")) this.setAttribute("locale", opts.locale)
    this.configure(client)
    return interceptSubmit(form, opts, async ({ submitter }) => {
      const subject = resolveControl(form, opts.subjectField)
      const external = opts.externalIdField ? resolveControl(form, opts.externalIdField) : null
      const outcome = await this.capture({
        subject: { email: subject?.value?.trim() || undefined, external_id: external?.value?.trim() || undefined },
        pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
        formId: form.getAttribute("id") || undefined,
        submitter: submitter?.getAttribute("name") ?? null,
        commit: opts.commit === true,
      })
      const result: FormCaptureResult = {
        token: outcome.token as DecisionToken,
        attestationId: "",
        committed: outcome.committed,
        wordingVerdict: "match",
        recordId: outcome.recordId,
      }
      opts.onCaptured?.(result)
      return { token: outcome.token }
    })
  }

  /** Returns every control to its rendered state and clears the token. */
  reset(): void {
    this.#post(FIELD_MESSAGE_TYPES.RESET, {})
    this.#setValue("")
  }

  /** Form-associated hook: the host form was reset. */
  formResetCallback(): void {
    this.reset()
  }

  #mount(): void {
    const flow = this.getAttribute("flow")
    const key = this.getAttribute("publishable-key")
    if (!flow || !key) return // wait for the facade's configure() or the attributes
    const base = (this.getAttribute("base-url") || defaultBaseUrl()).replace(/\/+$/, "")
    const url = new URL(`${base}${FIELD_DOCUMENT_PATH}/${encodeURIComponent(flow)}`)
    url.searchParams.set("pk", key)
    for (const attr of ["locale", "purposes", "theme"] as const) {
      const value = this.getAttribute(attr)
      if (value) url.searchParams.set(attr, value)
    }
    const appearance = this.getAttribute("appearance")
    if (appearance) {
      try {
        url.hash = encodeAppearance(JSON.parse(appearance))
      } catch {
        url.hash = ""
      }
    }
    this.#frameOrigin = url.origin

    const iframe = document.createElement("iframe")
    iframe.src = url.toString()
    iframe.title = this.getAttribute("name") || "Consent choices"
    // No `allow-forms`: the frame captures with fetch; `allow-popups` for the receipt-explanation link.
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups")
    iframe.setAttribute("referrerpolicy", "strict-origin")
    iframe.style.cssText = "width:100%;height:0;border:0;display:block;background:transparent;"
    const nonce = readCspNonce()
    if (nonce) iframe.setAttribute("nonce", nonce)
    iframe.addEventListener("error", () => {
      this.#emit("field:error", { code: "iframe_load_failed", message: "The consent field failed to load." })
      this.setAttribute("aria-busy", "false")
    })

    this.#ac = new AbortController()
    window.addEventListener("message", this.#onMessage, { signal: this.#ac.signal })
    this.#iframe = iframe
    this.#shadow.appendChild(iframe)
  }

  #onMessage = (event: MessageEvent): void => {
    if (!this.#iframe || event.origin !== this.#frameOrigin) return
    // Only our own frame: a synthetic event with no source (any script on the
    // host page can dispatch one) or another frame at the trust origin is not it.
    const source = this.#iframe.contentWindow
    if (!source || event.source !== source) return
    const result = validateField(event.data)
    if (!result.valid) {
      this.#emit("field:error", { code: "protocol_violation" })
      return
    }
    const envelope = event.data as FieldEnvelope
    switch (envelope.type) {
      case FIELD_MESSAGE_TYPES.READY:
        this.#ready = true
        this.setAttribute("aria-busy", "false")
        this.#post(FIELD_MESSAGE_TYPES.INIT, this.getAttribute("locale") ? { locale: this.getAttribute("locale") } : {})
        this.#emit("field:ready", {})
        break
      case FIELD_MESSAGE_TYPES.STATE:
        this.#decisions = { ...(envelope.payload.decisions as Record<string, "granted" | "declined">) }
        this.#emit("field:state", { decisions: this.decisions })
        break
      case FIELD_MESSAGE_TYPES.RESIZE: {
        const height = (envelope.payload as { height?: number }).height
        if (typeof height === "number" && this.#iframe) this.#iframe.style.height = `${height}px`
        break
      }
      case FIELD_MESSAGE_TYPES.COMPLETE: {
        const payload = envelope.payload as { token: string; committed: boolean; record_id?: string | null }
        this.#setValue(payload.token)
        const outcome: FieldCaptureResult = { token: payload.token, committed: payload.committed === true, recordId: payload.record_id ?? null }
        this.#pending?.resolve(outcome)
        this.#pending = null
        this.#emit("field:complete", outcome)
        break
      }
      case FIELD_MESSAGE_TYPES.ERROR: {
        const payload = envelope.payload as { code: string; message?: string }
        this.#pending?.reject(new FieldCaptureError(payload.code, payload.message))
        this.#pending = null
        this.#emit("field:error", payload)
        break
      }
      case FIELD_MESSAGE_TYPES.SUBMIT_REQUESTED:
        this.form?.requestSubmit?.()
        break
    }
  }

  #post(type: (typeof FIELD_MESSAGE_TYPES)[keyof typeof FIELD_MESSAGE_TYPES], payload: Record<string, unknown>): void {
    const target = this.#iframe?.contentWindow
    if (!target || !this.#frameOrigin) return
    try {
      target.postMessage(fieldEnvelope(type, payload), this.#frameOrigin)
    } catch {
      // the frame went away
    }
  }

  #setValue(token: string): void {
    this.#value = token
    // jsdom's ElementInternals has no setFormValue; a real browser's does.
    if (this.#internals && typeof this.#internals.setFormValue === "function") this.#internals.setFormValue(token || null)
  }

  #emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }

  #teardown(): void {
    this.#ac?.abort()
    this.#ac = null
    if (this.#iframe?.parentNode) this.#iframe.parentNode.removeChild(this.#iframe)
    this.#iframe = null
    this.#ready = false
    this.#frameOrigin = ""
    this.#pending?.reject(new FieldCaptureError("field_unmounted"))
    this.#pending = null
    this.setAttribute("aria-busy", "true")
  }
}

function readCspNonce(): string | null {
  if (typeof document === "undefined") return null
  return document.querySelector('meta[name="csp-nonce"]')?.getAttribute("content") ?? null
}

/** The trust host the core defaults to; the host page's own origin serves no field document. */
function defaultBaseUrl(): string {
  return DEFAULT_BASE_URL
}

/** Registers `<overturo-consent-field>` once; warns and skips when already defined. */
export function registerConsentFieldElement(): void {
  if (typeof customElements === "undefined") return
  if (customElements.get(FIELD_ELEMENT_NAME)) {
    // eslint-disable-next-line no-console
    console.warn("[overturo:sdk]", FIELD_ALREADY_DEFINED_CODE, `<${FIELD_ELEMENT_NAME}> already registered; skipping.`)
    return
  }
  customElements.define(FIELD_ELEMENT_NAME, ConsentFieldElement)
}

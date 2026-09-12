// `<overturo-decision>` custom element. NET-NEW
// (no `<overturoid-button>` exists in v0 despite CLAUDE.md's claim).
//
// Usage:
//   <overturo-decision token="ds_…" mode="embed"></overturo-decision>
//   document.querySelector("overturo-decision")
//     .addEventListener("decision:complete", (e) => console.log(e.detail));
//
// Plan: Phase D.

import { validate, type Envelope } from "../postmessage_v2"
import { MESSAGE_TYPES_V2 } from "../constants"
import type { DecisionMode } from "../types"

export const ELEMENT_NAME = "overturo-decision"
export const ALREADY_DEFINED_CODE = "OVERTURO_ELEMENT_ALREADY_DEFINED"

/**
 * Reads `token` + `mode` + `theme` attributes; mounts the trust-host
 * iframe under a Shadow DOM root; emits CustomEvents for every
 * lifecycle transition. Consumers can subscribe with bare DOM APIs
 * (no SDK initialisation required for the simple case).
 *
 * Events fired (all CustomEvent):
 *   `decision:ready`     — `detail` is the READY payload
 *   `decision:state`     — `detail = {kind, payload}`
 *   `decision:complete`  — `detail = {kind, payload}`
 *   `decision:cancel`    — `detail` is the CANCEL payload
 *   `decision:error`     — `detail` is the ERROR payload
 *   `decision:deadline`  — `detail` is the DEADLINE payload
 */
export class DecisionElement extends HTMLElement {
  static observedAttributes = ["token", "mode", "theme", "flow-base-url"]

  #shadow: ShadowRoot
  #iframe: HTMLIFrameElement | null = null
  #ac: AbortController | null = null
  #errorRegion: HTMLDivElement | null = null

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "open" })
  }

  connectedCallback(): void {
    if (!this.hasAttribute("role")) this.setAttribute("role", "region")
    if (!this.hasAttribute("aria-label")) {
      this.setAttribute("aria-label", "Loading decision")
    }
    this.setAttribute("aria-busy", "true")
    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0")
    this.addEventListener("keydown", this.#onKey)
    this.#mount()
  }

  disconnectedCallback(): void {
    this.removeEventListener("keydown", this.#onKey)
    this.#teardown()
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return
    if (!this.isConnected) return
    if (name === "token" || name === "mode" || name === "flow-base-url" || name === "theme") {
      // `theme` re-mounts so the iframe URL picks up the new
      // ?theme= query param. Costlier than CSS hot-swap but the
      // trust-host renders themed templates server-side; client-side
      // swap would require a postMessage round-trip and a kind-aware
      // theme schema, both out of v1 scope.
      this.#teardown()
      this.#mount()
    }
  }

  #mount(): void {
    const token = this.getAttribute("token")
    if (!token) return // wait for attribute
    const mode = (this.getAttribute("mode") as DecisionMode) ?? "embed"
    const flowBaseUrl = this.getAttribute("flow-base-url") ?? defaultFlowBaseUrl()
    if (mode !== "embed") {
      // Popup + redirect modes don't make sense without JS interaction;
      // the element falls back to rendering a link the user clicks.
      this.#renderClickToOpen(flowBaseUrl, token, mode)
      return
    }

    // Append `?theme=…` to the URL if the host page set the `theme`
    // attribute. The trust-host server reads it from the query string
    // and applies the matching theme tokens. Unknown themes fall back
    // to the surface's default — no client-side validation needed.
    const themeAttr = this.getAttribute("theme")
    const baseUrl = `${flowBaseUrl.replace(/\/+$/, "")}/decisions/${token}/embed`
    const url = themeAttr ? `${baseUrl}?theme=${encodeURIComponent(themeAttr)}` : baseUrl
    const expectedOrigin = new URL(url).origin

    const iframe = document.createElement("iframe")
    iframe.src = url
    iframe.title = "Overturo decision form"
    iframe.setAttribute("allow", "popups")
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-popups")
    iframe.style.cssText = "width:100%;min-height:400px;border:0;background:transparent;"
    if (themeAttr) iframe.dataset.theme = themeAttr
    const nonce = readCspNonce()
    if (nonce) iframe.setAttribute("nonce", nonce)

    // Iframe-level error (CSP rejection, blocked origin). Match
    // decisions.embed's error handling: bubble an event with stable
    // code so consumers don't have to distinguish in the message
    // handler.
    iframe.addEventListener("error", () => {
      this.dispatchEvent(
        new CustomEvent("decision:error", {
          detail: {
            code: "iframe_load_failed",
            message: "The trust-host iframe failed to load.",
          },
          bubbles: true,
          composed: true,
        })
      )
      this.setAttribute("aria-busy", "false")
    })

    this.#ac = new AbortController()
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== expectedOrigin) return
      const result = validate(event.data)
      if (!result.valid) {
        this.#emitError({ code: "protocol_violation" })
        return
      }
      this.#handleEnvelope(event.data as Envelope, iframe)
    }
    window.addEventListener("message", onMessage, { signal: this.#ac.signal })

    this.#iframe = iframe
    this.#shadow.appendChild(iframe)
  }

  #renderClickToOpen(flowBaseUrl: string, token: string, mode: DecisionMode): void {
    const a = document.createElement("a")
    a.href = `${flowBaseUrl.replace(/\/+$/, "")}/decisions/${token}`
    a.target = mode === "popup" ? "_blank" : "_self"
    a.rel = "noopener noreferrer"
    a.textContent = "Open decision"
    a.style.cssText = "display:inline-block;padding:0.5em 1em;text-decoration:none;"
    this.#shadow.appendChild(a)
    this.setAttribute("aria-busy", "false")
  }

  #handleEnvelope(envelope: Envelope, iframe: HTMLIFrameElement): void {
    switch (envelope.type) {
      case MESSAGE_TYPES_V2.READY: {
        this.setAttribute("aria-busy", "false")
        // Prefer `payload.title` then fall back to the
        // branding application_name from the schema-required `branding`
        // object. The trust-host MAY ship either; we read both.
        const payload = (envelope.payload ?? {}) as {
          title?: string
          branding?: { application_name?: string }
        }
        const labelSource =
          (typeof payload.title === "string" ? payload.title : null) ?? payload.branding?.application_name ?? null
        if (labelSource) {
          this.setAttribute("aria-label", labelSource)
        }
        this.dispatchEvent(new CustomEvent("decision:ready", { detail: envelope.payload }))
        break
      }
      case MESSAGE_TYPES_V2.STATE:
        this.dispatchEvent(
          new CustomEvent("decision:state", {
            detail: { kind: envelope.kind, payload: envelope.payload },
          })
        )
        break
      case MESSAGE_TYPES_V2.RESIZE: {
        const height = (envelope.payload as { height?: number }).height
        if (typeof height === "number") iframe.style.height = `${height}px`
        break
      }
      case MESSAGE_TYPES_V2.COMPLETE:
        this.dispatchEvent(
          new CustomEvent("decision:complete", {
            detail: { kind: envelope.kind, payload: envelope.payload },
            bubbles: true,
            composed: true,
          })
        )
        break
      case MESSAGE_TYPES_V2.CANCEL:
        this.dispatchEvent(
          new CustomEvent("decision:cancel", {
            detail: envelope.payload,
            bubbles: true,
            composed: true,
          })
        )
        break
      case MESSAGE_TYPES_V2.ERROR:
        this.#emitError(envelope.payload as Record<string, unknown>)
        break
      case MESSAGE_TYPES_V2.DEADLINE:
        this.dispatchEvent(new CustomEvent("decision:deadline", { detail: envelope.payload }))
        break
    }
  }

  #emitError(payload: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent("decision:error", { detail: payload, bubbles: true }))
    // Screen-reader announcement ("screen-reader-only").
    if (!this.#errorRegion) {
      this.#errorRegion = document.createElement("div")
      this.#errorRegion.setAttribute("role", "alert")
      this.#errorRegion.setAttribute("aria-live", "assertive")
      this.#errorRegion.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);"
      this.#shadow.appendChild(this.#errorRegion)
    }
    const msg =
      typeof payload.message === "string" ? (payload.message as string) : "An error occurred. Please try again."
    this.#errorRegion.textContent = msg
    // Auto-clear so a subsequent error fires another announcement.
    window.setTimeout(() => {
      if (this.#errorRegion) this.#errorRegion.textContent = ""
    }, 30_000)
  }

  #teardown(): void {
    if (this.#ac) {
      this.#ac.abort()
      this.#ac = null
    }
    if (this.#iframe && this.#iframe.parentNode) {
      this.#iframe.parentNode.removeChild(this.#iframe)
    }
    this.#iframe = null
    // Reset slotted error region (but keep the host's aria attributes
    // so consumers see a stable shape across re-mounts).
    if (this.#errorRegion) {
      this.#errorRegion.textContent = ""
    }
    this.setAttribute("aria-busy", "true")
  }

  #onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.dispatchEvent(
        new CustomEvent("decision:cancel", {
          detail: { reason: "user_pressed_esc" },
          bubbles: true,
          composed: true,
        })
      )
      this.#teardown()
    }
  }
}

function readCspNonce(): string | null {
  if (typeof document === "undefined") return null
  const meta = document.querySelector('meta[name="csp-nonce"]')
  return meta?.getAttribute("content") ?? null
}

function defaultFlowBaseUrl(): string {
  // Best-effort: same-origin. Consumers using a different trust host
  // MUST set the `flow-base-url` attribute (e.g. via a small inline
  // script that mirrors the SDK constructor's `flowBaseUrl`).
  if (typeof window !== "undefined") return window.location.origin
  return "https://overturo.com"
}

/**
 * Default registration. Side-effect import from `src/elements/index.ts`
 * triggers this on bundle load. Skipped (with a console warning) if
 * the element is already registered.
 */
export function registerDecisionElement(): void {
  if (typeof customElements === "undefined") return
  if (customElements.get(ELEMENT_NAME)) {
    // eslint-disable-next-line no-console
    console.warn("[overturo:sdk]", ALREADY_DEFINED_CODE, `<${ELEMENT_NAME}> already registered; skipping.`)
    return
  }
  customElements.define(ELEMENT_NAME, DecisionElement)
}

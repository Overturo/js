import { EMBED_DEFAULTS, MESSAGE_TYPES_V2 } from "./constants"
import { resolveContainer, applyStyle } from "./dom"
import { validate, type Envelope } from "./postmessage_v2"
import type { EmbedHandle, EmbedOptions } from "./types"

/**
 * Creates an embedded consent or approval flow in an iframe.
 *
 * Consumer dispatch is now kind-aware: the host's callbacks
 * receive the kind discriminator alongside the payload so a single SDK can
 * route consent-shaped vs. approval-shaped completions correctly. Inbound
 * messages are validated against the v2 envelope + per-kind-per-type
 * schemas; invalid envelopes are dropped (warn-logged in development).
 */
export function createEmbed(baseUrl: string, options: EmbedOptions): EmbedHandle {
  const container = resolveContainer(options.container)
  const expectedOrigin = new URL(baseUrl).origin
  const embedUrl = `${baseUrl}/accord/embed/${options.sessionToken}`

  container.innerHTML = ""
  if (options.loading) {
    const loadingEl = document.createElement("div")
    loadingEl.setAttribute("data-overturo-loading", "")
    if (typeof options.loading === "string") {
      loadingEl.innerHTML = options.loading
    } else {
      loadingEl.appendChild(options.loading)
    }
    container.appendChild(loadingEl)
  }

  const iframe = document.createElement("iframe")
  iframe.src = embedUrl
  // No `allow=` — `popups` is not a Permissions-Policy feature.
  // Popup-opening is governed by sandbox's allow-popups below.
  iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-popups")

  applyStyle(iframe, { ...EMBED_DEFAULTS }, options.style)

  iframe.addEventListener("load", () => {
    const loadingChild = container.querySelector("[data-overturo-loading]")
    if (loadingChild) container.removeChild(loadingChild)
  })

  const ac = new AbortController()

  function handleMessage(event: MessageEvent): void {
    if (event.origin !== expectedOrigin) return

    const result = validate(event.data)
    if (!result.valid) return

    const envelope = event.data as Envelope

    switch (envelope.type) {
      case MESSAGE_TYPES_V2.READY:
        options.onReady?.(envelope.payload)
        break
      case MESSAGE_TYPES_V2.RESIZE: {
        const height = (envelope.payload as { height?: number }).height
        if (typeof height === "number") {
          iframe.style.height = `${height}px`
          options.onResize?.(height)
        }
        break
      }
      case MESSAGE_TYPES_V2.STATE:
        options.onState?.(envelope.kind, envelope.payload)
        break
      case MESSAGE_TYPES_V2.DEADLINE:
        options.onDeadline?.(envelope.payload)
        break
      case MESSAGE_TYPES_V2.COMPLETE:
        options.onComplete?.(envelope.kind, envelope.payload)
        break
      case MESSAGE_TYPES_V2.CANCEL:
        options.onCancel?.(envelope.payload)
        break
      case MESSAGE_TYPES_V2.ERROR:
        options.onError?.(envelope.payload)
        break
    }
  }

  window.addEventListener("message", handleMessage, { signal: ac.signal })
  container.appendChild(iframe)

  return {
    iframe,
    destroy(): void {
      ac.abort()
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    },
  }
}

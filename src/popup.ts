import { MESSAGE_TYPES_V2, POPUP_DEFAULTS } from "./constants"
import { OverturoError, OverturoValidationError } from "./errors"
import { validate, type Envelope } from "./postmessage_v2"
import type { PopupHandle, PopupOptions } from "./types"

let popupCounter = 0

/**
 * Opens a consent or approval flow in a popup window.
 *
 * Validates inbound v2 envelopes and routes terminal types
 * (COMPLETE, CANCEL, ERROR) to the host callbacks with kind discrimination.
 */
export function createPopup(baseUrl: string, options: PopupOptions): PopupHandle {
  if (!options.sessionToken) {
    throw new OverturoValidationError("sessionToken is required for popup mode")
  }

  const embedUrl = `${baseUrl}/accord/embed/${options.sessionToken}`
  const width = options.width ?? POPUP_DEFAULTS.width
  const height = options.height ?? POPUP_DEFAULTS.height
  const left = Math.round((screen.width - width) / 2)
  const top = Math.round((screen.height - height) / 2)

  const windowName = `overturo_decision_${++popupCounter}`
  const popup = window.open(
    embedUrl,
    windowName,
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
  )

  if (!popup) {
    throw new OverturoError("Popup was blocked by the browser. Allow popups for this site and try again.")
  }

  const expectedOrigin = new URL(baseUrl).origin
  const ac = new AbortController()

  function handleMessage(event: MessageEvent): void {
    if (event.origin !== expectedOrigin) return

    const result = validate(event.data)
    if (!result.valid) return

    const envelope = event.data as Envelope

    switch (envelope.type) {
      case MESSAGE_TYPES_V2.COMPLETE:
        options.onComplete?.(envelope.kind, envelope.payload)
        cleanup()
        break
      case MESSAGE_TYPES_V2.CANCEL:
        options.onCancel?.(envelope.payload)
        cleanup()
        break
      case MESSAGE_TYPES_V2.ERROR:
        options.onError?.(envelope.payload)
        break
    }
  }

  function cleanup(): void {
    ac.abort()
    if (popup && !popup.closed) popup.close()
  }

  window.addEventListener("message", handleMessage, { signal: ac.signal })

  return { close: cleanup }
}

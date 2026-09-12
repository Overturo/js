import { EMBED_DEFAULTS, SETUP_MESSAGE_TYPES, SETUP_POPUP_DEFAULTS } from "./constants"
import { resolveContainer, applyStyle } from "./dom"
import type {
  AccordSetupOptions,
  AccordSetupPopupOptions,
  AccordSetupRedirectOptions,
  AccordSetupResult,
  SetupHandle,
  SetupPopupHandle,
  SetupStep,
} from "./types"

/**
 * Creates an AccordSetup wizard embedded in an iframe.
 *
 * @param baseUrl - The Overturo base URL
 * @param options - Setup options including session token, container, and callbacks
 * @returns Handle with iframe reference and destroy method
 */
export function createSetupEmbed(baseUrl: string, options: AccordSetupOptions & { sessionToken: string }): SetupHandle {
  const container = resolveContainer(options.container)
  const expectedOrigin = new URL(baseUrl).origin
  const embedUrl = `${baseUrl}/accord_setup/embed/${options.sessionToken}`

  // Clear container and show loading state
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
  iframe.setAttribute("allow", "popups")
  iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-popups")

  applyStyle(iframe, { ...EMBED_DEFAULTS }, options.style)

  // Remove loading state when iframe loads
  iframe.addEventListener("load", () => {
    const loadingChild = container.querySelector("[data-overturo-loading]")
    if (loadingChild) container.removeChild(loadingChild)
  })

  const ac = new AbortController()

  function handleMessage(event: MessageEvent): void {
    if (event.origin !== expectedOrigin) return

    const data = event.data
    if (!data || !data.type) return

    switch (data.type) {
      case SETUP_MESSAGE_TYPES.READY:
        options.onReady?.()
        break
      case SETUP_MESSAGE_TYPES.RESIZE:
        if (data.height) {
          iframe.style.height = `${data.height}px`
          options.onResize?.(data.height)
        }
        break
      case SETUP_MESSAGE_TYPES.STEP:
        options.onStep?.({
          key: data.step,
          index: data.stepIndex,
          total: data.totalSteps,
        } as SetupStep)
        break
      case SETUP_MESSAGE_TYPES.CREATED:
        options.onCreated?.({
          accordId: data.accordId,
          flowId: data.flowId,
        } as AccordSetupResult)
        break
      case SETUP_MESSAGE_TYPES.CANCEL:
        options.onCancel?.()
        break
      case SETUP_MESSAGE_TYPES.ERROR:
        options.onError?.(data.error)
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

/**
 * Opens the AccordSetup wizard in a popup window.
 *
 * @param baseUrl - The Overturo base URL
 * @param options - Popup options including session token and callbacks
 * @returns Handle with close method
 */
export function createSetupPopup(
  baseUrl: string,
  options: AccordSetupPopupOptions & { sessionToken: string }
): SetupPopupHandle {
  const embedUrl = `${baseUrl}/accord_setup/embed/${options.sessionToken}`
  const expectedOrigin = new URL(baseUrl).origin

  const w = options.width ?? SETUP_POPUP_DEFAULTS.width
  const h = options.height ?? SETUP_POPUP_DEFAULTS.height
  const left = Math.round((screen.width - w) / 2)
  const top = Math.round((screen.height - h) / 2)

  const popup = window.open(
    embedUrl,
    "accord_setup_popup",
    `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`
  )

  const ac = new AbortController()
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function handleMessage(event: MessageEvent): void {
    if (event.origin !== expectedOrigin) return

    const data = event.data
    if (!data || !data.type) return

    switch (data.type) {
      case SETUP_MESSAGE_TYPES.CREATED:
        options.onCreated?.({
          accordId: data.accordId,
          flowId: data.flowId,
        })
        cleanup()
        break
      case SETUP_MESSAGE_TYPES.CANCEL:
        options.onCancel?.()
        cleanup()
        break
      case SETUP_MESSAGE_TYPES.ERROR:
        options.onError?.(data.error)
        break
    }
  }

  function cleanup(): void {
    ac.abort()
    if (pollTimer) clearInterval(pollTimer)
  }

  window.addEventListener("message", handleMessage, { signal: ac.signal })

  // Poll for popup close (user closed window manually)
  pollTimer = setInterval(() => {
    if (popup && popup.closed) {
      options.onCancel?.()
      cleanup()
    }
  }, 500)

  return {
    close(): void {
      popup?.close()
      cleanup()
    },
  }
}

/**
 * Redirects to the AccordSetup wizard (full-page navigation).
 *
 * @param baseUrl - The Overturo base URL
 * @param options - Redirect options including session token
 */
export function setupRedirect(baseUrl: string, options: AccordSetupRedirectOptions & { sessionToken: string }): void {
  const embedUrl = `${baseUrl}/accord_setup/embed/${options.sessionToken}`
  window.location.href = embedUrl
}

import type { PreviewOptions, PreviewHandle, EmbedStyle } from "./types"

const VIEWPORTS: Record<string, { width: number | null; height: number }> = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: null, height: 800 },
}

/**
 * Renders a preview iframe inside a container.
 *
 * @param previewUrl - The full URL to the preview endpoint (e.g., /preview/prv_abc123)
 * @param options - Preview rendering options
 * @returns A handle for controlling the preview iframe
 */
export function renderPreview(previewUrl: string, options: PreviewOptions): PreviewHandle {
  const container = resolveContainer(options.container)
  let currentDevice = options.device || "desktop"
  let currentTheme = options.theme || "default"
  let currentLocale = options.locale

  // Build initial URL with params
  const url = buildUrl(previewUrl, currentTheme, currentDevice, currentLocale)

  // Show loading state
  if (options.loading) {
    showLoading(container, options.loading)
  }

  // Create iframe
  const iframe = document.createElement("iframe")
  iframe.src = url
  iframe.sandbox.add("allow-scripts", "allow-same-origin")
  iframe.style.border = "none"
  iframe.title = "Preview"

  applyViewport(iframe, currentDevice)
  applyStyle(iframe, options.style)

  iframe.addEventListener(
    "load",
    () => {
      // Remove loading state once content loads
      const loader = container.querySelector("[data-preview-loading]")
      if (loader) loader.remove()
    },
    { once: true }
  )

  container.appendChild(iframe)

  const handle: PreviewHandle = {
    iframe,

    setDevice(device: "mobile" | "tablet" | "desktop") {
      currentDevice = device
      applyViewport(iframe, device)
      iframe.src = buildUrl(previewUrl, currentTheme, currentDevice, currentLocale)
    },

    setTheme(theme: string) {
      currentTheme = theme
      iframe.src = buildUrl(previewUrl, currentTheme, currentDevice, currentLocale)
    },

    destroy() {
      iframe.remove()
    },
  }

  return handle
}

function resolveContainer(target: string | HTMLElement): HTMLElement {
  if (typeof target === "string") {
    const el = document.querySelector<HTMLElement>(target)
    if (!el) throw new Error(`Preview container not found: ${target}`)
    return el
  }
  return target
}

function buildUrl(base: string, theme: string, device: string, locale?: string): string {
  const url = new URL(base, window.location.origin)
  url.searchParams.set("theme", theme)
  url.searchParams.set("device", device)
  if (locale) url.searchParams.set("locale", locale)
  return url.toString()
}

function applyViewport(iframe: HTMLIFrameElement, device: string): void {
  const vp = VIEWPORTS[device] || VIEWPORTS.desktop
  if (vp.width) {
    iframe.style.width = `${vp.width}px`
    iframe.style.maxWidth = "100%"
  } else {
    iframe.style.width = "100%"
    iframe.style.maxWidth = "none"
  }
  iframe.style.height = `${vp.height}px`
}

function applyStyle(iframe: HTMLIFrameElement, style?: EmbedStyle): void {
  if (!style) return
  if (style.width) iframe.style.width = style.width
  if (style.minHeight) iframe.style.minHeight = style.minHeight
  if (style.maxHeight) iframe.style.maxHeight = style.maxHeight
  if (style.borderRadius) iframe.style.borderRadius = style.borderRadius
  if (style.border) iframe.style.border = style.border
  if (style.background) iframe.style.background = style.background
}

function showLoading(container: HTMLElement, loading: string | HTMLElement): void {
  const wrapper = document.createElement("div")
  wrapper.setAttribute("data-preview-loading", "")
  if (typeof loading === "string") {
    wrapper.textContent = loading
  } else {
    wrapper.appendChild(loading)
  }
  container.appendChild(wrapper)
}

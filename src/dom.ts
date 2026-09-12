import { EMBED_STYLE_KEYS } from "./constants"
import { OverturoValidationError } from "./errors"
import type { EmbedStyle } from "./types"

/**
 * Resolves a container from a CSS selector or HTMLElement.
 * @throws {OverturoValidationError} if the selector doesn't match any element
 */
export function resolveContainer(container: string | HTMLElement): HTMLElement {
  if (typeof container === "string") {
    const el = document.querySelector<HTMLElement>(container)
    if (!el) {
      throw new OverturoValidationError(`Container element not found: "${container}"`)
    }
    return el
  }
  return container
}

/**
 * Applies whitelisted style overrides to an element.
 * Only keys in EMBED_STYLE_KEYS are applied — all others are ignored.
 */
export function applyStyle(el: HTMLElement, defaults: Record<string, string>, overrides?: EmbedStyle): void {
  const style: Record<string, string> = { ...defaults }
  if (overrides) {
    for (const key of EMBED_STYLE_KEYS) {
      if (key in overrides) {
        style[key] = overrides[key as keyof EmbedStyle] as string
      }
    }
  }
  for (const [key, value] of Object.entries(style)) {
    ;(el.style as unknown as Record<string, string>)[key] = value
  }
}

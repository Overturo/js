/**
 * 201 — the sanitised form snapshot: the consent controls (with their checked
 * state) and the labels around them, every other input's value stripped,
 * scripts and inline handlers removed, capped at 16 KB. The subject field is
 * sent as a field, never inside the snapshot.
 */
export const SNAPSHOT_MAX_BYTES = 16 * 1024

const VALUE_BEARING = "input, textarea, select"
const EVENT_ATTR = /^on/i
const FREE_TEXT_ATTRS = new Set(["title", "aria-label", "aria-description"])

export function sanitisedSnapshot(form: HTMLFormElement, consentSelectors: string[]): string {
  const clone = form.cloneNode(true) as HTMLFormElement
  const keep = new Set<Element>()
  for (const selector of consentSelectors) {
    const el = clone.querySelector(selector)
    if (el) keep.add(el)
  }

  clone.querySelectorAll("script, style, iframe, object, embed").forEach((el) => el.remove())
  ;[clone, ...Array.from(clone.querySelectorAll("*"))].forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      // Inline handlers, embedded documents and free-text attributes an
      // integrator may have put a value into (data-*, title, aria-label).
      if (EVENT_ATTR.test(name) || name === "srcdoc" || name.startsWith("data-") || FREE_TEXT_ATTRS.has(name)) {
        el.removeAttribute(attr.name)
      }
    }
  })

  clone.querySelectorAll(VALUE_BEARING).forEach((node) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (keep.has(el)) {
      // A consent control keeps its checked state and loses any value text.
      const input = el as HTMLInputElement
      if (input.checked) input.setAttribute("checked", "")
      else input.removeAttribute("checked")
      el.removeAttribute("value")
      return
    }
    el.removeAttribute("value")
    el.removeAttribute("placeholder")
    if (el instanceof HTMLTextAreaElement) el.textContent = ""
    if (el instanceof HTMLSelectElement) {
      el.querySelectorAll("option").forEach((o) => {
        o.removeAttribute("selected")
        o.removeAttribute("value")
      })
    }
    if (el instanceof HTMLInputElement) {
      el.removeAttribute("checked")
      if (el.type === "hidden") el.remove()
    }
  })

  const html = clone.outerHTML
  return truncateUtf8(html, SNAPSHOT_MAX_BYTES)
}

function truncateUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder()
  if (encoder.encode(text).byteLength <= maxBytes) return text
  let out = text
  while (encoder.encode(out).byteLength > maxBytes) {
    out = out.slice(0, Math.floor(out.length * 0.9))
  }
  return out
}

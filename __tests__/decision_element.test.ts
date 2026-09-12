// `<overturo-decision>` custom element tests.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DecisionElement, ELEMENT_NAME, ALREADY_DEFINED_CODE, registerDecisionElement } from "../src/elements"

beforeEach(() => {
  // The element auto-registers on import of `src/index.ts`; this file
  // only imports `src/elements/index.ts` directly, so registration runs
  // exactly once here too. Subsequent registration calls warn-and-skip.
  document.body.innerHTML = ""
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("<overturo-decision> element", () => {
  it("is registered under the canonical name", () => {
    expect(customElements.get(ELEMENT_NAME)).toBe(DecisionElement)
  })

  it("attaches a Shadow DOM in open mode on connect", () => {
    const host = document.createElement(ELEMENT_NAME) as DecisionElement
    host.setAttribute("token", "ds_abc")
    document.body.appendChild(host)
    expect(host.shadowRoot).not.toBeNull()
  })

  it("sets role=region + tabindex + aria-busy on mount", () => {
    const host = document.createElement(ELEMENT_NAME)
    host.setAttribute("token", "ds_abc")
    document.body.appendChild(host)
    expect(host.getAttribute("role")).toBe("region")
    expect(host.getAttribute("tabindex")).toBe("0")
    expect(host.getAttribute("aria-busy")).toBe("true")
  })

  it("mounts an iframe inside the Shadow DOM when token is set + mode=embed", () => {
    const host = document.createElement(ELEMENT_NAME)
    host.setAttribute("token", "ds_abc")
    host.setAttribute("mode", "embed")
    host.setAttribute("flow-base-url", "https://flow.test.local")
    document.body.appendChild(host)
    const iframe = host.shadowRoot!.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe!.src).toContain("/decisions/ds_abc/embed")
    expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-same-origin allow-popups")
  })

  it("renders an <a> click-to-open for mode=popup", () => {
    const host = document.createElement(ELEMENT_NAME)
    host.setAttribute("token", "ds_abc")
    host.setAttribute("mode", "popup")
    host.setAttribute("flow-base-url", "https://flow.test.local")
    document.body.appendChild(host)
    const a = host.shadowRoot!.querySelector("a")
    expect(a).not.toBeNull()
    expect(a!.href).toContain("/decisions/ds_abc")
    expect(a!.target).toBe("_blank")
    expect(a!.rel).toBe("noopener noreferrer")
  })

  it("re-mounts when the token attribute changes", () => {
    const host = document.createElement(ELEMENT_NAME)
    host.setAttribute("token", "ds_first")
    host.setAttribute("flow-base-url", "https://flow.test.local")
    document.body.appendChild(host)
    let iframe = host.shadowRoot!.querySelector("iframe")!
    expect(iframe.src).toContain("ds_first")

    host.setAttribute("token", "ds_second")
    iframe = host.shadowRoot!.querySelector("iframe")!
    expect(iframe.src).toContain("ds_second")
  })

  it("Esc keypress dispatches decision:cancel + tears down the iframe", () => {
    const host = document.createElement(ELEMENT_NAME)
    host.setAttribute("token", "ds_abc")
    host.setAttribute("flow-base-url", "https://flow.test.local")
    document.body.appendChild(host)
    const onCancel = vi.fn()
    host.addEventListener("decision:cancel", onCancel)
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(host.shadowRoot!.querySelector("iframe")).toBeNull()
  })

  it("registerDecisionElement() warns + skips when already defined", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    registerDecisionElement()
    expect(spy).toHaveBeenCalledWith(
      "[overturo:sdk]",
      ALREADY_DEFINED_CODE,
      expect.stringContaining("already registered")
    )
  })

  it("disconnectedCallback tears down the iframe", () => {
    const host = document.createElement(ELEMENT_NAME)
    host.setAttribute("token", "ds_abc")
    host.setAttribute("flow-base-url", "https://flow.test.local")
    document.body.appendChild(host)
    expect(host.shadowRoot!.querySelector("iframe")).not.toBeNull()
    document.body.removeChild(host)
    // After disconnect, attempting to read the iframe via querySelector
    // succeeds (Shadow DOM is preserved), but the actual element has been
    // removed by #teardown().
    expect(host.shadowRoot!.querySelector("iframe")).toBeNull()
  })
})

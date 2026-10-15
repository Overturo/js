// 202 review pass — the element and the interception under misuse: a second
// attach on one form, a second capture while one is pending, a synthetic
// message with no source, an accessible-name change, the default trust host.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConsentFieldElement, FIELD_ELEMENT_NAME, registerConsentFieldElement } from "../src/field"
import { fieldEnvelope } from "../src/field/protocol"
import { FIELD_MESSAGE_TYPES } from "../src/field/constants"
import { interceptSubmit } from "../src/forms/intercept"
import { DEFAULT_BASE_URL } from "../src/constants"

const FRAME = "https://trust.test.local"

function mount(attrs: Record<string, string> = {}): ConsentFieldElement {
  const form = document.createElement("form")
  form.id = "signup"
  const host = document.createElement(FIELD_ELEMENT_NAME) as ConsentFieldElement
  for (const [k, v] of Object.entries({ flow: "flw_abc", "publishable-key": "pk_test_x", "base-url": FRAME, ...attrs })) host.setAttribute(k, v)
  form.appendChild(host)
  document.body.appendChild(form)
  return host
}

// jsdom gives a shadow-root iframe no browsing context; the element requires a
// real source window, so the tests give the frame one (a real browser has it).
function ready(host: ConsentFieldElement): void {
  const iframe = host.shadowRoot!.querySelector("iframe")!
  Object.defineProperty(iframe, "contentWindow", { value: { postMessage: vi.fn() }, configurable: true })
  window.dispatchEvent(new MessageEvent("message", { data: fieldEnvelope(FIELD_MESSAGE_TYPES.READY, {}), origin: FRAME, source: iframe.contentWindow }))
}

beforeEach(() => {
  registerConsentFieldElement()
  document.body.innerHTML = ""
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("interceptSubmit", () => {
  it("refuses a second interception on the same form until the first is detached", () => {
    const form = document.createElement("form")
    document.body.appendChild(form)
    const run = async () => ({ token: "t" })
    const detach = interceptSubmit(form, {}, run)
    expect(() => interceptSubmit(form, {}, run)).toThrow(/duplicate_attach/)
    detach()
    expect(() => interceptSubmit(form, {}, run)()).not.toThrow()
  })
})

describe("<overturo-consent-field> hardening", () => {
  it("rejects a second capture while one is pending; the first still answers", async () => {
    const host = mount()
    ready(host)
    const first = host.capture({})
    await expect(host.capture({})).rejects.toMatchObject({ code: "capture_in_flight" })
    const iframe = host.shadowRoot!.querySelector("iframe")!
    window.dispatchEvent(
      new MessageEvent("message", {
        data: fieldEnvelope(FIELD_MESSAGE_TYPES.COMPLETE, { token: "tok_1", committed: false, record_id: null }),
        origin: FRAME,
        source: iframe.contentWindow,
      })
    )
    await expect(first).resolves.toMatchObject({ token: "tok_1" })
  })

  it("ignores a message with no source even from the frame origin (a page script cannot forge COMPLETE)", () => {
    const host = mount()
    const complete = vi.fn()
    host.addEventListener("field:complete", complete)
    window.dispatchEvent(
      new MessageEvent("message", { data: fieldEnvelope(FIELD_MESSAGE_TYPES.COMPLETE, { token: "forged", committed: true }), origin: FRAME, source: null })
    )
    expect(complete).not.toHaveBeenCalled()
    expect(host.value).toBe("")
  })

  it("keeps the frame and a pending capture when only the accessible name changes", async () => {
    const host = mount({ name: "Consent" })
    ready(host)
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const pending = host.capture({})
    host.setAttribute("name", "Your choices")
    expect(host.shadowRoot!.querySelector("iframe")).toBe(iframe)
    expect(iframe.title).toBe("Your choices")
    expect(host.getAttribute("aria-label")).toBe("Your choices")
    host.setAttribute("locale", "de") // any other attribute remounts and settles the pending capture
    await expect(pending).rejects.toMatchObject({ code: "field_unmounted" })
    expect(host.shadowRoot!.querySelector("iframe")).not.toBe(iframe)
  })

  it("mounts from the trust host by default, never from the host page's own origin", () => {
    const host = mount()
    host.removeAttribute("base-url")
    const src = host.shadowRoot!.querySelector("iframe")!.src
    expect(src.startsWith(`${DEFAULT_BASE_URL}/decisions/fields/flw_abc`)).toBe(true)
    expect(src.startsWith(window.location.origin)).toBe(false)
  })
})

describe("<overturo-decision> beside a consent field", () => {
  it("drops a field-family envelope from the trust origin silently, never as a protocol violation", async () => {
    const { ELEMENT_NAME } = await import("../src/elements")
    const decision = document.createElement(ELEMENT_NAME)
    decision.setAttribute("token", "ds_beside_field")
    decision.setAttribute("flow-base-url", FRAME)
    document.body.appendChild(decision)
    const error = vi.fn()
    decision.addEventListener("error", error)
    decision.addEventListener("overturo:error", error)
    window.dispatchEvent(new MessageEvent("message", { data: fieldEnvelope(FIELD_MESSAGE_TYPES.STATE, { decisions: {} }), origin: FRAME }))
    window.dispatchEvent(new MessageEvent("message", { data: { type: "overturo-field:ready", version: 1, payload: {} }, origin: FRAME }))
    expect(error).not.toHaveBeenCalled()
    expect(decision.getAttribute("aria-busy")).toBe("true") // untouched by the foreign family
  })
})

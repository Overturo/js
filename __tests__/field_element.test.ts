// 202 — `<overturo-consent-field>`: mount URL and fragment, origin discipline,
// the handshake, resize with no floor, COMPLETE → value, submit-requested,
// reset, capture() resolution, and the facade handoff through attachTo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConsentFieldElement, FIELD_ELEMENT_NAME, registerConsentFieldElement } from "../src/field"
import { fieldEnvelope } from "../src/field/protocol"
import { FIELD_MESSAGE_TYPES } from "../src/field/constants"

const FRAME = "https://trust.test.local"

function mount(attrs: Record<string, string> = {}): ConsentFieldElement {
  const form = document.createElement("form")
  form.id = "signup"
  form.innerHTML = `<input id="email" name="email" value="Person@Example.com"><input id="uid" name="uid" value="crm-7">`
  const host = document.createElement(FIELD_ELEMENT_NAME) as ConsentFieldElement
  for (const [k, v] of Object.entries({ flow: "flw_abc", "publishable-key": "pk_test_x", "base-url": FRAME, ...attrs })) {
    host.setAttribute(k, v)
  }
  form.appendChild(host)
  document.body.appendChild(form)
  return host
}

function deliver(host: ConsentFieldElement, type: string, payload: Record<string, unknown>, origin = FRAME): void {
  const iframe = host.shadowRoot!.querySelector("iframe")!
  window.dispatchEvent(new MessageEvent("message", { data: fieldEnvelope(type as never, payload), origin, source: iframe.contentWindow }))
}

beforeEach(() => {
  document.body.innerHTML = ""
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("<overturo-consent-field>", () => {
  it("is registered once and warns on a second registration", () => {
    expect(customElements.get(FIELD_ELEMENT_NAME)).toBe(ConsentFieldElement)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    registerConsentFieldElement()
    expect(warn).toHaveBeenCalled()
  })

  it("mounts the field document with the key, locale, purposes and theme in the query and the appearance in the fragment", () => {
    const host = mount({ locale: "de", purposes: "marketing,analytics", theme: "dark", appearance: JSON.stringify({ accent: "#2563eb", evil: "x" }) })
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const url = new URL(iframe.src)
    expect(url.origin).toBe(FRAME)
    expect(url.pathname).toBe("/decisions/fields/flw_abc")
    expect(url.searchParams.get("pk")).toBe("pk_test_x")
    expect(url.searchParams.get("locale")).toBe("de")
    expect(url.searchParams.get("purposes")).toBe("marketing,analytics")
    expect(url.searchParams.get("theme")).toBe("dark")
    expect(url.hash).toMatch(/^#a=/)
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-popups")
    expect(iframe.style.height).toBe("0px")
    expect(host.getAttribute("role")).toBe("group")
    expect(host.getAttribute("aria-busy")).toBe("true")
    expect(host.style.display).toBe("block") // takes its row; nothing overlaps the frame
  })

  it("waits for configure() when no key is set, then mounts", () => {
    const host = document.createElement(FIELD_ELEMENT_NAME) as ConsentFieldElement
    host.setAttribute("flow", "flw_abc")
    document.body.appendChild(host)
    expect(host.shadowRoot!.querySelector("iframe")).toBeNull()
    host.configure({ flowBaseUrl: `${FRAME}/`, publishableKey: "pk_test_y" })
    const iframe = host.shadowRoot!.querySelector("iframe")!
    expect(iframe.src).toContain("pk=pk_test_y")
  })

  it("answers READY with INIT, ignores other origins, and flags protocol violations", () => {
    const host = mount({ locale: "fr" })
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const post = vi.fn()
    Object.defineProperty(iframe, "contentWindow", { value: { postMessage: post }, configurable: true })
    const errors: unknown[] = []
    host.addEventListener("field:error", (e) => errors.push((e as CustomEvent).detail))

    deliver(host, FIELD_MESSAGE_TYPES.READY, {}, "https://evil.example")
    expect(host.ready).toBe(false)
    deliver(host, FIELD_MESSAGE_TYPES.READY, {})
    expect(host.ready).toBe(true)
    expect(host.getAttribute("aria-busy")).toBe("false")
    expect(post).toHaveBeenCalledTimes(1)
    const [envelope, origin] = post.mock.calls[0]
    expect(envelope.type).toBe("overturo-field:init")
    expect(envelope.payload).toEqual({ locale: "fr" })
    expect(origin).toBe(FRAME)

    window.dispatchEvent(new MessageEvent("message", { data: { type: "overturo-field:state", version: 1 }, origin: FRAME, source: iframe.contentWindow }))
    expect(errors.at(-1)).toEqual({ code: "protocol_violation" })
  })

  it("tracks STATE, sizes from RESIZE with no floor, and sets its value on COMPLETE", async () => {
    const host = mount()
    const iframe = host.shadowRoot!.querySelector("iframe")!
    Object.defineProperty(iframe, "contentWindow", { value: { postMessage: vi.fn() }, configurable: true })
    deliver(host, FIELD_MESSAGE_TYPES.READY, {})
    deliver(host, FIELD_MESSAGE_TYPES.STATE, { decisions: { marketing: "granted" } })
    expect(host.decisions).toEqual({ marketing: "granted" })
    deliver(host, FIELD_MESSAGE_TYPES.RESIZE, { height: 37 })
    expect(iframe.style.height).toBe("37px")

    const pending = host.capture({ subject: { email: "p@example.com" } })
    deliver(host, FIELD_MESSAGE_TYPES.COMPLETE, { token: "tok_1", committed: false, record_id: null })
    await expect(pending).resolves.toEqual({ token: "tok_1", committed: false, recordId: null })
    expect(host.value).toBe("tok_1")
  })

  it("rejects capture() before READY and on an ERROR from the frame", async () => {
    const host = mount()
    await expect(host.capture({})).rejects.toMatchObject({ code: "field_not_ready" })
    const iframe = host.shadowRoot!.querySelector("iframe")!
    Object.defineProperty(iframe, "contentWindow", { value: { postMessage: vi.fn() }, configurable: true })
    deliver(host, FIELD_MESSAGE_TYPES.READY, {})
    const pending = host.capture({})
    deliver(host, FIELD_MESSAGE_TYPES.ERROR, { code: "origin_not_allowed" })
    await expect(pending).rejects.toMatchObject({ code: "origin_not_allowed" })
  })

  it("asks the host form to submit on SUBMIT_REQUESTED and clears on reset", () => {
    const host = mount()
    const form = host.closest("form") as HTMLFormElement
    form.requestSubmit = vi.fn()
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const post = vi.fn()
    Object.defineProperty(iframe, "contentWindow", { value: { postMessage: post }, configurable: true })
    deliver(host, FIELD_MESSAGE_TYPES.READY, {})
    deliver(host, FIELD_MESSAGE_TYPES.SUBMIT_REQUESTED, {})
    expect(form.requestSubmit).toHaveBeenCalled()
    deliver(host, FIELD_MESSAGE_TYPES.COMPLETE, { token: "tok_1", committed: false })
    host.reset()
    expect(host.value).toBe("")
    expect(post.mock.calls.at(-1)![0].type).toBe("overturo-field:reset")
  })

  it("attachTo: intercepts the form's submit, asks the element to capture with the subject, writes the hidden input, and re-submits", async () => {
    const host = mount()
    const form = host.closest("form") as HTMLFormElement
    form.requestSubmit = vi.fn()
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const post = vi.fn()
    Object.defineProperty(iframe, "contentWindow", { value: { postMessage: post }, configurable: true })
    deliver(host, FIELD_MESSAGE_TYPES.READY, {})
    const captured: unknown[] = []
    const detach = host.attachTo(form, { flowId: "flw_abc", form, field: host, subjectField: "#email", externalIdField: "#uid", onCaptured: (r) => captured.push(r) }, {
      flowBaseUrl: FRAME,
      publishableKey: "pk_test_x",
    })
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    await Promise.resolve()
    const capture = post.mock.calls.find((c) => c[0].type === "overturo-field:capture")!
    expect(capture[0].payload.subject).toEqual({ email: "Person@Example.com", external_id: "crm-7" })
    expect(capture[0].payload.form_id).toBe("signup")
    deliver(host, FIELD_MESSAGE_TYPES.COMPLETE, { token: "tok_9", committed: false })
    await new Promise((r) => setTimeout(r, 0))
    expect((form.querySelector('input[name="overturo_capture_token"]') as HTMLInputElement).value).toBe("tok_9")
    expect(form.requestSubmit).toHaveBeenCalled()
    expect(captured).toHaveLength(1)
    detach()
    expect(form.querySelector('input[name="overturo_capture_token"]')).toBeNull()
  })
})

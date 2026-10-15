// 201 — Form Capture facade tests: the capture body, the hidden-input handoff,
// the re-entrant submit, the error path (the form still submits), the wording
// write-in, and the refusals before the network.

import { webcrypto } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"
import { corpusResponse } from "./support/corpus"

function mountForm(html?: string): HTMLFormElement {
  document.body.innerHTML =
    html ??
    `<form id="signup" action="/sink">
      <input id="name" name="name" value="Ada">
      <input id="email" name="email" value="Person@Example.com">
      <input id="uid" name="uid" value="crm-7">
      <label id="marketing_label" for="marketing">May we email you?</label>
      <input id="marketing" name="marketing" type="checkbox" checked>
      <input id="analytics" name="analytics" type="checkbox" checked>
      <button type="submit">Go</button>
    </form>`
  const form = document.querySelector("form") as HTMLFormElement
  form.requestSubmit = vi.fn()
  return form
}

const OPTS = {
  flowId: "flw_abc",
  form: "#signup",
  map: { marketing: "#marketing", analytics: "#analytics" },
  subjectField: "#email",
  externalIdField: "#uid",
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => corpusResponse("Decisions_Captures_create")) as unknown as typeof fetch
})

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("forms facade", () => {
  it("refuses an empty flowId, an empty map and a missing form before the network", () => {
    mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    expect(() => client.forms.attach({ ...OPTS, flowId: "" })).toThrow(/flowId is required/)
    expect(() => client.forms.attach({ ...OPTS, map: {} })).toThrow(/at least one purpose/)
    expect(() => client.forms.attach({ ...OPTS, form: "#nope" })).toThrow(/form must resolve/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("builds the capture body from the DOM: decisions with presentation, the subject as a field, a sanitised snapshot", () => {
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    const body = client.forms.buildCaptureBody(form, OPTS) as Record<string, any>
    expect(body.flowId).toBe("flw_abc")
    expect(body.decisions.marketing).toEqual({ decision: "granted", default_checked: true, mandatory: false })
    expect(body.subject).toEqual({ email: "Person@Example.com", externalId: "crm-7" })
    expect(body.snapshot).toContain("May we email you?")
    expect(body.snapshot).not.toContain("Person@Example.com")
    expect(body.snapshot).not.toContain("Ada")
    expect(body.snapshot).not.toContain("crm-7")
    expect(body.formId).toBe("signup")
  })

  it("captures on submit, writes the token into a hidden input, then lets the form submit", async () => {
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x", baseUrl: "https://api.test.local" })
    const captured = vi.fn()
    client.forms.attach({ ...OPTS, onCaptured: captured })
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
    await vi.waitFor(() => expect(captured).toHaveBeenCalled())

    const [url, init] = (globalThis.fetch as any).mock.calls[0]
    expect(url).toBe("https://api.test.local/api/v1/decisions/capture")
    expect(init.headers["X-Publishable-Key"]).toBe("pk_test_x")
    const sent = JSON.parse(init.body)
    expect(sent.flow_id).toBe("flw_abc")
    expect(sent.decisions.marketing.decision).toBe("granted")
    expect(sent.subject.external_id).toBe("crm-7")

    const hidden = form.querySelector<HTMLInputElement>('input[name="overturo_capture_token"]')
    expect(hidden?.value).toBeTruthy()
    expect(captured.mock.calls[0][0].token).toBe(hidden?.value)
    expect(captured.mock.calls[0][0].committed).toBe(false)
    expect(form.requestSubmit).toHaveBeenCalledTimes(1)
    expect(form.dataset.overturoCaptured).toBe("1")
  })

  it("lets the re-entrant submit through once, then captures again on the next real submit", async () => {
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    client.forms.attach(OPTS)
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await vi.waitFor(() => expect(form.requestSubmit).toHaveBeenCalled())
    // The facade's own re-submit: passes through, no second capture.
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(form.dataset.overturoCaptured).toBeUndefined()
    // The person fixes a field and submits again (an AJAX form that stayed on the page): a fresh capture, no stale token.
    ;(form.querySelector("#marketing") as HTMLInputElement).checked = false
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
    const sent = JSON.parse((globalThis.fetch as any).mock.calls[1][1].body)
    expect(sent.decisions.marketing.decision).toBe("declined")
    expect(form.querySelectorAll('input[name="overturo_capture_token"]').length).toBe(1)
  })

  it("ignores a second click while a capture is in flight", async () => {
    let resolveFetch: (r: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((r) => (resolveFetch = r))) as unknown as typeof fetch
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    client.forms.attach(OPTS)
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
    form.dispatchEvent(new Event("submit", { cancelable: true })) // the second click, mid-flight
    await new Promise((r) => setTimeout(r, 10))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    resolveFetch(corpusResponse("Decisions_Captures_create"))
    await vi.waitFor(() => expect(form.requestSubmit).toHaveBeenCalledTimes(1))
  })

  it("re-submits with the button the person clicked", async () => {
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    client.forms.attach(OPTS)
    const button = form.querySelector("button") as HTMLButtonElement
    const ev = new Event("submit", { cancelable: true }) as SubmitEvent
    Object.defineProperty(ev, "submitter", { value: button })
    form.dispatchEvent(ev)
    await vi.waitFor(() => expect(form.requestSubmit).toHaveBeenCalledWith(button))
  })

  it("reports a consent control it cannot find instead of recording a decline, and the form still submits", async () => {
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    const onError = vi.fn()
    client.forms.attach({ ...OPTS, map: { marketing: "#marketing", analytics: "#typo" }, onError })
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    expect(onError.mock.calls[0][0].message).toMatch(/analytics/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(form.requestSubmit).toHaveBeenCalledTimes(1)
  })

  it("attests the digest of each mapped label the person read", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    client.forms.attach({ ...OPTS, labels: { marketing: "#marketing_label" } })
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const sent = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    // the digest of "May we email you?" under the published algorithm
    expect(sent.notice_hashes.marketing).toMatch(/^[0-9a-f]{64}$/)
    const expected = Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode("May we email you?")))) // audit-public-language: allow
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
    expect(sent.notice_hashes.marketing).toBe(expected)
    vi.unstubAllGlobals()
  })

  it("reads a box ticked by script before the person saw it as shown ticked by default", () => {
    const form = mountForm()
    const analytics = form.querySelector("#analytics") as HTMLInputElement
    analytics.removeAttribute("checked")
    analytics.checked = true // a script ticked it at load
    const client = new Overturo({ publishableKey: "pk_test_x" })
    client.forms.attach(OPTS)
    const body = client.forms.buildCaptureBody(form, OPTS, { analytics: true }) as Record<string, any>
    expect(body.decisions.analytics.default_checked).toBe(true)
  })

  it("treats a required yes/no radio group as a choice, not a mandatory consent", () => {
    mountForm(`<form id="signup"><input id="email" value="a@b.c">
      <input type="radio" name="mk" id="mk_yes" value="yes" required checked>
      <input type="radio" name="mk" id="mk_no" value="no" required>
      <input type="checkbox" id="an" required checked></form>`)
    const form = document.querySelector("form") as HTMLFormElement
    const client = new Overturo({ publishableKey: "pk_test_x" })
    const body = client.forms.buildCaptureBody(form, { ...OPTS, map: { marketing: "#mk_yes", analytics: "#an" }, externalIdField: undefined }) as Record<string, any>
    expect(body.decisions.marketing).toEqual({ decision: "granted", default_checked: true, mandatory: false })
    expect(body.decisions.analytics.mandatory).toBe(true)
  })

  it("still submits the form and fires onError when Overturo is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    }) as unknown as typeof fetch
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    const onError = vi.fn()
    client.forms.attach({ ...OPTS, onError })
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    expect(form.requestSubmit).toHaveBeenCalledTimes(1)
    expect(form.querySelector('input[name="overturo_capture_token"]')).toBeNull()
  })

  it("writes the published wording into the named labels", async () => {
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    vi.spyOn(client.decisions, "discover").mockResolvedValue({
      purposes: [{ name: "marketing", label: "Marketing", description: "We send product news." }],
    } as never)
    client.forms.attach({ ...OPTS, wording: { marketing: "#marketing_label" } })
    await vi.waitFor(() => expect(form.querySelector("#marketing_label")?.textContent).toBe("We send product news."))
  })

  it("keeps a checkbox nested inside the label when writing the wording", async () => {
    mountForm(`<form id="signup"><input id="email" value="a@b.c">
      <label id="wrap"><input type="checkbox" id="marketing"> May we email you?</label></form>`)
    const form = document.querySelector("form") as HTMLFormElement
    const client = new Overturo({ publishableKey: "pk_test_x" })
    vi.spyOn(client.decisions, "discover").mockResolvedValue({
      purposes: [{ name: "marketing", label: "Marketing", description: "We send product news." }],
    } as never)
    client.forms.attach({ ...OPTS, map: { marketing: "#marketing" }, externalIdField: undefined, wording: { marketing: "#wrap" } })
    await vi.waitFor(() => expect(form.querySelector("#wrap")?.textContent).toContain("We send product news."))
    expect(form.querySelector("#marketing")).not.toBeNull()
  })

  it("detaches cleanly and writes nothing to client storage", async () => {
    const form = mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    const detach = client.forms.attach(OPTS)
    detach()
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(form.dataset.overturoCaptured).toBeUndefined()
    expect(localStorage.length).toBe(0)
    expect(document.cookie).toBe("")
  })
})

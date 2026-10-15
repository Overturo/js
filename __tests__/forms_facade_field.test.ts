// 202 — the core facade's field handoff: refusals before any network, and the
// delegation to the element's attachTo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"

function mountForm(): HTMLFormElement {
  document.body.innerHTML = `<form id="signup"><input id="email" name="email" value="p@example.com"><overturo-consent-field id="cf" flow="flw_abc"></overturo-consent-field></form>`
  return document.querySelector("form") as HTMLFormElement
}

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch
})

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("forms facade — field", () => {
  it("refuses a field when the field entry is not loaded", () => {
    mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    expect(() => client.forms.attach({ flowId: "flw_abc", form: "#signup", field: "#cf", subjectField: "#email" })).toThrow(/field_entry_not_loaded/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("still requires a map when no field is given", () => {
    mountForm()
    const client = new Overturo({ publishableKey: "pk_test_x" })
    expect(() => client.forms.attach({ flowId: "flw_abc", form: "#signup", subjectField: "#email" })).toThrow(/at least one purpose/)
  })

  describe("with the field entry loaded", () => {
    beforeEach(async () => {
      await import("../src/field")
    })

    it("delegates to the element with the client's trust base and key, and refuses a flow mismatch or a duplicate", () => {
      const form = mountForm()
      const element = form.querySelector("#cf") as HTMLElement & { attachTo: unknown }
      const attachTo = vi.fn(() => () => {})
      element.attachTo = attachTo
      const client = new Overturo({ publishableKey: "pk_test_x", baseUrl: "https://api.test.local", flowBaseUrl: "https://trust.test.local/" })
      const detach = client.forms.attach({ flowId: "flw_abc", form, field: "#cf", subjectField: "#email" })
      expect(typeof detach).toBe("function")
      expect(attachTo).toHaveBeenCalledWith(form, expect.objectContaining({ flowId: "flw_abc" }), { flowBaseUrl: "https://trust.test.local", publishableKey: "pk_test_x" })

      expect(() => client.forms.attach({ flowId: "flw_other", form, field: "#cf", subjectField: "#email" })).toThrow(/must match flowId/)
      const twin = document.createElement("overturo-consent-field")
      twin.setAttribute("flow", "flw_abc")
      form.appendChild(twin)
      expect(() => client.forms.attach({ flowId: "flw_abc", form, field: "#cf", subjectField: "#email" })).toThrow(/duplicate_field/)
    })
  })
})

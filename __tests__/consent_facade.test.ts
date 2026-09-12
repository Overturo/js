// consent facade tests.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"
import { corpusResponse } from "./support/corpus"

// The recorded create exchange the real API produced (validated against the published document).
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => corpusResponse("Decisions_create")) as unknown as typeof fetch
})

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

function makeContainer(): HTMLElement {
  const div = document.createElement("div")
  document.body.appendChild(div)
  return div
}

describe("consent facade", () => {
  it("open() rejects an empty flowId", async () => {
    const client = new Overturo({ publishableKey: "pk_test_x" })
    await expect(client.consent.open({ flowId: "", container: makeContainer() })).rejects.toThrow(/flowId is required/)
  })

  it("open() delegates to decisions.createSession with kind=consent", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      baseUrl: "https://api.test.local",
      flowBaseUrl: "https://flow.test.local",
    })
    const spy = vi.spyOn(client.decisions, "createSession")
    await client.consent.open({
      flowId: "flw_abc",
      container: makeContainer(),
    })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ kind: "consent", subjectRef: "flw_abc" }))
  })

  it("open() mounts an iframe in the container", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      flowBaseUrl: "https://flow.test.local",
    })
    const container = makeContainer()
    await client.consent.open({ flowId: "flw_abc", container })
    expect(container.querySelector("iframe")).not.toBeNull()
  })

  it("url() forwards to decisions.url", () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      flowBaseUrl: "https://flow.test.local",
    })
    const url = client.consent.url({ flowId: "flw_abc", mode: "embed" })
    expect(url).toBe("https://flow.test.local/decisions/flw_abc/embed")
  })

  it("v0 `client.consent({...})` call pattern is gone (consent is no longer callable)", () => {
    const client = new Overturo({ publishableKey: "pk_test_x" })
    // The v0 method is replaced by a facade property — calling it as
    // a function raises TypeError. Documented in CHANGELOG.
    expect(typeof (client.consent as unknown)).toBe("object")
    expect(() => (client.consent as unknown as () => void)()).toThrow(TypeError)
  })
})

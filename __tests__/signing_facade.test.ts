// signing facade tests. Mirrors approvals_facade.test.ts; the kind
// is `signature_request`, the subject is `signatureRef` (the per-party slot).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"
import type { DecisionToken } from "../src/types"

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.endsWith("/api/v1/decisions")) {
      return new Response(
        JSON.stringify({
          decision: {
            session_token: "ds_signing_test",
            kind: "signature_request",
            mode: "embed",
            deadline_at: "2099-01-01T00:00:00Z",
            embed_url: "https://flow.test.local/decisions/ds_signing_test/embed",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    }
    if (u.match(/\/api\/v1\/decisions\/[^/]+$/)) {
      return new Response(
        JSON.stringify({
          deadline_at: new Date(Date.now() + 60_000).toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }
    return new Response("{}", { status: 200 })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
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

describe("signing facade", () => {
  it("open() rejects an empty signatureRef", async () => {
    const client = new Overturo({ publishableKey: "pk_test_x" })
    await expect(client.signing.open({ signatureRef: "", container: makeContainer() })).rejects.toThrow(
      /signatureRef is required/
    )
  })

  it("open() delegates to decisions.createSession with kind=signature_request", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      flowBaseUrl: "https://flow.test.local",
    })
    const spy = vi.spyOn(client.decisions, "createSession")
    await client.signing.open({
      signatureRef: "part_abc",
      container: makeContainer(),
    })
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "signature_request",
        subjectRef: "part_abc",
      })
    )
  })

  it("url() forwards to decisions.url with the signatureRef as token", () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      flowBaseUrl: "https://flow.test.local",
    })
    const url = client.signing.url({ signatureRef: "part_abc", mode: "embed" })
    expect(url).toBe("https://flow.test.local/decisions/part_abc/embed")
  })

  it("deadline() returns {remainingMs, deadlineAt}", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      baseUrl: "https://api.test.local",
    })
    const result = await client.signing.deadline("ds_signing_test" as DecisionToken)
    expect(result.deadlineAt).toBeTypeOf("string")
    expect(result.remainingMs).toBeGreaterThan(0)
    expect(result.remainingMs).toBeLessThanOrEqual(60_000)
  })

  it("deadline() rejects an empty token", async () => {
    const client = new Overturo({ publishableKey: "pk_test_x" })
    await expect(client.signing.deadline("" as DecisionToken)).rejects.toThrow(/token is required/)
  })
})

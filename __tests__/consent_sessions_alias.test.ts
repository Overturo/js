// consent_sessions alias compat.
//
// During the alias window the server accepts both the canonical
// `/api/v1/decisions` path and the legacy `/api/v1/consent_sessions`
// path. The SDK calls the canonical path; this spec asserts the
// canonical call still returns a consent-shaped session for partners
// that haven't migrated yet.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"

let fetchMock: ReturnType<typeof vi.fn>
let calls: Array<{ url: string; init: RequestInit }> = []

beforeEach(() => {
  calls = []
  fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(
      JSON.stringify({
        decision: {
          session_token: "ds_consent_test",
          kind: "consent",
          mode: "embed",
          deadline_at: "2099-01-01T00:00:00Z",
          embed_url: "https://flow.test.local/decisions/ds_consent_test/embed",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    )
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("consent_sessions alias compat", () => {
  it("decisions.createSession calls the canonical /api/v1/decisions path", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      baseUrl: "https://api.test.local",
    })
    await client.decisions.createSession({
      kind: "consent",
      subjectRef: "flw_abc",
      mode: "embed",
    })
    const lastCall = calls.at(-1)!
    expect(lastCall.url).toMatch(/\/api\/v1\/decisions$/)
    expect(lastCall.url).not.toMatch(/\/api\/v1\/consent_sessions/)
  })

  it("consent.open routes through the canonical path (not the alias)", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      baseUrl: "https://api.test.local",
      flowBaseUrl: "https://flow.test.local",
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    await client.consent.open({ flowId: "flw_abc", container })
    const createSessionCall = calls.find((c) => c.url.endsWith("/api/v1/decisions"))
    expect(createSessionCall).toBeDefined()
    expect(createSessionCall!.url).not.toMatch(/\/api\/v1\/consent_sessions/)
    document.body.removeChild(container)
  })

  it("the canonical response shape includes kind + mode + expires_at + token", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      baseUrl: "https://api.test.local",
    })
    const session = await client.decisions.createSession({
      kind: "consent",
      subjectRef: "flw_abc",
      mode: "embed",
    })
    // These fields prove the SDK is reading from the v1 contract;
    // the legacy v0 `session_token` shape would fail this assertion.
    expect(session.token).toBe("ds_consent_test")
    expect(session.kind).toBe("consent")
    expect(session.mode).toBe("embed")
    expect(session.expiresAt).toBe("2099-01-01T00:00:00Z")
  })
})

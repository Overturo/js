// approvals facade tests.

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
            session_token: "ds_approval_test",
            kind: "approval",
            mode: "embed",
            deadline_at: "2099-01-01T00:00:00Z",
            embed_url: "https://flow.test.local/decisions/ds_approval_test/embed",
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

describe("approvals facade", () => {
  it("open() rejects an empty escalationId", async () => {
    const client = new Overturo({ publishableKey: "pk_test_x" })
    await expect(client.approvals.open({ escalationId: "", container: makeContainer() })).rejects.toThrow(
      /escalationId is required/
    )
  })

  it("open() delegates to decisions.createSession with kind=approval", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      flowBaseUrl: "https://flow.test.local",
    })
    const spy = vi.spyOn(client.decisions, "createSession")
    await client.approvals.open({
      escalationId: "esc_abc",
      container: makeContainer(),
    })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ kind: "approval", subjectRef: "esc_abc" }))
  })

  it("url() forwards to decisions.url with the escalationId as token", () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      flowBaseUrl: "https://flow.test.local",
    })
    const url = client.approvals.url({
      escalationId: "esc_abc",
      mode: "embed",
    })
    expect(url).toBe("https://flow.test.local/decisions/esc_abc/embed")
  })

  it("deadline() returns {remainingMs, deadlineAt}", async () => {
    const client = new Overturo({
      publishableKey: "pk_test_x",
      baseUrl: "https://api.test.local",
    })
    const result = await client.approvals.deadline("ds_approval_test" as DecisionToken)
    expect(result.deadlineAt).toBeTypeOf("string")
    expect(result.remainingMs).toBeGreaterThan(0)
    expect(result.remainingMs).toBeLessThanOrEqual(60_000)
  })

  it("deadline() rejects an empty token", async () => {
    const client = new Overturo({ publishableKey: "pk_test_x" })
    await expect(client.approvals.deadline("" as DecisionToken)).rejects.toThrow(/token is required/)
  })
})

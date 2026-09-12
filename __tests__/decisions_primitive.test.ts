// decisions primitive tests. Parametrised
// over both kinds where the behaviour is kind-agnostic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"
import type { DecisionKind, DecisionToken } from "../src/types"

const FLOW_BASE_URL = "https://flow.test.local"
const API_BASE_URL = "https://api.test.local"

interface Fixture {
  kind: DecisionKind
  subjectRef: string
  token: DecisionToken
}

const FIXTURES: Fixture[] = [
  {
    kind: "consent",
    subjectRef: "flw_dev_consent_a",
    token: "ds_consent_test" as DecisionToken,
  },
  {
    kind: "approval",
    subjectRef: "esc_dev_approval_a",
    token: "ds_approval_test" as DecisionToken,
  },
]

function makeClient(opts: { debug?: boolean } = {}): Overturo {
  return new Overturo({
    publishableKey: "pk_test_x",
    baseUrl: API_BASE_URL,
    flowBaseUrl: FLOW_BASE_URL,
    ...opts,
  })
}

function makeContainer(): HTMLElement {
  const div = document.createElement("div")
  div.id = `test-${Math.random().toString(36).slice(2)}`
  document.body.appendChild(div)
  return div
}

describe("decisions primitive", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (_url: RequestInfo | URL, init: RequestInit | undefined) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      // Mirror the real decisions API create shape:
      // wrapped in {decision: ...}, snake_case fields, `session_token`
      // (not `token`), `deadline_at` (not `expires_at`).
      return new Response(
        JSON.stringify({
          decision: {
            session_token: body.kind === "approval" ? "ds_approval_test" : "ds_consent_test",
            kind: body.kind ?? "consent",
            mode: body.delivery_mode ?? "embed",
            deadline_at: "2099-01-01T00:00:00Z",
            embed_url: `${FLOW_BASE_URL}/decisions/ds_x/embed`,
            decision_url: `${FLOW_BASE_URL}/decisions/ds_x`,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  describe("url()", () => {
    it("builds the embed URL with the /embed suffix", () => {
      const client = makeClient()
      const url = client.decisions.url({
        token: "ds_abc" as DecisionToken,
        mode: "embed",
      })
      expect(url).toBe(`${FLOW_BASE_URL}/decisions/ds_abc/embed`)
    })

    it("builds the popup URL without the /embed suffix", () => {
      const client = makeClient()
      const url = client.decisions.url({
        token: "ds_abc" as DecisionToken,
        mode: "popup",
      })
      expect(url).toBe(`${FLOW_BASE_URL}/decisions/ds_abc`)
    })
  })

  describe.each(FIXTURES)("createSession (kind=$kind)", ({ kind, subjectRef }) => {
    it("POSTs to /api/v1/decisions with X-Publishable-Key", async () => {
      const client = makeClient()
      await client.decisions.createSession({
        kind,
        subjectRef,
        mode: "embed",
      } as never)
      const [url, init] = fetchMock.mock.calls[0]!
      expect(String(url)).toMatch(/\/api\/v1\/decisions$/)
      expect((init as RequestInit).headers).toMatchObject({
        "X-Publishable-Key": "pk_test_x",
      })
      const body = JSON.parse(String((init as RequestInit).body))
      expect(body.kind).toBe(kind)
      expect(body.subject_ref).toBe(subjectRef)
      // Wire contract: request uses snake_case `delivery_mode`,
      // not `mode`. Regression-guard against drifting back.
      expect(body.delivery_mode).toBe("embed")
      expect(body.mode).toBeUndefined()
    })

    it("returns a typed session with the kind preserved", async () => {
      const client = makeClient()
      const session = await client.decisions.createSession({
        kind,
        subjectRef,
        mode: "embed",
      } as never)
      expect(session.kind).toBe(kind)
      expect(session.mode).toBe("embed")
      expect(session.token).toBeTypeOf("string")
    })

    it("rejects an empty subjectRef", async () => {
      const client = makeClient()
      await expect(
        client.decisions.createSession({
          kind,
          subjectRef: "",
          mode: "embed",
        } as never)
      ).rejects.toThrow(/subjectRef is required/)
    })
  })

  describe.each(FIXTURES)("embed (kind=$kind)", ({ token }) => {
    it("mounts an iframe with the sandbox attribute and correct src", () => {
      const client = makeClient()
      const container = makeContainer()
      client.decisions.embed({ token, container })
      const iframe = container.querySelector("iframe")
      expect(iframe).not.toBeNull()
      expect(iframe!.src).toContain(`/decisions/${token}/embed`)
      expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-same-origin allow-popups")
    })

    it("destroy() removes the iframe and aborts the listener", async () => {
      const client = makeClient()
      const container = makeContainer()
      const handle = client.decisions.embed({ token, container })
      expect(container.querySelector("iframe")).not.toBeNull()
      await handle.destroy()
      expect(container.querySelector("iframe")).toBeNull()
    })

    it("rejects an empty token", () => {
      const client = makeClient()
      const container = makeContainer()
      expect(() =>
        client.decisions.embed({
          token: "" as DecisionToken,
          container,
        })
      ).toThrow(/token is required/)
    })

    it("rejects malformed v2 envelopes silently from foreign origin", () => {
      const client = makeClient()
      const container = makeContainer()
      const onError = vi.fn()
      client.decisions.embed({ token, container, onError })

      // Wrong origin → silently dropped (no onError).
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "overturo:complete", version: 2, kind: "consent", payload: {} },
          origin: "https://attacker.example",
        })
      )
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe("destroyAll", () => {
    it("destroys every live handle the client created", async () => {
      const client = makeClient()
      const c1 = makeContainer()
      const c2 = makeContainer()
      client.decisions.embed({ token: "ds_a" as DecisionToken, container: c1 })
      client.decisions.embed({ token: "ds_b" as DecisionToken, container: c2 })
      expect(c1.querySelector("iframe")).not.toBeNull()
      expect(c2.querySelector("iframe")).not.toBeNull()
      await client.destroy()
      expect(c1.querySelector("iframe")).toBeNull()
      expect(c2.querySelector("iframe")).toBeNull()
    })
  })

  describe("cancel", () => {
    it("POSTs to /api/v1/decisions/:token/cancel", async () => {
      const client = makeClient()
      await client.decisions.cancel("ds_abc" as DecisionToken)
      const lastCall = fetchMock.mock.calls.at(-1)!
      expect(String(lastCall[0])).toMatch(/\/api\/v1\/decisions\/ds_abc\/cancel$/)
    })

    it("rejects an empty token", async () => {
      const client = makeClient()
      await expect(client.decisions.cancel("" as DecisionToken)).rejects.toThrow(/token is required/)
    })
  })

  describe("exchange", () => {
    it("requires both token and exchangeToken", async () => {
      const client = makeClient()
      await expect(
        client.decisions.exchange({
          token: "ds_x" as DecisionToken,
          exchangeToken: "",
        })
      ).rejects.toThrow(/required/)
    })
  })
})

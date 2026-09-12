// pre-flight disclosure discovery (`decisions.discover`) tests. Decodes
// the shared conformance fixture (lib/sdk/shared/conformance/discovery/
// flow_disclosures.json) — the same corpus the server + the other three clients
// hold — so a decoder that drifts from the wire shape is a red suite.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"
import { OverturoApiError, OverturoValidationError } from "../src/errors"

const API_BASE_URL = "https://api.test.local"
const FLOW_BASE_URL = "https://flow.test.local"
const FLOW_ID = "flw_test_discovery"

// The raw wire fixture (snake_case, {flow: {...}}). Parsed once; the mock
// returns its text verbatim so the SDK's own toCamelCase pass runs.
const SHARED_FIXTURE = join(__dirname, "../../shared/conformance/discovery/flow_disclosures.json")
// The shared fixture when this package sits next to it; the vendored copy otherwise.
const FIXTURE_PATH = existsSync(SHARED_FIXTURE)
  ? SHARED_FIXTURE
  : join(__dirname, "fixtures/discovery/flow_disclosures.json")
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf8")

function makeClient(): Overturo {
  return new Overturo({
    publishableKey: "pk_test_x",
    baseUrl: API_BASE_URL,
    flowBaseUrl: FLOW_BASE_URL,
  })
}

describe("decisions.discover (189)", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => {
      return new Response(FIXTURE_TEXT, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("decodes the fixture into the camelCase FlowDisclosures shape", async () => {
    const result = await makeClient().decisions.discover({ flowId: FLOW_ID })

    expect(result.schema).toBe("overturo-disclosure/1")
    expect(result.flow.kind).toBe("consent")
    // camelCase transform of the snake_case wire keys.
    expect(result.application.primaryColor).toBe("#0B5FFF")
    expect(result.expiry.consentDurationDays).toBe(365)
    expect(result.locale.fallback).toBe("en")
    // Enum VALUES pass through unchanged (data, not keys).
    const purpose = result.purposes.find((p) => p.name === "care_reminders")
    expect(purpose?.mechanism).toBe("opt_out")
    expect(purpose?.legalBasis).toBe("consent")
    expect(Array.isArray(purpose?.dataLabels)).toBe(true)
    // fields carry the public completed_by vocabulary, camelCased key.
    expect(result.fields.map((f) => f.completedBy)).toContain("principal")
    expect(result.outcomes).toEqual(["granted", "denied"])
  })

  it("GETs the disclosures path with the publishable key and no locale query", async () => {
    await makeClient().decisions.discover({ flowId: FLOW_ID })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${API_BASE_URL}/api/v1/decisions/flows/${FLOW_ID}/disclosures`)
    expect((init?.headers as Record<string, string>)["X-Publishable-Key"]).toBe("pk_test_x")
    expect(init?.method).toBe("GET")
  })

  it("appends the locale query when asked", async () => {
    await makeClient().decisions.discover({ flowId: FLOW_ID, locale: "de" })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/disclosures?locale=de")
  })

  it("throws OverturoValidationError when flowId is missing", async () => {
    await expect(makeClient().decisions.discover({ flowId: "" })).rejects.toBeInstanceOf(OverturoValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("is reachable via the consent facade (symmetry)", async () => {
    const result = await makeClient().consent.discover({ flowId: FLOW_ID })
    expect(result.flow.kind).toBe("consent")
  })

  it("surfaces the uniform 404 as OverturoApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "flow_not_found", message: "Flow not found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    )
    const err = await makeClient()
      .decisions.discover({ flowId: FLOW_ID })
      .catch((e) => e)
    expect(err).toBeInstanceOf(OverturoApiError)
    expect(err.status).toBe(404)
  })

  it("raises a typed error on an envelope-less 200", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const err = await makeClient()
      .decisions.discover({ flowId: FLOW_ID })
      .catch((e) => e)
    expect(err).toBeInstanceOf(OverturoApiError)
  })
})

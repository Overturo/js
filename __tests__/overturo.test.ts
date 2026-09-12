import { describe, it, expect, vi, beforeEach } from "vitest"
import { Overturo } from "../src/overturo"
import { OverturoApiError, OverturoError, OverturoValidationError } from "../src/errors"

describe("Overturo", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockReset()
  })

  it("throws on missing publishableKey", () => {
    expect(() => new Overturo({ publishableKey: "" })).toThrow(OverturoValidationError)
  })

  it("createSession() POSTs correct path and body", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          session_token: "tok_123",
          delivery_mode: "embed",
          expires_at: "2025-01-01T00:00:00Z",
          embed_url: "https://example.com/accord/embed/tok_123",
        }),
        { status: 200 }
      )
    )

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    const session = await client.createSession({
      flowId: "flw_abc",
      deliveryMode: "embed",
    })

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/v1/consent_sessions",
      expect.objectContaining({ method: "POST" })
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.accord_id).toBe("flw_abc")
    expect(body.delivery_mode).toBe("embed")

    expect(session.sessionToken).toBe("tok_123")
  })

  it("createSession() throws OverturoApiError on 404", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Flow not found or not active" }), { status: 404 })
    )

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    try {
      await client.createSession({ flowId: "flw_invalid" })
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(OverturoApiError)
      const apiErr = err as OverturoApiError
      expect(apiErr.status).toBe(404)
      expect(apiErr.message).toBe("Flow not found or not active")
    }
  })

  it("getSession() GETs correct path", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          session_token: "tok_123",
          status: "pending",
          delivery_mode: "embed",
          current_step: null,
          steps: [],
          expires_at: "2025-01-01T00:00:00Z",
          completed_at: null,
        }),
        { status: 200 }
      )
    )

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    const status = await client.getSession("tok_123")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/v1/consent_sessions/tok_123",
      expect.objectContaining({ method: "GET" })
    )

    expect(status.sessionToken).toBe("tok_123")
    expect(status.status).toBe("pending")
    expect(status.currentStep).toBeNull()
  })

  it("getSession() throws OverturoApiError on session not found", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Session not found" }), { status: 404 }))

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    await expect(client.getSession("tok_invalid")).rejects.toThrow(OverturoApiError)
  })

  it("exchange() POSTs correct path with consentToken", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          claims: { email: "user@example.com" },
          attestations: [
            {
              claim_type: "email",
              connector: "google",
              status: "verified",
              provider_id: "p_123",
            },
          ],
          credentials: [],
          provenance: {},
          access_token: "at_abc",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200 }
      )
    )

    const client = new Overturo({
      publishableKey: "pk_test_123",
      apiKey: "sk_test_456",
      baseUrl: "https://example.com",
    })

    const result = await client.exchange({
      sessionToken: "tok_123",
      consentToken: "ct_abc",
    })

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/v1/consent_sessions/tok_123/exchange",
      expect.objectContaining({ method: "POST" })
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.consent_token).toBe("ct_abc")

    expect(result.claims).toEqual({ email: "user@example.com" })
    expect(result.attestations).toHaveLength(1)
    expect(result.attestations[0].claimType).toBe("email")
    expect(result.accessToken).toBe("at_abc")
    expect(result.expiresIn).toBe(3600)
  })

  it("exchange() retries on 202 and succeeds on 200", async () => {
    const pendingResponse = new Response(JSON.stringify({ status: "pending", message: "Fulfillment in progress" }), {
      status: 202,
      headers: { "Retry-After": "0" },
    })
    const successResponse = new Response(
      JSON.stringify({
        claims: { email: "user@example.com" },
        attestations: [],
        credentials: [],
        provenance: {},
      }),
      { status: 200 }
    )

    mockFetch.mockResolvedValueOnce(pendingResponse).mockResolvedValueOnce(successResponse)

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    const result = await client.exchange({
      sessionToken: "tok_123",
      consentToken: "ct_abc",
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.claims).toEqual({ email: "user@example.com" })
  })

  it("exchange() throws after max retries on persistent 202", async () => {
    const pendingResponse = () =>
      new Response(
        JSON.stringify({
          status: "pending",
          message: "Fulfillment in progress",
        }),
        { status: 202, headers: { "Retry-After": "0" } }
      )

    mockFetch.mockImplementation(() => Promise.resolve(pendingResponse()))

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    await expect(client.exchange({ sessionToken: "tok_123", consentToken: "ct_abc" })).rejects.toThrow(OverturoApiError)
  })

  it("exchange() throws OverturoApiError on 500", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Fulfillment failed: DB error" }), { status: 500 })
    )

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    try {
      await client.exchange({
        sessionToken: "tok_123",
        consentToken: "ct_abc",
      })
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(OverturoApiError)
      const apiErr = err as OverturoApiError
      expect(apiErr.status).toBe(500)
      expect(apiErr.message).toContain("Fulfillment failed")
    }
  })

  it("consent() creates session then embeds", async () => {
    // Server returns the canonical {decision: {...}} envelope per
    // the decisions API create endpoint.
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          decision: {
            session_token: "ds_consent_test",
            kind: "consent",
            mode: "embed",
            deadline_at: "2025-01-01T00:00:00Z",
            embed_url: "https://example.com/decisions/ds_consent_test/embed",
          },
        }),
        { status: 201 }
      )
    )

    const container = document.createElement("div")
    container.id = "consent-test"
    document.body.appendChild(container)

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    // `client.consent({...})` (v0 method) is replaced by
    // `client.consent.open({...})` (v1 facade). Pre-production hard cut
    //. The new facade returns a DecisionsHandle (with
    // `destroy()`) rather than the v0 EmbedHandle (with `.iframe`).
    const handle = await client.consent.open({
      flowId: "flw_abc",
      container,
    })

    expect(handle.token).toBeTypeOf("string")
    expect(handle.mode).toBe("embed")
    expect(typeof handle.destroy).toBe("function")

    await handle.destroy()
    document.body.removeChild(container)
  })

  it("redirect() sets window.location.href", () => {
    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    const originalLocation = window.location
    const mockLocation = { ...originalLocation, href: "" }
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
    })

    client.redirect({
      flowId: "flw_xyz",
      redirectUri: "https://app.com/callback",
    })

    expect(mockLocation.href).toContain("/accord/flw_xyz")
    expect(mockLocation.href).toContain("redirect_uri=https%3A%2F%2Fapp.com%2Fcallback")

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    })
  })

  it("popup() throws when browser blocks popup", () => {
    vi.stubGlobal("open", vi.fn().mockReturnValue(null))

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
    })

    expect(() => client.popup({ sessionToken: "tok_abc" })).toThrow(OverturoError)
  })

  it("uses default baseUrl", () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    const client = new Overturo({ publishableKey: "pk_test_123" })
    client.getSession("tok_123")

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("https://overturo.com"), expect.any(Object))
  })

  it("uses custom baseUrl", () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://custom.example.com",
    })
    client.getSession("tok_123")

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("https://custom.example.com"), expect.any(Object))
  })

  it("strips trailing slashes from baseUrl", () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com///",
    })
    client.getSession("tok_123")

    expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/v1/consent_sessions/tok_123", expect.any(Object))
  })

  it("passes timeout option to API client", async () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    const client = new Overturo({
      publishableKey: "pk_test_123",
      baseUrl: "https://example.com",
      timeout: 5000,
    })

    await client.getSession("tok_123")

    // Verify signal is passed (timeout creates an AbortController)
    const fetchOptions = mockFetch.mock.calls[0][1]
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
  })

  // ── flowBaseUrl: independent host for consent flows + iframes ──

  describe("flowBaseUrl", () => {
    it("defaults to baseUrl when not provided (production parity)", () => {
      const openSpy = vi.fn().mockReturnValue({ closed: false, close: vi.fn() })
      vi.stubGlobal("open", openSpy)

      const client = new Overturo({
        publishableKey: "pk_test_123",
        baseUrl: "https://example.com",
      })
      client.popup({ sessionToken: "tok_abc" })

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/accord/embed/tok_abc"),
        expect.any(String),
        expect.any(String)
      )
    })

    it("popup() uses flowBaseUrl when provided, not baseUrl", () => {
      const openSpy = vi.fn().mockReturnValue({ closed: false, close: vi.fn() })
      vi.stubGlobal("open", openSpy)

      const client = new Overturo({
        publishableKey: "pk_test_123",
        baseUrl: "https://api.example.com",
        flowBaseUrl: "https://trust.example.com",
      })
      client.popup({ sessionToken: "tok_abc" })

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("https://trust.example.com/accord/embed/tok_abc"),
        expect.any(String),
        expect.any(String)
      )
    })

    it("redirect() uses flowBaseUrl when provided", () => {
      const client = new Overturo({
        publishableKey: "pk_test_123",
        baseUrl: "https://api.example.com",
        flowBaseUrl: "https://trust.example.com",
      })

      const originalLocation = window.location
      const mockLocation = { ...originalLocation, href: "" }
      Object.defineProperty(window, "location", { value: mockLocation, writable: true })

      client.redirect({ flowId: "flw_xyz", redirectUri: "https://app.com/cb" })

      expect(mockLocation.href).toContain("https://trust.example.com/accord/flw_xyz")

      Object.defineProperty(window, "location", { value: originalLocation, writable: true })
    })

    it("API calls still go through baseUrl, not flowBaseUrl", async () => {
      mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

      const client = new Overturo({
        publishableKey: "pk_test_123",
        baseUrl: "https://api.example.com",
        flowBaseUrl: "https://trust.example.com",
      })
      await client.getSession("tok_123")

      // The API call must hit api.example.com, NOT trust.example.com.
      // This is the partner contract: flowBaseUrl is for iframes only.
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("https://api.example.com"), expect.any(Object))
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("https://trust.example.com"),
        expect.any(Object)
      )
    })

    it("strips trailing slashes from flowBaseUrl", () => {
      const openSpy = vi.fn().mockReturnValue({ closed: false, close: vi.fn() })
      vi.stubGlobal("open", openSpy)

      const client = new Overturo({
        publishableKey: "pk_test_123",
        flowBaseUrl: "https://trust.example.com///",
      })
      client.popup({ sessionToken: "tok_abc" })

      expect(openSpy).toHaveBeenCalledWith(
        "https://trust.example.com/accord/embed/tok_abc",
        expect.any(String),
        expect.any(String)
      )
    })
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { ApiClient, toSnakeCase, toCamelCase } from "../src/api"
import { OverturoApiError, OverturoNetworkError, OverturoTimeoutError } from "../src/errors"

describe("ApiClient", () => {
  let client: ApiClient
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockReset()
    client = new ApiClient({
      baseUrl: "https://example.com",
      publishableKey: "pk_test_123",
    })
  })

  it("sends X-Publishable-Key header", async () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    await client.get("/test")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Publishable-Key": "pk_test_123",
        }),
      })
    )
  })

  it("sends Authorization header when apiKey is provided", async () => {
    const authedClient = new ApiClient({
      baseUrl: "https://example.com",
      publishableKey: "pk_test_123",
      apiKey: "sk_test_456",
    })
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    await authedClient.get("/test")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_456",
        }),
      })
    )
  })

  it("snake-cases request body", async () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    await client.post("/test", { flowId: "flw_123", deliveryMode: "embed" })

    const call = mockFetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body).toEqual({ flow_id: "flw_123", delivery_mode: "embed" })
  })

  it("camelCases response body", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ session_token: "tok_123", delivery_mode: "embed" }), { status: 200 })
    )

    const result = await client.get<{
      sessionToken: string
      deliveryMode: string
    }>("/test")

    expect(result).toEqual({ sessionToken: "tok_123", deliveryMode: "embed" })
  })

  it("throws OverturoApiError on 4xx/5xx with status and body", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Flow not found" }), {
        status: 404,
      })
    )

    try {
      await client.get("/test")
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(OverturoApiError)
      const apiErr = err as OverturoApiError
      expect(apiErr.status).toBe(404)
      expect(apiErr.body).toEqual({ error: "Flow not found" })
      expect(apiErr.message).toBe("Flow not found")
    }
  })

  it("unwraps the structured {error:{code,message}} envelope into a readable message", async () => {
    // The Rails API surface returns {error:{code,message,detail}} on most
    // controller-layer failures. Prior code stringified the inner object
    // to "[object Object]" and hid every real failure in CI.
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "subject_not_found", message: "Decision session not found" },
        }),
        { status: 404 }
      )
    )

    try {
      await client.get("/test")
      expect.fail("Should have thrown")
    } catch (err) {
      const apiErr = err as OverturoApiError
      expect(apiErr.message).toBe("subject_not_found: Decision session not found")
    }
  })

  it("surfaces the first validation reason from {code, errors:{field:[msg]}}", async () => {
    // A validation failure emits {code:"validation_failed",
    // errors:{field:[msg,...]}} via the API base rescue. Without
    // unwrapping `errors`, the message would be the bare code and
    // hide which field tripped the validation.
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "validation_failed",
            errors: { embed_origin: ["is not allowed for this application"] },
          },
        }),
        { status: 422 }
      )
    )

    try {
      await client.get("/test")
      expect.fail("Should have thrown")
    } catch (err) {
      const apiErr = err as OverturoApiError
      expect(apiErr.message).toBe("validation_failed: embed_origin is not allowed for this application")
    }
  })

  it("throws OverturoApiError with fallback message for non-JSON error", async () => {
    mockFetch.mockResolvedValue(new Response("Internal Server Error", { status: 500 }))

    try {
      await client.get("/test")
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(OverturoApiError)
      const apiErr = err as OverturoApiError
      expect(apiErr.status).toBe(500)
      expect(apiErr.message).toBe("HTTP 500")
      expect(apiErr.body).toBeNull()
    }
  })

  it("throws OverturoNetworkError on fetch failure", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"))

    await expect(client.get("/test")).rejects.toThrow(OverturoNetworkError)
  })

  it("throws OverturoTimeoutError when request exceeds timeout", async () => {
    const timeoutClient = new ApiClient({
      baseUrl: "https://example.com",
      publishableKey: "pk_test_123",
      timeout: 1,
    })

    // Simulate abort by making fetch reject with AbortError
    mockFetch.mockImplementation((_url: string, opts: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new DOMException("The operation was aborted", "AbortError")
          reject(err)
        })
      })
    })

    await expect(timeoutClient.get("/test")).rejects.toThrow(OverturoTimeoutError)
  })

  it("does not timeout when timeout is 0 (disabled)", async () => {
    const noTimeoutClient = new ApiClient({
      baseUrl: "https://example.com",
      publishableKey: "pk_test_123",
      timeout: 0,
    })

    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await noTimeoutClient.get<{ ok: boolean }>("/test")
    expect(result).toEqual({ ok: true })
  })

  it("passes AbortController signal to fetch", async () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    await client.get("/test")

    const fetchOptions = mockFetch.mock.calls[0][1]
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
  })

  it("handles empty response body", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 200 }))

    const result = await client.get("/test")
    expect(result).toEqual({})
  })

  it("sends JSON Content-Type header", async () => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }))

    await client.post("/test", { key: "value" })

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    )
  })
})

describe("toSnakeCase", () => {
  it("converts camelCase keys recursively", () => {
    expect(toSnakeCase({ flowId: "f", deliveryMode: "embed" })).toEqual({
      flow_id: "f",
      delivery_mode: "embed",
    })
  })

  it("handles nested objects", () => {
    expect(toSnakeCase({ outer: { innerKey: "val" } })).toEqual({
      outer: { inner_key: "val" },
    })
  })

  it("handles arrays", () => {
    expect(toSnakeCase([{ flowId: "a" }, { flowId: "b" }])).toEqual([{ flow_id: "a" }, { flow_id: "b" }])
  })

  it("passes through primitives", () => {
    expect(toSnakeCase("hello")).toBe("hello")
    expect(toSnakeCase(42)).toBe(42)
    expect(toSnakeCase(null)).toBeNull()
    expect(toSnakeCase(true)).toBe(true)
  })
})

describe("toCamelCase", () => {
  it("converts snake_case keys recursively", () => {
    expect(toCamelCase({ session_token: "t", delivery_mode: "embed" })).toEqual({
      sessionToken: "t",
      deliveryMode: "embed",
    })
  })

  it("handles nested objects", () => {
    expect(toCamelCase({ outer: { inner_key: "val" } })).toEqual({
      outer: { innerKey: "val" },
    })
  })

  it("handles arrays of objects", () => {
    expect(toCamelCase([{ claim_type: "email" }, { claim_type: "name" }])).toEqual([
      { claimType: "email" },
      { claimType: "name" },
    ])
  })

  it("passes through primitives", () => {
    expect(toCamelCase("hello")).toBe("hello")
    expect(toCamelCase(42)).toBe(42)
    expect(toCamelCase(null)).toBeNull()
  })
})

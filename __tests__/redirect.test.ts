import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { performRedirect } from "../src/redirect"
import { OverturoValidationError } from "../src/errors"

describe("performRedirect", () => {
  let originalLocation: Location
  let mockHref: string

  beforeEach(() => {
    originalLocation = window.location
    mockHref = ""
    Object.defineProperty(window, "location", {
      value: {
        ...originalLocation,
        get href() {
          return mockHref
        },
        set href(value: string) {
          mockHref = value
        },
      },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    })
  })

  it("sets window.location.href correctly", () => {
    performRedirect("https://example.com", {
      flowId: "flw_abc",
      redirectUri: "https://app.com/callback",
    })

    expect(mockHref).toContain("https://example.com/accord/flw_abc")
    expect(mockHref).toContain("redirect_uri=https%3A%2F%2Fapp.com%2Fcallback")
  })

  it("uses flowId in URL path", () => {
    performRedirect("https://example.com", {
      flowId: "flw_xyz_123",
      redirectUri: "https://app.com/cb",
    })

    expect(mockHref).toContain("/accord/flw_xyz_123")
  })

  it("encodes query params", () => {
    performRedirect("https://example.com", {
      flowId: "flw_abc",
      redirectUri: "https://app.com/callback?foo=bar",
    })

    expect(mockHref).toContain("redirect_uri=https%3A%2F%2Fapp.com%2Fcallback%3Ffoo%3Dbar")
  })

  it("includes optional params", () => {
    performRedirect("https://example.com", {
      flowId: "flw_abc",
      redirectUri: "https://app.com/callback",
      state: "csrf_123",
      nonce: "nonce_456",
      scope: "openid profile email",
    })

    expect(mockHref).toContain("state=csrf_123")
    expect(mockHref).toContain("nonce=nonce_456")
    expect(mockHref).toContain("scope=openid+profile+email")
  })

  it("throws on missing flowId", () => {
    expect(() =>
      performRedirect("https://example.com", {
        flowId: "",
        redirectUri: "https://app.com/cb",
      })
    ).toThrow(OverturoValidationError)
  })

  it("throws on missing redirectUri", () => {
    expect(() =>
      performRedirect("https://example.com", {
        flowId: "flw_abc",
        redirectUri: "",
      })
    ).toThrow(OverturoValidationError)
  })
})

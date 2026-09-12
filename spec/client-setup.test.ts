import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Overturo } from "../src/overturo"

const BASE_URL = "https://overturo.com"
const PK = "pk_test_abc123"

function mockFetchSuccess(data: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ "content-type": "application/json" }),
  })
}

function mockFetchError(status: number, body: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers({ "content-type": "application/json" }),
  })
}

describe("Overturo - AccordSetup methods", () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement("div")
    container.id = "setup-container"
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  describe("createSetupSession()", () => {
    it("sends POST with correct params", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "setup_token_123",
        delivery_mode: "embed",
        embed_url: `${BASE_URL}/accord_setup/embed/setup_token_123`,
        expires_at: "2026-03-27T12:00:00Z",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      const session = await overturo.createSetupSession({
        solution: "meetings",
        deliveryMode: "embed",
      })

      expect(session.sessionToken).toBe("setup_token_123")
      expect(session.deliveryMode).toBe("embed")
      expect(session.embedUrl).toContain("/accord_setup/embed/")

      // Verify fetch was called with correct URL and body
      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toContain("/api/v1/accord_setup_sessions")
      const body = JSON.parse(options.body)
      expect(body.solution).toBe("meetings")
      expect(body.delivery_mode).toBe("embed")
    })

    it("sends publishable key in header", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "token",
        delivery_mode: "embed",
        embed_url: "",
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await overturo.createSetupSession({ solution: "meetings" })

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers["X-Publishable-Key"]).toBe(PK)
    })

    it("auto-detects locale from navigator", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "token",
        delivery_mode: "embed",
        embed_url: "",
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await overturo.createSetupSession({ solution: "meetings" })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.locale).toBeTruthy()
    })

    it("throws on API error", async () => {
      const fetchMock = mockFetchError(422, {
        errors: { solution: ["is not valid"] },
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await expect(overturo.createSetupSession({ solution: "invalid" })).rejects.toThrow()
    })
  })

  describe("accordSetup()", () => {
    it("creates session and embeds iframe", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "embed_token",
        delivery_mode: "embed",
        embed_url: `${BASE_URL}/accord_setup/embed/embed_token`,
        expires_at: "2026-03-27T12:00:00Z",
      })
      vi.stubGlobal("fetch", fetchMock)

      const onCreated = vi.fn()
      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      const handle = await overturo.accordSetup({
        solution: "meetings",
        container: "#setup-container",
        onCreated,
      })

      expect(handle.iframe).toBeInstanceOf(HTMLIFrameElement)
      expect(handle.iframe.src).toContain("/accord_setup/embed/embed_token")
      expect(container.contains(handle.iframe)).toBe(true)

      handle.destroy()
    })

    it("passes constraints to session creation", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "token",
        delivery_mode: "embed",
        embed_url: "",
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await overturo
        .accordSetup({
          solution: "meetings",
          container: "#setup-container",
          constraints: {
            allowedTemplates: ["standard_meeting"],
            locked: { identityRequirement: "verified" },
          },
        })
        .then((h) => h.destroy())

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.constraints.allowed_templates).toEqual(["standard_meeting"])
    })
  })

  describe("accordSetupPopup()", () => {
    it("creates session and opens popup", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "popup_token",
        delivery_mode: "popup",
        embed_url: `${BASE_URL}/accord_setup/embed/popup_token`,
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const mockPopup = { closed: false, close: vi.fn() }
      vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      const handle = await overturo.accordSetupPopup({
        solution: "meetings",
      })

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("/accord_setup/embed/popup_token"),
        expect.any(String),
        expect.any(String)
      )

      handle.close()
    })
  })

  describe("accordSetupRedirect()", () => {
    it("creates session and navigates", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "redirect_token",
        delivery_mode: "redirect",
        embed_url: `${BASE_URL}/accord_setup/embed/redirect_token`,
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })

      await expect(
        overturo.accordSetupRedirect({
          solution: "meetings",
          redirectUri: "https://example.com/callback",
          state: "csrf_123",
        })
      ).resolves.not.toThrow()

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.delivery_mode).toBe("redirect")
      expect(body.redirect_uri).toBe("https://example.com/callback")
      expect(body.state).toBe("csrf_123")
    })
  })

  describe("error propagation", () => {
    it("accordSetup propagates session creation errors", async () => {
      const fetchMock = mockFetchError(422, {
        errors: { embed_origin: ["is required"] },
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await expect(overturo.accordSetup({ solution: "meetings", container: "#setup-container" })).rejects.toThrow()
    })

    it("accordSetupPopup propagates session creation errors", async () => {
      const fetchMock = mockFetchError(500, { error: "Internal server error" })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await expect(overturo.accordSetupPopup({ solution: "meetings" })).rejects.toThrow()
    })
  })

  describe("param passthrough", () => {
    it("accordSetup passes vertical and locale", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "token",
        delivery_mode: "embed",
        embed_url: "",
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await overturo
        .accordSetup({
          solution: "meetings",
          vertical: "healthcare",
          locale: "de-DE",
          container: "#setup-container",
        })
        .then((h) => h.destroy())

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.vertical).toBe("healthcare")
      expect(body.locale).toBe("de-DE")
    })

    it("accordSetupPopup passes archetype and constraints", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "token",
        delivery_mode: "popup",
        embed_url: "",
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)
      const mockPopup = { closed: false, close: vi.fn() }
      vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      const handle = await overturo.accordSetupPopup({
        archetype: "agent_authority",
        constraints: { hiddenSteps: ["presentation"] },
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.archetype).toBe("agent_authority")
      expect(body.constraints.hidden_steps).toEqual(["presentation"])

      handle.close()
    })
  })

  describe("preset support", () => {
    it("sends presetId in session creation request", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "preset_token",
        delivery_mode: "embed",
        embed_url: "",
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await overturo.createSetupSession({
        solution: "meetings",
        presetId: "asp_abc123",
      })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.preset_id).toBe("asp_abc123")
    })

    it("accordSetup passes presetId through to session creation", async () => {
      const fetchMock = mockFetchSuccess({
        session_token: "token",
        delivery_mode: "embed",
        embed_url: "",
        expires_at: "",
      })
      vi.stubGlobal("fetch", fetchMock)

      const overturo = new Overturo({ publishableKey: PK, baseUrl: BASE_URL })
      await overturo
        .accordSetup({
          solution: "meetings",
          container: "#setup-container",
          presetId: "asp_xyz789",
        })
        .then((h) => h.destroy())

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.preset_id).toBe("asp_xyz789")
    })
  })

  describe("constructor validation", () => {
    it("throws without publishable key", () => {
      expect(() => new Overturo({ publishableKey: "" })).toThrow("publishableKey is required")
    })
  })
})

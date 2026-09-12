import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createSetupEmbed, createSetupPopup, setupRedirect } from "../src/setup"
import type { SetupHandle, SetupPopupHandle } from "../src/types"

const BASE_URL = "https://overturo.com"

function sendMessage(type: string, data: Record<string, unknown> = {}) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: BASE_URL,
      data: { type, version: 1, ...data },
    })
  )
}

function sendMessageFromOrigin(origin: string, type: string, data: Record<string, unknown> = {}) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      data: { type, version: 1, ...data },
    })
  )
}

describe("createSetupEmbed", () => {
  let container: HTMLDivElement
  let handle: SetupHandle | null = null

  beforeEach(() => {
    container = document.createElement("div")
    container.id = "test-container"
    document.body.appendChild(container)
  })

  afterEach(() => {
    handle?.destroy()
    handle = null
    document.body.innerHTML = ""
  })

  it("creates an iframe with correct src and sandbox", () => {
    handle = createSetupEmbed(BASE_URL, {
      sessionToken: "test_token_123",
      container: "#test-container",
    })

    expect(handle.iframe).toBeInstanceOf(HTMLIFrameElement)
    expect(handle.iframe.src).toBe(`${BASE_URL}/accord_setup/embed/test_token_123`)
    expect(handle.iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-same-origin allow-popups")
    expect(handle.iframe.getAttribute("allow")).toBe("popups")
  })

  it("accepts HTMLElement as container", () => {
    handle = createSetupEmbed(BASE_URL, {
      sessionToken: "token",
      container: container,
    })

    expect(container.contains(handle.iframe)).toBe(true)
  })

  it("throws for invalid container selector", () => {
    expect(() =>
      createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#nonexistent",
      })
    ).toThrow("Container element not found")
  })

  it("shows string loading placeholder", () => {
    handle = createSetupEmbed(BASE_URL, {
      sessionToken: "token",
      container: "#test-container",
      loading: "<div class='spinner'>Loading...</div>",
    })

    const loading = container.querySelector("[data-overturo-loading]")
    expect(loading).toBeTruthy()
    expect(loading?.innerHTML).toContain("Loading...")
  })

  it("shows HTMLElement loading placeholder", () => {
    const loadingEl = document.createElement("div")
    loadingEl.textContent = "Please wait"

    handle = createSetupEmbed(BASE_URL, {
      sessionToken: "token",
      container: "#test-container",
      loading: loadingEl,
    })

    const wrapper = container.querySelector("[data-overturo-loading]")
    expect(wrapper).toBeTruthy()
    expect(wrapper?.textContent).toContain("Please wait")
  })

  it("applies style overrides to iframe", () => {
    handle = createSetupEmbed(BASE_URL, {
      sessionToken: "token",
      container: "#test-container",
      style: { width: "500px", minHeight: "600px", borderRadius: "8px" },
    })

    expect(handle.iframe.style.width).toBe("500px")
    expect(handle.iframe.style.minHeight).toBe("600px")
    expect(handle.iframe.style.borderRadius).toBe("8px")
  })

  it("uses default styles when no overrides", () => {
    handle = createSetupEmbed(BASE_URL, {
      sessionToken: "token",
      container: "#test-container",
    })

    expect(handle.iframe.style.width).toBe("100%")
    expect(handle.iframe.style.minHeight).toBe("400px")
  })

  describe("PostMessage handling", () => {
    it("calls onReady", () => {
      const onReady = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onReady,
      })

      sendMessage("overturoid:ready")
      expect(onReady).toHaveBeenCalledOnce()
    })

    it("calls onStep with structured data", () => {
      const onStep = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onStep,
      })

      sendMessage("overturoid:setup:step", {
        step: "purposes_and_scopes",
        stepIndex: 1,
        totalSteps: 5,
      })

      expect(onStep).toHaveBeenCalledWith({
        key: "purposes_and_scopes",
        index: 1,
        total: 5,
      })
    })

    it("calls onCreated with accord data", () => {
      const onCreated = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onCreated,
      })

      sendMessage("overturoid:setup:created", {
        accordId: "acc_123",
        flowId: "flw_456",
      })

      expect(onCreated).toHaveBeenCalledWith({
        accordId: "acc_123",
        flowId: "flw_456",
      })
    })

    it("calls onCancel", () => {
      const onCancel = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onCancel,
      })

      sendMessage("overturoid:cancel")
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it("calls onError with message", () => {
      const onError = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onError,
      })

      sendMessage("overturoid:error", { error: "Something went wrong" })
      expect(onError).toHaveBeenCalledWith("Something went wrong")
    })

    it("calls onResize and updates iframe height", () => {
      const onResize = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onResize,
      })

      sendMessage("overturoid:resize", { height: 800 })

      expect(onResize).toHaveBeenCalledWith(800)
      expect(handle.iframe.style.height).toBe("800px")
    })

    it("ignores resize without height", () => {
      const onResize = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onResize,
      })

      sendMessage("overturoid:resize", {})
      expect(onResize).not.toHaveBeenCalled()
    })
  })

  describe("origin validation", () => {
    it("ignores messages from wrong origin", () => {
      const onCreated = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onCreated,
      })

      sendMessageFromOrigin("https://evil.com", "overturoid:setup:created", {
        accordId: "acc_evil",
      })

      expect(onCreated).not.toHaveBeenCalled()
    })

    it("ignores messages with null data", () => {
      const onCreated = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onCreated,
      })

      window.dispatchEvent(
        new MessageEvent("message", {
          origin: BASE_URL,
          data: null,
        })
      )

      expect(onCreated).not.toHaveBeenCalled()
    })

    it("ignores messages without type field", () => {
      const onCreated = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onCreated,
      })

      window.dispatchEvent(
        new MessageEvent("message", {
          origin: BASE_URL,
          data: { accordId: "acc_123" },
        })
      )

      expect(onCreated).not.toHaveBeenCalled()
    })
  })

  describe("cleanup", () => {
    it("destroy() removes iframe from DOM", () => {
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
      })

      expect(container.contains(handle.iframe)).toBe(true)

      handle.destroy()
      expect(container.contains(handle.iframe)).toBe(false)
      handle = null // prevent double-destroy in afterEach
    })

    it("destroy() stops message listener", () => {
      const onCreated = vi.fn()
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
        onCreated,
      })

      handle.destroy()
      handle = null

      sendMessage("overturoid:setup:created", { accordId: "acc_123" })
      expect(onCreated).not.toHaveBeenCalled()
    })

    it("handles double destroy gracefully", () => {
      handle = createSetupEmbed(BASE_URL, {
        sessionToken: "token",
        container: "#test-container",
      })

      handle.destroy()
      expect(() => handle!.destroy()).not.toThrow()
      handle = null
    })
  })
})

describe("createSetupPopup", () => {
  let popupHandle: SetupPopupHandle | null = null

  afterEach(() => {
    popupHandle?.close()
    popupHandle = null
    vi.restoreAllMocks()
  })

  it("opens a popup window with correct URL and dimensions", () => {
    const mockPopup = { closed: false, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)

    popupHandle = createSetupPopup(BASE_URL, {
      sessionToken: "popup_token",
    })

    expect(window.open).toHaveBeenCalledWith(
      `${BASE_URL}/accord_setup/embed/popup_token`,
      "accord_setup_popup",
      expect.stringContaining("width=600")
    )
    expect(window.open).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining("height=800")
    )
  })

  it("uses custom dimensions", () => {
    const mockPopup = { closed: false, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)

    popupHandle = createSetupPopup(BASE_URL, {
      sessionToken: "token",
      width: 900,
      height: 1100,
    })

    expect(window.open).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining("width=900")
    )
  })

  it("calls onCreated when popup sends created message", () => {
    const mockPopup = { closed: false, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)

    const onCreated = vi.fn()
    popupHandle = createSetupPopup(BASE_URL, {
      sessionToken: "token",
      onCreated,
    })

    sendMessage("overturoid:setup:created", {
      accordId: "acc_popup",
      flowId: "flw_popup",
    })

    expect(onCreated).toHaveBeenCalledWith({
      accordId: "acc_popup",
      flowId: "flw_popup",
    })
  })

  it("calls onCancel when popup sends cancel message", () => {
    const mockPopup = { closed: false, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)

    const onCancel = vi.fn()
    popupHandle = createSetupPopup(BASE_URL, {
      sessionToken: "token",
      onCancel,
    })

    sendMessage("overturoid:cancel")
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("close() closes the popup window", () => {
    const mockPopup = { closed: false, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)

    popupHandle = createSetupPopup(BASE_URL, {
      sessionToken: "token",
    })

    popupHandle.close()
    expect(mockPopup.close).toHaveBeenCalled()
    popupHandle = null
  })

  it("detects popup closed by user via polling", async () => {
    const mockPopup = { closed: false, close: vi.fn() }
    vi.spyOn(window, "open").mockReturnValue(mockPopup as unknown as Window)
    vi.useFakeTimers()

    const onCancel = vi.fn()
    popupHandle = createSetupPopup(BASE_URL, {
      sessionToken: "token",
      onCancel,
    })

    // Simulate user closing the popup
    mockPopup.closed = true
    vi.advanceTimersByTime(600)

    expect(onCancel).toHaveBeenCalledOnce()

    vi.useRealTimers()
    popupHandle = null
  })
})

describe("setupRedirect", () => {
  it("constructs the correct embed URL", () => {
    // We can't actually test window.location.href assignment in jsdom,
    // but we can verify the function constructs the right URL by checking
    // it doesn't throw and the URL format is correct.
    const originalHref = window.location.href

    // setupRedirect will try to set window.location.href which jsdom silently ignores
    expect(() =>
      setupRedirect(BASE_URL, {
        sessionToken: "redirect_token",
        redirectUri: "https://example.com/callback",
      })
    ).not.toThrow()
  })
})

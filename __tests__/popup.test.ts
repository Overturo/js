import { describe, it, expect, vi, beforeEach } from "vitest"
import { createPopup } from "../src/popup"
import { OverturoError, OverturoValidationError } from "../src/errors"

// Rewritten for protocol v2 envelopes.

const BASE = {
  kind: "consent" as const,
  version: 2 as const,
  ts: "2026-06-05T12:00:00.000Z",
}

let messageIdCounter = 0
function nextId(): string {
  messageIdCounter++
  const hex = messageIdCounter.toString(16).padStart(12, "0")
  return `00000000-0000-4000-8000-${hex}`
}

describe("createPopup (v2)", () => {
  let mockOpen: ReturnType<typeof vi.fn>
  let mockPopupWindow: { closed: boolean; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockPopupWindow = { closed: false, close: vi.fn() }
    mockOpen = vi.fn().mockReturnValue(mockPopupWindow)
    vi.stubGlobal("open", mockOpen)
  })

  it("calls window.open with correct URL and features", () => {
    const handle = createPopup("https://example.com", {
      sessionToken: "tok_abc",
    })

    expect(mockOpen).toHaveBeenCalledWith(
      "https://example.com/accord/embed/tok_abc",
      expect.stringContaining("overturo_decision_"),
      expect.stringContaining("width=500")
    )
    expect(mockOpen.mock.calls[0][2]).toContain("height=700")
    handle.close()
  })

  it("fires onComplete (kind, payload) and closes popup on overturo:complete", () => {
    const onComplete = vi.fn()
    createPopup("https://example.com", {
      sessionToken: "tok_abc",
      onComplete,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...BASE,
          type: "overturo:complete",
          payload: {
            outcome: "granted",
            exchange_token: "ctx_xyz",
            completed_at: "2026-06-05T12:00:30.000Z",
          },
          message_id: nextId(),
        },
      })
    )

    expect(onComplete).toHaveBeenCalledWith(
      "consent",
      expect.objectContaining({ outcome: "granted", exchange_token: "ctx_xyz" })
    )
    expect(mockPopupWindow.close).toHaveBeenCalled()
  })

  it("fires onCancel(payload) and closes popup on overturo:cancel", () => {
    const onCancel = vi.fn()
    createPopup("https://example.com", {
      sessionToken: "tok_abc",
      onCancel,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...BASE,
          type: "overturo:cancel",
          payload: { reason: "user_declined", cancelled_by: "principal" },
          message_id: nextId(),
        },
      })
    )

    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ reason: "user_declined" }))
    expect(mockPopupWindow.close).toHaveBeenCalled()
  })

  it("close() removes listener and closes popup", () => {
    const onComplete = vi.fn()
    const handle = createPopup("https://example.com", {
      sessionToken: "tok_abc",
      onComplete,
    })

    handle.close()
    expect(mockPopupWindow.close).toHaveBeenCalled()

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...BASE,
          type: "overturo:complete",
          payload: {
            outcome: "granted",
            exchange_token: "ctx_xyz",
            completed_at: "2026-06-05T12:00:30.000Z",
          },
          message_id: nextId(),
        },
      })
    )

    expect(onComplete).not.toHaveBeenCalled()
  })

  it("throws on missing sessionToken", () => {
    expect(() => createPopup("https://example.com", { sessionToken: "" })).toThrow(OverturoValidationError)
  })

  it("centers popup on screen", () => {
    createPopup("https://example.com", {
      sessionToken: "tok_abc",
      width: 400,
      height: 600,
    })

    const features = mockOpen.mock.calls[0][2]
    expect(features).toContain("width=400")
    expect(features).toContain("height=600")
    expect(features).toMatch(/left=-?\d+/)
    expect(features).toMatch(/top=-?\d+/)
  })

  it("throws OverturoError when popup is blocked (window.open returns null)", () => {
    mockOpen.mockReturnValue(null)
    expect(() => createPopup("https://example.com", { sessionToken: "tok_abc" })).toThrow(OverturoError)
  })

  it("uses unique window names for concurrent popups", () => {
    const handle1 = createPopup("https://example.com", { sessionToken: "tok_1" })
    const handle2 = createPopup("https://example.com", { sessionToken: "tok_2" })

    const name1 = mockOpen.mock.calls[0][1]
    const name2 = mockOpen.mock.calls[1][1]
    expect(name1).not.toBe(name2)
    expect(name1).toMatch(/^overturo_decision_\d+$/)
    expect(name2).toMatch(/^overturo_decision_\d+$/)

    handle1.close()
    handle2.close()
  })

  it("fires onError(payload) on overturo:error without closing popup", () => {
    const onError = vi.fn()
    const handle = createPopup("https://example.com", {
      sessionToken: "tok_abc",
      onError,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...BASE,
          type: "overturo:error",
          payload: {
            code: "auth_failed",
            message: "Something failed",
            fatal: false,
            recoverable_via: "new_session",
          },
          message_id: nextId(),
        },
      })
    )

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "auth_failed", message: "Something failed" }))
    expect(mockPopupWindow.close).not.toHaveBeenCalled()
    handle.close()
  })

  it("drops legacy overturoid:* envelopes", () => {
    const onComplete = vi.fn()
    const handle = createPopup("https://example.com", {
      sessionToken: "tok_abc",
      onComplete,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: { type: "overturoid:complete", consent_token: "ct_xyz" },
      })
    )

    expect(onComplete).not.toHaveBeenCalled()
    handle.close()
  })

  it("ignores messages from wrong origin", () => {
    const onComplete = vi.fn()
    const handle = createPopup("https://example.com", {
      sessionToken: "tok_abc",
      onComplete,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.com",
        data: {
          ...BASE,
          type: "overturo:complete",
          payload: {
            outcome: "granted",
            exchange_token: "ctx_xyz",
            completed_at: "2026-06-05T12:00:30.000Z",
          },
          message_id: nextId(),
        },
      })
    )

    expect(onComplete).not.toHaveBeenCalled()
    handle.close()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createEmbed } from "../src/embed"
import { OverturoValidationError } from "../src/errors"

// Rewritten for protocol v2 envelopes.
// v1 messages (`overturoid:*`) are dropped by the envelope validator.

const READY_BASE = {
  kind: "consent" as const,
  version: 2 as const,
  ts: "2026-06-05T12:00:00.000Z",
}

const VALID_READY_PAYLOAD = {
  kind: "consent",
  session_token: "a".repeat(43),
  deadline_at: "2026-12-31T23:59:59.000Z",
  branding: { application_name: "Demo Co", logo_url: null, primary_color: null },
  mode: "embed",
  locale: "en-US",
}

let messageIdCounter = 0
function nextId(): string {
  messageIdCounter++
  const hex = messageIdCounter.toString(16).padStart(12, "0")
  return `00000000-0000-4000-8000-${hex}`
}

describe("createEmbed (v2)", () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement("div")
    container.id = "embed-test"
    document.body.appendChild(container)
  })

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container)
    }
  })

  it("creates iframe with correct src", () => {
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
    })
    expect(handle.iframe.src).toBe("https://example.com/accord/embed/tok_abc")
    handle.destroy()
  })

  it("does not set an `allow` attribute (popups is not a Permissions-Policy feature)", () => {
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
    })
    // Browsers warn "Unrecognized feature: 'popups'" — the popup
    // permission for sandboxed iframes belongs in `sandbox`, not
    // `allow`.
    expect(handle.iframe.getAttribute("allow")).toBeNull()
    handle.destroy()
  })

  it("sets sandbox attribute with required permissions", () => {
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
    })
    expect(handle.iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-same-origin allow-popups")
    handle.destroy()
  })

  it("applies default styles", () => {
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
    })
    expect(handle.iframe.style.width).toBe("100%")
    expect(handle.iframe.style.minHeight).toBe("400px")
    handle.destroy()
  })

  it("applies style overrides (whitelist only)", () => {
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      style: { minHeight: "600px", borderRadius: "12px" },
    })
    expect(handle.iframe.style.minHeight).toBe("600px")
    expect(handle.iframe.style.borderRadius).toBe("12px")
    handle.destroy()
  })

  it("fires onComplete with (kind, payload) on overturo:complete (consent)", () => {
    const onComplete = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onComplete,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
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

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(
      "consent",
      expect.objectContaining({ outcome: "granted", exchange_token: "ctx_xyz" })
    )
    handle.destroy()
  })

  it("fires onComplete with kind='approval' for approval envelopes", () => {
    const onComplete = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onComplete,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
          kind: "approval",
          type: "overturo:complete",
          payload: {
            outcome: "approved",
            exchange_token: "atx_xyz",
            completed_at: "2026-06-05T12:00:30.000Z",
          },
          message_id: nextId(),
        },
      })
    )

    expect(onComplete).toHaveBeenCalledWith("approval", expect.objectContaining({ outcome: "approved" }))
    handle.destroy()
  })

  it("fires onCancel on overturo:cancel", () => {
    const onCancel = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onCancel,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
          type: "overturo:cancel",
          payload: { reason: "user_declined", cancelled_by: "principal" },
          message_id: nextId(),
        },
      })
    )

    expect(onCancel).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "user_declined", cancelled_by: "principal" })
    )
    handle.destroy()
  })

  it("fires onError on overturo:error with payload", () => {
    const onError = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onError,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
          type: "overturo:error",
          payload: {
            code: "auth_failed",
            message: "Something went wrong",
            fatal: false,
            recoverable_via: "new_session",
          },
          message_id: nextId(),
        },
      })
    )

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "auth_failed", message: "Something went wrong" })
    )
    handle.destroy()
  })

  it("fires onState (replaces v1 onStep) on overturo:state", () => {
    const onState = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onState,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
          type: "overturo:state",
          payload: { from: null, to: "reviewing", step_index: 0, total_steps: 3 },
          message_id: nextId(),
        },
      })
    )

    expect(onState).toHaveBeenCalledWith("consent", expect.objectContaining({ to: "reviewing", step_index: 0 }))
    handle.destroy()
  })

  it("fires onDeadline on overturo:deadline", () => {
    const onDeadline = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onDeadline,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
          type: "overturo:deadline",
          payload: {
            remaining_seconds: 30,
            level: "warning",
            deadline_at: "2026-12-31T23:59:59.000Z",
          },
          message_id: nextId(),
        },
      })
    )

    expect(onDeadline).toHaveBeenCalledWith(expect.objectContaining({ remaining_seconds: 30, level: "warning" }))
    handle.destroy()
  })

  it("fires onResize and sets iframe height on overturo:resize", () => {
    const onResize = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onResize,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
          type: "overturo:resize",
          payload: { height: 750 },
          message_id: nextId(),
        },
      })
    )

    expect(onResize).toHaveBeenCalledWith(750)
    expect(handle.iframe.style.height).toBe("750px")
    handle.destroy()
  })

  it("fires onReady with the READY payload on overturo:ready", () => {
    const onReady = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onReady,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
          type: "overturo:ready",
          payload: VALID_READY_PAYLOAD,
          message_id: nextId(),
        },
      })
    )

    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "consent", session_token: VALID_READY_PAYLOAD.session_token })
    )
    handle.destroy()
  })

  it("drops legacy overturoid:* envelopes (envelope validator rejects)", () => {
    const onComplete = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onComplete,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: { type: "overturoid:complete", consent_token: "ct_xyz" },
      })
    )

    expect(onComplete).not.toHaveBeenCalled()
    handle.destroy()
  })

  it("destroy() removes listener and iframe", () => {
    const onComplete = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onComplete,
    })

    expect(container.querySelector("iframe")).not.toBeNull()
    handle.destroy()
    expect(container.querySelector("iframe")).toBeNull()

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: {
          ...READY_BASE,
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

  it("ignores messages from wrong origin", () => {
    const onComplete = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onComplete,
    })

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.com",
        data: {
          ...READY_BASE,
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
    handle.destroy()
  })

  it("throws OverturoValidationError when container not found", () => {
    expect(() =>
      createEmbed("https://example.com", {
        sessionToken: "tok_abc",
        container: "#nonexistent-container",
      })
    ).toThrow(OverturoValidationError)
  })

  it("ignores messages with no envelope shape", () => {
    const onComplete = vi.fn()
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      onComplete,
    })

    window.dispatchEvent(new MessageEvent("message", { origin: "https://example.com", data: { foo: "bar" } }))
    window.dispatchEvent(new MessageEvent("message", { origin: "https://example.com", data: null }))

    expect(onComplete).not.toHaveBeenCalled()
    handle.destroy()
  })

  it("shows and removes loading state", () => {
    const handle = createEmbed("https://example.com", {
      sessionToken: "tok_abc",
      container,
      loading: "<p>Loading...</p>",
    })

    const loadingEl = container.querySelector("[data-overturo-loading]")
    expect(loadingEl).not.toBeNull()
    expect(loadingEl!.innerHTML).toBe("<p>Loading...</p>")

    handle.iframe.dispatchEvent(new Event("load"))
    expect(container.querySelector("[data-overturo-loading]")).toBeNull()
    handle.destroy()
  })
})

// `<overturo-decision>` accessibility.
//
// Ten accessibility requirements. The full axe-core scan is
// flagged as a follow-up (axe isn't a current devDep); this file
// covers the structural baseline that doesn't need a rules engine:
// the host element ships with the right ARIA, the right tabindex,
// the right focus management, and an assertive-live region on error.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ELEMENT_NAME } from "../src/elements"
import { MESSAGE_TYPES_V2 } from "../src/constants"

let host: HTMLElement
let idCounter = 0

const nextId = (): string => {
  // RFC 4122 v4 UUID — the envelope schema requires this exact form.
  const hex = (n: number): string => n.toString(16).padStart(4, "0")
  idCounter += 1
  return `${hex(idCounter)}0000-0000-4000-8000-000000000000`
}

// Schema-valid READY payload skeleton. The element pulls `title` from
// the branding object when setting aria-label.
const validReadyPayload = (
  kind: "consent" | "approval",
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  kind,
  session_token: "a".repeat(43),
  deadline_at: "2026-12-31T23:59:59.000Z",
  branding: { application_name: "Demo Co", logo_url: null, primary_color: null },
  mode: "embed",
  locale: "en",
  ...extra,
})

// Schema-valid ERROR payload. Schema requires `code`, `message`, `fatal`.
const validErrorPayload = (
  _kind: "consent" | "approval",
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  code: "server_error",
  message: "Something went wrong",
  fatal: false,
  ...extra,
})

const envelope = (
  type: (typeof MESSAGE_TYPES_V2)[keyof typeof MESSAGE_TYPES_V2],
  kind: "consent" | "approval",
  payload: Record<string, unknown>
): Record<string, unknown> => ({
  type,
  kind,
  version: 2,
  payload,
  ts: "2026-06-05T12:00:00.000Z",
  message_id: nextId(),
})

beforeEach(() => {
  idCounter = 0
  host = document.createElement(ELEMENT_NAME)
  host.setAttribute("token", "ds_a11y_test")
  host.setAttribute("flow-base-url", "https://flow.test.local")
  document.body.appendChild(host)
})

afterEach(() => {
  document.body.innerHTML = ""
})

describe("<overturo-decision> structural a11y", () => {
  it("has role=region on mount", () => {
    expect(host.getAttribute("role")).toBe("region")
  })

  it("starts with aria-busy=true (advertising the loading state)", () => {
    expect(host.getAttribute("aria-busy")).toBe("true")
  })

  it("is focusable via tabindex=0", () => {
    expect(host.getAttribute("tabindex")).toBe("0")
  })

  it("flips aria-busy to false on READY envelope", () => {
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const origin = new URL(iframe.src).origin
    window.dispatchEvent(
      new MessageEvent("message", {
        data: envelope(MESSAGE_TYPES_V2.READY, "consent", validReadyPayload("consent", { title: "Consent decision" })),
        origin,
      })
    )
    expect(host.getAttribute("aria-busy")).toBe("false")
  })

  it("updates aria-label from the READY envelope's title", () => {
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const origin = new URL(iframe.src).origin
    window.dispatchEvent(
      new MessageEvent("message", {
        data: envelope(
          MESSAGE_TYPES_V2.READY,
          "consent",
          validReadyPayload("consent", { title: "Approve a payment to ACME Co" })
        ),
        origin,
      })
    )
    expect(host.getAttribute("aria-label")).toBe("Approve a payment to ACME Co")
  })

  it("does NOT update aria-label when READY arrives without a title", () => {
    const initialLabel = host.getAttribute("aria-label")
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const origin = new URL(iframe.src).origin
    window.dispatchEvent(
      new MessageEvent("message", {
        data: envelope(
          MESSAGE_TYPES_V2.READY,
          "consent",
          // No `title`; no `application_name` override. Element keeps
          // the placeholder label.
          {
            ...validReadyPayload("consent"),
            branding: { application_name: null, logo_url: null, primary_color: null },
          }
        ),
        origin,
      })
    )
    expect(host.getAttribute("aria-label")).toBe(initialLabel)
  })

  it("injects an aria-live=assertive region on ERROR envelope", () => {
    const iframe = host.shadowRoot!.querySelector("iframe")!
    const origin = new URL(iframe.src).origin
    window.dispatchEvent(
      new MessageEvent("message", {
        data: envelope(MESSAGE_TYPES_V2.ERROR, "consent", validErrorPayload("consent")),
        origin,
      })
    )
    const region = host.shadowRoot!.querySelector('[aria-live="assertive"]')
    expect(region).not.toBeNull()
    expect(region!.getAttribute("role")).toBe("alert")
    expect(region!.textContent).toBe("Something went wrong")
  })

  it("iframe carries title attribute (screen readers don't announce 'unnamed frame')", () => {
    const iframe = host.shadowRoot!.querySelector("iframe")
    expect(iframe!.title).toBe("Overturo decision form")
  })

  it("supports a theme attribute by appending ?theme= and tagging the iframe dataset", () => {
    host.setAttribute("theme", "dark")
    // Element re-mounts on attribute change.
    const iframe = host.shadowRoot!.querySelector("iframe")!
    expect(iframe.src).toContain("?theme=dark")
    expect(iframe.dataset.theme).toBe("dark")
  })
})

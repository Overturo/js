// buildOutcome kind-discrimination. Guards the bug where the signing
// kind fell through to a hardcoded `kind: "approval"` outcome (so a signing
// completion would never reach the signing facade's kind-guarded onComplete).

import { describe, expect, it } from "vitest"
import { buildOutcome } from "../src/decisions"

describe("buildOutcome — signing kind", () => {
  it("builds a signature_request outcome (not approval) from a snake_case COMPLETE", () => {
    const outcome = buildOutcome("signature_request", {
      outcome: "signed",
      assurance_level: "qualified",
      completed_at: "2026-06-26T12:00:30.000Z",
    })
    expect(outcome.kind).toBe("signature_request")
    expect(outcome).toMatchObject({
      kind: "signature_request",
      result: "signed",
      assuranceLevel: "qualified",
      completedAt: "2026-06-26T12:00:30.000Z",
    })
  })

  it.each(["signed", "declined", "countered"] as const)("maps the %s wire outcome to result", (wire) => {
    const outcome = buildOutcome("signature_request", { outcome: wire })
    expect(outcome.kind).toBe("signature_request")
    expect(outcome.result).toBe(wire)
  })

  it("leaves assurance/completedAt undefined when absent (fail-closed, not fabricated)", () => {
    const outcome = buildOutcome("signature_request", { outcome: "declined" })
    if (outcome.kind !== "signature_request") throw new Error("wrong kind")
    expect(outcome.assuranceLevel).toBeUndefined()
    expect(outcome.completedAt).toBeUndefined()
  })

  it("still discriminates consent and approval correctly", () => {
    expect(buildOutcome("consent", { result: "granted" }).kind).toBe("consent")
    expect(buildOutcome("approval", { result: "approved" }).kind).toBe("approval")
  })
})

// Regression — buildOutcome must read the snake_case wire fields the Trust
// Surface frame actually emits (`outcome` + `exchange_token`), not the
// camelCase names the SDK type uses. Previously `consentToken`/`escalationToken`
// were always undefined and a declined/denied COMPLETE mapped to granted/approved.
describe("buildOutcome — consent/approval wire mapping", () => {
  it("maps consent `outcome` + `exchange_token` from the wire", () => {
    const outcome = buildOutcome("consent", {
      outcome: "declined",
      exchange_token: "ctx_abc",
      completed_at: "2026-06-26T12:00:30.000Z",
    })
    expect(outcome).toMatchObject({
      kind: "consent",
      result: "declined",
      consentToken: "ctx_abc",
    })
  })

  it("maps approval `outcome` + `exchange_token` from the wire", () => {
    const outcome = buildOutcome("approval", {
      outcome: "denied",
      exchange_token: "atx_xyz",
      completed_at: "2026-06-26T12:00:30.000Z",
    })
    expect(outcome).toMatchObject({
      kind: "approval",
      result: "denied",
      escalationToken: "atx_xyz",
    })
  })

  it("treats a null exchange_token as an absent token (not null)", () => {
    const outcome = buildOutcome("consent", {
      outcome: "granted",
      exchange_token: null,
    })
    if (outcome.kind !== "consent") throw new Error("wrong kind")
    expect(outcome.consentToken).toBeUndefined()
  })
})

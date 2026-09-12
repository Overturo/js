import { describe, expect, it } from "vitest"

import {
  OapAuthorizationDenied,
  OapDenied,
  OapIntentDenied,
  OapSequenceDenied,
  OapTrajectoryDenied,
  type OapDenialCategory,
  type OapErrorEnvelope,
} from "../src/errors"

// 1 / 100-2 — OapDenied.fromEnvelope dispatch.
// Mirrors the @overturo/authorize SDK's error tests so the two
// surfaces share semantics.
describe("OapDenied.fromEnvelope", () => {
  const envelope = (extra: Partial<OapErrorEnvelope>): OapErrorEnvelope => ({
    reason_code: "scope_not_covered",
    message: "demo",
    ...extra,
  })

  const cases: Array<{
    category: OapDenialCategory
    klass: typeof OapDenied
  }> = [
    { category: "authorization_denied", klass: OapAuthorizationDenied },
    { category: "intent_denied", klass: OapIntentDenied },
    { category: "trajectory_denied", klass: OapTrajectoryDenied },
  ]

  cases.forEach(({ category, klass }) => {
    it(`dispatches denial_category=${category} to ${klass.name}`, () => {
      const e = OapDenied.fromEnvelope(envelope({ denial_category: category, cascade_step: 4 }), 403, {})
      expect(e).toBeInstanceOf(klass)
      expect(e).toBeInstanceOf(OapDenied)
      expect(e.denial_category).toBe(category)
      expect(e.cascade_step).toBe(4)
    })
  })

  it("falls back to OapDenied when denial_category is absent", () => {
    const e = OapDenied.fromEnvelope(envelope({ reason_code: "validation_failed" }), 422, {})
    expect(e.constructor).toBe(OapDenied)
  })

  // ── sequence dispatch precedence ────────────────
  describe("OapSequenceDenied", () => {
    it.each([["sequence_prohibited" as const], ["sequence_missing_predecessor" as const]])(
      "dispatches reason_code=%s to OapSequenceDenied",
      (reason_code) => {
        const e = OapDenied.fromEnvelope(
          envelope({
            reason_code,
            denial_category: "trajectory_denied",
            cascade_step: 13,
            failed_bound: "sequence_bounds",
          }),
          403,
          {}
        )
        expect(e).toBeInstanceOf(OapSequenceDenied)
        expect(e).toBeInstanceOf(OapTrajectoryDenied)
        expect(e).toBeInstanceOf(OapDenied)
        expect(e.failed_bound).toBe("sequence_bounds")
      }
    )

    it("does NOT downgrade other trajectory_denied codes to OapSequenceDenied", () => {
      const e = OapDenied.fromEnvelope(
        envelope({
          reason_code: "value_exceeds_tx_max",
          denial_category: "trajectory_denied",
          cascade_step: 10,
        }),
        403,
        {}
      )
      expect(e).toBeInstanceOf(OapTrajectoryDenied)
      expect(e).not.toBeInstanceOf(OapSequenceDenied)
    })
  })
})

// type-level assertions.
//
// Uses Vitest's `expectTypeOf` to verify the kind-discriminated union
// narrowing works as the spec promises. Tests in `.test-d.ts` files
// are compile-time-only; vitest runs them via the `typecheck` pass.

import { expectTypeOf, test } from "vitest"
import type {
  ApprovalsNamespace,
  ConsentNamespace,
  DecisionExchange,
  DecisionOutcome,
  DecisionToken,
  DecisionsCreateSessionInput,
  DecisionsHandle,
  DecisionsNamespace,
} from "../src/types"

test("DecisionOutcome narrows on kind=consent", () => {
  const outcome: DecisionOutcome = {
    kind: "consent",
    result: "granted",
    purposesGranted: ["analytics"],
    purposesDeclined: [],
  }
  if (outcome.kind === "consent") {
    expectTypeOf(outcome.purposesGranted).toEqualTypeOf<string[] | undefined>()
    expectTypeOf(outcome.result).toEqualTypeOf<"granted" | "declined">()
  }
})

test("DecisionOutcome narrows on kind=approval", () => {
  const outcome: DecisionOutcome = {
    kind: "approval",
    result: "approved",
    escalationToken: "etok_x",
  }
  if (outcome.kind === "approval") {
    expectTypeOf(outcome.escalationToken).toEqualTypeOf<string | undefined>()
    expectTypeOf(outcome.result).toEqualTypeOf<"approved" | "denied" | "countered">()
  }
})

test("DecisionsCreateSessionInput rejects mixing consent fields into approval input", () => {
  // Approval input does NOT have `scope` or `nonce`. The type should
  // reject either by structural shape.
  const _approval: DecisionsCreateSessionInput = {
    kind: "approval",
    subjectRef: "esc_x",
    mode: "embed",
    // @ts-expect-error — scope is consent-only
    scope: "openid",
  }
  void _approval
})

test("DecisionExchange narrows", () => {
  const x: DecisionExchange = { kind: "consent", consentToken: "ct_x" }
  if (x.kind === "consent") {
    expectTypeOf(x.consentToken).toEqualTypeOf<string>()
  }
  const y: DecisionExchange = { kind: "approval", escalationToken: "et_x" }
  if (y.kind === "approval") {
    expectTypeOf(y.escalationToken).toEqualTypeOf<string>()
  }
})

test("DecisionToken is nominal (won't accept bare strings without cast)", () => {
  // Bare string is NOT assignable to DecisionToken; consumer must cast.
  // @ts-expect-error — string not assignable to branded token
  const _bad: DecisionToken = "not-a-token"
  const ok: DecisionToken = "ds_token" as DecisionToken
  void ok
  void _bad
})

test("DecisionsNamespace methods return the right shapes", () => {
  type EmbedRet = ReturnType<DecisionsNamespace["embed"]>
  expectTypeOf<EmbedRet>().toEqualTypeOf<DecisionsHandle>()

  type UrlRet = ReturnType<DecisionsNamespace["url"]>
  expectTypeOf<UrlRet>().toEqualTypeOf<string>()

  type CancelRet = ReturnType<DecisionsNamespace["cancel"]>
  expectTypeOf<CancelRet>().toEqualTypeOf<Promise<void>>()
})

test("ConsentNamespace + ApprovalsNamespace are distinct types", () => {
  // They share `open()` and `url()` shape-wise but with different
  // parameter discriminators; not assignable across.
  type Consent = ConsentNamespace
  type Approvals = ApprovalsNamespace
  expectTypeOf<Consent>().not.toEqualTypeOf<Approvals>()
})

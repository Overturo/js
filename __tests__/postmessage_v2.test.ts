import { describe, expect, it } from "vitest"
import { validate, validateEnvelope, validatePayload, type Envelope } from "../src/postmessage_v2"

const VALID_READY: Envelope = {
  type: "overturo:ready",
  kind: "consent",
  version: 2,
  payload: {
    kind: "consent",
    session_token: "a".repeat(43),
    deadline_at: "2026-12-31T23:59:59.000Z",
    branding: { application_name: "Test App", logo_url: null, primary_color: null },
    mode: "embed",
    locale: "en-US",
  },
  ts: "2026-06-05T12:00:00.000Z",
  message_id: "550e8400-e29b-41d4-a716-446655440000",
}

describe("postmessage v2 validator", () => {
  it("accepts a well-formed READY envelope", () => {
    const r = validate(VALID_READY)
    expect(r.valid, JSON.stringify(r.errors)).toBe(true)
  })

  it("validateEnvelope rejects envelope with missing message_id", () => {
    const { message_id: _drop, ...rest } = VALID_READY
    expect(validateEnvelope(rest).valid).toBe(false)
  })

  it("validateEnvelope rejects envelope with version != 2", () => {
    expect(validateEnvelope({ ...VALID_READY, version: 1 }).valid).toBe(false)
  })

  it("validateEnvelope rejects unknown type", () => {
    expect(validateEnvelope({ ...VALID_READY, type: "overturo:bogus" }).valid).toBe(false)
  })

  it("validateEnvelope rejects unknown kind", () => {
    expect(validateEnvelope({ ...VALID_READY, kind: "unknown" }).valid).toBe(false)
  })

  it("validateEnvelope rejects additionalProperties at envelope level", () => {
    expect(validateEnvelope({ ...VALID_READY, extra: 1 }).valid).toBe(false)
  })

  it("validateEnvelope rejects non-UUID v4 message_id", () => {
    expect(validateEnvelope({ ...VALID_READY, message_id: "not-a-uuid" }).valid).toBe(false)
  })

  it("kind-routes STATE payload: consent shape", () => {
    const env: Envelope = {
      ...VALID_READY,
      type: "overturo:state",
      payload: { from: null, to: "reviewing", step_index: 0, total_steps: 3 },
    }
    const r = validate(env)
    expect(r.valid, JSON.stringify(r.errors)).toBe(true)
  })

  it("kind-routes STATE payload: approval shape with kind_payload", () => {
    const env: Envelope = {
      ...VALID_READY,
      kind: "approval",
      type: "overturo:state",
      payload: {
        from: null,
        to: "opened",
        kind_payload: {
          agent_id: "agt_x",
          action_class: "send_email",
          scope_invoked: "email:send",
        },
      },
    }
    const r = validate(env)
    expect(r.valid, JSON.stringify(r.errors)).toBe(true)
  })

  it("rejects approval STATE missing kind_payload.action_class", () => {
    const env: Envelope = {
      ...VALID_READY,
      kind: "approval",
      type: "overturo:state",
      payload: {
        from: null,
        to: "opened",
        kind_payload: { agent_id: "agt_x", scope_invoked: "email:send" },
      },
    }
    expect(validate(env).valid).toBe(false)
  })

  it("accepts COMPLETE with kind-discriminated outcome enum", () => {
    const consentComplete: Envelope = {
      ...VALID_READY,
      type: "overturo:complete",
      payload: {
        outcome: "granted",
        exchange_token: "ctx_abc",
        completed_at: "2026-06-05T12:00:30.000Z",
      },
    }
    expect(validate(consentComplete).valid).toBe(true)

    const approvalComplete: Envelope = {
      ...VALID_READY,
      kind: "approval",
      type: "overturo:complete",
      payload: {
        outcome: "approved",
        exchange_token: "atx_xyz",
        completed_at: "2026-06-05T12:00:30.000Z",
      },
    }
    expect(validate(approvalComplete).valid).toBe(true)
  })

  it("rejects consent COMPLETE with approval outcome", () => {
    const env: Envelope = {
      ...VALID_READY,
      type: "overturo:complete",
      payload: { outcome: "approved", completed_at: "2026-06-05T12:00:30.000Z" },
    }
    expect(validate(env).valid).toBe(false)
  })

  it("accepts DEADLINE with valid level", () => {
    const env: Envelope = {
      ...VALID_READY,
      type: "overturo:deadline",
      payload: {
        remaining_seconds: 30,
        level: "warning",
        deadline_at: "2026-12-31T23:59:59.000Z",
      },
    }
    expect(validate(env).valid).toBe(true)
  })

  it("accepts CANCEL with valid reason/cancelled_by", () => {
    const env: Envelope = {
      ...VALID_READY,
      type: "overturo:cancel",
      payload: { reason: "user_declined", cancelled_by: "principal" },
    }
    expect(validate(env).valid).toBe(true)
  })

  it("rejects CANCEL with unknown reason", () => {
    const env: Envelope = {
      ...VALID_READY,
      type: "overturo:cancel",
      payload: { reason: "bogus", cancelled_by: "principal" },
    }
    expect(validate(env).valid).toBe(false)
  })

  it("accepts RESIZE with integer height", () => {
    const env: Envelope = {
      ...VALID_READY,
      type: "overturo:resize",
      payload: { height: 480 },
    }
    expect(validate(env).valid).toBe(true)
  })

  it("validatePayload short-circuits unknown type", () => {
    const r = validatePayload({ ...VALID_READY, type: "overturo:bogus" } as Envelope)
    expect(r.valid).toBe(false)
    expect(r.errors?.[0].message).toContain("Unknown type")
  })
})

// signing kind conformance against schemas/postmessage-v2/signature/*.
describe("postmessage v2 — signing kind", () => {
  const SIGNING_READY: Envelope = { ...VALID_READY, kind: "signature_request" }

  it("kind-routes a signing STATE payload (assurance + progress)", () => {
    const env: Envelope = {
      ...SIGNING_READY,
      type: "overturo:state",
      payload: {
        from: null,
        to: "in_progress",
        kind_payload: {
          required_assurance_level: "advanced",
          participant_role: "counterparty",
        },
      },
    }
    expect(validate(env).valid, JSON.stringify(validate(env).errors)).toBe(true)
  })

  it("rejects a signing STATE missing kind_payload.required_assurance_level", () => {
    const env: Envelope = {
      ...SIGNING_READY,
      type: "overturo:state",
      payload: { from: null, to: "opened", kind_payload: { participant_role: null } },
    }
    expect(validate(env).valid).toBe(false)
  })

  it("accepts the three COMPLETE outcomes: signed / declined / countered", () => {
    for (const outcome of ["signed", "declined", "countered"]) {
      const env: Envelope = {
        ...SIGNING_READY,
        type: "overturo:complete",
        payload: { outcome, completed_at: "2026-06-05T12:00:30.000Z" },
      }
      expect(validate(env).valid, `${outcome}: ${JSON.stringify(validate(env).errors)}`).toBe(true)
    }
  })

  it("REJECTS `expired` as a COMPLETE outcome (it is a STATE, not a completion)", () => {
    const env: Envelope = {
      ...SIGNING_READY,
      type: "overturo:complete",
      payload: { outcome: "expired", completed_at: "2026-06-05T12:00:30.000Z" },
    }
    expect(validate(env).valid).toBe(false)
  })

  it("accepts a COMPLETE carrying an assurance label", () => {
    const env: Envelope = {
      ...SIGNING_READY,
      type: "overturo:complete",
      payload: {
        outcome: "signed",
        assurance_level: "qualified",
        completed_at: "2026-06-05T12:00:30.000Z",
      },
    }
    expect(validate(env).valid, JSON.stringify(validate(env).errors)).toBe(true)
  })

  it("rejects a COMPLETE with an out-of-vocabulary assurance label", () => {
    const env: Envelope = {
      ...SIGNING_READY,
      type: "overturo:complete",
      payload: {
        outcome: "signed",
        assurance_level: "platinum",
        completed_at: "2026-06-05T12:00:30.000Z",
      },
    }
    expect(validate(env).valid).toBe(false)
  })
})

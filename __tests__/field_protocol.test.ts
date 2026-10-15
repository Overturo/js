// 202 — the field-v1 validator helper.
import { describe, expect, it } from "vitest"
import { fieldEnvelope, validateField, validateFieldEnvelope, validateFieldPayload } from "../src/field/protocol"
import { FIELD_MESSAGE_TYPES, FIELD_PROTOCOL_VERSION } from "../src/field/constants"

describe("field-v1 protocol", () => {
  it("builds an envelope the validator accepts, for every type", () => {
    const payloads: Record<string, Record<string, unknown>> = {
      [FIELD_MESSAGE_TYPES.READY]: {},
      [FIELD_MESSAGE_TYPES.STATE]: { decisions: { marketing: "granted" } },
      [FIELD_MESSAGE_TYPES.RESIZE]: { height: 96 },
      [FIELD_MESSAGE_TYPES.COMPLETE]: { token: "tok", committed: false, record_id: null },
      [FIELD_MESSAGE_TYPES.ERROR]: { code: "network" },
      [FIELD_MESSAGE_TYPES.SUBMIT_REQUESTED]: {},
      [FIELD_MESSAGE_TYPES.INIT]: { locale: "en" },
      [FIELD_MESSAGE_TYPES.CAPTURE]: { subject: { email: "p@example.com" }, commit: false },
      [FIELD_MESSAGE_TYPES.RESET]: {},
    }
    for (const [type, payload] of Object.entries(payloads)) {
      const env = fieldEnvelope(type as never, payload)
      expect(env.version).toBe(FIELD_PROTOCOL_VERSION)
      expect(validateField(env).valid, type).toBe(true)
    }
  })

  it("rejects a v2 envelope, a wrong version, an unknown type and a bad payload", () => {
    expect(validateFieldEnvelope({ type: "overturo:ready", kind: "consent", version: 2, payload: {}, ts: new Date().toISOString(), message_id: "x" }).valid).toBe(false)
    const env = fieldEnvelope(FIELD_MESSAGE_TYPES.STATE, { decisions: { marketing: "maybe" } })
    expect(validateFieldPayload(env).valid).toBe(false)
    expect(validateField({ ...env, version: 2 }).valid).toBe(false)
    expect(validateFieldPayload({ ...env, type: "overturo-field:nope" as never }).valid).toBe(false)
    expect(validateField(fieldEnvelope(FIELD_MESSAGE_TYPES.RESIZE, { height: -1 })).valid).toBe(false)
    expect(validateField(fieldEnvelope(FIELD_MESSAGE_TYPES.COMPLETE, { committed: true })).valid).toBe(false)
  })
})

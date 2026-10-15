// 202 — field-v1 validator helper (the postmessage_v2.ts shape over the
// Ajv standalone validators generated from schemas/field-v1/*.json).

import envelopeValidator from "../generated/field-v1/envelope.js"
import readyValidator from "../generated/field-v1/ready.js"
import stateValidator from "../generated/field-v1/state.js"
import resizeValidator from "../generated/field-v1/resize.js"
import completeValidator from "../generated/field-v1/complete.js"
import errorValidator from "../generated/field-v1/error.js"
import submitRequestedValidator from "../generated/field-v1/submit_requested.js"
import initValidator from "../generated/field-v1/init.js"
import captureValidator from "../generated/field-v1/capture.js"
import resetValidator from "../generated/field-v1/reset.js"
import { FIELD_MESSAGE_TYPES, FIELD_PROTOCOL_VERSION, type FieldMessageType } from "./constants"

export interface FieldEnvelope {
  type: FieldMessageType
  version: typeof FIELD_PROTOCOL_VERSION
  payload: Record<string, unknown>
  ts: string
  message_id: string
}

export interface FieldValidationError {
  instancePath?: string
  schemaPath?: string
  keyword?: string
  message?: string
  params?: Record<string, unknown>
}

export interface FieldValidationResult {
  valid: boolean
  errors: FieldValidationError[] | null
}

interface ValidatorFn {
  (data: unknown): boolean
  errors?: FieldValidationError[] | null
}

const VALIDATORS: Record<string, ValidatorFn> = {
  [FIELD_MESSAGE_TYPES.READY]: readyValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.STATE]: stateValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.RESIZE]: resizeValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.COMPLETE]: completeValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.ERROR]: errorValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.SUBMIT_REQUESTED]: submitRequestedValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.INIT]: initValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.CAPTURE]: captureValidator as ValidatorFn,
  [FIELD_MESSAGE_TYPES.RESET]: resetValidator as ValidatorFn,
}

const envelopeFn = envelopeValidator as ValidatorFn

export function validateFieldEnvelope(message: unknown): FieldValidationResult {
  const valid = envelopeFn(message)
  return { valid, errors: valid ? null : (envelopeFn.errors ?? null) }
}

export function validateFieldPayload(message: FieldEnvelope): FieldValidationResult {
  const validator = VALIDATORS[message.type]
  if (!validator) return { valid: false, errors: [{ message: `Unknown type ${message.type}` }] }
  const valid = validator(message.payload)
  return { valid, errors: valid ? null : (validator.errors ?? null) }
}

/** Envelope first, then payload. */
export function validateField(message: unknown): FieldValidationResult {
  const envelopeResult = validateFieldEnvelope(message)
  if (!envelopeResult.valid) return envelopeResult
  return validateFieldPayload(message as FieldEnvelope)
}

/** Builds an outbound envelope (host → frame). */
export function fieldEnvelope(type: FieldMessageType, payload: Record<string, unknown>): FieldEnvelope {
  return { type, version: FIELD_PROTOCOL_VERSION, payload, ts: new Date().toISOString(), message_id: uuidV4() }
}

function uuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// 202 — the embedded consent field protocol family.
//
// A family of its own beside postMessage v2 and SETUP: the `overturo-field:`
// prefix keeps it outside the v2 parity scan, and FIELD_PROTOCOL_VERSION
// moves in lockstep with the frame runtime
// (app/javascript/controllers/trust_surface/field_controller.js) — enforced
// by spec/lib/field_protocol_parity_spec.rb.
export const FIELD_PROTOCOL_VERSION = 1

import { CONSENT_FIELD_ELEMENT_NAME } from "../constants"

export const FIELD_ELEMENT_NAME = CONSENT_FIELD_ELEMENT_NAME

export const FIELD_MESSAGE_TYPES = {
  READY: "overturo-field:ready",
  STATE: "overturo-field:state",
  RESIZE: "overturo-field:resize",
  COMPLETE: "overturo-field:complete",
  ERROR: "overturo-field:error",
  SUBMIT_REQUESTED: "overturo-field:submit_requested",
  INIT: "overturo-field:init",
  CAPTURE: "overturo-field:capture",
  RESET: "overturo-field:reset",
} as const

export type FieldMessageType = (typeof FIELD_MESSAGE_TYPES)[keyof typeof FIELD_MESSAGE_TYPES]

/** The field document's path on the trust host: `${flowBaseUrl}/decisions/fields/:flowId`. */
export const FIELD_DOCUMENT_PATH = "/decisions/fields"

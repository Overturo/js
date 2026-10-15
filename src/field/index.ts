// 202 — `@overturo/js/field`: the embedded consent field entry, loaded
// EXPLICITLY beside the core (a second import or script tag). Registering the
// element is its side effect; the core facade (`overturo.forms.attach({ field })`)
// recognises the element and reports a clear error when this entry is absent.

export {
  ConsentFieldElement,
  FieldCaptureError,
  FIELD_ALREADY_DEFINED_CODE,
  registerConsentFieldElement,
  type FieldCaptureRequest,
  type FieldCaptureResult,
} from "./element"
export { FIELD_ELEMENT_NAME, FIELD_MESSAGE_TYPES, FIELD_PROTOCOL_VERSION, FIELD_DOCUMENT_PATH } from "./constants"
export { validateField, validateFieldEnvelope, validateFieldPayload, fieldEnvelope, type FieldEnvelope } from "./protocol"
export { encodeAppearance, sanitiseAppearance, APPEARANCE_KEYS, type FieldAppearance } from "./appearance"

import { registerConsentFieldElement } from "./element"

registerConsentFieldElement()

// The IIFE build exposes `window.OverturoField` (tsup footer); nothing else to do here.
export { ConsentFieldElement as default } from "./element"

export { Overturo } from "./overturo"
export type {
  Attestation,
  ConsentOptions,
  ConsentResult,
  CreateSessionParams,
  Credential,
  EmbedHandle,
  EmbedOptions,
  EmbedStyle,
  ExchangeParams,
  ExchangeResult,
  OverturoOptions,
  PopupHandle,
  PopupOptions,
  RedirectOptions,
  Session,
  SessionStatus,
  StepInfo,
  // AccordSetup types
  AccordSetupOptions,
  AccordSetupPopupOptions,
  AccordSetupRedirectOptions,
  AccordSetupResult,
  CreateSetupSessionParams,
  SetupConstraints,
  SetupHandle,
  SetupPopupHandle,
  SetupSession,
  SetupStep,
  // decisions namespace types
  DecisionKind,
  DecisionMode,
  DecisionPayload,
  DecisionToken,
  DecisionOutcome,
  DecisionsCreateSessionInput,
  DecisionsSession,
  DecisionsExchangeInput,
  DecisionExchange,
  DecisionsEmbedOptions,
  DecisionsPopupOptions,
  DecisionsHandle,
  DecisionsNamespace,
  FlowDisclosures,
  FlowDisclosurePurpose,
  FlowDisclosureField,
  FlowDisclosureStep,
  FlowDisclosureMechanism,
  FlowDisclosureLegalBasis,
  FlowDisclosureButtonMode,
  ConsentOpenOptions,
  ApprovalsOpenOptions,
  ConsentNamespace,
  ApprovalsNamespace,
  SigningOpenOptions,
  SigningNamespace,
  SignatureStatePayload,
} from "./types"
export { createSetupEmbed, createSetupPopup, setupRedirect } from "./setup"
export {
  OverturoApiError,
  OverturoError,
  OverturoNetworkError,
  OverturoTimeoutError,
  OverturoValidationError,
  OapDenied,
  OapAuthorizationDenied,
  OapIntentDenied,
  OapTrajectoryDenied,
  OapSequenceDenied,
} from "./errors"
export type { OapDenialCategory, OapErrorEnvelope } from "./errors"

// `<overturo-decision>` custom element.
// Side-effect import triggers `customElements.define("overturo-decision", …)`
// on module load (no-op if already defined; emits warning).
import "./elements"

export { DecisionElement, ELEMENT_NAME, ALREADY_DEFINED_CODE, registerDecisionElement } from "./elements"

// Default export for IIFE/UMD builds
export { Overturo as default } from "./overturo"

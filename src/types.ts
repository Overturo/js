/** Configuration options for the Overturo client. */
export interface OverturoOptions {
  /** Publishable key for client-side authentication (pk_live_... or pk_test_...). */
  publishableKey: string
  /** API key for server-side operations (sk_live_... or sk_test_...). */
  apiKey?: string
  /** Base URL of the Overturo API. Defaults to https://overturo.com. */
  baseUrl?: string
  /**
   * Base URL of the host that serves consent flows + iframes (the
   * "trust" host). Defaults to `baseUrl` — production runs API and
   * flow on the same origin (`overturo.com`), so most integrations
   * leave this unset. Set it when the flow is served from a separate
   * host (e.g. `https://trust.overturo.com`, or `http://trust.lvh.me:5100`
   * in dev).
   *
   * Affects: `embed()`, `popup()`, `redirect()`, and the `accordSetup*`
   * variants. Does NOT affect API calls — those always go through
   * `baseUrl`.
   */
  flowBaseUrl?: string
  /** Request timeout in milliseconds. Defaults to 30000 (30s). Set to 0 to disable. */
  timeout?: number
  /**
   * opt-in structured `console.debug` output prefixed with
   * `[overturo:sdk]`. Never logs session tokens, publishable keys, or raw
   * envelope payloads. Default false.
   */
  debug?: boolean
}

/** Parameters for creating a new consent session. */
export interface CreateSessionParams {
  /** The flow ID to initiate (flw_...). */
  flowId: string
  /** Delivery mode for the consent flow. */
  deliveryMode?: "embed" | "popup" | "redirect"
  /** Origin of the embedding page (auto-detected in browser). */
  embedOrigin?: string
  /** URI to redirect after consent (for redirect mode). */
  redirectUri?: string
  /** CSRF protection token. */
  state?: string
  /** ID token replay protection nonce. */
  nonce?: string
  /** Requested OAuth scopes (space-separated). */
  scope?: string
  /** Steps to skip in the flow. */
  skipSteps?: string[]
}

/** A created consent session. */
export interface Session {
  /** Session token for subsequent operations. */
  sessionToken: string
  /** Delivery mode of the session. */
  deliveryMode: string
  /** When the session expires. */
  expiresAt: string
  /** URL for embedding the consent flow in an iframe. */
  embedUrl: string
}

/** Status of a consent session. */
export interface SessionStatus {
  /** Session token. */
  sessionToken: string
  /** Current status of the session. */
  status: string
  /** Delivery mode. */
  deliveryMode: string
  /** Current step key. */
  currentStep: string | null
  /** All steps in the flow. */
  steps: StepInfo[]
  /** When the session expires. */
  expiresAt: string
  /** When the session was completed, if applicable. */
  completedAt: string | null
}

/** Information about a single step in a flow. */
export interface StepInfo {
  /** Step number (1-based). */
  number: number
  /** Step key identifier. */
  key: string
  /** Human-readable step title. */
  title: string
}

/**
 * v2 callback signatures.
 *
 * The host's lifecycle callbacks now receive the kind discriminator and the
 * full payload object so a single SDK can route consent-shaped vs.
 * approval-shaped completions correctly.
 */
export type DecisionKind = "consent" | "approval" | "signature_request"

/** Payload object carried in v2 envelopes. Per-kind-per-type schemas live in `lib/sdk/overturo-js/schemas/postmessage-v2/`. */
export type DecisionPayload = Record<string, unknown>

/** Options for the high-level consent() method. */
export interface ConsentOptions {
  /** The flow ID to initiate (flw_...). */
  flowId: string
  /** Container element or CSS selector for the iframe. */
  container: string | HTMLElement
  /** Requested OAuth scopes (space-separated). */
  scope?: string
  /** CSRF protection token. */
  state?: string
  /** ID token replay protection nonce. */
  nonce?: string
  /** Steps to skip in the flow. */
  skipSteps?: string[]
  /** Style overrides for the iframe. */
  style?: EmbedStyle
  /** Loading placeholder (HTML string or DOM element). */
  loading?: string | HTMLElement
  /** Called when the flow completes. Receives kind and outcome payload. */
  onComplete?: (kind: DecisionKind, payload: DecisionPayload) => void
  /** Called when the flow is cancelled. */
  onCancel?: (payload: DecisionPayload) => void
  /** Called on error. Payload conforms to the per-kind error schema. */
  onError?: (payload: DecisionPayload) => void
  /** Called when the flow's state transitions (replaces v1 `onStep`). */
  onState?: (kind: DecisionKind, payload: DecisionPayload) => void
  /** Called on a DEADLINE tick (T-30s/T-15s/T-5s/T-0). */
  onDeadline?: (payload: DecisionPayload) => void
  /** Called when the iframe content resizes. */
  onResize?: (height: number) => void
  /** Called when the iframe is ready (carries branding + kind in payload). */
  onReady?: (payload: DecisionPayload) => void
}

/**
 * @deprecated Use the v2 `onComplete(kind, payload)` callback signature.
 * Retained as a type-only export for downstream type checkers.
 */
export interface ConsentResult {
  consentToken: string
}

/** Options for embedding a consent or approval flow in an iframe. */
export interface EmbedOptions {
  /** Session token from createSession(). */
  sessionToken: string
  /** Container element or CSS selector for the iframe. */
  container: string | HTMLElement
  /** Style overrides for the iframe. */
  style?: EmbedStyle
  /** Loading placeholder (HTML string or DOM element). */
  loading?: string | HTMLElement
  /** Called when the flow completes. Receives kind and outcome payload. */
  onComplete?: (kind: DecisionKind, payload: DecisionPayload) => void
  /** Called when the flow is cancelled. */
  onCancel?: (payload: DecisionPayload) => void
  /** Called on error. */
  onError?: (payload: DecisionPayload) => void
  /** Called on each STATE transition. */
  onState?: (kind: DecisionKind, payload: DecisionPayload) => void
  /** Called on a DEADLINE tick. */
  onDeadline?: (payload: DecisionPayload) => void
  /** Called when the iframe content resizes. */
  onResize?: (height: number) => void
  /** Called when the iframe is ready (READY payload carries branding + kind). */
  onReady?: (payload: DecisionPayload) => void
}

/** Style overrides for the embed iframe. Only whitelisted properties are applied. */
export interface EmbedStyle {
  /** CSS width. Default: "100%". */
  width?: string
  /** CSS min-height. Default: "400px". */
  minHeight?: string
  /** CSS max-height. Default: "none". */
  maxHeight?: string
  /** CSS border. Default: "none". */
  border?: string
  /** CSS border-radius. Default: "0". */
  borderRadius?: string
  /** CSS background. Default: "transparent". */
  background?: string
}

/** Handle returned from embed(), used to control or destroy the iframe. */
export interface EmbedHandle {
  /** The iframe element. */
  iframe: HTMLIFrameElement
  /** Removes the iframe and cleans up event listeners. */
  destroy: () => void
}

/** Options for opening a consent or approval flow in a popup window. */
export interface PopupOptions {
  /** Session token from createSession(). */
  sessionToken: string
  /** Called when the flow completes. Receives kind and outcome payload. */
  onComplete?: (kind: DecisionKind, payload: DecisionPayload) => void
  /** Called when the flow is cancelled. */
  onCancel?: (payload: DecisionPayload) => void
  /** Called on error. */
  onError?: (payload: DecisionPayload) => void
  /** Popup window width in pixels. Default: 500. */
  width?: number
  /** Popup window height in pixels. Default: 700. */
  height?: number
}

/** Handle returned from popup(), used to close the popup. */
export interface PopupHandle {
  /** Closes the popup window and cleans up event listeners. */
  close: () => void
}

/** Options for redirect mode (full-page navigation). */
export interface RedirectOptions {
  /** The flow ID to redirect to (flw_...). */
  flowId: string
  /** URI to redirect back to after consent. */
  redirectUri: string
  /** CSRF protection token. */
  state?: string
  /** ID token replay protection nonce. */
  nonce?: string
  /** Requested OAuth scopes (space-separated). */
  scope?: string
}

/** Parameters for exchanging a consent token. */
export interface ExchangeParams {
  /** Session token from the consent session. */
  sessionToken: string
  /** Single-use consent token received on completion. */
  consentToken: string
}

/** Result of a consent token exchange. */
export interface ExchangeResult {
  /** Resolved claims from the consent flow. */
  claims: Record<string, unknown>
  /** Attestation results from third-party connectors. */
  attestations: Attestation[]
  /** Issued verifiable credentials. */
  credentials: Credential[]
  /** Provenance metadata for claims. */
  provenance: Record<string, unknown>
  /** OAuth access token (if OAuth application configured). */
  accessToken?: string
  /** Token type (e.g., "Bearer"). */
  tokenType?: string
  /** Token expiry in seconds. */
  expiresIn?: number
  /** OIDC ID token. */
  idToken?: string
  /** OAuth refresh token. */
  refreshToken?: string
}

/** An attestation from a third-party connector. */
export interface Attestation {
  /** The claim type that was attested. */
  claimType: string
  /** Name of the connector that provided the attestation. */
  connector: string
  /** Attestation status. */
  status: string
  /** Provider-specific identifier. */
  providerId: string
}

/** An issued verifiable credential. */
export interface Credential {
  /** Credential ID. */
  id: string
  /** Type of credential. */
  credentialType: string
  /** Credential format (e.g., "jwt_vc", "sd_jwt"). */
  format: string
  /** When the credential was issued. */
  issuedAt: string
}

// ── AccordSetup Types ───────────────────────────────────

/** Parameters for creating an accord setup session. */
export interface CreateSetupSessionParams {
  /** Solution key (e.g., "meetings", "venues"). */
  solution?: string
  /** Vertical key (e.g., "healthcare", "education"). */
  vertical?: string
  /** Pre-selected archetype. */
  archetype?: string
  /** Pre-selected template key. */
  templateKey?: string
  /** Delivery mode. */
  deliveryMode?: "embed" | "popup" | "redirect"
  /** Origin of the embedding page (auto-detected in browser). */
  embedOrigin?: string
  /** URI to redirect after setup (for redirect mode). */
  redirectUri?: string
  /** CSRF protection token. */
  state?: string
  /** Locale for the setup wizard (auto-detected from navigator.language if omitted). */
  locale?: string
  /** Enterprise constraints. */
  constraints?: SetupConstraints
  /** Load constraints from a saved preset (overrides inline constraints). */
  presetId?: string
}

/** Enterprise constraints for the setup wizard. */
export interface SetupConstraints {
  /** Allowed archetype values. */
  allowedArchetypes?: string[]
  /** Allowed template keys. */
  allowedTemplates?: string[]
  /** Fields that are locked (user cannot change). */
  locked?: Record<string, unknown>
  /** Default values for fields (user can override). */
  defaults?: Record<string, unknown>
  /** Steps to hide from the wizard. */
  hiddenSteps?: string[]
}

/** A created setup session. */
export interface SetupSession {
  /** Session token for subsequent operations. */
  sessionToken: string
  /** Delivery mode of the session. */
  deliveryMode: string
  /** URL for embedding the setup wizard in an iframe. */
  embedUrl: string
  /** When the session expires. */
  expiresAt: string
}

/** Options for the accordSetup() embed method. */
export interface AccordSetupOptions {
  /** Solution key (e.g., "meetings", "venues"). */
  solution?: string
  /** Vertical key (e.g., "healthcare", "education"). */
  vertical?: string
  /** Surface key (e.g., "consent", "agree", "protect"). */
  surface?: string
  /** Pre-selected archetype. */
  archetype?: string
  /** Pre-selected template key. */
  templateKey?: string
  /** Container element or CSS selector for the iframe. */
  container: string | HTMLElement
  /** Enterprise constraints. */
  constraints?: SetupConstraints
  /** Load constraints from a saved preset (overrides inline constraints). */
  presetId?: string
  /** Style overrides for the iframe. */
  style?: EmbedStyle
  /** Loading placeholder (HTML string or DOM element). */
  loading?: string | HTMLElement
  /** Locale for the wizard. */
  locale?: string
  /** Called when the iframe is ready. */
  onReady?: () => void
  /** Called when the flow navigates to a new step. */
  onStep?: (step: SetupStep) => void
  /** Called when the accord is created. */
  onCreated?: (result: AccordSetupResult) => void
  /** Called when the user cancels. */
  onCancel?: () => void
  /** Called on error. */
  onError?: (error: string) => void
  /** Called when the iframe content resizes. */
  onResize?: (height: number) => void
}

/** Step progress information. */
export interface SetupStep {
  /** Step key (e.g., "purposes_and_scopes"). */
  key: string
  /** 0-based step index. */
  index: number
  /** Total number of steps. */
  total: number
}

/** Result returned when accord setup completes. */
export interface AccordSetupResult {
  /** The created accord ID. Always present. */
  accordId: string
  /** Consent flow ID (for consent/protect archetypes). */
  flowId?: string
}

/** Options for opening setup in a popup window. */
export interface AccordSetupPopupOptions {
  /** Solution key. */
  solution?: string
  /** Pre-selected archetype. */
  archetype?: string
  /** Pre-selected template key. */
  templateKey?: string
  /** Enterprise constraints. */
  constraints?: SetupConstraints
  /** Load constraints from a saved preset. */
  presetId?: string
  /** Called when the accord is created. */
  onCreated?: (result: AccordSetupResult) => void
  /** Called when the user cancels. */
  onCancel?: () => void
  /** Called on error. */
  onError?: (error: string) => void
  /** Popup window width in pixels. Default: 600. */
  width?: number
  /** Popup window height in pixels. Default: 800. */
  height?: number
}

/** Options for redirect mode setup. */
export interface AccordSetupRedirectOptions {
  /** Solution key. */
  solution?: string
  /** Pre-selected archetype. */
  archetype?: string
  /** Pre-selected template key. */
  templateKey?: string
  /** URI to redirect back to after setup. */
  redirectUri: string
  /** CSRF protection token. */
  state?: string
  /** Enterprise constraints. */
  constraints?: SetupConstraints
  /** Load constraints from a saved preset. */
  presetId?: string
}

/** Handle returned from accordSetup(), used to control or destroy the iframe. */
export interface SetupHandle {
  /** The iframe element. */
  iframe: HTMLIFrameElement
  /** Removes the iframe and cleans up event listeners. */
  destroy: () => void
}

/** Handle returned from accordSetupPopup(). */
export interface SetupPopupHandle {
  /** Closes the popup window and cleans up event listeners. */
  close: () => void
}

// ── Preview ─────────────────────────────────────────────────────────

/** Options for rendering a preview. */
export interface PreviewOptions {
  /** Container element or CSS selector for the preview iframe. */
  container: string | HTMLElement
  /** Device simulation. Default: "desktop". */
  device?: "mobile" | "tablet" | "desktop"
  /** Theme override. */
  theme?: string
  /** Locale override. */
  locale?: string
  /** Style overrides for the iframe. */
  style?: EmbedStyle
  /** Loading placeholder. */
  loading?: string | HTMLElement
}

/** Options for previewing a template. */
export interface PreviewTemplateOptions extends PreviewOptions {
  /** Template ID to preview. */
  templateId: string
}

/** Options for previewing a setup session. */
export interface PreviewSetupOptions extends PreviewOptions {
  /** Setup session token. */
  sessionToken: string
}

/** Handle returned from preview methods, used to control or destroy the preview. */
export interface PreviewHandle {
  /** The iframe element. */
  iframe: HTMLIFrameElement
  /** Switch device viewport. */
  setDevice: (device: "mobile" | "tablet" | "desktop") => void
  /** Switch theme. */
  setTheme: (theme: string) => void
  /** Destroy the preview and remove the iframe. */
  destroy: () => void
}

// ─────────────────────────────────────────────────────────────────────
// decisions namespace types.
//
// `DecisionsNamespace` is the universal primitive that knows nothing
// about kind beyond carrying it through. `ConsentFacade` and
// `ApprovalsFacade` are thin kind-named ergonomics on top.
//
// Discriminated unions: outcome / config / exchange / status all narrow
// on `kind` so consumers using TypeScript strict mode get per-kind
// type narrowing for free.
// ─────────────────────────────────────────────────────────────────────

/** Delivery mode for a decision. */
export type DecisionMode = "embed" | "popup" | "redirect"

/**
 * Nominal-typed decision token. Server-issued, opaque. The brand
 * prevents bare strings from being passed where a token is expected.
 */
export type DecisionToken = string & { readonly __brand: "DecisionToken" }

/** Per-kind outcome envelope returned by the COMPLETE postMessage. */
export type DecisionOutcome =
  | {
      kind: "consent"
      result: "granted" | "declined"
      consentToken?: string
      purposesGranted?: string[]
      purposesDeclined?: string[]
    }
  | {
      kind: "approval"
      result: "approved" | "denied" | "countered"
      escalationToken?: string
      counterProposal?: Record<string, unknown>
    }
  // signing kind. Mirrors `signature/complete.json`: outcome +
  // assurance_level (nullable) + completed_at. `countered` carries no proposal
  // payload (unlike approval); `expired` is a STATE, never a completion outcome.
  | {
      kind: "signature_request"
      result: "signed" | "declined" | "countered"
      assuranceLevel?: "integrity_proof" | "advanced" | "qualified" | null
      completedAt?: string
    }

/** Per-kind input to `decisions.createSession`. */
export type DecisionsCreateSessionInput =
  | {
      kind: "consent"
      subjectRef: string // flow ID
      mode?: DecisionMode
      embedOrigin?: string
      scope?: string
      state?: string
      nonce?: string
      redirectUri?: string
    }
  | {
      kind: "approval"
      subjectRef: string // escalation ID
      mode?: DecisionMode
      embedOrigin?: string
      state?: string
      redirectUri?: string
    }
  // signing kind. `subjectRef` is the per-party signing slot
  // (resolved server-side to the 122 participant).
  | {
      kind: "signature_request"
      subjectRef: string // signing-slot (participant) ID
      mode?: DecisionMode
      embedOrigin?: string
      state?: string
      redirectUri?: string
    }

/**
 * typed view of a signing-kind STATE payload (`signature/state.json`).
 * The base `DecisionPayload` stays an untyped Record; consumers that know the
 * kind is `signature_request` can read state through this shape. Carries
 * assurance + signing progress only — there is no home-country/region field.
 */
export interface SignatureStatePayload {
  from: string | null
  to: "pending" | "opened" | "in_progress" | "signed" | "declined" | "expired"
  kind_payload: {
    required_assurance_level: "integrity_proof" | "advanced" | "qualified"
    participant_role?: string | null
  }
}

/** Per-kind output from `decisions.createSession`. */
export interface DecisionsSession {
  token: DecisionToken
  kind: DecisionKind
  mode: DecisionMode
  expiresAt: string
  embedUrl: string
}

/** Input to `decisions.exchange`. */
export interface DecisionsExchangeInput {
  token: DecisionToken
  exchangeToken: string
}

/** Per-kind exchange result. */
export type DecisionExchange =
  | {
      kind: "consent"
      consentToken: string
      attestations?: Attestation[]
      credentials?: Credential[]
    }
  | {
      kind: "approval"
      escalationToken: string
      receiptJti?: string
    }

/** Options for `decisions.embed` / `consent.open` / `approvals.open`. */
export interface DecisionsEmbedOptions {
  token: DecisionToken
  container: string | HTMLElement
  style?: EmbedStyle
  loading?: string | HTMLElement
  embedOrigin?: string
  onReady?: (payload: DecisionPayload) => void
  onState?: (kind: DecisionKind, payload: DecisionPayload) => void
  onComplete?: (outcome: DecisionOutcome) => void
  onCancel?: (payload: DecisionPayload) => void
  onError?: (payload: DecisionPayload) => void
  onDeadline?: (payload: DecisionPayload) => void
  onResize?: (height: number) => void
  /** Counter-proposal from approval flows (three-outcome). */
  onCounter?: (payload: DecisionPayload) => void
}

/** Options for `decisions.popup`. */
export interface DecisionsPopupOptions {
  token: DecisionToken
  width?: number
  height?: number
  onComplete?: (outcome: DecisionOutcome) => void
  onCancel?: (payload: DecisionPayload) => void
  onError?: (payload: DecisionPayload) => void
}

/** Handle returned by `decisions.embed` / `decisions.popup`. */
export interface DecisionsHandle {
  readonly token: DecisionToken
  readonly mode: DecisionMode
  destroy(): Promise<void>
}

/** Public surface of the decisions primitive. */
export interface DecisionsNamespace {
  embed(opts: DecisionsEmbedOptions): DecisionsHandle
  popup(opts: DecisionsPopupOptions): DecisionsHandle
  url(opts: { token: DecisionToken; mode?: DecisionMode }): string
  createSession(input: DecisionsCreateSessionInput): Promise<DecisionsSession>
  discover(opts: { flowId: string; locale?: string }): Promise<FlowDisclosures>
  exchange(input: DecisionsExchangeInput): Promise<DecisionExchange>
  cancel(token: DecisionToken): Promise<void>
}

// pre-flight disclosure discovery types. camelCase: the ApiClient's
// toCamelCase pass (api.ts) transforms the snake_case wire keys before these
// surface to consumers, so `primary_color` reads as `primaryColor` here. Enum
// VALUES are data, not keys, and pass through unchanged (`"opt_out"`,
// `"legitimate_interest"`). The closed shape mirrors
// config/schemas/decisions/discovery/v1/disclosure_inventory.json.
export type FlowDisclosureMechanism = "explicit" | "informed" | "opt_out" | "documented" | "delegated"

export type FlowDisclosureLegalBasis =
  | "consent"
  | "contract"
  | "legitimate_interest"
  | "legal_obligation"
  | "vital_interest"
  | "public_task"

export type FlowDisclosureButtonMode =
  | "accept"
  | "acknowledge"
  | "authorize"
  | "connect"
  | "continue"
  | "share"
  | "sign_in"
  | "verify"

export interface FlowDisclosurePurpose {
  name: string
  label: string
  description: string | null
  mechanism: FlowDisclosureMechanism
  legalBasis: FlowDisclosureLegalBasis
  required: boolean
  dataLabels: string[]
}

export interface FlowDisclosureField {
  name: string
  label: string
  fieldType: string
  required: boolean
  section: "input" | "obligation" | "proof"
  completedBy: "principal" | "application" | "both"
}

export interface FlowDisclosureStep {
  key: string
  title: string
}

export interface FlowDisclosures {
  schema: string
  flow: { id: string; name: string; version: number; kind: "consent" }
  application: {
    name: string
    primaryColor: string | null
    logoUrl: string | null
  }
  purposes: FlowDisclosurePurpose[]
  fields: FlowDisclosureField[]
  steps: FlowDisclosureStep[]
  presentation: { buttonMode: FlowDisclosureButtonMode; displayLabel: string }
  outcomes: Array<"granted" | "denied">
  expiry: { consentDurationDays: number | null }
  locale: {
    requested: "params" | "header" | "default"
    resolved: string
    fallback: "en"
  }
  revision: string
}

/** Options for `consent.open` (preserves v0 callback names). */
export interface ConsentOpenOptions {
  flowId: string
  container: string | HTMLElement
  mode?: DecisionMode
  embedOrigin?: string
  scope?: string
  state?: string
  nonce?: string
  redirectUri?: string
  style?: EmbedStyle
  loading?: string | HTMLElement
  onComplete?: (outcome: DecisionOutcome & { kind: "consent" }) => void
  onCancel?: (payload: DecisionPayload) => void
  onError?: (payload: DecisionPayload) => void
  onStep?: (payload: DecisionPayload) => void
  onReady?: (payload: DecisionPayload) => void
}

/** Options for `approvals.open` (three-outcome flow). */
export interface ApprovalsOpenOptions {
  escalationId: string
  container: string | HTMLElement
  mode?: DecisionMode
  embedOrigin?: string
  state?: string
  redirectUri?: string
  style?: EmbedStyle
  loading?: string | HTMLElement
  onComplete?: (outcome: DecisionOutcome & { kind: "approval" }) => void
  onCancel?: (payload: DecisionPayload) => void
  onError?: (payload: DecisionPayload) => void
  onState?: (payload: DecisionPayload) => void
  onDeadline?: (payload: DecisionPayload) => void
  onCounter?: (payload: DecisionPayload) => void
  onReady?: (payload: DecisionPayload) => void
}

/** Public surface of the consent facade. */
export interface ConsentNamespace {
  open(opts: ConsentOpenOptions): Promise<DecisionsHandle>
  url(opts: { flowId: string; mode?: DecisionMode }): string
  /** 189 — pre-flight disclosure discovery for a consent flow (delegates to `decisions.discover`). */
  discover(opts: { flowId: string; locale?: string }): Promise<FlowDisclosures>
}

/** Public surface of the approvals facade. */
export interface ApprovalsNamespace {
  open(opts: ApprovalsOpenOptions): Promise<DecisionsHandle>
  url(opts: { escalationId: string; mode?: DecisionMode }): string
  /** Returns remaining deadline for an approval session. */
  deadline(token: DecisionToken): Promise<{ remainingMs: number; deadlineAt: string }>
}

/**
 * Options for `signing.open` (cross-border signing, kind
 * `signature_request`). Mirrors `ApprovalsOpenOptions`; `signatureRef` is the
 * per-party signing slot the host resolves to a signing token. `onComplete`
 * narrows to the signing outcome (`signed | declined | countered`). `onState`
 * receives the signing STATE payload (assurance + progress; see
 * {@link SignatureStatePayload}).
 */
export interface SigningOpenOptions {
  signatureRef: string
  container: string | HTMLElement
  mode?: DecisionMode
  embedOrigin?: string
  state?: string
  redirectUri?: string
  style?: EmbedStyle
  loading?: string | HTMLElement
  onComplete?: (outcome: DecisionOutcome & { kind: "signature_request" }) => void
  onCancel?: (payload: DecisionPayload) => void
  onError?: (payload: DecisionPayload) => void
  /** Signing STATE — typed assurance + progress (`signature/state.json`). */
  onState?: (payload: SignatureStatePayload) => void
  onDeadline?: (payload: DecisionPayload) => void
  /** Fires on a `countered` outcome. Signing carries no proposal payload. */
  onCounter?: (payload: DecisionPayload) => void
  onReady?: (payload: DecisionPayload) => void
}

/** Public surface of the signing facade. */
export interface SigningNamespace {
  open(opts: SigningOpenOptions): Promise<DecisionsHandle>
  url(opts: { signatureRef: string; mode?: DecisionMode }): string
  /** Returns remaining deadline for a signing session. */
  deadline(token: DecisionToken): Promise<{ remainingMs: number; deadlineAt: string }>
}

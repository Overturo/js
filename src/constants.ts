/**
 * Current protocol version for postMessage communication.
 *
 * Parity invariant: this constant MUST match the `PROTOCOL_VERSION` declared
 * by the decision page's frame messaging.
 * Enforced by `spec/lib/protocol_version_parity_spec.rb`.
 */
export const PROTOCOL_VERSION = 2

/**
 * postMessage event types — protocol v2 (`overturo:*` namespace, kind-aware).
 *
 * Seven closed-enum types. Adding a type is a protocol version change.
 * Pinned decisions.
 */
export const MESSAGE_TYPES_V2 = {
  READY: "overturo:ready",
  STATE: "overturo:state",
  COMPLETE: "overturo:complete",
  CANCEL: "overturo:cancel",
  ERROR: "overturo:error",
  RESIZE: "overturo:resize",
  DEADLINE: "overturo:deadline",
} as const

export type MessageTypeV2 = (typeof MESSAGE_TYPES_V2)[keyof typeof MESSAGE_TYPES_V2]

/** Default iframe styles for embed mode. */
export const EMBED_DEFAULTS = {
  width: "100%",
  minHeight: "400px",
  maxHeight: "none",
  border: "none",
  borderRadius: "0",
  background: "transparent",
} as const

/** Allowed style keys for embed iframe (whitelist). */
export const EMBED_STYLE_KEYS = Object.keys(EMBED_DEFAULTS) as ReadonlyArray<keyof typeof EMBED_DEFAULTS>

/** Default popup window dimensions. */
export const POPUP_DEFAULTS = {
  width: 500,
  height: 700,
} as const

/** postMessage event types for AccordSetup bridge controller. */
export const SETUP_MESSAGE_TYPES = {
  READY: "overturoid:ready",
  RESIZE: "overturoid:resize",
  STEP: "overturoid:setup:step",
  CREATED: "overturoid:setup:created",
  CANCEL: "overturoid:cancel",
  ERROR: "overturoid:error",
  PING: "overturoid:ping",
  HEARTBEAT: "overturoid:heartbeat",
} as const

/** Default popup dimensions for AccordSetup. */
export const SETUP_POPUP_DEFAULTS = {
  width: 600,
  height: 800,
} as const

/** API path for consent sessions. */
export const API_PATH = "/api/v1/consent_sessions"

/**
 * kind-agnostic decisions API path . The v0
 * `/api/v1/consent_sessions` path is preserved as a server-side alias
 * during the alias window; the SDK calls the canonical
 * `/api/v1/decisions` path from `decisions.createSession`.
 */
export const DECISIONS_API_PATH = "/api/v1/decisions"

/**
 * Decisions flow path on the trust host: `${flowBaseUrl}/decisions/:token`
 * for popup/redirect, `${flowBaseUrl}/decisions/:token/embed` for embed.
 */
export const DECISIONS_FLOW_PATH = "/decisions"

/** API path for accord setup sessions. */
export const SETUP_API_PATH = "/api/v1/accord_setup_sessions"

/**
 * API path for preview tokens — top-level, not nested under consent_sessions.
 * Used by previewTemplate (a flow template) and previewSetup (a setup session).
 * The route is declared in `config/routes/api_core.rb` as
 * POST only.
 */
export const PREVIEW_TOKENS_PATH = "/api/v1/preview_tokens"

/** Default base URL. */
export const DEFAULT_BASE_URL = "https://overturo.com"

/** Default request timeout in milliseconds (30 seconds). */
export const DEFAULT_TIMEOUT = 30_000

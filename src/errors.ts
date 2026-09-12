/** Base error class for all Overturo SDK errors. */
export class OverturoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OverturoError"
  }
}

/** Thrown when required parameters are missing or invalid. */
export class OverturoValidationError extends OverturoError {
  constructor(message: string) {
    super(message)
    this.name = "OverturoValidationError"
  }
}

/** Thrown when the API returns a 4xx or 5xx response. */
export class OverturoApiError extends OverturoError {
  /** HTTP status code. */
  status: number
  /** Parsed response body, if available. */
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "OverturoApiError"
    this.status = status
    this.body = body
  }
}

/** Thrown when a network error prevents the request from completing. */
export class OverturoNetworkError extends OverturoError {
  /** The original error that caused the failure. */
  cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = "OverturoNetworkError"
    this.cause = cause
  }
}

/** Thrown when an operation times out. */
export class OverturoTimeoutError extends OverturoError {
  constructor(message: string = "Operation timed out") {
    super(message)
    this.name = "OverturoTimeoutError"
  }
}

/**
 * OAP denial category vocabulary.
 *
 * Cascade-relevant errors returned by OAP endpoints carry one of these
 * values. Non-cascade errors (validation, conflict, internal) omit the
 * field.
 */
export type OapDenialCategory = "authorization_denied" | "intent_denied" | "trajectory_denied"

/**
 * Shape of a single OAP error envelope as rendered by the server.
 * Surfaced through {@link OapDenied} so callers can introspect the
 * full envelope without re-parsing the response body.
 */
export interface OapErrorEnvelope {
  reason_code: string
  message: string
  detail?: Record<string, unknown>
  failed_bound?: string
  denial_category?: OapDenialCategory
  cascade_step?: number
  request_id?: string
  negotiable?: boolean
  negotiate_url?: string
  documentation_url?: string
}

/**
 * Thrown when an OAP-protocol endpoint returns a denial.
 *
 * Carries the structured fields from the OAP error envelope. The
 * three subclasses below map 1:1 to {@link OapDenialCategory} so
 * callers can `catch (e: OapIntentDenied)` directly.
 */
export class OapDenied extends OverturoApiError {
  reason_code: string
  failed_bound: string | undefined
  denial_category: OapDenialCategory | undefined
  cascade_step: number | undefined
  detail: Record<string, unknown> | undefined

  constructor(envelope: OapErrorEnvelope, status: number, body: unknown) {
    super(envelope.message, status, body)
    this.name = "OapDenied"
    this.reason_code = envelope.reason_code
    this.failed_bound = envelope.failed_bound
    this.denial_category = envelope.denial_category
    this.cascade_step = envelope.cascade_step
    this.detail = envelope.detail
  }

  /**
   * Build the most-specific subclass for the envelope. Reason-code
   * dispatch takes precedence over category dispatch so the most
   * specific subclass wins (sequence denials are
   * trajectory_denied but get their own subclass).
   */
  static fromEnvelope(envelope: OapErrorEnvelope, status: number, body: unknown): OapDenied {
    if (envelope.reason_code === "sequence_prohibited" || envelope.reason_code === "sequence_missing_predecessor") {
      return new OapSequenceDenied(envelope, status, body)
    }
    switch (envelope.denial_category) {
      case "authorization_denied":
        return new OapAuthorizationDenied(envelope, status, body)
      case "intent_denied":
        return new OapIntentDenied(envelope, status, body)
      case "trajectory_denied":
        return new OapTrajectoryDenied(envelope, status, body)
      default:
        return new OapDenied(envelope, status, body)
    }
  }
}

/** denial_category == "authorization_denied" — OAuth/DPoP layer rejected. */
export class OapAuthorizationDenied extends OapDenied {
  constructor(envelope: OapErrorEnvelope, status: number, body: unknown) {
    super(envelope, status, body)
    this.name = "OapAuthorizationDenied"
  }
}

/** denial_category == "intent_denied" — request fell outside grant bounds. */
export class OapIntentDenied extends OapDenied {
  constructor(envelope: OapErrorEnvelope, status: number, body: unknown) {
    super(envelope, status, body)
    this.name = "OapIntentDenied"
  }
}

/** denial_category == "trajectory_denied" — execution history blocked. */
export class OapTrajectoryDenied extends OapDenied {
  constructor(envelope: OapErrorEnvelope, status: number, body: unknown) {
    super(envelope, status, body)
    this.name = "OapTrajectoryDenied"
  }
}

/**
 * 2 — sequence_bounds violation
 * (`sequence_prohibited` / `sequence_missing_predecessor`). A
 * trajectory denial with a structural-ordering flavour.
 */
export class OapSequenceDenied extends OapTrajectoryDenied {
  constructor(envelope: OapErrorEnvelope, status: number, body: unknown) {
    super(envelope, status, body)
    this.name = "OapSequenceDenied"
  }
}

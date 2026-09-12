// `signing` facade. `kind: "signature_request"` shim over the
// decisions primitive, for cross-border legal signing. Mirrors the
// approvals facade: three delivery modes, kind-guarded completion, `deadline`,
// and an `onCounter` callback (signing carries no proposal payload). Assurance +
// progress ride the STATE payload; there is no home-country field.
//

import type { ApiClient } from "./api"
import { DECISIONS_API_PATH } from "./constants"
import type { Decisions } from "./decisions"
import { OverturoValidationError } from "./errors"
import type {
  DecisionMode,
  DecisionToken,
  DecisionsHandle,
  SignatureStatePayload,
  SigningNamespace,
  SigningOpenOptions,
} from "./types"

export class SigningFacade implements SigningNamespace {
  readonly #decisions: Decisions
  readonly #api: ApiClient

  constructor(decisions: Decisions, api: ApiClient) {
    this.#decisions = decisions
    this.#api = api
  }

  async open(opts: SigningOpenOptions): Promise<DecisionsHandle> {
    if (!opts.signatureRef) {
      throw new OverturoValidationError("signatureRef is required")
    }
    const mode = opts.mode ?? "embed"
    const session = await this.#decisions.createSession({
      kind: "signature_request",
      subjectRef: opts.signatureRef,
      mode,
      embedOrigin: opts.embedOrigin,
      state: opts.state,
      redirectUri: opts.redirectUri,
    })
    if (mode === "popup") {
      return this.#decisions.popup({
        token: session.token,
        onComplete: (outcome) => {
          if (outcome.kind === "signature_request") opts.onComplete?.(outcome)
        },
        onCancel: opts.onCancel,
        onError: opts.onError,
      })
    }
    if (mode === "redirect") {
      const url = this.#decisions.url({ token: session.token, mode: "redirect" })
      window.location.href = url
      return {
        token: session.token,
        mode: "redirect",
        destroy: async () => {},
      }
    }
    return this.#decisions.embed({
      token: session.token,
      container: opts.container,
      style: opts.style,
      loading: opts.loading,
      onReady: opts.onReady,
      onState: (_kind, payload) => opts.onState?.(payload as unknown as SignatureStatePayload),
      onComplete: (outcome) => {
        if (outcome.kind === "signature_request") opts.onComplete?.(outcome)
      },
      onCancel: opts.onCancel,
      onError: opts.onError,
      onDeadline: opts.onDeadline,
      onCounter: opts.onCounter,
    })
  }

  url(opts: { signatureRef: string; mode?: DecisionMode }): string {
    return this.#decisions.url({
      token: opts.signatureRef as unknown as DecisionToken,
      mode: opts.mode,
    })
  }

  /**
   * Polls `${decisions_api}/:token` for deadline metadata. Returns the
   * computed remainingMs alongside the absolute deadlineAt for clock-
   * skew tolerance in consumers.
   */
  async deadline(token: DecisionToken): Promise<{ remainingMs: number; deadlineAt: string }> {
    if (!token) {
      throw new OverturoValidationError("token is required for deadline")
    }
    const status = await this.#api.get<{ deadlineAt: string }>(`${DECISIONS_API_PATH}/${token}`)
    return {
      remainingMs: Math.max(0, new Date(status.deadlineAt).getTime() - Date.now()),
      deadlineAt: status.deadlineAt,
    }
  }
}

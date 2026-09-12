// `approvals` facade. Pre-`kind: "approval"` shim over
// the decisions primitive. Adds `onCounter` for the three-outcome
// flow + `deadline(token)` for remaining-time queries.
//
// Plan: Phase C.

import type { ApiClient } from "./api"
import { DECISIONS_API_PATH } from "./constants"
import type { Decisions } from "./decisions"
import { OverturoValidationError } from "./errors"
import type { ApprovalsNamespace, ApprovalsOpenOptions, DecisionMode, DecisionToken, DecisionsHandle } from "./types"

export class ApprovalsFacade implements ApprovalsNamespace {
  readonly #decisions: Decisions
  readonly #api: ApiClient

  constructor(decisions: Decisions, api: ApiClient) {
    this.#decisions = decisions
    this.#api = api
  }

  async open(opts: ApprovalsOpenOptions): Promise<DecisionsHandle> {
    if (!opts.escalationId) {
      throw new OverturoValidationError("escalationId is required")
    }
    const mode = opts.mode ?? "embed"
    const session = await this.#decisions.createSession({
      kind: "approval",
      subjectRef: opts.escalationId,
      mode,
      embedOrigin: opts.embedOrigin,
      state: opts.state,
      redirectUri: opts.redirectUri,
    })
    if (mode === "popup") {
      return this.#decisions.popup({
        token: session.token,
        onComplete: (outcome) => {
          if (outcome.kind === "approval") opts.onComplete?.(outcome)
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
      onState: (_kind, payload) => opts.onState?.(payload),
      onComplete: (outcome) => {
        if (outcome.kind === "approval") opts.onComplete?.(outcome)
      },
      onCancel: opts.onCancel,
      onError: opts.onError,
      onDeadline: opts.onDeadline,
      onCounter: opts.onCounter,
    })
  }

  url(opts: { escalationId: string; mode?: DecisionMode }): string {
    return this.#decisions.url({
      token: opts.escalationId as unknown as DecisionToken,
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

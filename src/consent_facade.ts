// `consent` facade. Pre-`kind: "consent"` shim over the
// decisions primitive. Preserves v0 callback names (`onComplete`,
// `onCancel`, `onError`, `onStep`) so internal migration is one rename.
//
// Plan: Phase B.

import type { Decisions } from "./decisions"
import { OverturoValidationError } from "./errors"
import type {
  ConsentNamespace,
  ConsentOpenOptions,
  DecisionMode,
  DecisionToken,
  DecisionsHandle,
  FlowDisclosures,
} from "./types"

export class ConsentFacade implements ConsentNamespace {
  readonly #decisions: Decisions

  constructor(decisions: Decisions) {
    this.#decisions = decisions
  }

  /**
   * Creates a consent session and mounts the iframe in one call.
   * Bridges v0's `onStep(payload)` to v1's `onState(kind, payload)`
   * so existing call sites keep working with a single rename.
   */
  async open(opts: ConsentOpenOptions): Promise<DecisionsHandle> {
    if (!opts.flowId) {
      throw new OverturoValidationError("flowId is required")
    }
    const mode = opts.mode ?? "embed"
    const session = await this.#decisions.createSession({
      kind: "consent",
      subjectRef: opts.flowId,
      mode,
      embedOrigin: opts.embedOrigin,
      scope: opts.scope,
      state: opts.state,
      nonce: opts.nonce,
      redirectUri: opts.redirectUri,
    })
    if (mode === "popup") {
      return this.#decisions.popup({
        token: session.token,
        onComplete: (outcome) => {
          if (outcome.kind === "consent") opts.onComplete?.(outcome)
        },
        onCancel: opts.onCancel,
        onError: opts.onError,
      })
    }
    if (mode === "redirect") {
      const url = this.#decisions.url({ token: session.token, mode: "redirect" })
      window.location.href = url
      // The caller's continuation is irrelevant — navigation tears down
      // the page. Return a sealed handle for type-shape consistency.
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
      onState: (_kind, payload) => opts.onStep?.(payload),
      onComplete: (outcome) => {
        if (outcome.kind === "consent") opts.onComplete?.(outcome)
      },
      onCancel: opts.onCancel,
      onError: opts.onError,
    })
  }

  url(opts: { flowId: string; mode?: DecisionMode }): string {
    // We don't have a token before createSession runs, but the URL
    // helper is useful for consumers that want to build redirect
    // links from a flowId server-side. Return the canonical flow URL
    // shape; the trust host resolves flowId → token internally.
    return this.#decisions.url({
      token: opts.flowId as unknown as DecisionToken,
      mode: opts.mode,
    })
  }

  /**
   * pre-flight disclosure discovery. Thin delegate to
   * `decisions.discover` so the kind facades stay symmetric.
   */
  discover(opts: { flowId: string; locale?: string }): Promise<FlowDisclosures> {
    return this.#decisions.discover(opts)
  }
}

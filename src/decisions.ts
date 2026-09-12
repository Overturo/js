// `decisions` primitive. Kind-agnostic API surface.
//
// The primitive owns the lifecycle plumbing (session creation, iframe /
// popup / redirect dispatch, postMessage envelope handling, exchange,
// cancel) without baking in `consent`-vs-`approval` ergonomics. The
// kind facades (`consent.open`, `approvals.open`) are thin shims on
// top.
//

import type { ApiClient } from "./api"
import { DECISIONS_API_PATH, DECISIONS_FLOW_PATH, EMBED_DEFAULTS, MESSAGE_TYPES_V2, POPUP_DEFAULTS } from "./constants"
import { applyStyle, resolveContainer } from "./dom"
import { OverturoApiError, OverturoError, OverturoValidationError } from "./errors"
import { validate, type Envelope } from "./postmessage_v2"
import type {
  DecisionExchange,
  DecisionKind,
  DecisionOutcome,
  DecisionPayload,
  DecisionToken,
  DecisionsCreateSessionInput,
  DecisionsEmbedOptions,
  DecisionsExchangeInput,
  DecisionsHandle,
  DecisionsNamespace,
  DecisionsPopupOptions,
  DecisionsSession,
  DecisionMode,
  FlowDisclosures,
} from "./types"

interface DecisionsConfig {
  api: ApiClient
  flowBaseUrl: string
  debug: boolean
}

/**
 * Implementation of the kind-agnostic decisions namespace. Exposed
 * to consumers as `Overturo#decisions`.
 *
 * The class tracks every live `DecisionsHandle` it creates so
 * `Overturo#destroy()` can tear them all down at once.
 */
export class Decisions implements DecisionsNamespace {
  readonly #api: ApiClient
  readonly #flowBaseUrl: string
  readonly #debug: boolean
  readonly #liveHandles = new Set<DecisionsHandle>()

  constructor(config: DecisionsConfig) {
    this.#api = config.api
    this.#flowBaseUrl = config.flowBaseUrl
    this.#debug = config.debug
  }

  /**
   * Returns the canonical decisions URL for a token. `mode="embed"`
   * gets the `/embed` suffix; `popup` and `redirect` use the bare
   * path (the server-rendered page handles both).
   */
  url(opts: { token: DecisionToken; mode?: DecisionMode }): string {
    const tail = opts.mode === "embed" ? "/embed" : ""
    return `${this.#flowBaseUrl}${DECISIONS_FLOW_PATH}/${opts.token}${tail}`
  }

  /**
   * Creates a new decisions session via `POST /api/v1/decisions`.
   * Wraps the legacy v0 API client's snake-case helpers so existing
   * tests around case conversion keep working.
   */
  async createSession(input: DecisionsCreateSessionInput): Promise<DecisionsSession> {
    if (!input.subjectRef) {
      throw new OverturoValidationError("subjectRef is required")
    }
    const embedOrigin = input.embedOrigin ?? (typeof window !== "undefined" ? window.location.origin : undefined)

    // Both kinds share `state` and `redirectUri`; the discriminated
    // union types narrow per-kind for static safety, but the wire
    // shape carries the same fields regardless. Pass through both
    // unconditionally so partner integrators using runtime-built
    // input objects (where `"state" in input` may not reflect the
    // declared type) still get their values delivered.
    // Wire field is `delivery_mode` per the server contract. We accept
    // `mode` on the public input for terseness, then surface it on the
    // wire as `deliveryMode` so the API client's snake-case pass renders
    // it as `delivery_mode`. The response still echoes `mode` (server
    // convention diverges from request — see decision_token_json).
    const body: Record<string, unknown> = {
      kind: input.kind,
      subjectRef: input.subjectRef,
      deliveryMode: input.mode ?? "embed",
      embedOrigin,
      state: input.state,
      redirectUri: input.redirectUri,
    }
    if (input.kind === "consent") {
      body.scope = input.scope
      body.nonce = input.nonce
    }

    // The server returns the canonical `{decision: {...}}` envelope per
    // the decisions API. The body
    // uses `session_token`/`deadline_at`/`embed_url`/`decision_url` field
    // names; after the API client's toCamelCase pass we read
    // `sessionToken`/`deadlineAt`/`embedUrl`/`decisionUrl`. Field
    // `mode` is the response convention (different from the request's
    // `delivery_mode` — the server intentionally diverges).
    const envelope = await this.#api.post<{
      decision: {
        sessionToken: string
        kind: DecisionKind
        mode: DecisionMode
        deadlineAt?: string
        embedUrl: string
        decisionUrl?: string
      }
    }>(DECISIONS_API_PATH, body)
    const raw = envelope.decision

    if (this.#debug) {
      // eslint-disable-next-line no-console
      console.debug("[overturo:sdk]", "session_created", {
        kind: raw.kind,
        mode: raw.mode,
      })
    }
    return {
      token: raw.sessionToken as DecisionToken,
      kind: raw.kind,
      mode: raw.mode,
      expiresAt: raw.deadlineAt ?? "",
      embedUrl: raw.embedUrl,
    }
  }

  /**
   * pre-flight disclosure discovery. Fetches what the decision screen
   * will present for a flow, BEFORE any session exists: purposes, fields,
   * steps, the action label, expiry, and application branding, in public
   * vocabulary and the requested locale. The recommended first call in the
   * embed flow: discover -> createSession -> (SDK reads config).
   *
   * Publishable-key authenticated — the ApiClient already sends
   * `X-Publishable-Key` (api.ts); the server ignores any bearer header on this
   * endpoint. An unknown / foreign / non-consent flow answers a uniform 404
   * (OverturoApiError, status 404).
   */
  async discover(opts: { flowId: string; locale?: string }): Promise<FlowDisclosures> {
    if (!opts.flowId) {
      throw new OverturoValidationError("flowId is required")
    }
    const qs = opts.locale ? `?locale=${encodeURIComponent(opts.locale)}` : ""
    // The server returns the `{flow: {...}}` envelope (ResponseNormalization
    // renames accord -> flow). ApiClient.get already ran toCamelCase, so the
    // decoded object is camelCase FlowDisclosures.
    const envelope = await this.#api.get<{ flow: FlowDisclosures }>(
      `${DECISIONS_API_PATH}/flows/${encodeURIComponent(opts.flowId)}/disclosures${qs}`
    )
    // Guard an envelope-less 200 (a proxy/gateway misconfig — the server is
    // fail-closed): a typed error, never a silent `undefined`.
    if (!envelope || typeof envelope !== "object" || !("flow" in envelope)) {
      throw new OverturoApiError("Malformed discovery response: missing 'flow'", 200, envelope)
    }
    return envelope.flow
  }

  /**
   * Mounts the decisions flow inside an iframe under `opts.container`.
   * Validates inbound v2 envelopes; drops on origin mismatch /
   * schema-invalid. Returns a handle whose `.destroy()` tears down
   * the iframe + listener.
   */
  embed(opts: DecisionsEmbedOptions): DecisionsHandle {
    if (!opts.token) {
      throw new OverturoValidationError("token is required")
    }
    const url = this.url({ token: opts.token, mode: "embed" })
    const expectedOrigin = new URL(url).origin
    const container = resolveContainer(opts.container)

    container.innerHTML = ""
    if (opts.loading) {
      const loadingEl = document.createElement("div")
      loadingEl.setAttribute("data-overturo-loading", "")
      if (typeof opts.loading === "string") {
        loadingEl.innerHTML = opts.loading
      } else {
        loadingEl.appendChild(opts.loading)
      }
      container.appendChild(loadingEl)
    }

    const iframe = document.createElement("iframe")
    iframe.src = url
    // No `allow=` attribute. Earlier versions set `allow="popups"`,
    // but `popups` is not a Permissions-Policy feature (browsers
    // warn "Unrecognized feature: 'popups'"). Popup-opening permission
    // for sandboxed iframes is governed by `allow-popups` in `sandbox`,
    // which we set below.
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-popups")
    applyStyle(iframe, { ...EMBED_DEFAULTS }, opts.style)

    const clearLoading = (): void => {
      const loadingChild = container.querySelector("[data-overturo-loading]")
      if (loadingChild) container.removeChild(loadingChild)
    }
    iframe.addEventListener("load", clearLoading)
    // Network-level failure surfaces as the iframe firing `error`
    // (rare — usually CSP rejection or blocked origin). Clear loading
    // + bubble through `onError` with a stable code so integrators can
    // distinguish from server-emitted ERROR envelopes.
    iframe.addEventListener("error", () => {
      clearLoading()
      opts.onError?.({
        code: "iframe_load_failed",
        message: "The trust-host iframe failed to load.",
      } as DecisionPayload)
    })

    const ac = new AbortController()
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== expectedOrigin) return
      const result = validate(event.data)
      if (!result.valid) {
        opts.onError?.({
          code: "protocol_violation",
          errors: result.errors,
        } as DecisionPayload)
        if (this.#debug) {
          // eslint-disable-next-line no-console
          console.debug("[overturo:sdk]", "envelope_dropped", {
            reason: "schema_invalid",
          })
        }
        return
      }
      this.#dispatch(event.data as Envelope, opts, iframe)
    }
    window.addEventListener("message", onMessage, { signal: ac.signal })
    container.appendChild(iframe)

    const handle: DecisionsHandle = {
      token: opts.token,
      mode: "embed",
      destroy: async () => {
        ac.abort()
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        this.#liveHandles.delete(handle)
        if (this.#debug) {
          // eslint-disable-next-line no-console
          console.debug("[overturo:sdk]", "iframe_destroyed", {})
        }
      },
    }
    this.#liveHandles.add(handle)
    if (this.#debug) {
      // eslint-disable-next-line no-console
      console.debug("[overturo:sdk]", "iframe_mounted", {
        sandboxAttr: iframe.getAttribute("sandbox"),
      })
    }
    return handle
  }

  /**
   * Opens the decisions flow in a popup window. Caller MUST invoke this
   * synchronously from a user-action handler or browsers will block.
   */
  popup(opts: DecisionsPopupOptions): DecisionsHandle {
    if (!opts.token) {
      throw new OverturoValidationError("token is required")
    }
    const url = this.url({ token: opts.token, mode: "popup" })
    const expectedOrigin = new URL(url).origin
    const width = opts.width ?? POPUP_DEFAULTS.width
    const height = opts.height ?? POPUP_DEFAULTS.height
    const left = Math.round((screen.width - width) / 2)
    const top = Math.round((screen.height - height) / 2)

    // No `noopener,noreferrer` — the popup IS our trust surface and
    // sends results back via `window.opener.postMessage(...)`. With
    // noopener the opener reference is nulled, the postMessage never
    // round-trips, AND Chrome returns null from window.open so this
    // path would always throw "Popup was blocked".
    const features = `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
    const win = window.open(url, "_blank", features)
    if (!win) {
      if (this.#debug) {
        // eslint-disable-next-line no-console
        console.debug("[overturo:sdk]", "popup_blocked", {})
      }
      throw new OverturoError("Popup was blocked by the browser. Allow popups for this site and try again.")
    }
    if (this.#debug) {
      // eslint-disable-next-line no-console
      console.debug("[overturo:sdk]", "popup_opened", { features })
    }

    const ac = new AbortController()
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== expectedOrigin) return
      const result = validate(event.data)
      if (!result.valid) {
        opts.onError?.({ code: "protocol_violation" } as DecisionPayload)
        return
      }
      const envelope = event.data as Envelope
      switch (envelope.type) {
        case MESSAGE_TYPES_V2.COMPLETE:
          opts.onComplete?.(buildOutcome(envelope.kind, envelope.payload))
          handle.destroy()
          break
        case MESSAGE_TYPES_V2.CANCEL:
          opts.onCancel?.(envelope.payload as DecisionPayload)
          handle.destroy()
          break
        case MESSAGE_TYPES_V2.ERROR:
          opts.onError?.(envelope.payload as DecisionPayload)
          break
      }
    }
    window.addEventListener("message", onMessage, { signal: ac.signal })

    // User-closed-popup detection. The browser doesn't fire a message
    // when the user closes a popup manually, so without polling we'd
    // leak the message listener and never tell the integrator the user
    // bailed. 500ms is the cheapest interval that doesn't visibly
    // delay legitimate completion (which races via postMessage anyway).
    let closeTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (win.closed) {
        if (closeTimer) {
          clearInterval(closeTimer)
          closeTimer = null
        }
        opts.onCancel?.({ reason: "user_closed_popup" } as DecisionPayload)
        handle.destroy()
      }
    }, 500)

    const handle: DecisionsHandle = {
      token: opts.token,
      mode: "popup",
      destroy: async () => {
        if (closeTimer) {
          clearInterval(closeTimer)
          closeTimer = null
        }
        ac.abort()
        if (win && !win.closed) win.close()
        this.#liveHandles.delete(handle)
      },
    }
    this.#liveHandles.add(handle)
    return handle
  }

  /**
   * Exchanges a completed decision's token for the per-kind receipt.
   * Server returns a discriminated union; the SDK preserves the
   * discriminator so consumers using strict TypeScript get narrowing.
   */
  async exchange(input: DecisionsExchangeInput): Promise<DecisionExchange> {
    if (!input.token || !input.exchangeToken) {
      throw new OverturoValidationError("token and exchangeToken are required for exchange")
    }
    const path = `${DECISIONS_API_PATH}/${input.token}/exchange`
    const raw = await this.#api.post<DecisionExchange>(path, {
      exchangeToken: input.exchangeToken,
    })
    return raw
  }

  /**
   * Asks the server to mark a session as cancelled. Idempotent on
   * already-terminal sessions.
   */
  async cancel(token: DecisionToken): Promise<void> {
    if (!token) {
      throw new OverturoValidationError("token is required for cancel")
    }
    await this.#api.post(`${DECISIONS_API_PATH}/${token}/cancel`, {})
  }

  /**
   * Tears down every live handle (embed or popup) this client created.
   * Called by `Overturo#destroy()`. Errors during destroy are swallowed
   * — we want best-effort cleanup, not a half-destroyed state.
   */
  async destroyAll(): Promise<void> {
    const handles = [...this.#liveHandles]
    await Promise.allSettled(handles.map((h) => h.destroy()))
    this.#liveHandles.clear()
  }

  #dispatch(envelope: Envelope, opts: DecisionsEmbedOptions, iframe: HTMLIFrameElement): void {
    // approval counter-proposal arrives in STATE with
    // `phase: "countered"`. Surface ONLY through `onCounter` to keep
    // the contract clean (no double-fire of onState + onCounter).
    // If the integrator wants the raw STATE payload too, they can
    // implement onState themselves — the `payload` is the same shape.
    const isCounterState =
      envelope.type === MESSAGE_TYPES_V2.STATE &&
      envelope.kind === "approval" &&
      (envelope.payload as { phase?: string })?.phase === "countered"

    switch (envelope.type) {
      case MESSAGE_TYPES_V2.READY:
        opts.onReady?.(envelope.payload as DecisionPayload)
        break
      case MESSAGE_TYPES_V2.STATE:
        if (isCounterState) {
          opts.onCounter?.(envelope.payload as DecisionPayload)
        } else {
          opts.onState?.(envelope.kind, envelope.payload as DecisionPayload)
        }
        break
      case MESSAGE_TYPES_V2.RESIZE: {
        const height = (envelope.payload as { height?: number }).height
        if (typeof height === "number") {
          iframe.style.height = `${height}px`
          opts.onResize?.(height)
        }
        break
      }
      case MESSAGE_TYPES_V2.COMPLETE:
        opts.onComplete?.(buildOutcome(envelope.kind, envelope.payload))
        break
      case MESSAGE_TYPES_V2.CANCEL:
        opts.onCancel?.(envelope.payload as DecisionPayload)
        break
      case MESSAGE_TYPES_V2.ERROR:
        opts.onError?.(envelope.payload as DecisionPayload)
        break
      case MESSAGE_TYPES_V2.DEADLINE:
        opts.onDeadline?.(envelope.payload as DecisionPayload)
        break
    }
    if (this.#debug) {
      // eslint-disable-next-line no-console
      console.debug("[overturo:sdk]", "envelope_received", {
        type: envelope.type,
        kind: envelope.kind,
      })
    }
  }
}

/**
 * Coerces a server COMPLETE payload into the kind-discriminated
 * `DecisionOutcome` type. Server already enforces shape via the
 * generated v2 schemas; this is the SDK-side narrowing layer.
 */
export function buildOutcome(kind: DecisionKind, payload: unknown): DecisionOutcome {
  const p = (payload ?? {}) as Record<string, unknown>
  // The COMPLETE wire payload is snake_case per consent|approval/complete.json:
  // `outcome` (the result) + `exchange_token` (the token the host exchanges,
  // i.e. the SDK's `consentToken`/`escalationToken`) + `completed_at`. Read the
  // wire fields directly; camelCase is accepted defensively. (Declines arrive as
  // CANCEL, not COMPLETE — but the schema permits `declined`/`denied` here, so
  // map the real outcome rather than defaulting it.)
  if (kind === "consent") {
    return {
      kind: "consent",
      result: ((p.outcome ?? p.result) as "granted" | "declined") ?? "granted",
      consentToken: (p.exchange_token ?? p.consentToken) as string | undefined,
      purposesGranted: p.purposesGranted as string[] | undefined,
      purposesDeclined: p.purposesDeclined as string[] | undefined,
    }
  }
  // signing kind. The COMPLETE wire payload is snake_case per
  // `signature/complete.json` (`outcome`/`assurance_level`/`completed_at`),
  // validated before dispatch; read it directly (camelCase accepted defensively).
  // `expired` is never a completion outcome — only signed/declined/countered.
  if (kind === "signature_request") {
    return {
      kind: "signature_request",
      result: ((p.outcome ?? p.result) as "signed" | "declined" | "countered") ?? "signed",
      assuranceLevel: (p.assurance_level ?? p.assuranceLevel) as
        | "integrity_proof"
        | "advanced"
        | "qualified"
        | null
        | undefined,
      completedAt: (p.completed_at ?? p.completedAt) as string | undefined,
    }
  }
  return {
    kind: "approval",
    result: ((p.outcome ?? p.result) as "approved" | "denied" | "countered") ?? "approved",
    escalationToken: (p.exchange_token ?? p.escalationToken) as string | undefined,
    counterProposal: p.counterProposal as Record<string, unknown> | undefined,
  }
}

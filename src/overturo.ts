import { ApiClient, extractErrorMessage, toCamelCase } from "./api"
import { ApprovalsFacade } from "./approvals_facade"
import { ConsentFacade } from "./consent_facade"
import { SigningFacade } from "./signing_facade"
import { API_PATH, DEFAULT_BASE_URL, PREVIEW_TOKENS_PATH, SETUP_API_PATH } from "./constants"
import { Decisions } from "./decisions"
import { createEmbed } from "./embed"
import { OverturoApiError, OverturoValidationError } from "./errors"
import { createPopup } from "./popup"
import { renderPreview } from "./preview"
import { performRedirect } from "./redirect"
import { createSetupEmbed, createSetupPopup, setupRedirect } from "./setup"
import type {
  AccordSetupOptions,
  AccordSetupPopupOptions,
  AccordSetupRedirectOptions,
  CreateSessionParams,
  CreateSetupSessionParams,
  EmbedHandle,
  EmbedOptions,
  ExchangeParams,
  ExchangeResult,
  OverturoOptions,
  PopupHandle,
  PopupOptions,
  PreviewHandle,
  PreviewSetupOptions,
  PreviewTemplateOptions,
  RedirectOptions,
  Session,
  SessionStatus,
  SetupHandle,
  SetupPopupHandle,
  SetupSession,
} from "./types"

/**
 * The main Overturo client for initiating consent flows and exchanging tokens.
 *
 * @example
 * ```ts
 * const overturo = new Overturo({ publishableKey: "pk_live_..." });
 *
 * // High-level: create session + embed in one call
 * const flow = await overturo.consent({
 *   flowId: "flw_...",
 *   container: "#consent",
 *   onComplete: (result) => console.log(result.consentToken),
 * });
 *
 * // Low-level: manual session + embed
 * const session = await overturo.createSession({ flowId: "flw_..." });
 * const widget = overturo.embed({ sessionToken: session.sessionToken, container: "#el" });
 * ```
 */
export class Overturo {
  private api: ApiClient
  private baseUrl: string
  // Host that serves consent flows + iframes. Falls back to baseUrl
  // when not explicitly configured — production has both on one host
  // (overturo.com), so this distinction only matters in dev (trust
  // subdomain on a separate port) or for partners with a custom
  // multi-host setup.
  private flowBaseUrl: string
  private debugFlag: boolean
  // `decisions` primitive + `consent` / `approvals`
  // facades. Constructed eagerly so consumers can reach them as
  // `client.decisions.embed(…)` / `client.consent.open(…)` etc.
  readonly decisions: Decisions
  readonly consent: ConsentFacade
  readonly approvals: ApprovalsFacade
  readonly signing: SigningFacade

  constructor(options: OverturoOptions) {
    if (!options.publishableKey) {
      throw new OverturoValidationError("publishableKey is required")
    }

    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.flowBaseUrl = (options.flowBaseUrl ?? this.baseUrl).replace(/\/+$/, "")
    this.debugFlag = options.debug === true

    this.api = new ApiClient({
      baseUrl: this.baseUrl,
      publishableKey: options.publishableKey,
      apiKey: options.apiKey,
      timeout: options.timeout,
    })

    this.decisions = new Decisions({
      api: this.api,
      flowBaseUrl: this.flowBaseUrl,
      debug: this.debugFlag,
    })
    this.consent = new ConsentFacade(this.decisions)
    this.approvals = new ApprovalsFacade(this.decisions, this.api)
    this.signing = new SigningFacade(this.decisions, this.api)

    if (this.debugFlag && typeof window !== "undefined") {
      const url = new URL(this.baseUrl)
      // localhost, 127.0.0.1, *.lvh.me, and *.localhost are all
      // well-known dev hostnames that always resolve to 127.0.0.1.
      // No need to warn about HTTP on them.
      const devHosts =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "lvh.me" ||
        url.hostname.endsWith(".lvh.me") ||
        url.hostname.endsWith(".localhost")
      if (url.protocol === "http:" && !devHosts) {
        // eslint-disable-next-line no-console
        console.warn(
          "[overturo:sdk]",
          "OVERTURO_INSECURE_HOST",
          `API host ${url.host} is not HTTPS; treat this as dev-only.`
        )
      }
    }
  }

  /**
   * Tears down every live decisions handle (embed iframes + popups).
   * Best-effort: errors during teardown are swallowed.
   *
   * @since 1.0.0
   */
  async destroy(): Promise<void> {
    await this.decisions.destroyAll()
  }

  // v0's `Overturo#consent({...})` method is REPLACED
  // by the `consent` facade property declared above. Consumers must
  // migrate `client.consent({...})` → `client.consent.open({...})`.
  // The migration is documented in CHANGELOG.md and the developer
  // portal. Calling `client.consent(...)`
  // as a function now raises `TypeError` (consent is an object, not
  // a function); we accept this surprise per the spec's "v0 callers
  // break" pre-production stance.

  /**
   * Creates a new consent session.
   * The flowId is sent as accord_id to the server (automatic parameter aliasing).
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    return this.api.post<Session>(API_PATH, {
      accordId: params.flowId,
      deliveryMode: params.deliveryMode,
      embedOrigin: params.embedOrigin,
      redirectUri: params.redirectUri,
      state: params.state,
      nonce: params.nonce,
      scope: params.scope,
      skipSteps: params.skipSteps,
    })
  }

  /**
   * Retrieves the status of an existing consent session.
   */
  async getSession(sessionToken: string): Promise<SessionStatus> {
    return this.api.get<SessionStatus>(`${API_PATH}/${sessionToken}`)
  }

  /**
   * Embeds a consent flow in an iframe.
   * Requires a sessionToken from createSession().
   */
  embed(options: EmbedOptions): EmbedHandle {
    return createEmbed(this.flowBaseUrl, options)
  }

  /**
   * Opens a consent flow in a popup window.
   * Requires a sessionToken from createSession().
   *
   * @throws {OverturoError} If the browser blocks the popup.
   */
  popup(options: PopupOptions): PopupHandle {
    return createPopup(this.flowBaseUrl, options)
  }

  /**
   * Redirects to a consent flow (full-page navigation).
   * No session token needed — the server creates one on arrival.
   */
  redirect(options: RedirectOptions): void {
    performRedirect(this.flowBaseUrl, options)
  }

  /**
   * Exchanges a consent token for claims, attestations, credentials, and tokens.
   * Best used server-side with apiKey set.
   *
   * Handles HTTP 202 (fulfillment pending) transparently by retrying with
   * the Retry-After interval until the server returns the full result.
   */
  async exchange(params: ExchangeParams): Promise<ExchangeResult> {
    const maxRetries = 5
    const path = `${API_PATH}/${params.sessionToken}/exchange`
    const body = { consentToken: params.consentToken }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await this.api.rawPost(path, body)

      if (response.status === 202) {
        if (attempt === maxRetries) {
          throw new OverturoApiError("Exchange timeout: fulfillment still pending", 202, null)
        }
        const retryAfter = parseInt(response.headers.get("Retry-After") || "1", 10)
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
        continue
      }

      if (!response.ok) {
        let responseBody: unknown
        try {
          responseBody = await response.json()
        } catch {
          responseBody = null
        }
        const message = extractErrorMessage(responseBody, response.status)
        throw new OverturoApiError(
          message === `HTTP ${response.status}` ? `Exchange failed: HTTP ${response.status}` : message,
          response.status,
          responseBody
        )
      }

      const text = await response.text()
      return toCamelCase(JSON.parse(text)) as ExchangeResult
    }

    throw new OverturoApiError("Exchange failed: max retries exceeded", 202, null)
  }

  // ── AccordSetup Methods ──────────────────────────────

  /**
   * Creates a new AccordSetup session via the API.
   * Lower-level than accordSetup() — use when you need manual control.
   */
  async createSetupSession(params: CreateSetupSessionParams): Promise<SetupSession> {
    return this.api.post<SetupSession>(SETUP_API_PATH, {
      solution: params.solution,
      vertical: params.vertical,
      archetype: params.archetype,
      templateKey: params.templateKey,
      deliveryMode: params.deliveryMode || "embed",
      embedOrigin: params.embedOrigin || (typeof window !== "undefined" ? window.location.origin : undefined),
      redirectUri: params.redirectUri,
      state: params.state,
      locale: params.locale || (typeof navigator !== "undefined" ? navigator.language : undefined),
      constraints: params.constraints,
      presetId: params.presetId,
    })
  }

  /**
   * High-level: creates a setup session and embeds the wizard in an iframe.
   *
   * @example
   * ```ts
   * const handle = await overturo.accordSetup({
   *   solution: "meetings",
   *   container: "#setup",
   *   onCreated: ({ flowId }) => console.log("Created:", flowId),
   * });
   * ```
   */
  async accordSetup(options: AccordSetupOptions): Promise<SetupHandle> {
    const session = await this.createSetupSession(this.buildSetupParams(options, "embed"))

    return createSetupEmbed(this.flowBaseUrl, {
      ...options,
      sessionToken: session.sessionToken,
    })
  }

  /**
   * Creates a setup session and opens the wizard in a popup window.
   */
  async accordSetupPopup(options: AccordSetupPopupOptions): Promise<SetupPopupHandle> {
    const session = await this.createSetupSession(this.buildSetupParams(options, "popup"))

    return createSetupPopup(this.flowBaseUrl, {
      ...options,
      sessionToken: session.sessionToken,
    })
  }

  /**
   * Creates a setup session and redirects to the wizard (full-page navigation).
   * On completion, the user is redirected back to `redirectUri` with query params.
   */
  async accordSetupRedirect(options: AccordSetupRedirectOptions): Promise<void> {
    const session = await this.createSetupSession({
      ...this.buildSetupParams(options, "redirect"),
      redirectUri: options.redirectUri,
      state: options.state,
    })

    setupRedirect(this.flowBaseUrl, {
      ...options,
      sessionToken: session.sessionToken,
    })
  }

  // ── Preview ────────────────────────────────────────────────────────

  /**
   * Preview a template in an iframe.
   *
   * Creates a preview token via the API, then renders the preview in the
   * specified container. Returns a handle for controlling the preview.
   *
   * @example
   * ```ts
   * const preview = await overturo.previewTemplate({
   *   templateId: "tpl_abc123",
   *   container: "#preview",
   *   device: "mobile",
   *   theme: "corporate",
   * });
   * preview.setDevice("desktop");
   * preview.destroy();
   * ```
   */
  async previewTemplate(options: PreviewTemplateOptions): Promise<PreviewHandle> {
    if (!options.templateId) throw new OverturoValidationError("templateId is required")
    if (!options.container) throw new OverturoValidationError("container is required")

    const response = await this.api.post<{ preview_url: string; token: string; expires_at: string }>(
      PREVIEW_TOKENS_PATH,
      {
        previewable_type: "template",
        previewable_id: options.templateId,
        theme: options.theme,
        device: options.device,
        locale: options.locale,
      }
    )

    return renderPreview(response.preview_url, options)
  }

  /**
   * Preview a setup session in an iframe.
   *
   * Creates a preview token via the API for the specified setup session,
   * then renders the preview in the specified container.
   *
   * @example
   * ```ts
   * const preview = await overturo.previewSetup({
   *   sessionToken: "acs_abc123",
   *   container: "#preview",
   * });
   * preview.setTheme("dark");
   * preview.destroy();
   * ```
   */
  async previewSetup(options: PreviewSetupOptions): Promise<PreviewHandle> {
    if (!options.sessionToken) throw new OverturoValidationError("sessionToken is required")
    if (!options.container) throw new OverturoValidationError("container is required")

    const response = await this.api.post<{ preview_url: string; token: string; expires_at: string }>(
      PREVIEW_TOKENS_PATH,
      {
        previewable_type: "setup_session",
        previewable_id: options.sessionToken,
        theme: options.theme,
        device: options.device,
        locale: options.locale,
      }
    )

    return renderPreview(response.preview_url, options)
  }

  /**
   * Builds common CreateSetupSessionParams from any setup options variant.
   */
  private buildSetupParams(
    options: {
      solution?: string
      archetype?: string
      templateKey?: string
      constraints?: import("./types").SetupConstraints
      presetId?: string
      locale?: string
      vertical?: string
    },
    deliveryMode: "embed" | "popup" | "redirect"
  ): CreateSetupSessionParams {
    return {
      solution: options.solution,
      vertical: options.vertical,
      archetype: options.archetype,
      templateKey: options.templateKey,
      deliveryMode,
      locale: options.locale,
      constraints: options.constraints,
      presetId: options.presetId,
    }
  }
}

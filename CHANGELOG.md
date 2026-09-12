# Changelog

## [1.3.0] - 2026-09-11

### Changed

- Source comments, tests and this changelog describe behaviour only; planning references were removed.
- The test suite is self-contained: the discovery fixture and the message-protocol fixtures it validates are vendored under `__tests__/fixtures/` (the shared copies are read when the package sits next to them).
- `endpoints.json` declares every endpoint this client calls, proven against the source by a self-test; tests stub recorded operations from the shared API response corpus (`__tests__/support/corpus.ts`, vendored under `__tests__/fixtures/api_responses`).
- Preview tokens are requested with the public `previewable_type` values `template` / `setup_session` (the documented enum).
- **Licence: Apache-2.0** (was MIT, a scaffold default). One outbound licence for every Overturo SDK — explicit patent grant, trademark exclusion, and contribution terms.
- Repository, homepage, and issue-tracker metadata point at the public source mirror under https://github.com/overturo; a LICENSE file now ships with the package.

## [1.2.0] - 2026-08-15


### Added — pre-flight disclosure discovery (`decisions.discover`)

- **`overturo.decisions.discover({ flowId, locale? })`** and the symmetric
  facade sugar **`overturo.consent.discover(...)`** — fetch what a consent flow
  would ask a person (purposes, fields, steps, the action label, expiry, and
  application branding) BEFORE any session exists, in public vocabulary and the
  requested locale. Publishable-key authenticated (already sent by the client);
  an unknown / foreign / non-consent flow answers a uniform 404
  (`OverturoApiError`).
- **`FlowDisclosures`** and its member types are exported. Decoded through the
  client's `toCamelCase` pass, so keys are camelCase (`primaryColor`,
  `dataLabels`, `completedBy`, `consentDurationDays`).
- Cross-language parity is gated by the shared corpus at
  `lib/sdk/shared/conformance/discovery/flow_disclosures.json`.

## [1.1.0] - 2026-06-26


### Added — the signing decision kind (`signature_request`)

- **`client.signing`** — a third facade alongside `consent` and `approvals`, for
  cross-border legal signing. `open({ signatureRef, container, mode, … })` across
  embed / popup / redirect, `url({ signatureRef, mode })`, and `deadline(token)` —
  the same shape as `client.approvals`.
- **`<overturo-decision token="…">` now reaches signing** with **no markup change** —
  the kind is inferred server-side from the session token (never declared on the
  element), exactly as for consent and approval.
- **Three completion outcomes:** `signed` / `declined` / `countered`. `expired` is a
  signing *state*, not a completion outcome. The discriminated `DecisionOutcome`
  gains a `kind: "signature_request"` arm.
- **Signature assurance** surfaces on signing decision state and completion
  (`integrity_proof` / `advanced` / `qualified`), fail-closed. No region/home-country
  field is exposed.
- postMessage v2: the signing envelopes validate against the
  `schemas/postmessage-v2/signature/*` schemas. **No new message type** — the seven
  v2 types are reused.

### Fixed

- **Decision outcomes now read the real wire fields.** `buildOutcome` mapped the
  COMPLETE payload from camelCase names (`result`, `consentToken`,
  `escalationToken`) that the Trust Surface frame never emits — it sends snake_case
  `outcome` + `exchange_token`. As a result `outcome.consentToken` /
  `outcome.escalationToken` were always `undefined` through the `consent` / `approvals`
  facades, and a `declined`/`denied` COMPLETE would have mapped to `granted`/`approved`.
  Outcomes now map from `outcome` and `exchange_token` (the latter is the token the
  host exchanges). Strictly additive — populates fields that were previously empty.

### Compatibility

- **Additive, no break.** `DecisionKind` widens to include `signature_request`;
  existing consent/approval consumers are unaffected. Minor version bump.

## [1.0.0] - 2026-06-09


### Breaking changes

- **`client.consent({...})` is gone.** Replace with `client.consent.open({...})`.
  v0 callers will hit `TypeError: client.consent is not a function`. The
  v1 facade preserves v0 callback names (`onComplete`, `onCancel`,
  `onError`, `onStep`). Pre-production-only break.
- `createSession()` server response shape moved from
  `{session_token, delivery_mode, embed_url}` to
  `{token, kind, mode, embed_url, expires_at}` per the server's
  `/api/v1/decisions` contract. The legacy `/api/v1/consent_sessions`
  endpoint is preserved as a server-side alias during the alias
  window.
- `dist/index.mjs` path corrected to `dist/index.js` (the actual tsup
  output). `package.json` `exports.import.default` updated.

### Added

- **`client.decisions.*`** — the universal kind-agnostic primitive.
  Six methods: `embed`, `popup`, `url`, `createSession`, `exchange`,
  `cancel`. Used directly by integrators who want both kinds without
  ergonomic shims, and by both facades below.
- **`client.approvals.*`** — new facade for the approval kind.
  Methods: `open({escalationId, container, …, onCounter})`,
  `url({escalationId, mode})`, `deadline(token)`. The `onCounter`
  callback fires on three-outcome counter-proposals.
- **`<overturo-decision token="ds_…" mode="embed">`** custom element.
  Auto-registers under the canonical name on bundle load (no-op +
  warning if already defined). Shadow DOM. Dispatches
  `decision:ready`, `decision:state`, `decision:complete`,
  `decision:cancel`, `decision:error`, `decision:deadline`
  CustomEvents. WCAG 2.1 AA baseline: `role=region`, `tabindex=0`,
  `aria-busy` lifecycle, `Esc` → cancel, assertive-live error region,
  CSP nonce propagation. Net-new — no `<overturoid-button>` ever
  shipped in v0.
- **`debug: true`** constructor option emits structured
  `console.debug` entries prefixed with `[overturo:sdk]`. Never logs
  tokens, publishable keys, or raw envelope payloads.
- **`Overturo#destroy()`** tears down every live embed iframe and
  popup created by the client.
- TypeScript types: `DecisionKind`, `DecisionMode`, `DecisionToken`
  (branded), `DecisionOutcome` (kind-discriminated), `DecisionsCreateSessionInput`,
  `DecisionsExchangeInput`, `DecisionExchange`, `DecisionsNamespace`,
  `ConsentOpenOptions`, `ApprovalsOpenOptions`, plus `ConsentNamespace`
  and `ApprovalsNamespace` for facade-side typing. All shipped in both
  `.d.ts` and `.d.cts`.
- Bundle size budget: 25 KB minified+gzipped. Current: ESM 21.6 KB,
  CJS 22.1 KB. Methodology in `scripts/measure-bundle.mjs`. Measure with `yarn size`.
- Package keywords: `approval`, `decisions`, `agent`, `trust-surface`
  in addition to the existing `consent`, `privacy`, `sdk`, `overturo`.

### Changed

- `package.json` `sideEffects` allowlist now declares
  `["./dist/index.js", "./dist/index.cjs", "./dist/elements/**"]` so
  the custom-element auto-registration side effect survives tree-shaking.
- The Overturo class constructor accepts a new optional `debug: boolean`.

### Preserved unchanged (out of v1 scope)

- All AccordSetup methods: `createSetupEmbed`, `createSetupPopup`,
  `setupRedirect`, `previewTemplate`, `previewSetup`. AccordSetup stays at v1 of its own
  surface, with `overturoid:*` postMessage namespace unchanged.
- `flowBaseUrl` constructor option vs `baseUrl` API host separation.
- Origin validation behaviour (blank origin blocks send).
- Dual ESM + CJS output. IIFE bundle at `dist/overturo.global.js`.

### Migration

| v0 call | v1 replacement |
|---|---|
| `client.consent({flowId, onComplete, …})` | `client.consent.open({flowId, onComplete, …})` |
| `client.embed({sessionToken, …})` | `client.decisions.embed({token, …})` or use the element |
| `client.popup({sessionToken, …})` | `client.decisions.popup({token, …})` |
| `client.redirect({flowId, redirectUri})` | `client.decisions.url({token, mode: "redirect"})` + integrator navigates |
| `client.exchange({sessionToken, consentToken})` | `client.decisions.exchange({token, exchangeToken})` |
| (none) | `client.approvals.open({escalationId, …, onCounter})` for OAP approvals |
| (none) | `<overturo-decision token="…">` declarative usage |

Full migration guide ships in TS-11 (developer portal).

## [0.1.0] - 2026-03-11

### Added
- `embed()` function for iframe-based consent flows
- `sandbox` attribute on generated iframes (`allow-scripts allow-forms allow-same-origin allow-popups`)
- Protocol versioning (`version: 1`) on all postMessage messages
- `overturoid:ready`, `overturoid:resize`, `overturoid:complete`, `overturoid:declined`, `overturoid:error` event types
- TypeScript type definitions
- Configurable embed options (width, height, origin)

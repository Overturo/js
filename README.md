> **Release mirror.** This repository is a read-only snapshot of
> `@overturo/js` 1.3.0, published from Overturo's main
> development repository. Issues and pull requests are welcome here; accepted
> changes are ported upstream and appear in the next release snapshot.
> Security reports: see [SECURITY.md](./SECURITY.md).

# @overturo/js

JavaScript SDK for integrating Overturo consent flows into your application. TypeScript-first, zero runtime dependencies.

## Installation

```bash
npm install @overturo/js
```

Or via CDN:

```html
<script src="https://unpkg.com/@overturo/js/dist/overturo.global.js"></script>
```

## Quick Start

### Embed a consent flow

```typescript
import { Overturo } from "@overturo/js";

const overturo = new Overturo({ publishableKey: "pk_live_..." });

const flow = await overturo.consent({
  flowId: "flw_...",
  container: "#consent-container",
  scope: "openid profile email",
  onComplete: (result) => {
    console.log("Consent token:", result.consentToken);
    // Send consentToken to your server for exchange
  },
  onCancel: () => {
    console.log("User cancelled");
  },
  onError: (error) => {
    console.error("Error:", error);
  },
});

// Clean up when done
flow.destroy();
```

### Embed a signing flow

Cross-border legal signing rides the same delivery layer as consent and approval.
Mint a signing session server-side, then open it by its signing-slot reference:

```typescript
const overturo = new Overturo({ publishableKey: "pk_live_..." });

const signing = await overturo.signing.open({
  signatureRef: "part_...", // this signer's slot in the agreement
  container: "#signing-container",
  mode: "embed", // or "popup" / "redirect"
  onState: (payload) => {
    // Signing progress + the assurance level being asked for.
    // payload.kind_payload.required_assurance_level: "integrity_proof" | "advanced" | "qualified"
  },
  onComplete: (outcome) => {
    // outcome.result: "signed" | "declined" | "countered"
    // outcome.assuranceLevel: the level recorded (or null)
    console.log("Signing outcome:", outcome.result);
  },
  onCancel: () => console.log("Signer dismissed the flow"),
  onError: (error) => console.error("Error:", error),
});

signing.destroy();
```

The `<overturo-decision token="...">` custom element embeds a signing decision with
**identical markup** to consent and approval — the kind is inferred server-side from
the token; never declare it on the element.

### CDN / Script tag

```html
<div id="consent-container"></div>
<script src="https://unpkg.com/@overturo/js/dist/overturo.global.js"></script>
<script>
  const overturo = new Overturo({ publishableKey: "pk_live_..." });

  overturo.consent({
    flowId: "flw_...",
    container: "#consent-container",
    onComplete: function (result) {
      console.log("Consent token:", result.consentToken);
    },
  });
</script>
```

## API Reference

### `new Overturo(options)`

Creates a new client instance.

| Option           | Type     | Required | Description                                       |
| ---------------- | -------- | -------- | ------------------------------------------------- |
| `publishableKey` | `string` | Yes      | Your publishable key (`pk_live_...` or `pk_test_...`) |
| `apiKey`         | `string` | No       | API key for server-side operations (`sk_live_...`)    |
| `baseUrl`        | `string` | No       | API base URL (defaults to `https://overturo.com`) |

### `overturo.consent(options): Promise<EmbedHandle>`

High-level method that creates a session and embeds the consent flow in one call.

| Option       | Type                            | Required | Description                                |
| ------------ | ------------------------------- | -------- | ------------------------------------------ |
| `flowId`     | `string`                        | Yes      | Flow ID (`flw_...`)                        |
| `container`  | `string \| HTMLElement`         | Yes      | CSS selector or DOM element                |
| `scope`      | `string`                        | No       | Requested OAuth scopes (space-separated)   |
| `state`      | `string`                        | No       | CSRF protection token                      |
| `nonce`      | `string`                        | No       | ID token replay protection                 |
| `skipSteps`  | `string[]`                      | No       | Steps to skip                              |
| `style`      | `EmbedStyle`                    | No       | Iframe style overrides                     |
| `loading`    | `string \| HTMLElement`         | No       | Loading placeholder                        |
| `onComplete` | `(result: ConsentResult) => void` | No     | Called when user completes consent          |
| `onCancel`   | `() => void`                    | No       | Called when user cancels                    |
| `onError`    | `(error: string) => void`       | No       | Called on error                             |
| `onStep`     | `(step: string) => void`        | No       | Called on step navigation                   |
| `onResize`   | `(height: number) => void`      | No       | Called on iframe resize                     |
| `onReady`    | `() => void`                    | No       | Called when iframe is ready                 |

Returns an `EmbedHandle` with `{ iframe, destroy() }`.

### `overturo.createSession(params): Promise<Session>`

Creates a consent session manually.

```typescript
const session = await overturo.createSession({
  flowId: "flw_...",
  deliveryMode: "embed", // "embed" | "popup" | "redirect"
  scope: "openid profile",
});
```

### `overturo.getSession(sessionToken): Promise<SessionStatus>`

Retrieves the status of an existing session.

```typescript
const status = await overturo.getSession("ses_...");
console.log(status.status, status.currentStep);
```

### `overturo.embed(options): EmbedHandle`

Embeds a consent flow using an existing session token.

```typescript
const widget = overturo.embed({
  sessionToken: "ses_...",
  container: "#el",
  onComplete: (result) => console.log(result.consentToken),
});
widget.destroy();
```

### `overturo.popup(options): PopupHandle`

Opens a consent flow in a popup window.

```typescript
const popup = overturo.popup({
  sessionToken: "ses_...",
  onComplete: (result) => console.log(result.consentToken),
  onCancel: () => console.log("Cancelled"),
  width: 500,
  height: 700,
});
popup.close();
```

### `overturo.redirect(options): void`

Redirects to a consent flow (full-page navigation).

```typescript
overturo.redirect({
  flowId: "flw_...",
  redirectUri: "https://yourapp.com/callback",
  state: "csrf_token",
  scope: "openid profile email",
});
```

### `overturo.exchange(params): Promise<ExchangeResult>`

Exchanges a consent token for claims, attestations, credentials, and tokens. **Requires `apiKey`** — use this on your server.

```typescript
const result = await overturo.exchange({
  sessionToken: "ses_...",
  consentToken: "ct_...",
});
// result.claims, result.attestations, result.credentials
// result.accessToken, result.idToken (if OAuth configured)
```

## Style Overrides

The embed iframe accepts these style properties:

| Property       | Default         | Description     |
| -------------- | --------------- | --------------- |
| `width`        | `"100%"`        | CSS width       |
| `minHeight`    | `"400px"`       | CSS min-height  |
| `maxHeight`    | `"none"`        | CSS max-height  |
| `border`       | `"none"`        | CSS border      |
| `borderRadius` | `"0"`           | CSS border-radius |
| `background`   | `"transparent"` | CSS background  |

## Error Handling

```typescript
import {
  OverturoError,
  OverturoApiError,
  OverturoNetworkError,
  OverturoValidationError,
} from "@overturo/js";

try {
  await overturo.createSession({ flowId: "flw_invalid" });
} catch (err) {
  if (err instanceof OverturoApiError) {
    console.error(`API error ${err.status}:`, err.message);
  } else if (err instanceof OverturoNetworkError) {
    console.error("Network error:", err.message);
  } else if (err instanceof OverturoValidationError) {
    console.error("Validation:", err.message);
  }
}
```

## Framework Examples

### React

```tsx
import { useEffect, useRef } from "react";
import { Overturo } from "@overturo/js";

function ConsentFlow({ flowId }: { flowId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overturo = new Overturo({ publishableKey: "pk_live_..." });
    let handle: Awaited<ReturnType<typeof overturo.consent>> | null = null;

    overturo
      .consent({
        flowId,
        container: containerRef.current!,
        onComplete: (result) => console.log(result.consentToken),
      })
      .then((h) => (handle = h));

    return () => handle?.destroy();
  }, [flowId]);

  return <div ref={containerRef} />;
}
```

### Vue

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Overturo, type EmbedHandle } from "@overturo/js";

const props = defineProps<{ flowId: string }>();
const container = ref<HTMLDivElement>();
let handle: EmbedHandle | null = null;

onMounted(async () => {
  const overturo = new Overturo({ publishableKey: "pk_live_..." });
  handle = await overturo.consent({
    flowId: props.flowId,
    container: container.value!,
    onComplete: (result) => console.log(result.consentToken),
  });
});

onUnmounted(() => handle?.destroy());
</script>

<template>
  <div ref="container" />
</template>
```

### Vanilla JS

```html
<div id="consent"></div>
<script type="module">
  import { Overturo } from "@overturo/js";

  const overturo = new Overturo({ publishableKey: "pk_live_..." });
  const flow = await overturo.consent({
    flowId: "flw_...",
    container: "#consent",
    onComplete: (result) => {
      document.getElementById("consent").innerHTML =
        "<p>Done! Token: " + result.consentToken + "</p>";
    },
  });
</script>
```

## Browser Support

ES2020+: Chrome 80+, Firefox 80+, Safari 14+, Edge 80+.

## TypeScript

All types are exported and available:

```typescript
import type {
  OverturoOptions,
  ConsentOptions,
  ConsentResult,
  EmbedHandle,
  Session,
  ExchangeResult,
} from "@overturo/js";
```

## Contract and testing

This client is written against Overturo's published OpenAPI document, kept at
<https://github.com/overturo/openapi>. When the client and the API disagree, the
document is the authority; a change to it is a change to this client.

The test suite stubs recorded operations from the shared API response corpus
(<https://github.com/overturo/conformance>, `api_responses/`), vendored under
`__tests__/fixtures/api_responses`. Each recording was made against the real API and checked against
the published document before it was committed, so a passing suite means the
client parses what the API actually sends — not what a test author remembered.
Identifiers, timestamps and tokens in the recordings are placeholders
(`<PREFIX_ID:1>`, `2026-01-01T00:00:00Z`, `<TOKEN>`); the corpus README documents the
grammar.

Run the suite with `npm test`. When you add a test for a recorded operation, stub it
from the recording (`corpusResponse("Decisions_create")`) rather than writing the response by hand.

## License

Apache-2.0 — see [LICENSE](./LICENSE). Copyright 2026 Overturo Geneva Association.

## Authority records — use a backend SDK

This package is the browser UI-flow SDK, and the authority record
endpoints take server-side token scopes (`audit:verify`,
`disclosures:write`) that do not belong in a browser. Client methods
live in the backend SDKs — `@overturo/sdk` (`/receipts` subpath),
`overturo` (Python, `overturo.receipts`), and the `overturo` gem
(`delegate_ns.authorization_receipts` / `disclosure_receipts`) —
and signed-record verification lives in `@overturo/verify`
(`verifyRecord`).

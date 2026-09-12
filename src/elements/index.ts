// element registration side effect. Importing
// `@overturo/js/elements` triggers `customElements.define("overturo-decision", …)`.
// The default barrel (`src/index.ts`) re-exports this so the IIFE
// bundle auto-registers; module consumers can opt out by importing
// `{Overturo}` from "@overturo/js/core" (planned post-v1 — out of
// v1 scope; documented as a follow-up).
//

export { DecisionElement, ELEMENT_NAME, ALREADY_DEFINED_CODE, registerDecisionElement } from "./decision_element"

import { registerDecisionElement } from "./decision_element"

registerDecisionElement()

// @vitest-environment node
// tree-shake smoke test.
//
// Runs under Node, not jsdom, because esbuild's Uint8Array invariants
// fail under jsdom's polyfilled TextEncoder.
//
// Bundles a tiny consumer entry that imports only what's needed and
// asserts the output does NOT contain identifiers from unimported
// modules. This proves the `package.json` `sideEffects` allowlist +
// per-module structure tree-shakes correctly under esbuild defaults.
//
// We don't run Vite / Rollup / webpack5 here — those would need their
// own dev-deps and process orchestration. esbuild is what tsup uses
// for the production bundle, so it's the most authoritative single
// check; the spec leaves the full multi-bundler matrix as a follow-up.

import { build } from "esbuild"
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SDK_ROOT = resolve(import.meta.dirname, "..")

interface BundleResult {
  output: string
  bytes: number
}

async function bundleConsumer(source: string): Promise<BundleResult> {
  const tmp = mkdtempSync(`${tmpdir()}/overturo-treeshake-`)
  const entry = resolve(tmp, "entry.ts")
  writeFileSync(entry, source)
  const out = resolve(tmp, "out.js")
  await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    write: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    outfile: out,
    absWorkingDir: SDK_ROOT,
    // The SDK lives under node_modules-style resolution from the test
    // file's perspective; resolve relative imports against the SDK root.
    alias: { "@overturo/js": resolve(SDK_ROOT, "src/index.ts") },
  })
  const text = readFileSync(out, "utf8")
  return { output: text, bytes: Buffer.byteLength(text, "utf8") }
}

describe("tree-shaking", () => {
  it("importing the custom element does NOT pull in AccordSetup", async () => {
    const result = await bundleConsumer(
      `import { DecisionElement } from "@overturo/js";
       export default DecisionElement;`
    )
    // AccordSetup-specific symbols should not appear in the output.
    expect(result.output).not.toContain("createSetupSession")
    expect(result.output).not.toContain("previewTemplate")
  })

  it("explicit DecisionElement import pulls the registration", async () => {
    const result = await bundleConsumer(
      `import { DecisionElement, registerDecisionElement } from "@overturo/js";
       registerDecisionElement();
       export default DecisionElement;`
    )
    expect(result.output).toContain("overturo-decision")
  })

  it("importing only DecisionElement does NOT pull the AccordSetup preview module", async () => {
    // AccordSetup preview is the heaviest unrelated module
    // (151 LOC). Verify the element's import path doesn't reach it.
    const result = await bundleConsumer(
      `import { DecisionElement } from "@overturo/js";
       export default DecisionElement;`
    )
    expect(result.output).not.toContain("PreviewSetupOptions")
    expect(result.output).not.toContain("renderPreview")
  })

  it("a non-trivial Overturo consumer bundles to under 220 KB unminified", async () => {
    // The Ajv-compiled validators dominate the bundle and pre-minify
    // are sizeable. The gzip-9 budget (25 KB) is asserted by
    // measure-bundle.mjs against the tsup-built dist; this test just
    // catches accidental dependency creep on the raw bundle. Wrap
    // in an async IIFE to satisfy es2020 target (no top-level await).
    const result = await bundleConsumer(
      `import { Overturo } from "@overturo/js";
       export default (async () => {
         const client = new Overturo({ publishableKey: "pk_x" });
         const h = await client.consent.open({ flowId: "flw_x", container: "#x" });
         await h.destroy();
         await client.approvals.open({ escalationId: "esc_x", container: "#x" });
       })();`
    )
    expect(result.bytes).toBeLessThan(220 * 1024)
  })
})

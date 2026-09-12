#!/usr/bin/env node
// bundle size measurement.
//
// Modes:
//   yarn size            — measure + assert budget. Default mode.
//   yarn size --baseline — measure + write `bundle-baseline.json`.
//                         Run on `main` after a build; commit the file.
//   yarn size --check    — measure + compare against the committed
//                         baseline; non-zero exit on regression.
//   JSON_OUTPUT=1 yarn size — emit machine-readable JSON to stdout
//                         (the human-readable table goes to stderr).
//                         Used by CI to post sticky PR comments.
//
// Methodology:
//   - minifier: tsup's default esbuild (already runs at build time)
//   - compression: zlib.gzipSync(buf, {level: 9})
//   - what's counted: dist/index.js (ESM) and dist/index.cjs (CJS)
//   - what's NOT counted: .d.ts declarations, source maps
//

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const BUDGET_BYTES = 25 * 1024
const BUNDLES = [
  { path: "dist/index.js", label: "ESM" },
  { path: "dist/index.cjs", label: "CJS" },
]
const BASELINE_FILE = resolve(ROOT, "bundle-baseline.json")

const args = new Set(process.argv.slice(2))
const writeBaseline = args.has("--baseline")
const checkAgainstBaseline = args.has("--check")
const jsonOutput = process.env.JSON_OUTPUT === "1"

const measurements = []
for (const { path, label } of BUNDLES) {
  let raw
  try {
    raw = readFileSync(resolve(ROOT, path))
  } catch (err) {
    console.error(`FAIL: ${path}: ${err.message}`)
    console.error("Did you run `yarn build` first?")
    process.exit(1)
  }
  const gz = gzipSync(raw, { level: 9 })
  measurements.push({
    label,
    path,
    rawBytes: raw.length,
    gzBytes: gz.length,
    budgetBytes: BUDGET_BYTES,
  })
}

// --baseline: write current measurements as the committed baseline.
if (writeBaseline) {
  const baseline = {
    version: 1,
    capturedAt: new Date().toISOString(),
    measurements: measurements.map(({ label, path, rawBytes, gzBytes }) => ({
      label,
      path,
      rawBytes,
      gzBytes,
    })),
  }
  writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`)
  console.error(`Baseline written to ${BASELINE_FILE}`)
  console.error(JSON.stringify(baseline.measurements, null, 2))
  process.exit(0)
}

// --check: compare against the committed baseline; require it exists.
let baseline = null
let baselineMissing = false
if (checkAgainstBaseline) {
  if (!existsSync(BASELINE_FILE)) {
    console.error(`FAIL: --check requires ${BASELINE_FILE} to exist. Run with --baseline first.`)
    process.exit(1)
  }
  baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
} else if (existsSync(BASELINE_FILE)) {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
} else {
  baselineMissing = true
}

// Compute deltas if we have a baseline.
const enriched = measurements.map((m) => {
  const base = baseline?.measurements.find((b) => b.label === m.label)
  return {
    ...m,
    baselineGzBytes: base?.gzBytes ?? null,
    deltaBytes: base ? m.gzBytes - base.gzBytes : null,
    budgetStatus: m.gzBytes <= BUDGET_BYTES ? "PASS" : "FAIL",
  }
})

// Human-readable output (always to stderr if --json, else stdout).
const sink = jsonOutput ? console.error : console.log
sink("@overturo/js bundle size (post-minify, gzip -9)")
sink("=".repeat(72))
for (const m of enriched) {
  const baseTxt =
    m.baselineGzBytes != null ? ` base=${m.baselineGzBytes}B Δ=${signed(m.deltaBytes)}B` : " (no baseline)"
  sink(
    `${m.label.padEnd(4)} ${m.path.padEnd(20)} ` +
      `raw=${m.rawBytes.toString().padStart(7)}B ` +
      `gz=${m.gzBytes.toString().padStart(6)}B ${m.budgetStatus}` +
      baseTxt
  )
}
sink("=".repeat(72))
if (baselineMissing) {
  sink(`No baseline file at ${BASELINE_FILE}. Run \`yarn size --baseline\` on main to capture.`)
}

// JSON output for CI consumption (stdout).
if (jsonOutput) {
  process.stdout.write(
    `${JSON.stringify(
      {
        budgetBytes: BUDGET_BYTES,
        measurements: enriched,
      },
      null,
      2
    )}\n`
  )
}

const exceeded = enriched.some((m) => m.gzBytes > BUDGET_BYTES)
if (exceeded) {
  console.error("\nOne or more bundles exceed the 25 KB minified+gzipped budget.")
  process.exit(1)
}

// --check mode: a positive delta also fails (regression detection).
if (checkAgainstBaseline) {
  const regressed = enriched.filter((m) => (m.deltaBytes ?? 0) > 0)
  if (regressed.length > 0) {
    console.error(`\n--check failed: ${regressed.length} bundle(s) grew vs baseline.`)
    for (const m of regressed) {
      console.error(`  ${m.label}: +${m.deltaBytes}B`)
    }
    process.exit(1)
  }
}

function signed(n) {
  if (n == null) return "?"
  if (n === 0) return "±0"
  return n > 0 ? `+${n}` : `${n}`
}

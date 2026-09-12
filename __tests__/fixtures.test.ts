import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { validate } from "../src/postmessage_v2"

// Run every committed conformance fixture through the
// Ajv-compiled validators. Catches schema drift in the same PR as fixture
// drift.

// The shared fixtures when this package sits next to them; the vendored copy otherwise.
const SHARED_ROOT = join(__dirname, "../../../../spec/fixtures/trust_surface/postmessage_v2")
const FIXTURE_ROOT = existsSync(SHARED_ROOT) ? SHARED_ROOT : join(__dirname, "fixtures/postmessage_v2")

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith(".json")) out.push(p)
  }
  return out
}

const allFixtures = walk(FIXTURE_ROOT)

describe("postmessage v2 fixture conformance", () => {
  it(`finds at least 8 fixture files (4 per kind)`, () => {
    expect(allFixtures.length).toBeGreaterThanOrEqual(8)
  })

  allFixtures.forEach((path) => {
    const rel = path.slice(FIXTURE_ROOT.length + 1)
    it(`${rel}: every envelope validates`, () => {
      const envelopes = JSON.parse(readFileSync(path, "utf-8"))
      envelopes.forEach((env: unknown, idx: number) => {
        const result = validate(env)
        expect(result.valid, `${rel}[${idx}] errors: ${JSON.stringify(result.errors)}`).toBe(true)
      })
    })
  })
})

import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

const SCHEMA_DIR = join(__dirname, "../schemas/postmessage-v2")

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith(".json")) out.push(p)
  }
  return out
}

describe("postmessage v2 schemas", () => {
  const allFiles = walk(SCHEMA_DIR)

  it("exposes exactly 16 schema files (envelope + 3 kind-agnostic + 12 kind-specific)", () => {
    // signing kind adds the 4 signature/* payload schemas (3 kinds × 4).
    expect(allFiles).toHaveLength(16)
  })

  it("ships the expected file layout (envelope + kind-agnostic + 3 kind subdirs)", () => {
    const rel = allFiles.map((p) => p.slice(SCHEMA_DIR.length + 1)).sort()
    expect(rel).toEqual([
      "approval/complete.json",
      "approval/deadline.json",
      "approval/error.json",
      "approval/state.json",
      "cancel.json",
      "consent/complete.json",
      "consent/deadline.json",
      "consent/error.json",
      "consent/state.json",
      "envelope.json",
      "ready.json",
      "resize.json",
      "signature/complete.json",
      "signature/deadline.json",
      "signature/error.json",
      "signature/state.json",
    ])
  })

  it("every schema is well-formed JSON with a Draft 2020-12 $schema and a unique $id", () => {
    const seenIds = new Set<string>()
    allFiles.forEach((p) => {
      const schema = JSON.parse(readFileSync(p, "utf-8"))
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
      expect(typeof schema.$id).toBe("string")
      expect(schema.$id).toMatch(/^https:\/\/schemas\.overturo\.com\/postmessage-v2\//)
      expect(seenIds.has(schema.$id)).toBe(false)
      seenIds.add(schema.$id)
      expect(schema.type).toBe("object")
    })
  })

  it("envelope: closed-enum type set is exactly the v2 vocabulary", () => {
    const envelope = JSON.parse(readFileSync(join(SCHEMA_DIR, "envelope.json"), "utf-8"))
    expect(envelope.properties.type.enum).toEqual([
      "overturo:ready",
      "overturo:state",
      "overturo:complete",
      "overturo:cancel",
      "overturo:error",
      "overturo:resize",
      "overturo:deadline",
    ])
    expect(envelope.properties.kind.enum).toEqual(["consent", "approval", "signature_request"])
    expect(envelope.properties.version.const).toBe(2)
    expect(envelope.additionalProperties).toBe(false)
  })

  it("envelope requires all 6 top-level fields", () => {
    const envelope = JSON.parse(readFileSync(join(SCHEMA_DIR, "envelope.json"), "utf-8"))
    expect(envelope.required.sort()).toEqual(["kind", "message_id", "payload", "ts", "type", "version"].sort())
  })

  it("payload schemas allow additionalProperties: true (forward compat)", () => {
    allFiles
      .filter((p) => !p.endsWith("envelope.json"))
      .forEach((p) => {
        const schema = JSON.parse(readFileSync(p, "utf-8"))
        expect(schema.additionalProperties).toBe(true)
      })
  })

  it("no schema mentions overturoid: (only overturo: in v2)", () => {
    allFiles.forEach((p) => {
      const raw = readFileSync(p, "utf-8")
      expect(raw).not.toContain("overturoid:")
    })
  })
})

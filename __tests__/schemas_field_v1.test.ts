// 202 — the field-v1 schema family (the postmessage-v2 schema test's shape).
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

const SCHEMA_DIR = join(__dirname, "../schemas/field-v1")

describe("field-v1 schemas", () => {
  const files = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()

  it("ships exactly the envelope and the nine payload schemas", () => {
    expect(files).toEqual([
      "capture.json",
      "complete.json",
      "envelope.json",
      "error.json",
      "init.json",
      "ready.json",
      "reset.json",
      "resize.json",
      "state.json",
      "submit_requested.json",
    ])
  })

  it("every schema is Draft 2020-12 with a unique field-v1 $id", () => {
    const seen = new Set<string>()
    for (const f of files) {
      const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, f), "utf-8"))
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
      expect(schema.$id).toMatch(/^https:\/\/schemas\.overturo\.com\/field-v1\//)
      expect(seen.has(schema.$id)).toBe(false)
      seen.add(schema.$id)
      expect(schema.type).toBe("object")
    }
  })

  it("the envelope is a closed set of nine overturo-field: types at version 1, with no kind", () => {
    const envelope = JSON.parse(readFileSync(join(SCHEMA_DIR, "envelope.json"), "utf-8"))
    expect(envelope.properties.type.enum).toEqual([
      "overturo-field:ready",
      "overturo-field:state",
      "overturo-field:resize",
      "overturo-field:complete",
      "overturo-field:error",
      "overturo-field:submit_requested",
      "overturo-field:init",
      "overturo-field:capture",
      "overturo-field:reset",
    ])
    expect(envelope.properties.version.const).toBe(1)
    expect(envelope.properties.kind).toBeUndefined()
    expect(envelope.additionalProperties).toBe(false)
    expect(envelope.required.sort()).toEqual(["message_id", "payload", "ts", "type", "version"])
    expect(envelope.properties.ts.format).toBeUndefined() // a pattern, so the formats library stays out of the field bundle
  })

  it("payload schemas allow additionalProperties (forward compat) and never mention the v2 prefix", () => {
    for (const f of files.filter((f) => f !== "envelope.json")) {
      const raw = readFileSync(join(SCHEMA_DIR, f), "utf-8")
      expect(JSON.parse(raw).additionalProperties).toBe(true)
      expect(raw).not.toMatch(/"overturo:[a-z_]+"/)
    }
  })
})

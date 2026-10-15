// 202 D8 — the bounded appearance vocabulary travels in the fragment.
import { describe, expect, it } from "vitest"
import { encodeAppearance, sanitiseAppearance } from "../src/field/appearance"

describe("field appearance", () => {
  it("keeps only the vocabulary's string values", () => {
    expect(sanitiseAppearance({ accent: "#2563eb", fontFamily: "inter", evil: "url(x)", radius: 4, density: "compact" })).toEqual({
      accent: "#2563eb",
      fontFamily: "inter",
      density: "compact",
    })
    expect(sanitiseAppearance(null)).toEqual({})
    expect(sanitiseAppearance({ text: "x".repeat(65) })).toEqual({})
  })

  it("encodes as a base64url fragment and nothing for an empty appearance", () => {
    const fragment = encodeAppearance({ accent: "#2563eb" })
    expect(fragment).toMatch(/^#a=[A-Za-z0-9_-]+$/)
    const json = JSON.parse(Buffer.from(fragment.slice(3).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
    expect(json).toEqual({ accent: "#2563eb" })
    expect(encodeAppearance({ evil: "x" })).toBe("")
  })
})

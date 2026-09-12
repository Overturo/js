import { describe, expect, it } from "vitest"
import * as constants from "../src/constants"
import { PROTOCOL_VERSION, MESSAGE_TYPES_V2, SETUP_MESSAGE_TYPES } from "../src/constants"

describe("postmessage v2 constants", () => {
  it("PROTOCOL_VERSION is 2", () => {
    expect(PROTOCOL_VERSION).toBe(2)
  })

  it("MESSAGE_TYPES_V2 has exactly 7 types", () => {
    expect(Object.keys(MESSAGE_TYPES_V2)).toHaveLength(7)
  })

  it("MESSAGE_TYPES_V2 keys are the closed-enum vocabulary", () => {
    expect(Object.keys(MESSAGE_TYPES_V2).sort()).toEqual(
      ["CANCEL", "COMPLETE", "DEADLINE", "ERROR", "READY", "RESIZE", "STATE"].sort()
    )
  })

  it("every MESSAGE_TYPES_V2 value uses overturo:* namespace (no overturoid:)", () => {
    Object.values(MESSAGE_TYPES_V2).forEach((v) => expect(v).toMatch(/^overturo:[a-z]+$/))
  })

  it("MESSAGE_TYPES is removed from the public exports", () => {
    expect((constants as Record<string, unknown>).MESSAGE_TYPES).toBeUndefined()
  })

  it("SETUP_MESSAGE_TYPES is untouched (still overturoid:*)", () => {
    // The SETUP family stays at v1.
    expect(SETUP_MESSAGE_TYPES.READY).toBe("overturoid:ready")
    expect(SETUP_MESSAGE_TYPES.STEP).toBe("overturoid:setup:step")
    expect(SETUP_MESSAGE_TYPES.CREATED).toBe("overturoid:setup:created")
  })
})

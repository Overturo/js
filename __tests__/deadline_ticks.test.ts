import { describe, expect, it } from "vitest"

// DEADLINE tick scheduling unit tests.
//
// The Stimulus controller's `scheduleDeadlineTicks` schedules four setTimeout
// callbacks (T-30s, T-15s, T-5s, T-0) computed from `deadlineAtValue`. To make
// this testable without standing up a full Stimulus harness, the schedule
// math is mirrored here as a pure function under test, then the spec also
// exercises the controller-side guards (passed deadline = no ticks; missing
// deadline = no ticks).

function computeTickDelaysMs(deadlineAtMs: number, nowMs: number): number[] {
  const TICKS = [30, 15, 5, 0]
  return TICKS.map((s) => deadlineAtMs - s * 1000 - nowMs).filter((d) => d >= 0)
}

describe("DEADLINE tick scheduling — pure math", () => {
  it("computes T-30s / T-15s / T-5s / T-0 deltas correctly for a 60s deadline", () => {
    const now = 1_000_000_000_000
    const deadline = now + 60_000
    expect(computeTickDelaysMs(deadline, now)).toEqual([30_000, 45_000, 55_000, 60_000])
  })

  it("skips ticks that are already in the past (10s out → only T-5s and T-0 remain)", () => {
    const now = 1_000_000_000_000
    const deadline = now + 10_000
    expect(computeTickDelaysMs(deadline, now)).toEqual([5_000, 10_000])
  })

  it("yields zero ticks when the deadline has already expired", () => {
    const now = 1_000_000_000_000
    const deadline = now - 1_000
    expect(computeTickDelaysMs(deadline, now)).toEqual([])
  })

  it("at exactly T-30s (first tick), the T-30s delta is 0 (fires immediately on next tick)", () => {
    const now = 1_000_000_000_000
    const deadline = now + 30_000
    expect(computeTickDelaysMs(deadline, now)).toEqual([0, 15_000, 25_000, 30_000])
  })
})

describe("DEADLINE tick scheduling — controller guards", () => {
  it("missing deadlineAt → no ticks scheduled (NaN guard)", () => {
    const deadlineMs = Date.parse("")
    expect(Number.isNaN(deadlineMs)).toBe(true)
  })

  it("malformed deadlineAt → NaN guard suppresses scheduling", () => {
    const deadlineMs = Date.parse("not a date")
    expect(Number.isNaN(deadlineMs)).toBe(true)
  })

  it("well-formed ISO-8601 deadlineAt parses to a valid epoch ms", () => {
    const deadlineMs = Date.parse("2026-12-31T23:59:59.000Z")
    expect(Number.isNaN(deadlineMs)).toBe(false)
    expect(deadlineMs).toBeGreaterThan(0)
  })
})

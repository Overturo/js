// 202 D8 — the bounded appearance vocabulary. The values travel in the frame
// URL's FRAGMENT (never sent to the server) and are validated inside the frame
// against the same closed set; an invalid value is ignored there.

export const APPEARANCE_KEYS = ["fontFamily", "fontSize", "text", "muted", "accent", "border", "radius", "density"] as const

export type AppearanceKey = (typeof APPEARANCE_KEYS)[number]

export interface FieldAppearance {
  /** One of `system`, `inter`, `serif`, `mono` (no host font file is ever loaded). */
  fontFamily?: "system" | "inter" | "serif" | "mono"
  /** A CSS length in px, rem or em. */
  fontSize?: string
  text?: string
  muted?: string
  accent?: string
  border?: string
  radius?: string
  density?: "compact" | "regular" | "relaxed"
}

/** Keeps only the vocabulary's keys with string values; the frame validates the values. */
export function sanitiseAppearance(input: unknown): Partial<Record<AppearanceKey, string>> {
  const out: Partial<Record<AppearanceKey, string>> = {}
  if (!input || typeof input !== "object") return out
  for (const key of APPEARANCE_KEYS) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === "string" && value.length <= 64) out[key] = value
  }
  return out
}

/** `#a=<base64url json>` — empty string when nothing survives sanitisation. */
export function encodeAppearance(input: unknown): string {
  const clean = sanitiseAppearance(input)
  if (Object.keys(clean).length === 0) return ""
  const json = JSON.stringify(clean)
  // UTF-8 → base64 with the platform's btoa (browsers and Node 16+ alike; no Buffer in a browser bundle).
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return `#a=${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`
}

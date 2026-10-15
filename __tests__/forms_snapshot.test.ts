// 201 — the sanitised snapshot: no non-consent input value survives; the size cap holds.
import { describe, expect, it } from "vitest"
import { decisionsFor, presentationFor } from "../src/forms/presentation"
import { SNAPSHOT_MAX_BYTES, sanitisedSnapshot } from "../src/forms/snapshot"

function form(html: string): HTMLFormElement {
  document.body.innerHTML = `<form id="f">${html}</form>`
  return document.querySelector("form") as HTMLFormElement
}

describe("sanitisedSnapshot", () => {
  it("keeps consent controls and labels, strips every other value, hidden input, script and handler", () => {
    const f = form(`
      <input name="email" value="secret@example.com" onfocus="alert(1)">
      <input type="hidden" name="csrf" value="tok">
      <textarea name="notes">private words</textarea>
      <select name="plan"><option value="gold" selected>Gold</option></select>
      <label for="m">Marketing emails</label><input id="m" type="checkbox" name="m" value="yes" checked>
      <script>steal()</script>`)
    const snap = sanitisedSnapshot(f, ["#m"])
    expect(snap).toContain("Marketing emails")
    expect(snap).toContain('type="checkbox"')
    expect(snap).toContain("checked")
    expect(snap).not.toContain("secret@example.com")
    expect(snap).not.toContain("tok")
    expect(snap).not.toContain("private words")
    expect(snap).not.toContain("gold")
    expect(snap).not.toContain("<script")
    expect(snap).not.toContain("onfocus")
    expect(snap).not.toContain('value="yes"')
  })

  it("records an unticked consent control as unticked", () => {
    const f = form(`<input id="m" type="checkbox" name="m" value="yes">`)
    const snap = sanitisedSnapshot(f, ["#m"])
    expect(snap).not.toContain("checked")
  })

  it("caps the snapshot at 16 KB", () => {
    const f = form(`<p>${"x".repeat(40_000)}</p><input id="m" type="checkbox">`)
    const snap = sanitisedSnapshot(f, ["#m"])
    expect(new TextEncoder().encode(snap).byteLength).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
  })
})

describe("presentation", () => {
  it("reads decision, default-checked and required from the control", () => {
    const f = form(`<input id="a" type="checkbox" checked required><input id="b" type="checkbox"><input id="t" type="text" value="x">`)
    const d = decisionsFor(f, { a: "#a", b: "#b", t: "#t", missing: "#zzz" })
    expect(d.a).toEqual({ decision: "granted", default_checked: true, mandatory: true })
    expect(d.b).toEqual({ decision: "declined", default_checked: false, mandatory: false })
    expect(d.t.decision).toBe("declined")
    expect(d.missing.decision).toBe("declined")
    expect(presentationFor(null).decision).toBe("declined")
  })

  it("strips free-text attributes an integrator may have put a value into", () => {
    document.body.innerHTML = `<form id="f" data-user="ada@example.com" title="Ada's form">
      <label aria-label="Ada" for="m">May we?</label><input id="m" type="checkbox" checked data-crm="42"></form>`
    const form = document.querySelector("form") as HTMLFormElement
    const html = sanitisedSnapshot(form, ["#m"])
    expect(html).not.toContain("ada@example.com")
    expect(html).not.toContain("Ada")
    expect(html).not.toContain("42")
    expect(html).toContain("May we?")
  })
})

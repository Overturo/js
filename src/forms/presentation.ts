/**
 * 201 D12 — the decision and the presentation of one mapped form control, as
 * observed in the DOM at submit: ticked → granted, unticked → declined (never
 * silence), with the default-ticked and required flags the server's matrix
 * refuses for a consent purpose. Only checkable controls are read; anything
 * else is declined (a text field is never a consent).
 */
export interface AttestedDecision {
  decision: "granted" | "declined"
  default_checked: boolean
  mandatory: boolean
}

export function resolveControl(root: ParentNode, selector: string): HTMLInputElement | null {
  const el = root.querySelector(selector)
  return el instanceof HTMLInputElement ? el : null
}

export function presentationFor(control: HTMLInputElement | null, initiallyChecked?: boolean): AttestedDecision {
  if (!control || (control.type !== "checkbox" && control.type !== "radio")) {
    return { decision: "declined", default_checked: false, mandatory: false }
  }
  return {
    decision: control.checked ? "granted" : "declined",
    // Shown ticked by default: the HTML attribute, or a script that ticked it before the person saw it.
    default_checked: control.defaultChecked || initiallyChecked === true,
    mandatory: mandatoryFor(control),
  }
}

/**
 * `required` on a lone checkbox means the person had to tick it. `required` on a
 * radio whose group offers another option (a "No") means the person had to
 * choose — which is a decision, not a mandatory consent.
 */
function mandatoryFor(control: HTMLInputElement): boolean {
  if (!control.required) return false
  if (control.type !== "radio" || !control.name) return true
  const root: ParentNode = control.form ?? control.ownerDocument
  const group = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((r) => r.name === control.name)
  return group.length <= 1
}

/** Every mapped purpose → its attested decision. */
export function decisionsFor(
  form: HTMLFormElement,
  map: Record<string, string>,
  initiallyChecked: Record<string, boolean> = {}
): Record<string, AttestedDecision> {
  const out: Record<string, AttestedDecision> = {}
  for (const [purpose, selector] of Object.entries(map)) {
    out[purpose] = presentationFor(resolveControl(form, selector), initiallyChecked[purpose])
  }
  return out
}

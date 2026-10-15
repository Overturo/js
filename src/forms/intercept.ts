import { OverturoValidationError } from "../errors"

/** 201 — the hidden input that carries the capture token to the organisation's server. */
export const DEFAULT_TOKEN_FIELD = "overturo_capture_token"
/** One-shot marker for the re-entrant submit the facade itself triggers; cleared as soon as it is seen. */
export const CAPTURED_MARK = "overturoCaptured"
/** The capture never holds the form longer than this (ms): the form submits either way. */
export const CAPTURE_TIMEOUT_MS = 5_000

export interface InterceptOptions {
  tokenFieldName?: string
  submitAfterCapture?: boolean
  onError?: (error: Error) => void
}

export interface InterceptContext {
  submitter: HTMLElement | null
}

/** One interception per form: a second attach without a detach would make two handlers re-submit each other forever. */
const attached = new WeakMap<HTMLFormElement, true>()

/**
 * 201 D4 Level B / 202 D9 — the one submit interception both capture shapes
 * share: one-shot re-entry, an in-flight guard, the timeout, the clicked
 * button travelling with the re-submit, the hidden token input. `run` does
 * the capture (from the DOM for the snippet, through the field element for
 * the embedded field) and returns the token; whatever happens, the form
 * submits afterwards unless `submitAfterCapture` is false.
 */
export function interceptSubmit(
  form: HTMLFormElement,
  opts: InterceptOptions,
  run: (ctx: InterceptContext) => Promise<{ token: string }>
): () => void {
  if (attached.has(form)) {
    throw new OverturoValidationError("duplicate_attach: this form already has a capture interception; detach it before attaching again")
  }
  attached.set(form, true)
  let inFlight = false
  const tokenField = opts.tokenFieldName ?? DEFAULT_TOKEN_FIELD
  const handler = (ev: Event) => {
    if (form.dataset[CAPTURED_MARK] === "1") {
      // The re-entrant submit the interception itself triggered: let it through once,
      // and forget it — the next real submit captures again.
      delete form.dataset[CAPTURED_MARK]
      return
    }
    ev.preventDefault()
    ev.stopImmediatePropagation()
    if (inFlight) return // a second click while the capture is in flight: the first one answers
    inFlight = true
    form.querySelector(`input[name="${tokenField}"]`)?.remove() // never carry a stale token
    const submitter = (ev as SubmitEvent).submitter ?? null
    void (async () => {
      try {
        const { token } = await withTimeout(run({ submitter }), CAPTURE_TIMEOUT_MS)
        setHiddenInput(form, tokenField, token)
      } catch (e) {
        opts.onError?.(e as Error) // the form still submits
      } finally {
        inFlight = false
        if (opts.submitAfterCapture !== false) {
          form.dataset[CAPTURED_MARK] = "1"
          resubmit(form, submitter)
        }
      }
    })()
  }
  form.addEventListener("submit", handler, { capture: true })
  return () => {
    attached.delete(form)
    form.removeEventListener("submit", handler, { capture: true })
    delete form.dataset[CAPTURED_MARK]
    form.querySelector(`input[name="${tokenField}"]`)?.remove()
  }
}

/** The capture never holds the form hostage: past the limit the form submits without a token. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new OverturoValidationError(`capture timed out after ${ms} ms; the form submits without a capture token`)),
      ms
    )
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

/** Re-submits the way the person did: the clicked button's name/value and formaction travel with it. */
export function resubmit(form: HTMLFormElement, submitter: HTMLElement | null): void {
  if (submitter && submitter.isConnected && typeof form.requestSubmit === "function") {
    try {
      form.requestSubmit(submitter)
      return
    } catch {
      /* fall through: an unusual submitter; the plain re-submit follows */
    }
  }
  if (typeof form.requestSubmit === "function") form.requestSubmit()
  else if (submitter && typeof (submitter as HTMLButtonElement).click === "function") (submitter as HTMLButtonElement).click()
  else form.submit()
}

export function resolveForm(form: HTMLFormElement | string): HTMLFormElement {
  const el = typeof form === "string" ? document.querySelector(form) : form
  if (!(el instanceof HTMLFormElement)) throw new OverturoValidationError("form must resolve to a <form> element")
  return el
}

export function setHiddenInput(form: HTMLFormElement, name: string, value: string): void {
  let input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!input) {
    input = document.createElement("input")
    input.type = "hidden"
    input.name = name
    form.appendChild(input)
  }
  input.value = value
}

import { OverturoValidationError } from "./errors"
import type { RedirectOptions } from "./types"

/**
 * Redirects the current page to a consent flow.
 */
export function performRedirect(baseUrl: string, options: RedirectOptions): void {
  if (!options.flowId) {
    throw new OverturoValidationError("flowId is required for redirect mode")
  }
  if (!options.redirectUri) {
    throw new OverturoValidationError("redirectUri is required for redirect mode")
  }

  const url = new URL(`${baseUrl}/accord/${options.flowId}`)
  const params = new URLSearchParams()

  params.set("redirect_uri", options.redirectUri)
  if (options.state) params.set("state", options.state)
  if (options.nonce) params.set("nonce", options.nonce)
  if (options.scope) params.set("scope", options.scope)

  url.search = params.toString()
  window.location.href = url.toString()
}

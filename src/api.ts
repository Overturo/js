import { DEFAULT_TIMEOUT } from "./constants"
import { OverturoApiError, OverturoNetworkError, OverturoTimeoutError } from "./errors"

// Two error envelopes ship across the surface:
//   * Flat:        { "error": "Invalid publishable key" }       (auth layer)
//   * Structured:  { "error": { "code": "x", "message": "y" } } (canonical)
// Prior code stringified the structured envelope to "[object Object]"
// and hid the real failure. Walk a small precedence chain.
export function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const raw = (body as Record<string, unknown>).error
    if (typeof raw === "string" && raw.length > 0) return raw
    if (raw && typeof raw === "object") {
      const inner = raw as Record<string, unknown>
      if (typeof inner.message === "string" && inner.message.length > 0) {
        return typeof inner.code === "string" && inner.code.length > 0
          ? `${inner.code}: ${inner.message}`
          : inner.message
      }
      // Validation-failure envelope shape:
      //   { code: "validation_failed", errors: { field: ["msg", ...] } }
      // Surface the first concrete validation reason so the failure
      // message names a specific field rather than just the code.
      if (inner.errors && typeof inner.errors === "object") {
        const firstField = Object.keys(inner.errors)[0]
        if (firstField) {
          const msgs = (inner.errors as Record<string, unknown>)[firstField]
          const first = Array.isArray(msgs) ? msgs[0] : msgs
          if (typeof first === "string") {
            const codePrefix = typeof inner.code === "string" && inner.code.length > 0 ? `${inner.code}: ` : ""
            return `${codePrefix}${firstField} ${first}`
          }
        }
      }
      if (typeof inner.code === "string" && inner.code.length > 0) {
        return inner.code
      }
    }
    const topMessage = (body as Record<string, unknown>).message
    if (typeof topMessage === "string" && topMessage.length > 0) return topMessage
  }
  return `HTTP ${status}`
}

export interface ApiClientOptions {
  baseUrl: string
  publishableKey: string
  apiKey?: string
  /** Request timeout in milliseconds. 0 disables timeout. */
  timeout?: number
}

/**
 * Converts a camelCase string to snake_case.
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * Converts a snake_case string to camelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * Recursively converts object keys from camelCase to snake_case.
 */
export function toSnakeCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase)
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[camelToSnake(key)] = toSnakeCase(value)
    }
    return result
  }
  return obj
}

/**
 * Recursively converts object keys from snake_case to camelCase.
 */
export function toCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase)
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = toCamelCase(value)
    }
    return result
  }
  return obj
}

/**
 * Fetch-based HTTP client with automatic case conversion, timeout, and error handling.
 */
export class ApiClient {
  private baseUrl: string
  private publishableKey: string
  private apiKey?: string
  private timeout: number

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl
    this.publishableKey = options.publishableKey
    this.apiKey = options.apiKey
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path)
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body)
  }

  /**
   * POST that returns the raw Response object without JSON parsing or error throwing.
   * Used by exchange() to handle HTTP 202 (fulfillment pending) with retry logic.
   */
  async rawPost(path: string, body: Record<string, unknown>): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Publishable-Key": this.publishableKey,
    }

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
    }

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (this.timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), this.timeout)
    }

    try {
      return await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(toSnakeCase(body)),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new OverturoTimeoutError(`Request timed out after ${this.timeout}ms`)
      }
      throw new OverturoNetworkError("Network request failed", error)
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Publishable-Key": this.publishableKey,
    }

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
    }

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (this.timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), this.timeout)
    }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(toSnakeCase(body)) : undefined,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new OverturoTimeoutError(`Request timed out after ${this.timeout}ms`)
      }
      throw new OverturoNetworkError("Network request failed", error)
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }

    if (!response.ok) {
      let responseBody: unknown
      try {
        responseBody = await response.json()
      } catch {
        responseBody = null
      }
      const message = extractErrorMessage(responseBody, response.status)
      throw new OverturoApiError(message, response.status, responseBody)
    }

    const text = await response.text()
    if (!text) {
      return {} as T
    }

    return toCamelCase(JSON.parse(text)) as T
  }
}

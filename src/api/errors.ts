export type ApiErrorCode =
  | "not_found"
  | "unauthorised"
  | "forbidden"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "invalid_code"
  | "expired"

/** User-facing error: `message` is written to be shown as-is and to name a way forward. */
export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

export function errorMessage(e: unknown, fallback = "Something didn't work. Check your connection and try again."): string {
  if (isApiError(e)) return e.message
  if (e instanceof Error && e.message && !/fetch|network|undefined|null/i.test(e.message)) return e.message
  return fallback
}

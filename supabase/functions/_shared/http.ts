import { env } from "./env.ts"

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

const STATUS: Record<string, number> = { not_found: 404, unauthorised: 401, forbidden: 403, validation: 422, conflict: 409, rate_limited: 429, unavailable: 409, invalid_code: 422, expired: 410 }
export const fail = (code: keyof typeof STATUS, message: string) => new ApiError(code, message, STATUS[code])

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? ""
  // Explicit origin allowlist (TECH 04) — never a wildcard on authenticated endpoints.
  const allowed = env.allowedOrigins().includes(origin) ? origin : env.allowedOrigins()[0]
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-order-access, x-gift-session",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

/** Errors are user-facing only when deliberately raised; anything else is logged with a correlation id. */
export function errorResponse(req: Request, e: unknown) {
  if (e instanceof ApiError) return json(req, { error: { code: e.code, message: e.message } }, e.status)
  const id = crypto.randomUUID().slice(0, 8)
  console.error(`[${id}]`, e instanceof Error ? e.stack ?? e.message : e)
  return json(req, { error: { code: "internal", message: `Something went wrong on our side. Reference ${id}.` } }, 500)
}

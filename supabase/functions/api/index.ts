// Single RPC-style entry point for the web app: POST { method, args } → result.
// Each handler authorises the caller itself; RLS additionally denies direct table access.
import { corsHeaders, errorResponse, fail, json } from "../_shared/http.ts"
import { getCaller } from "../_shared/auth.ts"
import type { Ctx, Handler } from "./context.ts"
import { catalog } from "./catalog.ts"
import { orders } from "./orders.ts"
import { gifts } from "./gifts.ts"
import { events } from "./events.ts"
import { vendor } from "./vendor.ts"
import { admin } from "./admin.ts"

const handlers: Record<string, Handler> = { ...catalog, ...orders, ...gifts, ...events, ...vendor, ...admin }

// Simple per-instance rate limit for unauthenticated, abuse-prone methods (TECH 04).
const LIMITED = new Set(["requestOrderAccess", "sendGiftCode", "verifyGiftCode", "verifyOrderAccess", "recommend", "createCheckout"])
const hits = new Map<string, number[]>()
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (list.length >= max) throw fail("rate_limited", "Too many attempts. Wait a minute and try again.")
  list.push(now)
  hits.set(key, list)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: { code: "method", message: "POST only" } }, 405)
  try {
    const { method, args } = (await req.json()) as { method: string; args?: Record<string, unknown> }
    const handler = handlers[method]
    if (!handler) throw fail("not_found", "Unknown method.")
    const caller = await getCaller(req)
    if (LIMITED.has(method)) rateLimit(`${method}:${req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? caller.userId ?? "anon"}`, method === "recommend" ? 20 : 10, 60_000)
    const ctx: Ctx = { req, caller, args: args ?? {} }
    const result = await handler(ctx)
    return json(req, { data: result ?? null })
  } catch (e) {
    return errorResponse(req, e)
  }
})

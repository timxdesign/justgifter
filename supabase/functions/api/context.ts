// deno-lint-ignore-file no-explicit-any
import type { Caller } from "../_shared/auth.ts"
import { fail } from "../_shared/http.ts"
import { db, must } from "../_shared/db.ts"
import { randomOtp, safeEqual, sha256Hex } from "../_shared/domain/index.ts"
import { enqueue } from "../_shared/notify.ts"

export interface Ctx {
  req: Request
  caller: Caller
  args: Record<string, any>
}
export type Handler = (ctx: Ctx) => Promise<unknown>

export const str = (v: unknown, name: string, max = 500): string => {
  if (typeof v !== "string") throw fail("validation", `Missing ${name}.`)
  return v.slice(0, max)
}

/** One-time codes are stored hashed, expire in 10 minutes, are rate limited and allow 5 attempts. */
export async function issueOtp(key: string, to: string, subject: string, bodyFor: (code: string) => string) {
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await db().from("otps").select("id", { count: "exact", head: true }).eq("key", key).gt("created_at", since)
  if ((count ?? 0) >= 3) throw fail("rate_limited", "Too many codes requested. Wait a minute before asking for another.")
  const code = randomOtp()
  must(await db().from("otps").insert({ key, code_hash: await sha256Hex(`${key}:${code}`), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }))
  await enqueue({ to, kind: "otp", subject, body: bodyFor(code) })
}

export async function consumeOtp(key: string, code: string) {
  const row = must(await db().from("otps").select("*").eq("key", key).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle()) as any
  if (!row) throw fail("expired", "That code has expired. Request a new one.")
  if (row.attempts >= 5) throw fail("rate_limited", "Too many attempts. Request a new code.")
  await db().from("otps").update({ attempts: row.attempts + 1 }).eq("id", row.id)
  if (!safeEqual(row.code_hash, await sha256Hex(`${key}:${code.trim()}`))) throw fail("invalid_code", "That code doesn't match. Check the latest message and try again.")
  await db().from("otps").delete().eq("key", key)
}

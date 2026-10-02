// Supabase Auth "Send Email" hook: Auth generates the code, this function writes and sends the
// email through our SMTP relay, so every JustGifter email shares one design and ships with the code.
// Enable in Dashboard → Authentication → Hooks → Send Email (HTTPS) and set SEND_EMAIL_HOOK_SECRET.
import { Webhook } from "npm:standardwebhooks@1.0.0"
import { db } from "../_shared/db.ts"
import { codeEmail, type CodePurpose } from "../_shared/email/codes.ts"
import { securityNoticeEmail } from "../_shared/email/notices.ts"
import { sendNow } from "../_shared/email/send.ts"

interface HookUser {
  id: string
  email: string
  new_email?: string
  email_confirmed_at?: string | null
  user_metadata?: Record<string, unknown>
}
interface EmailData {
  token: string
  token_hash: string
  redirect_to: string
  email_action_type: string
  site_url: string
  token_new: string
  token_hash_new: string
  old_email?: string
  factor_type?: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const minutes = () => Math.round(Number(Deno.env.get("AUTH_CODE_SECONDS") ?? 600) / 60)

/** Profile names default to the email's local part; only greet by name when it's a real one. */
async function displayName(user: HookUser) {
  const meta = user.user_metadata?.name ?? user.user_metadata?.full_name
  if (typeof meta === "string" && meta.trim()) return meta.trim().split(/\s+/)[0]
  const { data } = await db().from("profiles").select("name").eq("id", user.id).maybeSingle()
  const name = (data?.name as string | undefined)?.trim()
  if (!name || name.toLowerCase() === user.email.split("@")[0].toLowerCase()) return null
  return name.split(/\s+/)[0]
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: { http_code: 405, message: "POST only" } }, 405)
  const secret = Deno.env.get("SEND_EMAIL_HOOK_SECRET")
  if (!secret) return json({ error: { http_code: 500, message: "Hook secret not configured" } }, 500)

  let user: HookUser, data: EmailData
  try {
    const payload = await req.text()
    const verified = new Webhook(secret.replace(/^v1,whsec_/, "")).verify(payload, Object.fromEntries(req.headers)) as { user: HookUser; email_data: EmailData }
    user = verified.user
    data = verified.email_data
  } catch {
    return json({ error: { http_code: 401, message: "Invalid signature" } }, 401)
  }

  try {
    const name = await displayName(user).catch(() => null)
    const base = { name, minutes: minutes() }
    const action = data.email_action_type

    if (action === "email_change") {
      // Secure email change sends two codes; the field names are crossed by design (see Supabase docs).
      if (user.new_email && data.token_new) {
        await sendNow(user.email, codeEmail({ kind: "email_change_current", newEmail: user.new_email }, { ...base, to: user.email, code: data.token }))
        await sendNow(user.new_email, codeEmail({ kind: "email_change_new" }, { ...base, to: user.new_email, code: data.token_new }))
      } else {
        const to = user.new_email ?? user.email
        await sendNow(to, codeEmail({ kind: "email_change_new" }, { ...base, to, code: data.token }))
      }
      return json({})
    }

    if (action.endsWith("_notification")) {
      const notice = securityNoticeEmail(action, { to: user.email, name, oldEmail: data.old_email, factorType: data.factor_type })
      if (notice) await sendNow(user.email, notice)
      return json({})
    }

    let purpose: CodePurpose
    if (action === "reauthentication") purpose = { kind: "reauth" }
    else purpose = { kind: "signin", isNew: action === "signup" || action === "invite", next: data.redirect_to }
    await sendNow(user.email, codeEmail(purpose, { ...base, to: user.email, code: data.token }))
    return json({})
  } catch (e) {
    console.error("auth-email failed", e)
    return json({ error: { http_code: 500, message: "We couldn't send the email. Try again in a moment." } }, 500)
  }
})

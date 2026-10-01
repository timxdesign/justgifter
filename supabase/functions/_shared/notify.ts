import nodemailer from "npm:nodemailer@6"
import { db } from "./db.ts"
import { env } from "./env.ts"
import { uid } from "./domain/index.ts"

/**
 * Outbox pattern (§14): business transactions enqueue notifications in the database; the jobs
 * worker delivers them through Zoho Mail SMTP with bounded retries. Provider acceptance is
 * recorded as "accepted" — never as confirmed inbox delivery.
 */

export interface Message {
  to: string
  subject: string
  body: string
  kind: string
  link?: { label: string; href: string }
}

export async function enqueue(msg: Message) {
  const blocked = await db().from("blocked_contacts").select("contact").eq("contact", msg.to.toLowerCase()).maybeSingle()
  await db().from("notifications").insert({
    id: uid("msg"),
    recipient: msg.to,
    subject: msg.subject,
    body: msg.body,
    kind: msg.kind,
    link_label: msg.link?.label ?? null,
    link_href: msg.link?.href ?? null,
    status: blocked.data ? "suppressed" : "queued",
  })
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null
function smtp() {
  // Use the exact host for your Zoho datacentre (e.g. smtp.zoho.com, smtp.zoho.eu) — see docs/SETUP.md.
  transport ??= nodemailer.createTransport({ host: env.smtpHost(), port: env.smtpPort(), secure: env.smtpPort() === 465, auth: { user: env.smtpUser(), pass: env.smtpPass() } })
  return transport
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

function html(m: { subject: string; body: string; link_label: string | null; link_href: string | null }) {
  const url = m.link_href ? new URL(m.link_href, env.siteUrl()).toString() : null
  return `<!doctype html><html><body style="margin:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1e1311">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;padding:32px">
<tr><td style="font-family:Georgia,serif;font-size:22px;font-weight:600;padding-bottom:16px">JustGifter</td></tr>
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">${escape(m.subject)}</td></tr>
<tr><td style="font-size:16px;line-height:1.55;color:#4a3b36;padding-bottom:24px">${escape(m.body)}</td></tr>
${url ? `<tr><td><a href="${escape(url)}" style="display:inline-block;background:#1e1311;color:#fff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:600">${escape(m.link_label ?? "Open")}</a></td></tr>` : ""}
<tr><td style="font-size:12px;color:#8a7d78;padding-top:28px">You're receiving this because of an order or gift on JustGifter. Gift links are private — please don't forward them.</td></tr>
</table></td></tr></table></body></html>`
}

/** Delivers queued notifications in a bounded batch. Called by the jobs worker. */
export async function deliverOutbox(limit = 25) {
  const { data } = await db().from("notifications").select("*").eq("status", "queued").lt("attempts", 5).order("at").limit(limit)
  let sent = 0
  for (const m of data ?? []) {
    try {
      if (env.sendRealEmail() && env.smtpHost()) {
        await smtp().sendMail({ from: env.mailFrom(), to: m.recipient, subject: m.subject, text: `${m.body}${m.link_href ? `\n\n${m.link_label}: ${new URL(m.link_href, env.siteUrl())}` : ""}`, html: html(m) })
      } else {
        console.log(`[mail suppressed outside production] ${m.kind} → ${m.recipient}: ${m.subject}`)
      }
      await db().from("notifications").update({ status: "accepted", attempts: m.attempts + 1 }).eq("id", m.id)
      sent++
    } catch (e) {
      const attempts = m.attempts + 1
      await db().from("notifications").update({ status: attempts >= 5 ? "failed" : "queued", attempts, last_error: String(e).slice(0, 300) }).eq("id", m.id)
    }
  }
  return sent
}

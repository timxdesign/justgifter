import { db } from "./db.ts"
import { env } from "./env.ts"
import { uid } from "./domain/index.ts"
import { type Banner, esc } from "./email/layout.ts"
import { render, sendNow } from "./email/send.ts"

/**
 * Outbox pattern (§14): business transactions enqueue notifications in the database; the jobs
 * worker delivers them through the SMTP relay (ZeptoMail) with bounded retries. Provider acceptance is
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

const BANNERS: Record<string, Banner> = {
  gift_reveal: "open",
  claim_reminder: "gift",
  receipt: "bag",
  refund: "parcel",
  vendor_new_order: "store",
  host: "balloons",
}

const EYEBROWS: Record<string, string> = {
  gift_reveal: "A gift for you",
  claim_reminder: "Your gift is waiting",
  receipt: "Payment confirmed",
  refund: "Refund",
  vendor_new_order: "New order",
  host: "Occasion page",
}

/** Queued notifications share the code emails' layout; artwork follows the kind of message. */
function mail(m: { recipient: string; kind: string; subject: string; body: string; link_label: string | null; link_href: string | null }) {
  return render(m.subject, {
    preheader: m.body.slice(0, 140),
    banner: BANNERS[m.kind],
    eyebrow: EYEBROWS[m.kind],
    title: m.subject,
    intro: [esc(m.body)],
    cta: m.link_href ? { label: m.link_label ?? "Open JustGifter", href: m.link_href } : undefined,
    reason: m.kind === "gift_reveal" || m.kind === "claim_reminder"
      ? "Someone sent you a gift on JustGifter. Gift links are private to you, so please don't forward this email."
      : m.kind === "vendor_new_order" ? "You're getting this because you run a store on JustGifter." : "You're getting this because of an order, gift or account activity on JustGifter.",
    to: m.recipient,
  })
}

/** Delivers queued notifications in a bounded batch. Called by the jobs worker. */
export async function deliverOutbox(limit = 25) {
  const { data } = await db().from("notifications").select("*").eq("status", "queued").lt("attempts", 5).order("at").limit(limit)
  let sent = 0
  for (const m of data ?? []) {
    try {
      if (env.sendRealEmail() && env.smtpHost()) {
        await sendNow(m.recipient, mail(m))
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

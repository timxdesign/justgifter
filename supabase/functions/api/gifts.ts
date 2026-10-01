// deno-lint-ignore-file no-explicit-any
import type { Gift } from "../_shared/domain/index.ts"
import { canTransition, CLAIM_TRANSITIONS, formatMoney, maskContact, randomToken, sha256Hex, uid, zoneById } from "../_shared/domain/index.ts"
import { db, must } from "../_shared/db.ts"
import { fail } from "../_shared/http.ts"
import { cancelWithRefund, moveToAcceptance } from "../_shared/commerce.ts"
import { enqueue } from "../_shared/notify.ts"
import { audit, giftBy, orderBy, products, saveGift, saveOrder, timelineEntry, vendorsById } from "../_shared/repo.ts"
import { revealView } from "../_shared/views.ts"
import type { Handler } from "./context.ts"
import { consumeOtp, issueOtp, str } from "./context.ts"

async function byToken(token: unknown): Promise<Gift | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null
  return giftBy("token_hash", await sha256Hex(token))
}

async function requireSession(gift: Gift, session: unknown) {
  if (typeof session !== "string" || !session) throw fail("unauthorised", "Please confirm it's you first. We'll send a code to the contact the sender used.")
  const row = must(await db().from("gift_sessions").select("*").eq("token_hash", await sha256Hex(session)).maybeSingle()) as any
  if (!row || row.gift_id !== gift.id || new Date(row.expires_at) < new Date()) throw fail("unauthorised", "Your verification has expired. Request a new code.")
}

async function view(g: Gift, preview: boolean) {
  const o = (await orderBy("id", g.orderId))!
  const [p] = await products({ ids: [o.lines[0].productId] })
  const vendor = (await vendorsById([o.vendorId])).get(o.vendorId)!
  const ev = o.eventId ? (must(await db().from("events").select("published").eq("id", o.eventId).maybeSingle()) as any) : null
  return revealView(g, o, p, vendor.name, ev?.published?.content?.title ?? null, preview)
}

export const gifts: Record<string, Handler> = {
  async getGiftEntry({ args }) {
    const g = await byToken(args.token)
    if (!g) return { state: "not_found", recipientFirstName: null, contactMasked: null, verificationRequired: false, revealAt: null, revealStyle: "wrapped_box" }
    const state = g.access === "revoked" ? "revoked" : g.access === "expired" ? "expired" : g.claimStatus === "declined" ? "declined" : g.revealStatus === "scheduled" ? "scheduled" : "ready"
    return { state, recipientFirstName: g.recipientName.split(" ")[0], contactMasked: g.contactMasked, verificationRequired: g.claimStatus === "pending" || g.claimStatus === "needs_sender_approval", revealAt: g.revealAt, revealStyle: g.revealStyle }
  },

  async sendGiftCode({ args }) {
    const g = await byToken(args.token)
    if (!g) throw fail("not_found", "This gift link isn't valid.")
    const to = g.recipientEmail ?? g.recipientPhone
    if (!to) throw fail("unavailable", "We can't verify this gift automatically. Contact support for help.")
    await issueOtp(`gift:${g.id}`, to, "Your gift verification code", (code) => `Your code is ${code}. It expires in 10 minutes.`)
    return {}
  },

  async verifyGiftCode({ args }) {
    const g = await byToken(args.token)
    if (!g) throw fail("not_found", "This gift link isn't valid.")
    await consumeOtp(`gift:${g.id}`, str(args.code, "code", 10))
    const session = randomToken()
    const expiresAt = new Date(Date.now() + 2 * 3_600_000).toISOString()
    must(await db().from("gift_sessions").insert({ token_hash: await sha256Hex(session), gift_id: g.id, expires_at: expiresAt }))
    return { token: session, expiresAt }
  },

  async getGiftReveal({ args }) {
    const g = await byToken(args.token)
    if (!g || g.access !== "active") throw fail("not_found", "This gift link is no longer active.")
    if (g.revealStatus === "scheduled" || g.revealStatus === "draft") throw fail("unavailable", "This gift isn't ready to open yet.")
    return view(g, false)
  },

  async getGiftPreview({ args }) {
    // Preview tokens are separate from live links and never count as opening (MOT 06).
    const g = await giftBy("preview_token_hash", await sha256Hex(str(args.previewToken, "preview", 100)))
    if (!g) throw fail("not_found", "This preview link isn't valid.")
    return view(g, true)
  },

  async markGiftOpened({ args }) {
    const g = await byToken(args.token)
    if (!g || g.access !== "active" || g.revealStatus !== "available") return
    g.revealStatus = "opened"
    g.openedAt = new Date().toISOString()
    await saveGift(g)
    const o = (await orderBy("id", g.orderId))!
    o.timeline = [...o.timeline, timelineEntry("gift_opened", "Gift opened", "recipient")]
    await saveOrder(o)
  },

  async submitGiftAddress({ args }) {
    const g = await byToken(args.token)
    if (!g) throw fail("not_found", "This gift link isn't valid.")
    await requireSession(g, args.session)
    if (!canTransition(CLAIM_TRANSITIONS, g.claimStatus, "submitted")) throw fail("conflict", "This gift no longer needs an address.")
    const a = args.address ?? {}
    for (const [f, label] of [["recipientName", "your name"], ["phone", "a phone number for the rider"], ["line1", "your street address"], ["area", "your area"]] as const) {
      if (typeof a[f] !== "string" || !a[f].trim()) throw fail("validation", `Add ${label}.`)
    }
    const zone = zoneById(a.zoneId)
    if (!zone) throw fail("validation", "Choose a delivery area.")
    const address = { recipientName: a.recipientName.slice(0, 80), phone: a.phone.slice(0, 30), line1: a.line1.slice(0, 120), line2: a.line2?.slice(0, 120), landmark: a.landmark?.slice(0, 120), area: a.area.slice(0, 60), city: zone.city, state: zone.state, zoneId: zone.id, instructions: a.instructions?.slice(0, 200) }
    const o = (await orderBy("id", g.orderId))!
    const vendor = (await vendorsById([o.vendorId])).get(o.vendorId)!
    if (zone.id !== o.delivery.zoneId) {
      // Never charge the recipient or silently change the gift — the sender decides (§3).
      const serves = vendor.zones.find((z) => z.zoneId === zone.id)
      must(await db().from("revised_quotes").upsert({ order_id: o.id, zone_id: zone.id, fee: serves?.fee ?? null, address }))
      g.claimStatus = "needs_sender_approval"
      await saveGift(g)
      o.timeline = [...o.timeline, timelineEntry("revised_quote", "Recipient's address is outside the quoted area", "recipient")]
      await saveOrder(o)
      await enqueue({ to: o.buyerEmail, kind: "status", subject: `Action needed for ${o.reference}`, body: serves ? `${g.recipientName}'s address is in ${zone.name}, which costs ${formatMoney(serves.fee)} to deliver instead of ${formatMoney(o.pricing.delivery)}. Approve the difference or cancel for a full refund.` : `${vendor.name} can't deliver to ${zone.name}. You can cancel for a full refund.`, link: { label: "Review", href: `/account/orders/${o.id}` } })
      return { status: "needs_sender_approval", message: "Thanks! That address is outside the area the sender chose. We've asked them to confirm — you won't be charged anything." }
    }
    must(await db().from("order_addresses").upsert({ order_id: o.id, address }))
    g.claimStatus = "submitted"
    await saveGift(g)
    o.timeline = [...o.timeline, timelineEntry("address_received", "Recipient added a delivery address", "recipient")]
    await db().from("jobs").update({ status: "done" }).in("idempotency_key", [`claim-expiry:${g.id}`, `claim-reminder:${g.id}`]).eq("status", "queued")
    await moveToAcceptance(o)
    return { status: "submitted", message: "Address received. Only the vendor delivering your gift can see it." }
  },

  async declineGift({ args }) {
    const g = await byToken(args.token)
    if (!g) throw fail("not_found", "This gift link isn't valid.")
    await requireSession(g, args.session)
    const o = (await orderBy("id", g.orderId))!
    if (!["paid", "awaiting_recipient_details", "awaiting_vendor_acceptance"].includes(o.status)) throw fail("conflict", "This gift is already being prepared, so it can't be declined here. Contact support and we'll help.")
    if (canTransition(CLAIM_TRANSITIONS, g.claimStatus, "declined")) g.claimStatus = "declined"
    g.declinedAt = new Date().toISOString()
    await saveGift(g)
    const reason = String(args.reason ?? "").slice(0, 300)
    await cancelWithRefund(o, "recipient_declined", "recipient", reason ? `The recipient declined the gift: “${reason}”` : "The recipient declined the gift.")
  },

  async sendThankYou({ args }) {
    const g = await byToken(args.token)
    if (!g) throw fail("not_found", "This gift link isn't valid.")
    const note = str(args.note, "note", 500).trim()
    if (note.length < 2) throw fail("validation", "Write a short note first.")
    g.thankYouNote = note
    g.thankYouAt = new Date().toISOString()
    await saveGift(g)
    const o = (await orderBy("id", g.orderId))!
    await enqueue({ to: o.buyerEmail, kind: "status", subject: `${g.recipientName.split(" ")[0]} sent you a thank-you note`, body: note, link: { label: "View order", href: `/account/orders/${o.id}` } })
  },

  async reportGift({ args }) {
    const g = await byToken(args.token)
    if (!g) throw fail("not_found", "This gift link isn't valid.")
    must(await db().from("content_reports").insert({ id: uid("rpt"), kind: str(args.kind, "kind", 40), target_type: "gift", target_id: g.id, details: String(args.details ?? "").slice(0, 2000) }))
    g.reported = true
    if (args.stopContact) {
      g.contactStopped = true
      const contact = (g.recipientEmail ?? g.recipientPhone ?? "").toLowerCase()
      if (contact) await db().from("blocked_contacts").upsert({ contact })
    }
    await saveGift(g)
    await audit("recipient", "gift.reported", "gift", g.id, `${args.kind}${args.stopContact ? " + stop contact" : ""} (${maskContact(g.recipientEmail ?? "")})`)
  },
}

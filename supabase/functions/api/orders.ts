// deno-lint-ignore-file no-explicit-any
import type { Order } from "../_shared/domain/index.ts"
import { formatMoney, randomToken, sha256Hex, uid } from "../_shared/domain/index.ts"
import { db, must } from "../_shared/db.ts"
import { fail } from "../_shared/http.ts"
import { cancelWithRefund, createCheckout, createRefund, moveToAcceptance, preview, processVerifiedPayment, transition } from "../_shared/commerce.ts"
import * as paystack from "../_shared/paystack.ts"
import { enqueue } from "../_shared/notify.ts"
import { enqueueJob, giftBy, orderBy, saveGift, saveOrder, timelineEntry, toGift, toOrder } from "../_shared/repo.ts"
import { caseView, orderDetail, orderSummary } from "../_shared/views.ts"
import type { Ctx, Handler } from "./context.ts"
import { consumeOtp, issueOtp, str } from "./context.ts"

/** Buyer access: account owner, verified email, the checkout's own token, or an emailed-code token. */
export async function canViewOrder(ctx: Ctx, o: Order): Promise<boolean> {
  const c = ctx.caller
  if (c.userId && (o.buyerUserId === c.userId || (c.emailVerified && o.buyerEmail === c.email))) return true
  const tokens: string[] = Array.isArray(ctx.args.accessTokens) ? ctx.args.accessTokens.slice(0, 20) : []
  if (!tokens.length) return false
  const hashes = await Promise.all(tokens.map((t) => sha256Hex(String(t))))
  if (o.id && hashes.length) {
    const own = must(await db().from("orders").select("access_token_hash").eq("id", o.id).single()) as any
    if (hashes.includes(own.access_token_hash)) return true
  }
  const grants = must(await db().from("order_access").select("email").in("token_hash", hashes).gt("expires_at", new Date().toISOString())) as any[]
  return grants.some((g) => g.email === o.buyerEmail)
}

async function requireOrder(ctx: Ctx, id: string) {
  const o = await orderBy("id", id)
  if (!o || !(await canViewOrder(ctx, o))) throw fail("not_found", "We couldn't find that order. Sign in with the email you used at checkout.")
  return o
}

export const orders: Record<string, Handler> = {
  async previewCheckout({ args }) {
    const draft = args.draft
    if (draft.source === "wishlist") {
      const { data: ev } = await db().from("events").select("delivery_zone_id").eq("slug", draft.eventSlug ?? "").maybeSingle()
      if (ev?.delivery_zone_id) Object.assign(draft, { zoneId: ev.delivery_zone_id, addressKnown: true })
    }
    return preview(draft, draft.holdId)
  },

  async createCheckout({ args, caller }) {
    return createCheckout(args.draft, { userId: caller.userId })
  },

  async getPaymentStatus({ args }) {
    const reference = str(args.reference, "reference", 40)
    let p = must(await db().from("payments").select("*").eq("reference", reference).maybeSingle()) as any
    if (!p) throw fail("not_found", "We couldn't find that payment.")
    // The browser return is not proof: verify with Paystack before showing success (PAY 05).
    if (p.status === "pending" && Date.now() - new Date(p.created_at).getTime() > 3_000) {
      try {
        const v = await paystack.verifyTransaction(reference)
        if (v.status === "success") {
          await processVerifiedPayment(`verify:${reference}`, v.reference, v.amount, { source: "status_poll" })
          p = must(await db().from("payments").select("*").eq("reference", reference).single())
        }
      } catch { /* still pending at the provider */ }
    }
    const o = must(await db().from("orders").select("id, status").eq("id", p.order_id).single()) as any
    return { reference, orderId: o.id, status: p.status, orderStatus: o.status, amount: Number(p.amount) }
  },

  async requestOrderAccess({ args }) {
    const email = str(args.email, "email", 200).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("validation", "Enter a valid email address.")
    // Identical response whether or not orders exist for this email (no enumeration, SEC 03).
    await issueOtp(`orders:${email}`, email, "Your order access code", (code) => `Use ${code} to view your JustGifter orders. It expires in 10 minutes.`)
    return {}
  },

  async verifyOrderAccess({ args }) {
    const email = str(args.email, "email", 200).trim().toLowerCase()
    await consumeOtp(`orders:${email}`, str(args.code, "code", 10))
    const token = randomToken()
    must(await db().from("order_access").insert({ token_hash: await sha256Hex(token), email, expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString() }))
    return { accessToken: token }
  },

  async listMyOrders(ctx) {
    const c = ctx.caller
    const tokens: string[] = Array.isArray(ctx.args.accessTokens) ? ctx.args.accessTokens.slice(0, 20) : []
    const hashes = await Promise.all(tokens.map((t) => sha256Hex(String(t))))
    const grants = hashes.length ? ((must(await db().from("order_access").select("email").in("token_hash", hashes).gt("expires_at", new Date().toISOString())) as any[]).map((g) => g.email)) : []
    const filters = [
      ...(c.userId ? [`buyer_user_id.eq.${c.userId}`] : []),
      ...(c.userId && c.emailVerified && c.email ? [`buyer_email.eq.${c.email}`] : []),
      ...grants.map((e) => `buyer_email.eq.${e}`),
      ...hashes.map((h) => `access_token_hash.eq.${h}`),
    ].filter((f) => /^[a-z_]+\.eq\.[\w@.+-]+$/i.test(f))
    if (!filters.length) return []
    const rows = must(await db().from("orders").select("*").or(filters.join(",")).neq("status", "payment_expired").order("created_at", { ascending: false }).limit(100)) as any[]
    const vendorNames = new Map((must(await db().from("vendors").select("id,name").in("id", [...new Set(rows.map((r) => r.vendor_id))].concat("-"))) as any[]).map((v) => [v.id, v.name]))
    const giftRows = must(await db().from("gifts").select("*").in("order_id", rows.map((r) => r.id).concat("-"))) as any[]
    return rows.map((r) => orderSummary(toOrder(r), vendorNames.get(r.vendor_id) ?? "", giftRows.find((g) => g.order_id === r.id) ? toGift(giftRows.find((g) => g.order_id === r.id)) : null))
  },

  async getOrder(ctx) {
    const o = await requireOrder(ctx, str(ctx.args.id, "order"))
    return orderDetail(o, { revealAddress: true, includePreview: true })
  },

  async updateGift(ctx) {
    const o = await requireOrder(ctx, str(ctx.args.orderId, "order"))
    const g = o.giftId ? await giftBy("id", o.giftId) : null
    if (!g) throw fail("not_found", "This order isn't a gift.")
    if (!(g.revealStatus === "draft" || g.revealStatus === "scheduled")) throw fail("conflict", "The reveal has already been sent, so the message can't be changed.")
    const p = ctx.args.patch ?? {}
    if (p.message !== undefined) {
      if (String(p.message).length > 300) throw fail("validation", "Keep the message under 300 characters.")
      g.message = String(p.message).trim()
    }
    if (p.senderDisplayName !== undefined && !g.anonymous) g.senderDisplayName = String(p.senderDisplayName).slice(0, 40).trim()
    if (p.revealAt !== undefined) {
      g.revealAt = p.revealAt ?? new Date().toISOString()
      await db().from("jobs").update({ run_at: g.revealAt }).eq("idempotency_key", `reveal:${g.id}`).eq("status", "queued")
      if (g.revealStatus === "scheduled") await enqueueJob("reveal_notification", g.revealAt, `reveal:${g.id}`, { giftId: g.id })
    }
    await saveGift(g)
    o.timeline = [...o.timeline, timelineEntry("gift_updated", "Gift message or schedule updated", "buyer")]
    await saveOrder(o)
  },

  async respondToRevisedQuote(ctx) {
    const o = await requireOrder(ctx, str(ctx.args.orderId, "order"))
    const g = o.giftId ? await giftBy("id", o.giftId) : null
    const rq = must(await db().from("revised_quotes").select("*").eq("order_id", o.id).maybeSingle()) as any
    if (!g || g.claimStatus !== "needs_sender_approval" || !rq) throw fail("conflict", "There's nothing to approve on this order.")
    if (!ctx.args.approve || rq.fee === null) {
      g.claimStatus = "declined"
      await saveGift(g)
      await cancelWithRefund(o, "other", "buyer", "Cancelled because the recipient's address is outside the delivery area.")
    } else {
      const extra = Math.max(0, Number(rq.fee) - o.pricing.delivery)
      // An increase is collected as a separate, explicit payment before the order proceeds (§3).
      if (extra > 0) throw fail("validation", `Approving this needs an extra ${formatMoney(extra)} for delivery. Contact support to complete the additional payment.`)
      o.delivery.zoneId = rq.zone_id
      must(await db().from("order_addresses").upsert({ order_id: o.id, address: rq.address }))
      g.claimStatus = "submitted"
      await saveGift(g)
      o.timeline = [...o.timeline, timelineEntry("revised_quote_approved", "Revised delivery approved", "buyer")]
      await moveToAcceptance(o)
    }
    await db().from("revised_quotes").delete().eq("order_id", o.id)
  },

  async cancelOrder(ctx) {
    const o = await requireOrder(ctx, str(ctx.args.orderId, "order"))
    if (!["paid", "awaiting_recipient_details", "awaiting_vendor_acceptance"].includes(o.status)) throw fail("conflict", "The vendor has already started on this order. Open a support case and we'll help.")
    await cancelWithRefund(o, "pre_acceptance_cancellation", "buyer", "Cancelled by the buyer before the vendor accepted.")
  },

  async requestRefund(ctx) {
    const o = await requireOrder(ctx, str(ctx.args.orderId, "order"))
    if (o.status !== "delivered") throw fail("conflict", "Refunds can be requested once the order is delivered. Before that, you can cancel.")
    await createRefund(o, ctx.args.reason, { requestedBy: "buyer", amount: o.pricing.items, includesFees: false, note: String(ctx.args.note ?? "").slice(0, 500) })
  },

  async openCase(ctx) {
    const o = await requireOrder(ctx, str(ctx.args.orderId, "order"))
    const id = uid("case")
    const row = { id, order_id: o.id, vendor_id: o.vendorId, kind: str(ctx.args.kind, "kind", 40), subject: `${String(ctx.args.kind).replace(/_/g, " ")} — ${o.reference}`, description: str(ctx.args.description, "description", 2000), opened_by: "buyer" }
    must(await db().from("support_cases").insert(row))
    await enqueue({ to: o.buyerEmail, kind: "status", subject: `We've opened case ${id.slice(-6).toUpperCase()}`, body: "Our support team will reply within one working day." })
    return caseView({ ...row, status: "open", owner: null, evidence: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  },
}

export { transition }

// deno-lint-ignore-file no-explicit-any
import type { Gift, Order, OrderStatus, RefundReason, TimelineEntry } from "./domain/index.ts"
import {
  acceptanceDeadline, addHours, addMinutes, assertTransition, buildLine, checkEligibility, entriesForPayment, entriesForRefund, formatMoney, maskContact,
  ORDER_STATUS_LABEL, ORDER_TRANSITIONS, orderReference, quote, randomToken, sha256Hex, uid,
} from "./domain/index.ts"
import { db, must } from "./db.ts"
import { fail } from "./http.ts"
import { env } from "./env.ts"
import { enqueue } from "./notify.ts"
import * as paystack from "./paystack.ts"
import { activeHolds, audit, bookedByDate, enqueueJob, eventBy, giftBy, orderBy, products, saveGift, saveOrder, settings, timelineEntry, vendorsById } from "./repo.ts"

/**
 * Commerce service (§14 service boundaries): eligibility, holds, price snapshots, order
 * transitions and payment integration. Mirrors the in-browser demo engine, backed by Postgres.
 */

export function transition(o: Order, to: OrderStatus, actor: TimelineEntry["actor"], note?: string) {
  assertTransition(ORDER_TRANSITIONS, o.status, to, "order")
  o.status = to
  o.timeline = [...o.timeline, timelineEntry(to, ORDER_STATUS_LABEL[to], actor, note)]
}

export interface DraftIn {
  vendorId: string; source: "marketplace" | "wishlist" | "storefront"; storefrontId?: string | null; campaign?: string; eventSlug?: string; wishlistItemId?: string; holdId?: string
  purchaseType: "gift" | "self"; lines: { productId: string; variantId: string; quantity: number; personalisationText?: string; wrappingId?: string; expectedUnitPrice?: number }[]
  buyer: { name: string; email: string; phone?: string }; zoneId: any; requestedDate: string | null; addressKnown: boolean; address?: any
  recipient?: { name: string; email?: string; phone?: string }; gift?: { senderDisplayName: string; anonymous: boolean; message: string; revealStyle: "envelope" | "wrapped_box"; revealAt: string | null; timezone: string }
  personalisationConfirmed?: boolean
}

export async function preview(draft: DraftIn, ownHoldId?: string) {
  const s = await settings()
  const vendors = await vendorsById([draft.vendorId])
  const vendor = vendors.get(draft.vendorId)
  const prods = await products({ ids: draft.lines.map((l) => l.productId) })
  const holds = await activeHolds(draft.lines.map((l) => l.variantId))
  const storefront = draft.source === "storefront" && draft.storefrontId ? (must(await db().from("storefronts").select("*").eq("id", draft.storefrontId).maybeSingle()) as any) : null
  // Server derives attribution: the storefront must belong to the vendor (STF 08).
  if (storefront && storefront.vendor_id !== draft.vendorId) throw fail("validation", "This store link doesn't match the vendor.")
  const eligibility = checkEligibility({
    now: new Date(), settings: s, source: draft.source, vendor, storefront: storefront ? { ...storefront, status: storefront.status } : null, products: prods, lines: draft.lines,
    zoneId: draft.zoneId, requestedDate: draft.requestedDate, addressKnown: draft.addressKnown, holds, ownHoldId, bookedByDate: await bookedByDate(draft.vendorId),
  })
  const lines = draft.lines.flatMap((l) => {
    const p = prods.find((x) => x.id === l.productId)
    const v = p?.variants.find((x) => x.id === l.variantId)
    return p && v ? [buildLine({ product: p, variant: v, quantity: l.quantity, personalisationText: l.personalisationText, wrappingId: l.wrappingId })] : []
  })
  const d = eligibility.delivery
  const pricing = lines.length ? quote({ lines, deliveryFee: d?.fee ?? 0, deliveryProvisional: !draft.addressKnown, settings: s }) : null
  const delivery = d ? {
    feasible: d.feasible, reason: d.feasible ? undefined : d.reason, message: d.feasible ? undefined : d.message, earliest: d.earliest, date: d.feasible ? d.date : null,
    windowStart: d.feasible ? d.windowStart : null, windowEnd: d.feasible ? d.windowEnd : null, fee: d.fee, sameDay: d.feasible ? d.sameDay : false, dates: [], responsibleParty: vendor!.fulfilment,
  } : null
  return { ok: eligibility.ok, issues: eligibility.issues, lines, pricing, delivery, claimWindowHours: s.claimWindowHours, holdExpiresAt: null as string | null }
}

function validateDraft(draft: DraftIn) {
  const err = (m: string) => { throw fail("validation", m) }
  if (!draft.buyer?.name?.trim()) err("Add your name.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.buyer?.email ?? "")) err("Add an email address for your receipt.")
  if (!draft.requestedDate) err("Choose a delivery date.")
  if (draft.purchaseType === "gift") {
    if (!draft.recipient?.name?.trim()) err("Add the recipient's name.")
    if (!draft.recipient?.email && !draft.recipient?.phone) err("Add an email or phone number so we can send the gift reveal.")
    if (!draft.gift) err("Add a message and reveal style.")
    if ((draft.gift?.message.length ?? 0) > 300) err("Keep the message under 300 characters.")
  }
  if (draft.addressKnown && !draft.address) err("Add the delivery address.")
  if (draft.address && draft.address.zoneId !== draft.zoneId) err("The delivery address must be in the selected delivery area.")
  if (draft.lines.some((l) => l.personalisationText?.trim()) && !draft.personalisationConfirmed) err("Confirm the personalisation text is correct.")
  if (draft.lines.length < 1 || draft.lines.length > 20) err("Your bag is empty.")
}

async function hold(variantId: string, qty: number, wishlistItemId: string | null, minutes: number) {
  const id = uid("hld")
  const { data, error } = await db().rpc("create_stock_hold", { p_hold_id: id, p_variant: variantId, p_quantity: qty, p_wishlist_item: wishlistItemId, p_minutes: minutes })
  if (error) {
    if (/wishlist_held/.test(error.message)) throw fail("conflict", "Someone else is buying the last one right now. Try again in a few minutes, or choose another gift.")
    throw fail("conflict", "That item has just sold out. Choose another option or check back later.")
  }
  return { id, expiresAt: data as string }
}
export { hold as createHold }

async function releaseHolds(ids: string[]) {
  if (ids.length) await db().from("stock_holds").update({ status: "released" }).in("id", ids).eq("status", "active").is("order_id", null)
}

export async function createCheckout(draft: DraftIn, caller: { userId: string | null }) {
  const s = await settings()
  let ownHoldId: string | undefined
  const createdHolds: string[] = []
  if (draft.source === "wishlist") {
    const ev = await eventBy("slug", draft.eventSlug ?? "")
    const item = ev?.wishlist.find((w) => w.id === draft.wishlistItemId)
    if (!ev || ev.status !== "published" || !item) throw fail("unavailable", "This wishlist is no longer accepting gifts.")
    const addr = must(await db().from("event_addresses").select("address").eq("event_id", ev.id).maybeSingle()) as any
    if (!addr) throw fail("unavailable", "The host hasn't added a delivery address yet, so this item can't be bought right now.")
    const existing = draft.holdId ? (must(await db().from("stock_holds").select("*").eq("id", draft.holdId).eq("status", "active").gt("expires_at", new Date().toISOString()).maybeSingle()) as any) : null
    if (existing && existing.wishlist_item_id === item.id && !existing.order_id) ownHoldId = existing.id
    else {
      const h = await hold(item.variantId, draft.lines[0].quantity, item.id, s.holdMinutes)
      ownHoldId = h.id
      createdHolds.push(h.id)
    }
    const host = must(await db().from("profiles").select("email").eq("id", ev.hostUserId).maybeSingle()) as any
    draft = {
      ...draft, zoneId: ev.deliveryZoneId, addressKnown: true, address: addr.address, purchaseType: "gift", lines: [{ ...draft.lines[0], productId: item.productId, variantId: item.variantId }],
      recipient: { name: ev.published?.content.hostDisplayName ?? ev.draft.hostDisplayName, email: host?.email },
      gift: { ...(draft.gift ?? { senderDisplayName: draft.buyer.name.split(" ")[0], anonymous: false, message: "", revealStyle: "wrapped_box", timezone: s.timezone, revealAt: null }), revealAt: ev.surpriseMode && ev.surpriseRevealDate ? `${ev.surpriseRevealDate}T08:00:00.000Z` : draft.gift?.revealAt ?? null },
    }
  }
  try {
    validateDraft(draft)
    const pv = await preview(draft, ownHoldId)
    if (!pv.ok || !pv.pricing || !pv.delivery?.feasible) throw fail("validation", pv.issues[0]?.message ?? "This checkout can't be completed.")
    if (!ownHoldId) for (const l of draft.lines) createdHolds.push((await hold(l.variantId, l.quantity, null, s.holdMinutes)).id)
    const holdIds = ownHoldId ? [ownHoldId] : createdHolds
    const vendor = (await vendorsById([draft.vendorId])).get(draft.vendorId)!
    const ev = draft.eventSlug ? await eventBy("slug", draft.eventSlug) : null
    const id = uid("ord")
    const reference = orderReference()
    const accessToken = randomToken()
    const now = new Date()
    const order: any = {
      id, reference, vendor_id: vendor.id, buyer_user_id: caller.userId, buyer_name: draft.buyer.name.trim(), buyer_email: draft.buyer.email.trim().toLowerCase(), buyer_phone: draft.buyer.phone ?? null,
      source: draft.source, storefront_id: draft.source === "storefront" ? draft.storefrontId ?? null : null, campaign: draft.campaign?.slice(0, 60) ?? null, event_id: ev?.id ?? null,
      wishlist_item_id: draft.wishlistItemId ?? null, purchase_type: draft.purchaseType, lines: pv.lines, pricing: pv.pricing, status: "awaiting_payment", payment_status: "pending",
      delivery: { zoneId: draft.zoneId, addressKnown: draft.addressKnown, requestedDate: draft.requestedDate, windowKind: "requested", windowStart: pv.delivery.windowStart, windowEnd: pv.delivery.windowEnd, responsibleParty: vendor.fulfilment, attempts: 0 },
      timeline: [timelineEntry("awaiting_payment", "Order created — waiting for payment", "buyer")], hold_ids: holdIds, commission_bps: s.commissionBps, access_token_hash: await sha256Hex(accessToken),
    }
    must(await db().from("orders").insert(order))
    await db().from("stock_holds").update({ order_id: id }).in("id", holdIds)
    if (draft.address) must(await db().from("order_addresses").insert({ order_id: id, address: draft.address }))
    if (draft.purchaseType === "gift" && draft.recipient && draft.gift) {
      const previewToken = randomToken()
      const giftId = uid("gft")
      must(await db().from("gifts").insert({
        id: giftId, order_id: id, recipient_name: draft.recipient.name.trim(), recipient_email: draft.recipient.email?.trim().toLowerCase() ?? null, recipient_phone: draft.recipient.phone ?? null,
        contact_masked: maskContact(draft.recipient.email || draft.recipient.phone || ""), sender_display_name: draft.gift.anonymous ? "" : draft.gift.senderDisplayName.trim() || draft.buyer.name.split(" ")[0],
        anonymous: draft.gift.anonymous, message: draft.gift.message.trim(), reveal_style: draft.gift.revealStyle, reveal_at: draft.gift.revealAt ?? now.toISOString(), timezone: draft.gift.timezone,
        claim_status: draft.addressKnown ? "not_required" : "pending", preview_token_hash: await sha256Hex(previewToken), preview_token: previewToken, wishlist_item_id: draft.wishlistItemId ?? null,
      }))
      await db().from("orders").update({ gift_id: giftId }).eq("id", id)
    }
    const expiresAt = addMinutes(now, s.holdMinutes)
    const init = await paystack.initializeTransaction({
      email: order.buyer_email, amount: pv.pricing.total, reference, callbackUrl: `${env.siteUrl()}/checkout/confirm/${reference}`,
      metadata: { order_id: id, vendor_id: vendor.id, source: draft.source, cancel_action: `${env.siteUrl()}/checkout/confirm/${reference}` },
    })
    must(await db().from("payments").insert({ id: uid("pay"), order_id: id, reference, amount: pv.pricing.total, authorization_url: init.authorization_url, expires_at: expiresAt }))
    if (order.storefront_id) await db().from("analytics_events").insert({ storefront_id: order.storefront_id, vendor_id: vendor.id, kind: "checkout_start" })
    return { orderId: id, reference, paymentUrl: init.authorization_url, orderAccessToken: accessToken, expiresAt }
  } catch (e) {
    await releaseHolds(createdHolds)
    throw e
  }
}

// ---------------------------------------------------------------- Payment verification

/** Called by the webhook and by the status poll (after server-side verification with Paystack). */
export async function processVerifiedPayment(eventId: string, reference: string, amount: number, payload: unknown) {
  const { data: result, error } = await db().rpc("commit_verified_payment", { p_event_id: eventId, p_provider: "paystack", p_payload: payload, p_reference: reference, p_amount: amount })
  if (error) throw error
  if (result !== "committed" && result !== "conflict") return result as string
  const order = (await orderBy("reference", reference))!
  await postLedger(entriesForPayment(order))
  await db().from("reconciliation").insert({ id: uid("rec"), provider_reference: reference, amount, status: "matched", order_reference: reference, occurred_at: new Date().toISOString(), note: "Matched by reference and amount" })
  if (result === "conflict") {
    await db().from("support_cases").insert({ id: uid("case"), order_id: order.id, vendor_id: order.vendorId, kind: "general", subject: `Late payment conflict on ${order.reference}`, description: "Payment verified after the checkout hold expired and the item is no longer available. Offer a funded alternative with buyer consent or refund in full.", opened_by: "support" })
    await enqueue({ to: order.buyerEmail, kind: "status", subject: `We've received your payment for ${order.reference}`, body: "Your payment arrived just after the item was reserved by someone else. We haven't oversold it — our support team will offer you an alternative or a full refund within a few hours." })
    return result
  }
  const gift = order.giftId ? await giftBy("id", order.giftId) : null
  if (gift && !order.delivery.addressKnown) {
    transition(order, "awaiting_recipient_details", "system")
    await saveOrder(order)
  } else await moveToAcceptance(order)
  if (gift) {
    gift.revealStatus = "scheduled"
    await saveGift(gift)
    if (new Date(gift.revealAt) <= new Date()) await dispatchReveal(gift)
    else await enqueueJob("reveal_notification", gift.revealAt, `reveal:${gift.id}`, { giftId: gift.id })
  }
  await enqueue({ to: order.buyerEmail, kind: "receipt", subject: `Payment confirmed — ${order.reference}`, body: `We've received ${formatMoney(order.pricing.total)} for ${order.lines[0].title}${order.lines.length > 1 ? " and more" : ""}.`, link: { label: "View your order", href: `/account/orders/${order.id}` } })
  return result
}

export async function postLedger(drafts: ReturnType<typeof entriesForPayment>) {
  await db().from("ledger_entries").upsert(drafts.map((d) => ({ id: uid("led"), order_id: d.orderId, vendor_id: d.vendorId, type: d.type, amount: d.amount, currency: d.currency, idempotency_key: d.idempotencyKey, memo: d.memo })), { onConflict: "idempotency_key", ignoreDuplicates: true })
}

export async function moveToAcceptance(order: Order) {
  const s = await settings()
  const vendor = (await vendorsById([order.vendorId])).get(order.vendorId)!
  transition(order, "awaiting_vendor_acceptance", "system")
  order.acceptBy = acceptanceDeadline(vendor, new Date(), s.acceptanceHours, s.timezone).toISOString()
  await saveOrder(order)
  await enqueueJob("acceptance_timeout", order.acceptBy, `accept:${order.id}`, { orderId: order.id })
  const owner = must(await db().from("profiles").select("email").eq("vendor_id", vendor.id).contains("roles", ["vendor_owner"]).maybeSingle()) as any
  if (owner) await enqueue({ to: owner.email, kind: "vendor_new_order", subject: `New order ${order.reference}`, body: `${order.lines.map((l) => `${l.quantity} × ${l.title} (${l.variantName})`).join(", ")} for ${order.delivery.requestedDate}. Please accept within ${s.acceptanceHours} operating hours.`, link: { label: "Open order", href: `/vendor/orders/${order.id}` } })
}

/** Mints the recipient's link token (hash stored only) and queues the reveal message. */
export async function dispatchReveal(gift: Gift) {
  const order = (await orderBy("id", gift.orderId))!
  if (order.paymentStatus !== "successful" || ["cancelled", "declined"].includes(order.status) || gift.access !== "active") return
  if (gift.revealStatus === "available" || gift.revealStatus === "opened") return
  const s = await settings()
  const token = randomToken()
  gift.tokenHash = await sha256Hex(token)
  gift.revealStatus = "available"
  gift.notifiedAt = new Date().toISOString()
  if (gift.claimStatus === "pending") {
    gift.claimDeadline = addHours(new Date(), s.claimWindowHours)
    await enqueueJob("claim_reminder", addHours(gift.claimDeadline, -24), `claim-reminder:${gift.id}`, { giftId: gift.id })
    await enqueueJob("claim_expiry", gift.claimDeadline, `claim-expiry:${gift.id}`, { giftId: gift.id })
  }
  await saveGift(gift)
  if (gift.contactStopped || !gift.recipientEmail) return
  const from = gift.anonymous ? "Someone" : gift.senderDisplayName
  // Subject and body never name the item, price or anonymous sender (GFT 06, AC 07).
  await enqueue({ to: gift.recipientEmail, kind: "gift_reveal", subject: `${from} sent you something`, body: gift.claimStatus === "pending" ? "Open your gift and tell us where to deliver it. The link is private to you — please don't forward it." : "Open your gift whenever you're ready. The link is private to you — please don't forward it.", link: { label: "Open your gift", href: `/g/${token}` } })
}

// ---------------------------------------------------------------- Refunds & cancellation

export async function createRefund(order: Order, reason: RefundReason, opts: { amount?: number; includesFees?: boolean; requestedBy: string; submit?: boolean; note?: string }) {
  const existing = must(await db().from("refunds").select("*").eq("order_id", order.id).eq("reason", reason).not("status", "in", "(rejected,failed)").maybeSingle()) as any
  if (existing) return existing
  const id = uid("ref")
  const amount = opts.amount ?? order.pricing.total
  must(await db().from("refunds").insert({ id, order_id: order.id, amount, reason, includes_fees: opts.includesFees ?? true, status: opts.submit ? "approved" : "requested", requested_by: opts.requestedBy, note: opts.note ?? null }))
  if (opts.submit) await submitRefund(id)
  return { id }
}

/** Sends an approved refund to Paystack. Completion arrives via the refund.processed webhook. */
export async function submitRefund(refundId: string) {
  const r = must(await db().from("refunds").select("*, orders!inner(reference)").eq("id", refundId).single()) as any
  try {
    const res = await paystack.createRefund({ transaction: r.orders.reference, amount: r.amount, reason: r.reason })
    await db().from("refunds").update({ status: "submitted", provider_reference: String(res.id), updated_at: new Date().toISOString() }).eq("id", refundId)
  } catch (e) {
    await db().from("refunds").update({ status: "failed", note: String(e).slice(0, 200), updated_at: new Date().toISOString() }).eq("id", refundId)
  }
}

export async function completeRefund(refundId: string) {
  const r = must(await db().from("refunds").select("*").eq("id", refundId).single()) as any
  if (r.status === "completed") return
  await db().from("refunds").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", refundId)
  const order = (await orderBy("id", r.order_id))!
  await postLedger(entriesForRefund(order, { id: r.id, amount: Number(r.amount) }) as any)
  await enqueue({ to: order.buyerEmail, kind: "refund", subject: `Refund completed for ${order.reference}`, body: `${formatMoney(Number(r.amount))} has been returned to your original payment method. Banks usually show it within 3–10 working days.` })
}

export async function cancelWithRefund(order: Order, reason: RefundReason, actor: TimelineEntry["actor"], note: string, status: "cancelled" | "declined" = "cancelled") {
  if (["cancelled", "declined"].includes(order.status)) return
  const wasPaid = order.paymentStatus === "successful"
  transition(order, status, actor, note)
  order.cancellationReason = note
  await saveOrder(order)
  if (wasPaid) {
    await db().rpc("restock_order", { p_order: order.id })
    await createRefund(order, reason, { requestedBy: actor === "support" ? "support" : "system", submit: true, includesFees: true })
  }
  await db().from("jobs").update({ status: "done" }).eq("status", "queued").or(`payload->>orderId.eq.${order.id}${order.giftId ? `,payload->>giftId.eq.${order.giftId}` : ""}`)
  const gift = order.giftId ? await giftBy("id", order.giftId) : null
  if (gift) {
    if (gift.revealStatus !== "available" && gift.revealStatus !== "opened") {
      gift.access = "revoked"
      await saveGift(gift)
    } else if (!gift.contactStopped && gift.recipientEmail) {
      await enqueue({ to: gift.recipientEmail, kind: "status", subject: "An update about your gift", body: `Unfortunately the gift ${gift.anonymous ? "sent to you" : `from ${gift.senderDisplayName}`} can't be delivered. The sender has been refunded and told. There's nothing you need to do.` })
    }
  }
  await enqueue({ to: order.buyerEmail, kind: "status", subject: `Order ${order.reference} cancelled`, body: `${note}${wasPaid ? " A full refund is on its way." : ""}` })
  await audit(actor, `order.${status}`, "order", order.id, note)
}

// ---------------------------------------------------------------- Jobs

export async function runJob(kind: string, payload: Record<string, string>) {
  switch (kind) {
    case "reveal_notification": {
      const g = await giftBy("id", payload.giftId)
      if (g) await dispatchReveal(g)
      return
    }
    case "claim_reminder": {
      const g = await giftBy("id", payload.giftId)
      if (g?.claimStatus === "pending" && !g.contactStopped && g.recipientEmail) await enqueue({ to: g.recipientEmail, kind: "claim_reminder", subject: "Your gift is waiting for an address", body: "You have about a day left to tell us where to deliver your gift. Use the link in your original message." })
      return
    }
    case "claim_expiry": {
      const g = await giftBy("id", payload.giftId)
      if (g && (g.claimStatus === "pending" || g.claimStatus === "needs_sender_approval")) {
        g.claimStatus = "expired"
        g.access = "expired"
        await saveGift(g)
        const o = await orderBy("id", g.orderId)
        if (o) await cancelWithRefund(o, "claim_expired", "system", "The recipient didn't add a delivery address within the claim window.")
      }
      return
    }
    case "acceptance_timeout": {
      const o = await orderBy("id", payload.orderId)
      if (o?.status === "awaiting_vendor_acceptance") await cancelWithRefund(o, "vendor_declined", "system", "The vendor didn't confirm the order in time.", "declined")
      return
    }
  }
}

export { maskContact, uid }

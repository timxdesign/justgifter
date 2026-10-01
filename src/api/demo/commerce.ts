import type { Gift, Order, OrderStatus, Refund, RefundReason, StockHold, TimelineEntry } from "@domain/index.ts"
import {
  acceptanceDeadline,
  addHours,
  addMinutes,
  appendIdempotent,
  assertTransition,
  buildLine,
  checkEligibility,
  entriesForPayment,
  entriesForRefund,
  formatMoney,
  maskContact,
  ORDER_STATUS_LABEL,
  ORDER_TRANSITIONS,
  orderReference,
  quote,
  randomToken,
  resolveLatePayment,
  sellableUnits,
  sha256Hex,
  uid,
  wishlistRemaining,
  zoneById,
} from "@domain/index.ts"
import type { CheckoutDraft, CheckoutPreview, CheckoutSession, DeliveryQuote } from "../types"
import { ApiError } from "../errors"
import type { Store } from "./store"

// ---------------------------------------------------------------- Order state

export function timeline(o: Order, status: string, label: string, actor: TimelineEntry["actor"], note?: string) {
  o.timeline.push({ at: new Date().toISOString(), status, label, actor, note })
}

export function transition(s: Store, o: Order, to: OrderStatus, actor: TimelineEntry["actor"], note?: string) {
  assertTransition(ORDER_TRANSITIONS, o.status, to, "order")
  o.status = to
  o.updatedAt = s.nowIso()
  timeline(o, to, ORDER_STATUS_LABEL[to], actor, note)
}

// ---------------------------------------------------------------- Checkout

export function buildPreview(s: Store, draft: CheckoutDraft, ownHoldId?: string): CheckoutPreview {
  const vendor = s.db.vendors.find((v) => v.id === draft.vendorId)
  const storefront = draft.source === "storefront" ? s.db.storefronts.find((x) => x.id === draft.storefrontId) ?? null : null
  const products = s.db.products.filter((p) => draft.lines.some((l) => l.productId === p.id))
  const now = s.now()
  const eligibility = checkEligibility({
    now,
    settings: s.db.settings,
    source: draft.source,
    vendor,
    storefront,
    products,
    lines: draft.lines,
    zoneId: draft.zoneId,
    requestedDate: draft.requestedDate,
    addressKnown: draft.addressKnown,
    holds: s.db.holds,
    ownHoldId,
    bookedByDate: bookedByDate(s, draft.vendorId),
  })

  const lines = draft.lines.flatMap((l) => {
    const product = products.find((p) => p.id === l.productId)
    const variant = product?.variants.find((v) => v.id === l.variantId)
    return product && variant ? [buildLine({ product, variant, quantity: l.quantity, personalisationText: l.personalisationText, wrappingId: l.wrappingId })] : []
  })
  const d = eligibility.delivery
  const fee = d ? d.fee ?? 0 : 0
  const pricing = lines.length
    ? quote({ lines, deliveryFee: fee ?? 0, deliveryProvisional: !draft.addressKnown, settings: s.db.settings })
    : null
  const delivery: DeliveryQuote | null = d
    ? {
        feasible: d.feasible,
        reason: d.feasible ? undefined : d.reason,
        message: d.feasible ? undefined : d.message,
        earliest: d.earliest,
        date: d.feasible ? d.date : null,
        windowStart: d.feasible ? d.windowStart : null,
        windowEnd: d.feasible ? d.windowEnd : null,
        fee: d.fee,
        sameDay: d.feasible ? d.sameDay : false,
        dates: [],
        responsibleParty: vendor!.fulfilment,
      }
    : null

  const ownHold = ownHoldId ? s.db.holds.find((h) => h.id === ownHoldId) : null
  return {
    ok: eligibility.ok,
    issues: eligibility.issues,
    lines,
    pricing,
    delivery,
    claimWindowHours: s.db.settings.claimWindowHours,
    holdExpiresAt: ownHold?.expiresAt ?? null,
  }
}

export function bookedByDate(s: Store, vendorId: string) {
  const out: Record<string, number> = {}
  for (const o of s.db.orders) {
    if (o.vendorId !== vendorId || ["cancelled", "declined", "payment_expired", "awaiting_payment"].includes(o.status)) continue
    out[o.delivery.requestedDate] = (out[o.delivery.requestedDate] ?? 0) + 1
  }
  return out
}

function validateDraft(draft: CheckoutDraft) {
  const errors: string[] = []
  if (!draft.buyer.name.trim()) errors.push("Add your name.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.buyer.email)) errors.push("Add an email address for your receipt.")
  if (!draft.requestedDate) errors.push("Choose a delivery date.")
  if (draft.purchaseType === "gift") {
    if (!draft.recipient?.name.trim()) errors.push("Add the recipient's name.")
    if (!draft.recipient?.email && !draft.recipient?.phone) errors.push("Add an email or phone number so we can send the gift reveal.")
    if (!draft.gift) errors.push("Add a message and reveal style.")
    if (draft.gift && draft.gift.message.length > 300) errors.push("Keep the message under 300 characters.")
  }
  if (draft.addressKnown && !draft.address) errors.push("Add the delivery address.")
  if (draft.address && draft.address.zoneId !== draft.zoneId) errors.push("The delivery address must be in the selected delivery area.")
  if (draft.lines.some((l) => l.personalisationText?.trim()) && !draft.personalisationConfirmed) errors.push("Confirm the personalisation text is correct.")
  if (errors.length) throw new ApiError("validation", errors[0], errors)
}

export async function createCheckout(s: Store, draft: CheckoutDraft): Promise<CheckoutSession> {
  const now = s.now()
  const settings = s.db.settings

  let ownHold: StockHold | undefined
  if (draft.source === "wishlist") {
    const ev = s.db.events.find((e) => e.slug === draft.eventSlug && e.status === "published")
    const item = ev?.wishlist.find((w) => w.id === draft.wishlistItemId)
    if (!ev || !item) throw new ApiError("unavailable", "This wishlist is no longer accepting gifts.")
    if (!s.db.eventAddresses[ev.id]) throw new ApiError("unavailable", "The host hasn't added a delivery address yet, so this item can't be bought right now.")
    ownHold = s.db.holds.find((h) => h.id === draft.holdId && h.status === "active" && new Date(h.expiresAt) > now)
    if (!ownHold) {
      // The original hold lapsed: try to re-acquire atomically before taking payment.
      if (wishlistRemaining(item, s.db.holds, now) < draft.lines[0].quantity) {
        throw new ApiError("conflict", "Someone else is buying the last one right now. Try again in a few minutes, or choose another gift.")
      }
      ownHold = makeHold(s, item.variantId, draft.lines[0].quantity, item.id)
    }
    // The recipient of a wishlist gift is always the host; guests never see or supply host contact details.
    const host = s.db.users.find((u) => u.id === ev.hostUserId)
    draft = {
      ...draft,
      zoneId: ev.deliveryZoneId!,
      addressKnown: true,
      address: s.db.eventAddresses[ev.id],
      purchaseType: "gift",
      recipient: { name: ev.published?.content.hostDisplayName ?? ev.draft.hostDisplayName, email: host?.email },
      gift: draft.gift
        ? { ...draft.gift, revealAt: ev.surpriseMode && ev.surpriseRevealDate ? `${ev.surpriseRevealDate}T08:00:00.000Z` : draft.gift.revealAt }
        : { senderDisplayName: draft.buyer.name.split(" ")[0], anonymous: false, message: "", revealStyle: "wrapped_box", revealAt: null, timezone: s.db.settings.timezone },
    }
  }
  try {
    validateDraft(draft)
  } catch (e) {
    if (ownHold && !draft.holdId) ownHold.status = "released"
    throw e
  }

  const preview = buildPreview(s, draft, ownHold?.id)
  if (!preview.ok || !preview.pricing || !preview.delivery?.feasible) {
    throw new ApiError("validation", preview.issues[0]?.message ?? "This checkout can't be completed.", preview.issues)
  }

  // Hold every line for the payment window so marketplace and storefront buyers can't both take the last unit (AC 19).
  const holds: StockHold[] = ownHold ? [ownHold] : []
  if (!ownHold) {
    for (const l of draft.lines) holds.push(makeHold(s, l.variantId, l.quantity, null))
  }

  const vendor = s.db.vendors.find((v) => v.id === draft.vendorId)!
  const user = s.user()
  const orderId = uid("ord")
  const reference = orderReference()
  const expiresAt = addMinutes(now, settings.holdMinutes)
  const event = draft.eventSlug ? s.db.events.find((e) => e.slug === draft.eventSlug) : null

  const order: Order = {
    id: orderId,
    reference,
    vendorId: vendor.id,
    buyerUserId: user?.id ?? null,
    buyerName: draft.buyer.name.trim(),
    buyerEmail: draft.buyer.email.trim().toLowerCase(),
    buyerPhone: draft.buyer.phone,
    source: draft.source,
    storefrontId: draft.source === "storefront" ? draft.storefrontId ?? null : null,
    campaign: draft.campaign,
    eventId: event?.id ?? null,
    wishlistItemId: draft.wishlistItemId ?? null,
    purchaseType: draft.purchaseType,
    lines: preview.lines,
    pricing: preview.pricing,
    status: "awaiting_payment",
    paymentStatus: "pending",
    delivery: {
      zoneId: draft.zoneId,
      addressKnown: draft.addressKnown,
      requestedDate: draft.requestedDate!,
      windowKind: "requested",
      windowStart: preview.delivery.windowStart!,
      windowEnd: preview.delivery.windowEnd!,
      responsibleParty: vendor.fulfilment,
      attempts: 0,
    },
    giftId: null,
    acceptBy: null,
    timeline: [],
    createdAt: now.toISOString(),
    paidAt: null,
    updatedAt: now.toISOString(),
    holdId: holds[0]?.id ?? null,
    commissionBps: settings.commissionBps,
  }
  timeline(order, "awaiting_payment", "Order created — waiting for payment", "buyer")
  holds.forEach((h) => (h.orderId = orderId))
  if (draft.address) s.db.orderAddresses[orderId] = draft.address

  if (draft.purchaseType === "gift" && draft.recipient && draft.gift) {
    const previewToken = randomToken()
    const gift: Gift = {
      id: uid("gft"),
      orderId,
      recipientName: draft.recipient.name.trim(),
      recipientEmail: draft.recipient.email?.trim().toLowerCase(),
      recipientPhone: draft.recipient.phone,
      contactMasked: maskContact(draft.recipient.email || draft.recipient.phone || ""),
      senderDisplayName: draft.gift.anonymous ? "" : draft.gift.senderDisplayName.trim() || draft.buyer.name.split(" ")[0],
      anonymous: draft.gift.anonymous,
      message: draft.gift.message.trim(),
      revealStyle: draft.gift.revealStyle,
      revealAt: draft.gift.revealAt ?? now.toISOString(),
      timezone: draft.gift.timezone,
      revealStatus: "draft",
      access: "active",
      claimStatus: draft.addressKnown ? "not_required" : "pending",
      claimDeadline: null,
      tokenHash: "",
      previewTokenHash: await sha256Hex(previewToken),
      notifiedAt: null,
      openedAt: null,
      contactStopped: false,
      reported: false,
      wishlistItemId: draft.wishlistItemId ?? null,
    }
    s.db.gifts.push(gift)
    s.db.previewTokens[gift.id] = previewToken
    order.giftId = gift.id
  }

  s.db.orders.push(order)
  const accessToken = randomToken()
  s.db.orderAccessTokens[accessToken] = orderId
  s.db.payments.push({
    id: uid("pay"),
    orderId,
    reference,
    provider: "demo",
    amount: preview.pricing.total,
    currency: preview.pricing.currency,
    status: "pending",
    authorizationUrl: `/pay/demo/${reference}`,
    createdAt: now.toISOString(),
    verifiedAt: null,
    expiresAt,
  })
  if (order.storefrontId) recordAnalytics(s, order.storefrontId, "checkout_start")
  s.persist()
  return { orderId, reference, paymentUrl: `/pay/demo/${reference}`, orderAccessToken: accessToken, expiresAt }
}

export function makeHold(s: Store, variantId: string, quantity: number, wishlistItemId: string | null): StockHold {
  const now = s.now()
  const variant = s.db.products.flatMap((p) => p.variants).find((v) => v.id === variantId)
  if (!variant || sellableUnits(variant, s.db.holds, now) < quantity) {
    throw new ApiError("conflict", "That item has just sold out. Choose another option or check back later.")
  }
  const hold: StockHold = {
    id: uid("hld"),
    variantId,
    wishlistItemId,
    quantity,
    status: "active",
    expiresAt: addMinutes(now, s.db.settings.holdMinutes),
    orderId: null,
    createdAt: now.toISOString(),
  }
  s.db.holds.push(hold)
  return hold
}

export function recordAnalytics(s: Store, storefrontId: string, kind: "visit" | "product_view" | "checkout_start", productId?: string) {
  const sf = s.db.storefronts.find((x) => x.id === storefrontId)
  const user = s.user()
  // Vendor previews and staff tests are excluded from storefront analytics (STF 12).
  if (!sf || (user && (user.vendorId === sf.vendorId || user.roles.includes("admin") || user.roles.includes("support")))) return
  s.db.analytics.push({ storefrontId, vendorId: sf.vendorId, at: s.nowIso(), kind, productId })
}

// ---------------------------------------------------------------- Payments (webhook equivalents)

/**
 * Mirrors the `paystack-webhook` Edge Function: verifies, deduplicates by event id, and
 * commits stock, wishlist, ledger and gift records exactly once (PAY 04, AC 03, AC 21).
 */
export async function processPaymentSuccess(s: Store, reference: string, eventId: string) {
  if (s.db.processedWebhookIds.includes(eventId)) return
  s.db.processedWebhookIds.push(eventId)
  const payment = s.db.payments.find((p) => p.reference === reference)
  const order = s.db.orders.find((o) => o.reference === reference)
  if (!payment || !order) {
    s.db.reconciliation.unshift({ id: uid("rec"), providerReference: reference, amount: 0, status: "unmatched", orderReference: null, occurredAt: s.nowIso(), note: "Payment with no matching order" })
    return
  }
  if (payment.status === "successful") return
  const now = s.now()
  payment.status = "successful"
  payment.verifiedAt = now.toISOString()
  order.paymentStatus = "successful"
  order.paidAt = now.toISOString()

  // Late payment after the hold lapsed (WIS 04, AC 05): honour only if units remain; never oversell.
  const holds = s.db.holds.filter((h) => h.orderId === order.id)
  const lapsed = holds.some((h) => h.status !== "active" || new Date(h.expiresAt) <= now)
  let conflict = order.status === "payment_expired"
  for (const line of order.lines) {
    const variant = s.db.products.flatMap((p) => p.variants).find((v) => v.id === line.variantId)!
    const own = holds.find((h) => h.variantId === line.variantId)
    const stockExcludingOwn = sellableUnits(variant, s.db.holds, now, own?.id)
    let remaining = stockExcludingOwn
    if (order.wishlistItemId) {
      const item = s.db.events.flatMap((e) => e.wishlist).find((w) => w.id === order.wishlistItemId)
      if (item) remaining = Math.min(remaining, wishlistRemaining(item, s.db.holds, now, own?.id))
    }
    if (lapsed && resolveLatePayment(remaining, stockExcludingOwn, line.quantity) === "conflict") conflict = true
  }

  if (conflict) {
    order.status = "paid"
    order.paymentStatus = "successful"
    timeline(order, "paid", "Payment confirmed", "system", "Paid after the item was reserved by someone else — support will contact you.")
    holds.forEach((h) => (h.status = "released"))
    s.db.ledger = appendIdempotent(s.db.ledger, entriesForPayment(order), s.nowIso(), () => uid("led"))
    s.db.cases.unshift({
      id: uid("case"),
      orderId: order.id,
      vendorId: order.vendorId,
      kind: "general",
      status: "open",
      subject: `Late payment conflict on ${order.reference}`,
      description: "Payment verified after the checkout hold expired and the item is no longer available. Offer a funded alternative with buyer consent or refund in full.",
      openedBy: "support",
      owner: null,
      evidence: [],
      createdAt: s.nowIso(),
      updatedAt: s.nowIso(),
    })
    s.notify({ to: order.buyerEmail, kind: "status", subject: `We've received your payment for ${order.reference}`, body: "Your payment arrived just after the item was reserved by someone else. We haven't oversold it — our support team will offer you an alternative or a full refund within a few hours." })
    s.persist()
    return
  }

  for (const line of order.lines) {
    const variant = s.db.products.flatMap((p) => p.variants).find((v) => v.id === line.variantId)!
    variant.stock -= line.quantity
  }
  holds.forEach((h) => (h.status = "converted"))
  if (order.wishlistItemId) {
    const item = s.db.events.flatMap((e) => e.wishlist).find((w) => w.id === order.wishlistItemId)
    if (item) item.purchasedQty += order.lines[0].quantity
  }
  if (order.status === "payment_expired") order.status = "awaiting_payment"
  transition(s, order, "paid", "system")
  s.db.ledger = appendIdempotent(s.db.ledger, entriesForPayment(order), s.nowIso(), () => uid("led"))

  const vendor = s.db.vendors.find((v) => v.id === order.vendorId)!
  const gift = order.giftId ? s.db.gifts.find((g) => g.id === order.giftId) : null
  if (gift && !order.delivery.addressKnown) {
    transition(s, order, "awaiting_recipient_details", "system")
  } else {
    moveToAcceptance(s, order)
  }

  if (gift) {
    gift.revealStatus = "scheduled"
    if (new Date(gift.revealAt) <= now) await dispatchReveal(s, gift)
    else s.enqueue("reveal_notification", gift.revealAt, `reveal:${gift.id}`, { giftId: gift.id })
  }

  s.notify({
    to: order.buyerEmail,
    kind: "receipt",
    subject: `Payment confirmed — ${order.reference}`,
    body: `We've received ${formatMoney(order.pricing.total)} for ${order.lines[0].title}${order.lines.length > 1 ? " and more" : ""}. ${gift ? `${gift.recipientName}'s reveal is ${new Date(gift.revealAt) <= now ? "on its way to them now" : "scheduled"}.` : ""} ${vendor.name} will confirm your order shortly.`,
    link: { label: "View your order", href: `/account/orders/${order.id}` },
  })
  s.persist()
}

export function moveToAcceptance(s: Store, order: Order) {
  const vendor = s.db.vendors.find((v) => v.id === order.vendorId)!
  transition(s, order, "awaiting_vendor_acceptance", "system")
  order.acceptBy = acceptanceDeadline(vendor, s.now(), s.db.settings.acceptanceHours, s.db.settings.timezone).toISOString()
  s.enqueue("acceptance_timeout", order.acceptBy, `accept:${order.id}`, { orderId: order.id })
  const owner = s.db.users.find((u) => u.vendorId === vendor.id && u.roles.includes("vendor_owner"))
  if (owner) {
    s.notify({ to: owner.email, kind: "vendor_new_order", subject: `New order ${order.reference} — accept by ${new Date(order.acceptBy).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: s.db.settings.timezone })}`, body: `${order.lines.map((l) => `${l.quantity} × ${l.title} (${l.variantName})`).join(", ")} for ${order.delivery.requestedDate}.`, link: { label: "Open order", href: `/vendor/orders/${order.id}` } })
  }
}

export function processPaymentFailure(s: Store, reference: string, eventId: string) {
  if (s.db.processedWebhookIds.includes(eventId)) return
  s.db.processedWebhookIds.push(eventId)
  const payment = s.db.payments.find((p) => p.reference === reference)
  const order = s.db.orders.find((o) => o.reference === reference)
  if (!payment || !order || payment.status !== "pending") return
  payment.status = "failed"
  order.paymentStatus = "failed"
  // A failed attempt releases the hold immediately (WIS 05) and leaves the order retryable until expiry.
  s.db.holds.filter((h) => h.orderId === order.id && h.status === "active").forEach((h) => (h.status = "released"))
  timeline(order, "payment_failed", "Payment didn't go through", "system", "No money was taken. You can try again.")
  s.persist()
}

export function expireStalePayments(s: Store) {
  const now = s.now()
  let changed = false
  for (const p of s.db.payments) {
    if ((p.status === "pending" || p.status === "failed") && new Date(p.expiresAt) <= now) {
      const order = s.db.orders.find((o) => o.id === p.orderId)
      if (p.status === "pending") p.status = "expired"
      if (order && order.status === "awaiting_payment") {
        order.paymentStatus = p.status === "failed" ? "failed" : "expired"
        transition(s, order, "payment_expired", "system")
        s.db.holds.filter((h) => h.orderId === order.id && h.status === "active").forEach((h) => (h.status = "expired"))
        if (order.giftId) {
          const g = s.db.gifts.find((x) => x.id === order.giftId)
          if (g) g.access = "revoked"
        }
      }
      changed = true
    }
  }
  for (const h of s.db.holds) {
    if (h.status === "active" && new Date(h.expiresAt) <= now) {
      h.status = "expired"
      changed = true
    }
  }
  if (changed) s.persist()
}

// ---------------------------------------------------------------- Gift reveal

/** Mints the recipient's link token (only its hash is stored) and sends the reveal (§5 scheduling rules). */
export async function dispatchReveal(s: Store, gift: Gift) {
  const order = s.db.orders.find((o) => o.id === gift.orderId)!
  // Never issue a paid reveal without verified payment (AC 04), and never after cancellation.
  if (order.paymentStatus !== "successful" || ["cancelled", "declined"].includes(order.status) || gift.access !== "active") return
  if (gift.revealStatus === "available" || gift.revealStatus === "opened") return
  const token = randomToken()
  gift.tokenHash = await sha256Hex(token)
  gift.revealStatus = "available"
  gift.notifiedAt = s.nowIso()
  if (gift.claimStatus === "pending") {
    gift.claimDeadline = addHours(s.now(), s.db.settings.claimWindowHours)
    s.enqueue("claim_reminder", addHours(gift.claimDeadline, -24), `claim-reminder:${gift.id}`, { giftId: gift.id })
    s.enqueue("claim_expiry", gift.claimDeadline, `claim-expiry:${gift.id}`, { giftId: gift.id })
  }
  if (gift.contactStopped) return
  const from = gift.anonymous ? "Someone" : gift.senderDisplayName
  s.notify({
    to: gift.recipientEmail ?? gift.recipientPhone ?? "",
    kind: "gift_reveal",
    // Subject and preview never name the item, price or (for anonymous gifts) the sender (GFT 06, AC 07).
    subject: `${from} sent you something`,
    body: gift.claimStatus === "pending"
      ? `Open your gift and tell us where to deliver it. The link is private to you — please don't forward it.`
      : `Open your gift whenever you're ready. The link is private to you — please don't forward it.`,
    link: { label: "Open your gift", href: `/g/${token}` },
  })
}

// ---------------------------------------------------------------- Refunds & cancellations

export function createRefund(s: Store, order: Order, reason: RefundReason, opts: { amount?: number; includesFees?: boolean; requestedBy: Refund["requestedBy"]; autoApprove?: boolean; note?: string }) {
  const existing = s.db.refunds.find((r) => r.orderId === order.id && r.reason === reason && r.status !== "rejected" && r.status !== "failed")
  if (existing) return existing
  const refund: Refund = {
    id: uid("ref"),
    orderId: order.id,
    amount: opts.amount ?? order.pricing.total,
    currency: order.pricing.currency,
    reason,
    includesFees: opts.includesFees ?? true,
    status: "requested",
    requestedBy: opts.requestedBy,
    createdAt: s.nowIso(),
    updatedAt: s.nowIso(),
    note: opts.note,
  }
  s.db.refunds.unshift(refund)
  if (opts.autoApprove) {
    refund.status = "approved"
    refund.status = "submitted"
    refund.providerReference = `RF-${refund.id.slice(-6).toUpperCase()}`
    completeRefund(s, refund)
  }
  return refund
}

export function completeRefund(s: Store, refund: Refund) {
  const order = s.db.orders.find((o) => o.id === refund.orderId)!
  refund.status = "completed"
  refund.updatedAt = s.nowIso()
  s.db.ledger = appendIdempotent(s.db.ledger, entriesForRefund(order, refund), s.nowIso(), () => uid("led"))
  s.notify({ to: order.buyerEmail, kind: "refund", subject: `Refund completed for ${order.reference}`, body: `${formatMoney(refund.amount)} has been returned to your original payment method. Banks usually show it within 3–10 working days.` })
}

/** Cancels before dispatch: releases stock, restores wishlist quantity if still wanted, refunds once (AC 13). */
export function cancelWithRefund(s: Store, order: Order, reason: RefundReason, actor: TimelineEntry["actor"], note: string, status: "cancelled" | "declined" = "cancelled") {
  if (["cancelled", "declined"].includes(order.status)) return
  const wasPaid = order.paymentStatus === "successful"
  transition(s, order, status, actor, note)
  order.cancellationReason = note
  if (wasPaid) {
    for (const line of order.lines) {
      const variant = s.db.products.flatMap((p) => p.variants).find((v) => v.id === line.variantId)
      if (variant) variant.stock += line.quantity
    }
    if (order.wishlistItemId) {
      const item = s.db.events.flatMap((e) => e.wishlist).find((w) => w.id === order.wishlistItemId)
      if (item && item.status === "active") item.purchasedQty = Math.max(0, item.purchasedQty - order.lines[0].quantity)
    }
    createRefund(s, order, reason, { requestedBy: actor === "support" ? "support" : "system", autoApprove: true, includesFees: true })
  }
  s.db.jobs.filter((j) => j.status === "queued" && Object.values(j.payload).includes(order.id)).forEach((j) => (j.status = "done"))
  const gift = order.giftId ? s.db.gifts.find((g) => g.id === order.giftId) : null
  if (gift) {
    const revealed = gift.revealStatus === "available" || gift.revealStatus === "opened"
    s.db.jobs.filter((j) => j.status === "queued" && j.payload.giftId === gift.id).forEach((j) => (j.status = "done"))
    if (!revealed) {
      // Suppress the celebratory message entirely if the reveal hasn't gone out (§5).
      gift.access = "revoked"
    } else if (!gift.contactStopped && gift.recipientEmail) {
      s.notify({ to: gift.recipientEmail, kind: "status", subject: "An update about your gift", body: `Unfortunately the gift ${gift.anonymous ? "sent to you" : `from ${gift.senderDisplayName}`} can't be delivered. ${gift.anonymous ? "The sender" : gift.senderDisplayName} has been refunded and let know. There's nothing you need to do.` })
    }
  }
  s.notify({ to: order.buyerEmail, kind: "status", subject: `Order ${order.reference} cancelled`, body: `${note} ${wasPaid ? "A full refund has been issued." : ""}` })
}

// ---------------------------------------------------------------- Jobs

export async function runDueJobs(s: Store): Promise<number> {
  expireStalePayments(s)
  const now = s.now()
  let processed = 0
  for (const job of s.db.jobs) {
    if (job.status !== "queued" || new Date(job.runAt) > now) continue
    job.status = "running"
    job.attempts += 1
    try {
      await runJob(s, job.kind, job.payload)
      job.status = "done"
      processed++
    } catch (e) {
      job.status = job.attempts >= 5 ? "failed" : "queued"
      job.lastError = e instanceof Error ? e.message : String(e)
      job.runAt = addMinutes(now, 2 ** job.attempts)
    }
  }
  if (processed) s.persist()
  return processed
}

async function runJob(s: Store, kind: string, payload: Record<string, string>) {
  switch (kind) {
    case "reveal_notification": {
      const gift = s.db.gifts.find((g) => g.id === payload.giftId)
      if (gift) await dispatchReveal(s, gift)
      return
    }
    case "claim_reminder": {
      const gift = s.db.gifts.find((g) => g.id === payload.giftId)
      if (gift?.claimStatus === "pending" && !gift.contactStopped && gift.recipientEmail) {
        s.notify({ to: gift.recipientEmail, kind: "claim_reminder", subject: "Your gift is waiting for an address", body: "You have about a day left to tell us where to deliver your gift. Use the link in your original message." })
      }
      return
    }
    case "claim_expiry": {
      const gift = s.db.gifts.find((g) => g.id === payload.giftId)
      const order = gift && s.db.orders.find((o) => o.id === gift.orderId)
      if (gift && order && (gift.claimStatus === "pending" || gift.claimStatus === "needs_sender_approval")) {
        gift.claimStatus = "expired"
        gift.access = "expired"
        cancelWithRefund(s, order, "claim_expired", "system", "The recipient didn't add a delivery address within the claim window.")
      }
      return
    }
    case "acceptance_timeout": {
      const order = s.db.orders.find((o) => o.id === payload.orderId)
      if (order?.status === "awaiting_vendor_acceptance") {
        cancelWithRefund(s, order, "vendor_declined", "system", "The vendor didn't confirm the order in time.", "declined")
      }
      return
    }
    default:
      return
  }
}

export const zoneName = (id: string) => zoneById(id)?.name ?? id

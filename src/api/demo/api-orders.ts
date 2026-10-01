import type { Gift, Order } from "@domain/index.ts"
import {
  CLAIM_TRANSITIONS,
  canTransition,
  formatMoney,
  ORDER_STATUS_LABEL,
  sha256Hex,
  uid,
  zoneById,
  addHours,
  randomToken,
  maskContact,
} from "@domain/index.ts"
import type { Api, GiftRevealView, OrderDetail, OrderGiftView } from "../types"
import { ApiError } from "../errors"
import { clone, latency, type Store } from "./store"
import { orderSummary } from "./views"
import { buildPreview, cancelWithRefund, createCheckout, createRefund, moveToAcceptance, processPaymentFailure, processPaymentSuccess, runDueJobs, timeline, transition } from "./commerce"
import { consumeOtp, issueOtp } from "./api-catalog"

const GUEST_ACCESS_KEY = "jg-order-access"

/** Guest order access tokens live in sessionStorage only (never a guessable reference alone). */
export function rememberOrderAccess(token: string) {
  try {
    const list = JSON.parse(sessionStorage.getItem(GUEST_ACCESS_KEY) ?? "[]") as string[]
    sessionStorage.setItem(GUEST_ACCESS_KEY, JSON.stringify([...new Set([...list, token])]))
  } catch {
    /* session storage unavailable */
  }
}

function sessionAccessTokens(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(GUEST_ACCESS_KEY) ?? "[]") as string[]
  } catch {
    return []
  }
}

function canViewOrder(s: Store, o: Order) {
  const u = s.user()
  if (u && (o.buyerUserId === u.id || o.buyerEmail === u.email)) return true
  if (s.db.guestAccessEmails.includes(o.buyerEmail)) return true
  return sessionAccessTokens().some((t) => s.db.orderAccessTokens[t] === o.id)
}

function requireOrder(s: Store, id: string) {
  const o = s.db.orders.find((x) => x.id === id)
  if (!o || !canViewOrder(s, o)) throw new ApiError("not_found", "We couldn't find that order. Sign in with the email you used at checkout.")
  return o
}

export function giftView(s: Store, gift: Gift, order: Order): OrderGiftView {
  return {
    id: gift.id,
    recipientName: gift.recipientName,
    contactMasked: gift.contactMasked,
    senderDisplayName: gift.senderDisplayName,
    anonymous: gift.anonymous,
    message: gift.message,
    revealStyle: gift.revealStyle,
    revealAt: gift.revealAt,
    timezone: gift.timezone,
    revealStatus: gift.revealStatus,
    claimStatus: gift.claimStatus,
    claimDeadline: gift.claimDeadline,
    openedAt: gift.openedAt,
    thankYouNote: gift.thankYouNote,
    // GFT 05: message and schedule are editable until the reveal is dispatched.
    editable: (gift.revealStatus === "draft" || gift.revealStatus === "scheduled") && !["cancelled", "declined"].includes(order.status),
    previewToken: s.db.previewTokens[gift.id] ?? null,
  }
}

export function orderDetail(s: Store, o: Order, opts: { revealAddress: boolean }): OrderDetail {
  const vendor = s.db.vendors.find((v) => v.id === o.vendorId)!
  const gift = o.giftId ? s.db.gifts.find((g) => g.id === o.giftId) ?? null : null
  const addr = s.db.orderAddresses[o.id]
  const event = o.eventId ? s.db.events.find((e) => e.id === o.eventId) : null
  const isWishlist = o.source === "wishlist"
  return {
    order: o,
    vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, logoInitials: vendor.logoInitials, logoColor: vendor.logoColor, returnPolicy: vendor.returnPolicy, deliveryPolicy: vendor.deliveryPolicy, fulfilment: vendor.fulfilment },
    gift: gift ? giftView(s, gift, o) : null,
    refunds: s.db.refunds.filter((r) => r.orderId === o.id),
    cases: s.db.cases.filter((c) => c.orderId === o.id),
    // A wishlist buyer never sees the host's address (WIS 02); they see the delivery area only.
    addressSummary: addr && opts.revealAddress && !isWishlist ? `${addr.recipientName}, ${addr.line1}, ${addr.area}, ${addr.city}` : addr ? `${zoneById(addr.zoneId)?.name} delivery area` : null,
    eventTitle: event?.published?.content.title ?? event?.draft.title ?? null,
    canCancel: ["paid", "awaiting_recipient_details", "awaiting_vendor_acceptance"].includes(o.status),
    canRequestRefund: o.status === "delivered" && !s.db.refunds.some((r) => r.orderId === o.id && r.status !== "rejected"),
  }
}

async function findGiftByToken(s: Store, token: string) {
  if (!token || token.length < 20) return null
  const hash = await sha256Hex(token)
  return s.db.gifts.find((g) => g.tokenHash === hash) ?? null
}

function requireGiftSession(s: Store, gift: Gift, session: string) {
  const rec = s.db.giftSessions[session]
  if (!rec || rec.giftId !== gift.id || new Date(rec.expiresAt) < s.now()) throw new ApiError("unauthorised", "Please confirm it's you first. We'll send a code to the contact the sender used.")
}

function revealView(s: Store, gift: Gift, order: Order, preview: boolean): GiftRevealView {
  const line = order.lines[0]
  const product = s.db.products.find((p) => p.id === line.productId)
  const vendor = s.db.vendors.find((v) => v.id === order.vendorId)!
  const zone = zoneById(order.delivery.zoneId)!
  const event = order.eventId ? s.db.events.find((e) => e.id === order.eventId) : null
  const dispatched = ["dispatched", "delivered", "delivery_issue"].includes(order.status)
  return {
    giftId: gift.id,
    preview,
    recipientName: preview ? gift.recipientName || "Your recipient" : gift.recipientName,
    senderDisplayName: gift.anonymous ? null : gift.senderDisplayName,
    anonymous: gift.anonymous,
    message: gift.message,
    revealStyle: gift.revealStyle,
    revealStatus: preview ? "available" : gift.revealStatus,
    openedAt: preview ? null : gift.openedAt,
    item: {
      title: line.title,
      variantName: line.variantName,
      image: line.image,
      images: product?.images ?? [line.image],
      vendorName: vendor.name,
      summary: product?.summary ?? "",
      quantity: line.quantity,
      personalisationText: line.personalisationText,
    },
    claim: { status: gift.claimStatus, deadline: gift.claimDeadline, zoneId: zone.id, zoneName: zone.name, areas: zone.areas },
    fulfilment: {
      status: order.status,
      // GFT 09: "on its way" only after verified dispatch.
      label: dispatched ? (order.status === "delivered" ? "Delivered" : "Your gift is on its way") : order.status === "cancelled" || order.status === "declined" ? "This gift couldn't be delivered" : "Being prepared",
      dispatched,
      delivered: order.status === "delivered",
      window: dispatched || order.delivery.windowKind === "confirmed" ? { start: order.delivery.windowStart, end: order.delivery.windowEnd, kind: order.delivery.windowKind } : null,
    },
    occasionTitle: event?.published?.content.title ?? null,
    thankYouNote: preview ? undefined : gift.thankYouNote,
  }
}

export function ordersApi(s: Store): Pick<Api,
  | "previewCheckout" | "createCheckout" | "getPaymentStatus" | "simulatePayment"
  | "requestOrderAccess" | "verifyOrderAccess" | "listMyOrders" | "getOrder" | "updateGift" | "respondToRevisedQuote" | "cancelOrder" | "requestRefund" | "openCase"
  | "getGiftEntry" | "sendGiftCode" | "verifyGiftCode" | "getGiftReveal" | "getGiftPreview" | "markGiftOpened" | "submitGiftAddress" | "declineGift" | "sendThankYou" | "reportGift"
> {
  return {
    async previewCheckout(draft) {
      await latency(160)
      if (draft.source === "wishlist") {
        const ev = s.db.events.find((e) => e.slug === draft.eventSlug)
        if (ev?.deliveryZoneId) draft = { ...draft, zoneId: ev.deliveryZoneId, addressKnown: true }
      }
      return clone(buildPreview(s, draft, draft.holdId))
    },

    async createCheckout(draft) {
      await latency(400)
      const session = await createCheckout(s, draft)
      rememberOrderAccess(session.orderAccessToken)
      return session
    },

    async getPaymentStatus(reference) {
      await latency(250)
      await runDueJobs(s)
      const p = s.db.payments.find((x) => x.reference === reference)
      const o = p && s.db.orders.find((x) => x.id === p.orderId)
      if (!p || !o) throw new ApiError("not_found", "We couldn't find that payment.")
      return { reference, orderId: o.id, status: p.status, orderStatus: o.status, amount: p.amount }
    },

    async simulatePayment(reference, outcome) {
      await latency(700)
      // Each simulated provider event has its own id; the processor ignores replays (AC 03).
      if (outcome === "success") {
        const eventId = `demo_evt_${reference}`
        await processPaymentSuccess(s, reference, eventId)
        await processPaymentSuccess(s, reference, eventId) // replayed webhook: no duplicate order, stock or gift
      } else if (outcome === "failure") {
        processPaymentFailure(s, reference, `demo_fail_${reference}_${Date.now()}`)
      }
      s.persist()
    },

    async requestOrderAccess(email) {
      await latency()
      const normalised = email.trim().toLowerCase()
      const code = issueOtp(s, `orders:${normalised}`)
      // Same response whether or not orders exist for this address (no enumeration).
      s.notify({ to: normalised, kind: "otp", subject: "Your order access code", body: `Use ${code} to view your JustGifter orders. It expires in 10 minutes.` })
      s.persist()
      return { devCode: code }
    },

    async verifyOrderAccess(email, code) {
      await latency()
      const normalised = email.trim().toLowerCase()
      consumeOtp(s, `orders:${normalised}`, code)
      if (!s.db.guestAccessEmails.includes(normalised)) s.db.guestAccessEmails.push(normalised)
      s.persist()
    },

    async listMyOrders() {
      await latency(150)
      await runDueJobs(s)
      return clone(
        s.db.orders
          .filter((o) => canViewOrder(s, o) && o.status !== "payment_expired")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((o) => orderSummary(s, o)),
      )
    },

    async getOrder(id) {
      await latency(150)
      await runDueJobs(s)
      const o = requireOrder(s, id)
      return clone(orderDetail(s, o, { revealAddress: true }))
    },

    async updateGift(orderId, patch) {
      await latency()
      const o = requireOrder(s, orderId)
      const gift = s.db.gifts.find((g) => g.id === o.giftId)
      if (!gift) throw new ApiError("not_found", "This order isn't a gift.")
      if (!(gift.revealStatus === "draft" || gift.revealStatus === "scheduled")) throw new ApiError("conflict", "The reveal has already been sent, so the message can't be changed.")
      if (patch.message !== undefined) {
        if (patch.message.length > 300) throw new ApiError("validation", "Keep the message under 300 characters.")
        gift.message = patch.message.trim()
      }
      if (patch.senderDisplayName !== undefined && !gift.anonymous) gift.senderDisplayName = patch.senderDisplayName.trim()
      if (patch.revealAt !== undefined) {
        const at = patch.revealAt ?? s.nowIso()
        gift.revealAt = at
        const job = s.db.jobs.find((j) => j.idempotencyKey === `reveal:${gift.id}`)
        if (job && job.status === "queued") job.runAt = at
        else if (!job && gift.revealStatus === "scheduled") s.enqueue("reveal_notification", at, `reveal:${gift.id}`, { giftId: gift.id })
      }
      timeline(o, "gift_updated", "Gift message or schedule updated", "buyer")
      await runDueJobs(s)
      s.persist()
    },

    async respondToRevisedQuote(orderId, approve) {
      await latency(500)
      const o = requireOrder(s, orderId)
      const gift = s.db.gifts.find((g) => g.id === o.giftId)
      const revised = s.db.revisedQuotes[orderId]
      if (!gift || gift.claimStatus !== "needs_sender_approval" || !revised) throw new ApiError("conflict", "There's nothing to approve on this order.")
      if (!approve || revised.fee === null) {
        gift.claimStatus = "declined"
        cancelWithRefund(s, o, "other", "buyer", "Cancelled because the recipient's address is outside the delivery area.")
      } else {
        const extra = Math.max(0, revised.fee - o.pricing.delivery)
        // In production this opens a second hosted payment for the difference; the demo approves it directly.
        o.pricing = { ...o.pricing, delivery: revised.fee, total: o.pricing.total + extra, deliveryProvisional: false }
        o.delivery.zoneId = revised.zoneId
        s.db.orderAddresses[o.id] = revised.address
        if (extra > 0) s.db.ledger.push({ id: uid("led"), orderId: o.id, vendorId: o.vendorId, type: "adjustment", amount: extra, currency: "NGN", idempotencyKey: `revised:${o.id}`, createdAt: s.nowIso(), memo: "Additional delivery charge approved by sender" })
        gift.claimStatus = "submitted"
        timeline(o, "revised_quote_approved", `Revised delivery approved${extra ? ` (+${formatMoney(extra)})` : ""}`, "buyer")
        moveToAcceptance(s, o)
      }
      delete s.db.revisedQuotes[orderId]
      s.persist()
    },

    async cancelOrder(orderId, reason) {
      await latency(400)
      const o = requireOrder(s, orderId)
      if (!["paid", "awaiting_recipient_details", "awaiting_vendor_acceptance"].includes(o.status)) {
        throw new ApiError("conflict", "The vendor has already started on this order. Open a support case and we'll help.")
      }
      cancelWithRefund(s, o, "pre_acceptance_cancellation", "buyer", reason || "Cancelled by the buyer before the vendor accepted.")
      s.persist()
    },

    async requestRefund(orderId, reason, note) {
      await latency(300)
      const o = requireOrder(s, orderId)
      createRefund(s, o, reason, { requestedBy: "buyer", amount: o.pricing.items, includesFees: false, note })
      s.persist()
    },

    async openCase({ orderId, kind, description }) {
      await latency(300)
      const o = requireOrder(s, orderId)
      const c = {
        id: uid("case"), orderId: o.id, vendorId: o.vendorId, kind, status: "open" as const, subject: `${kind.replace(/_/g, " ")} — ${o.reference}`,
        description, openedBy: "buyer" as const, owner: null, evidence: [], createdAt: s.nowIso(), updatedAt: s.nowIso(),
      }
      s.db.cases.unshift(c)
      s.notify({ to: o.buyerEmail, kind: "status", subject: `We've opened case ${c.id.slice(-6).toUpperCase()}`, body: "Our support team will reply within one working day." })
      s.persist()
      return clone(c)
    },

    // ---------------------------------------------------------------- Recipient

    async getGiftEntry(token) {
      await latency(150)
      await runDueJobs(s)
      const gift = await findGiftByToken(s, token)
      if (!gift) return { state: "not_found", recipientFirstName: null, contactMasked: null, verificationRequired: false, revealAt: null, revealStyle: "wrapped_box" }
      const state = gift.access === "revoked" ? "revoked" : gift.access === "expired" ? "expired" : gift.claimStatus === "declined" ? "declined" : gift.revealStatus === "scheduled" ? "scheduled" : "ready"
      return {
        state,
        recipientFirstName: gift.recipientName.split(" ")[0],
        contactMasked: gift.contactMasked,
        verificationRequired: gift.claimStatus === "pending" || gift.claimStatus === "needs_sender_approval",
        revealAt: gift.revealAt,
        revealStyle: gift.revealStyle,
      }
    },

    async sendGiftCode(token) {
      await latency()
      const gift = await findGiftByToken(s, token)
      if (!gift) throw new ApiError("not_found", "This gift link isn't valid.")
      const code = issueOtp(s, `gift:${gift.id}`)
      s.notify({ to: gift.recipientEmail ?? gift.recipientPhone ?? "", kind: "otp", subject: "Your gift verification code", body: `Your code is ${code}.` })
      s.persist()
      return { devCode: code }
    },

    async verifyGiftCode(token, code) {
      await latency()
      const gift = await findGiftByToken(s, token)
      if (!gift) throw new ApiError("not_found", "This gift link isn't valid.")
      consumeOtp(s, `gift:${gift.id}`, code)
      const session = randomToken()
      const expiresAt = addHours(s.now(), 2)
      s.db.giftSessions[session] = { giftId: gift.id, expiresAt }
      s.persist()
      return { token: session, expiresAt }
    },

    async getGiftReveal(token) {
      await latency(200)
      const gift = await findGiftByToken(s, token)
      if (!gift || gift.access !== "active") throw new ApiError("not_found", "This gift link is no longer active.")
      if (gift.revealStatus === "scheduled" || gift.revealStatus === "draft") throw new ApiError("unavailable", "This gift isn't ready to open yet.")
      const order = s.db.orders.find((o) => o.id === gift.orderId)!
      return clone(revealView(s, gift, order, false))
    },

    async getGiftPreview(previewToken) {
      await latency(200)
      // MOT 06: preview tokens are separate from live links and never count as a reveal or claim.
      const hash = await sha256Hex(previewToken)
      const gift = s.db.gifts.find((g) => g.previewTokenHash === hash)
      if (!gift) throw new ApiError("not_found", "This preview link isn't valid.")
      const order = s.db.orders.find((o) => o.id === gift.orderId)!
      return clone(revealView(s, gift, order, true))
    },

    async markGiftOpened(token) {
      const gift = await findGiftByToken(s, token)
      if (!gift || gift.access !== "active") return
      if (gift.revealStatus === "available") {
        gift.revealStatus = "opened"
        gift.openedAt = s.nowIso()
        const order = s.db.orders.find((o) => o.id === gift.orderId)!
        timeline(order, "gift_opened", "Gift opened", "recipient")
        s.persist()
      }
    },

    async submitGiftAddress(token, session, address) {
      await latency(500)
      const gift = await findGiftByToken(s, token)
      if (!gift) throw new ApiError("not_found", "This gift link isn't valid.")
      requireGiftSession(s, gift, session)
      if (!canTransition(CLAIM_TRANSITIONS, gift.claimStatus, "submitted")) throw new ApiError("conflict", "This gift no longer needs an address.")
      for (const [field, label] of [["recipientName", "your name"], ["phone", "a phone number for the rider"], ["line1", "your street address"], ["area", "your area"]] as const) {
        if (!address[field]?.trim()) throw new ApiError("validation", `Add ${label}.`)
      }
      const order = s.db.orders.find((o) => o.id === gift.orderId)!
      const vendor = s.db.vendors.find((v) => v.id === order.vendorId)!
      if (address.zoneId !== order.delivery.zoneId) {
        // §3: never charge the recipient or silently change the gift; the sender decides.
        const serves = vendor.zones.find((z) => z.zoneId === address.zoneId)
        s.db.revisedQuotes[order.id] = { zoneId: address.zoneId, fee: serves ? serves.fee : null, address }
        gift.claimStatus = "needs_sender_approval"
        timeline(order, "revised_quote", "Recipient's address is outside the quoted area", "recipient")
        s.notify({ to: order.buyerEmail, kind: "status", subject: `Action needed for ${order.reference}`, body: serves ? `${gift.recipientName}'s address is in ${zoneById(address.zoneId)?.name}, which costs ${formatMoney(serves.fee)} to deliver instead of ${formatMoney(order.pricing.delivery)}. Approve the difference or cancel for a full refund.` : `${vendor.name} can't deliver to ${zoneById(address.zoneId)?.name}. You can cancel for a full refund.`, link: { label: "Review", href: `/account/orders/${order.id}` } })
        s.persist()
        return { status: "needs_sender_approval", message: `Thanks! That address is outside the area the sender chose. We've asked them to confirm — you won't be charged anything.` }
      }
      s.db.orderAddresses[order.id] = address
      gift.claimStatus = "submitted"
      timeline(order, "address_received", "Recipient added a delivery address", "recipient")
      s.db.jobs.filter((j) => j.payload.giftId === gift.id && (j.kind === "claim_expiry" || j.kind === "claim_reminder")).forEach((j) => (j.status = "done"))
      moveToAcceptance(s, order)
      s.persist()
      return { status: "submitted", message: "Address received. Only the vendor delivering your gift can see it." }
    },

    async declineGift(token, session, reason) {
      await latency(400)
      const gift = await findGiftByToken(s, token)
      if (!gift) throw new ApiError("not_found", "This gift link isn't valid.")
      requireGiftSession(s, gift, session)
      const order = s.db.orders.find((o) => o.id === gift.orderId)!
      if (!["paid", "awaiting_recipient_details", "awaiting_vendor_acceptance"].includes(order.status)) {
        throw new ApiError("conflict", "This gift is already being prepared, so it can't be declined here. Contact support and we'll help.")
      }
      gift.claimStatus = canTransition(CLAIM_TRANSITIONS, gift.claimStatus, "declined") ? "declined" : gift.claimStatus
      gift.declinedAt = s.nowIso()
      cancelWithRefund(s, order, "recipient_declined", "recipient", reason ? `The recipient declined the gift: “${reason}”` : "The recipient declined the gift.")
      s.persist()
    },

    async sendThankYou(token, _session, note) {
      await latency(300)
      const gift = await findGiftByToken(s, token)
      if (!gift) throw new ApiError("not_found", "This gift link isn't valid.")
      if (note.trim().length < 2) throw new ApiError("validation", "Write a short note first.")
      gift.thankYouNote = note.trim().slice(0, 500)
      gift.thankYouAt = s.nowIso()
      const order = s.db.orders.find((o) => o.id === gift.orderId)!
      // The thank-you goes to the buyer privately — never published (§13 UX writing rules).
      s.notify({ to: order.buyerEmail, kind: "status", subject: `${gift.recipientName.split(" ")[0]} sent you a thank-you note`, body: gift.thankYouNote, link: { label: "View order", href: `/account/orders/${order.id}` } })
      s.persist()
    },

    async reportGift(token, _session, { kind, details, stopContact }) {
      await latency(300)
      const gift = await findGiftByToken(s, token)
      if (!gift) throw new ApiError("not_found", "This gift link isn't valid.")
      s.db.reports.unshift({ id: uid("rpt"), kind, targetType: "gift", targetId: gift.id, details, status: "open", createdAt: s.nowIso() })
      gift.reported = true
      if (stopContact) {
        gift.contactStopped = true
        const contact = (gift.recipientEmail ?? gift.recipientPhone ?? "").toLowerCase()
        if (contact && !s.db.blockedContacts.includes(contact)) s.db.blockedContacts.push(contact)
      }
      s.audit("recipient", "gift.reported", "gift", gift.id, `${kind}${stopContact ? " + stop contact" : ""} (${maskContact(gift.recipientEmail ?? "")})`)
      s.persist()
    },
  }
}

export const orderStatusLabel = (o: Order) => ORDER_STATUS_LABEL[o.status]
export { transition }

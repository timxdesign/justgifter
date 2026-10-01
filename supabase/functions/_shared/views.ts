// deno-lint-ignore-file no-explicit-any
import type { Gift, OccasionEvent, Order, Product, StockHold, Vendor, ZoneId, PlatformSettings } from "./domain/index.ts"
import { canSendWithoutAddress, earliestDelivery, highestPrice, lowestPrice, sellableUnits, settlementFor, wishAvailability, zoneById, maskContact } from "./domain/index.ts"
import { db, must } from "./db.ts"

/** Response builders. Shapes match src/api/types.ts exactly — the web client is typed against them. */

export function vendorPublic(v: Vendor, sf: any | null, productCount: number) {
  return {
    id: v.id, slug: v.slug, name: v.name, tagline: v.tagline, about: v.about, logoInitials: v.logoInitials, logoColor: v.logoColor, coverImage: v.coverImage, verified: v.verified,
    status: v.status, zones: v.zones, operating: v.operating, fulfilment: v.fulfilment, categories: v.categories, city: v.city, responseHours: v.responseHours,
    returnPolicy: v.returnPolicy, deliveryPolicy: v.deliveryPolicy, featured: v.featured, storefrontSlug: sf?.slug ?? null, storefrontStatus: sf?.status ?? null, productCount,
  }
}

export function productCard(p: Product, v: Vendor, holds: StockHold[], s: PlatformSettings, zoneId?: ZoneId) {
  const now = new Date()
  const total = p.variants.reduce((n, variant) => n + sellableUnits(variant, holds, now), 0)
  const zone = zoneId ?? v.zones[0]?.zoneId
  const slot = zone && v.zones.some((z) => z.zoneId === zone) ? earliestDelivery({ now, timezone: s.timezone, vendor: v, zoneId: zone, prepHours: p.prepHours, maxAdvanceDays: s.maxAdvanceDays }) : null
  return {
    id: p.id, slug: p.slug, title: p.title, summary: p.summary, images: p.images, category: p.category, occasions: p.occasions,
    vendor: { id: v.id, name: v.name, slug: v.slug, verified: v.verified }, priceFrom: lowestPrice(p), priceTo: highestPrice(p), inStock: total > 0,
    lowStock: total > 0 && total <= 3 ? total : null, sponsored: p.sponsored, perishable: p.perishable, personalisable: Boolean(p.personalisation),
    canSendWithoutAddress: canSendWithoutAddress(p), earliest: slot && zone ? { date: slot.date, sameDay: slot.sameDay, zoneId: zone } : null,
  }
}

export function wishlistViews(ev: OccasionEvent, prods: Product[], vendors: Map<string, Vendor>, holds: StockHold[], s: PlatformSettings) {
  const now = new Date()
  const rank = (p: string) => (p === "must" ? 0 : p === "love" ? 1 : 2)
  return ev.wishlist.filter((w) => w.status !== "removed").flatMap((w) => {
    const product = prods.find((p) => p.id === w.productId)
    if (!product) return []
    const vendor = vendors.get(product.vendorId)!
    const variant = product.variants.find((v) => v.id === w.variantId)
    const purchasable = product.status === "active" && vendor.status === "approved"
    return [{
      item: { id: w.id, desiredQty: w.desiredQty, purchasedQty: w.purchasedQty, priority: w.priority, note: w.note, status: w.status, variantId: w.variantId, productId: w.productId, alternativeProductIds: w.alternativeProductIds },
      product: productCard(product, vendor, holds, s, ev.deliveryZoneId ?? undefined), variantName: variant?.name ?? "Unavailable option", price: variant?.price ?? 0,
      availability: wishAvailability(w, variant, purchasable, holds, now),
    }]
  }).sort((a, b) => rank(a.item.priority) - rank(b.item.priority))
}

export function orderSummary(o: Order, vendorName: string, gift: Gift | null) {
  return {
    id: o.id, reference: o.reference, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, purchaseType: o.purchaseType, source: o.source,
    total: o.pricing.total, vendorName, title: o.lines[0]?.title + (o.lines.length > 1 ? ` + ${o.lines.length - 1} more` : ""), image: o.lines[0]?.image ?? "",
    itemCount: o.lines.reduce((n, l) => n + l.quantity, 0), recipientName: gift?.recipientName ?? null, revealStatus: gift?.revealStatus ?? null, requestedDate: o.delivery.requestedDate,
  }
}

export function giftView(g: Gift, o: Order, previewToken: string | null) {
  return {
    id: g.id, recipientName: g.recipientName, contactMasked: g.contactMasked, senderDisplayName: g.senderDisplayName, anonymous: g.anonymous, message: g.message,
    revealStyle: g.revealStyle, revealAt: g.revealAt, timezone: g.timezone, revealStatus: g.revealStatus, claimStatus: g.claimStatus, claimDeadline: g.claimDeadline,
    openedAt: g.openedAt, thankYouNote: g.thankYouNote, editable: (g.revealStatus === "draft" || g.revealStatus === "scheduled") && !["cancelled", "declined"].includes(o.status), previewToken,
  }
}

export async function orderDetail(o: Order, opts: { revealAddress: boolean; includePreview: boolean }) {
  const [vendorRow, giftRow, refunds, cases, addr, ev] = await Promise.all([
    db().from("vendors").select("*").eq("id", o.vendorId).single(),
    o.giftId ? db().from("gifts").select("*").eq("id", o.giftId).maybeSingle() : Promise.resolve({ data: null }),
    db().from("refunds").select("*").eq("order_id", o.id),
    db().from("support_cases").select("*").eq("order_id", o.id),
    db().from("order_addresses").select("address").eq("order_id", o.id).maybeSingle(),
    o.eventId ? db().from("events").select("draft, published").eq("id", o.eventId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const v = vendorRow.data as any
  const { toGift } = await import("./repo.ts")
  const g = giftRow.data ? toGift(giftRow.data) : null
  const a = (addr.data as any)?.address
  return {
    order: o,
    vendor: { id: v.id, name: v.name, slug: v.slug, logoInitials: v.logo_initials, logoColor: v.logo_color, returnPolicy: v.return_policy, deliveryPolicy: v.delivery_policy, fulfilment: v.fulfilment },
    gift: g ? giftView(g, o, opts.includePreview ? (giftRow.data as any).preview_token : null) : null,
    refunds: (refunds.data ?? []).map((r: any) => ({ id: r.id, orderId: r.order_id, amount: Number(r.amount), currency: r.currency, reason: r.reason, includesFees: r.includes_fees, status: r.status, requestedBy: r.requested_by, createdAt: r.created_at, updatedAt: r.updated_at, providerReference: r.provider_reference ?? undefined, note: r.note ?? undefined })),
    cases: (cases.data ?? []).map(caseView),
    addressSummary: a && opts.revealAddress && o.source !== "wishlist" ? `${a.recipientName}, ${a.line1}, ${a.area}, ${a.city}` : a ? `${zoneById(a.zoneId)?.name} delivery area` : null,
    eventTitle: (ev.data as any)?.published?.content?.title ?? (ev.data as any)?.draft?.title ?? null,
    canCancel: ["paid", "awaiting_recipient_details", "awaiting_vendor_acceptance"].includes(o.status),
    canRequestRefund: o.status === "delivered" && !(refunds.data ?? []).some((r: any) => r.status !== "rejected"),
  }
}

export const caseView = (c: any) => ({ id: c.id, orderId: c.order_id, vendorId: c.vendor_id, kind: c.kind, status: c.status, subject: c.subject, description: c.description, openedBy: c.opened_by, owner: c.owner, evidence: c.evidence, resolution: c.resolution ?? undefined, createdAt: c.created_at, updatedAt: c.updated_at })

export function revealView(g: Gift, o: Order, product: Product | undefined, vendorName: string, occasionTitle: string | null, preview: boolean) {
  const line = o.lines[0]
  const zone = zoneById(o.delivery.zoneId)!
  const dispatched = ["dispatched", "delivered", "delivery_issue"].includes(o.status)
  return {
    giftId: g.id, preview, recipientName: g.recipientName, senderDisplayName: g.anonymous ? null : g.senderDisplayName, anonymous: g.anonymous, message: g.message,
    revealStyle: g.revealStyle, revealStatus: preview ? "available" : g.revealStatus, openedAt: preview ? null : g.openedAt,
    item: { title: line.title, variantName: line.variantName, image: line.image, images: product?.images ?? [line.image], vendorName, summary: product?.summary ?? "", quantity: line.quantity, personalisationText: line.personalisationText },
    claim: { status: g.claimStatus, deadline: g.claimDeadline, zoneId: zone.id, zoneName: zone.name, areas: zone.areas },
    fulfilment: {
      status: o.status, label: dispatched ? (o.status === "delivered" ? "Delivered" : "Your gift is on its way") : ["cancelled", "declined"].includes(o.status) ? "This gift couldn't be delivered" : "Being prepared",
      dispatched, delivered: o.status === "delivered", window: dispatched || o.delivery.windowKind === "confirmed" ? { start: o.delivery.windowStart, end: o.delivery.windowEnd, kind: o.delivery.windowKind } : null,
    },
    occasionTitle, thankYouNote: preview ? undefined : g.thankYouNote,
  }
}

export async function vendorOrderView(o: Order) {
  const accepted = !["awaiting_payment", "paid", "awaiting_recipient_details", "awaiting_vendor_acceptance", "cancelled", "declined", "payment_expired"].includes(o.status)
  const addr = accepted ? (must(await db().from("order_addresses").select("address").eq("order_id", o.id).maybeSingle()) as any)?.address ?? null : null
  const gift = o.giftId ? (must(await db().from("gifts").select("reveal_status").eq("id", o.giftId).maybeSingle()) as any) : null
  const st = settlementFor(o.pricing, o.commissionBps)
  return {
    order: { id: o.id, reference: o.reference, status: o.status, paymentStatus: o.paymentStatus, source: o.source, purchaseType: o.purchaseType, lines: o.lines, pricing: o.pricing, createdAt: o.createdAt, acceptBy: o.acceptBy, timeline: o.timeline, delivery: o.delivery, storefrontId: o.storefrontId, campaign: o.campaign },
    customerLabel: `${o.buyerName.split(" ")[0]} · ${maskContact(o.buyerEmail)}`, deliveryAddress: addr, isGift: o.purchaseType === "gift",
    giftNote: o.lines.find((l) => l.personalisationText)?.personalisationText ?? null, settlement: { gross: st.gross, commission: st.commission, vendorPayable: st.vendorPayable },
    revealHidden: Boolean(gift && (gift.reveal_status === "scheduled" || gift.reveal_status === "draft")),
  }
}

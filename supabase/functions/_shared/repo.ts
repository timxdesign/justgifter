// deno-lint-ignore-file no-explicit-any
import { db, must } from "./db.ts"
import type { Gift, OccasionEvent, Order, PlatformSettings, Product, StockHold, Storefront, Vendor, VendorApplication, WishlistItem, TimelineEntry } from "./domain/index.ts"
import { DEFAULT_SETTINGS, uid } from "./domain/index.ts"

/** Row ↔ domain mapping. Keeps snake_case confined to this file. */

export const toVendor = (r: any): Vendor => ({
  id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, about: r.about, logoInitials: r.logo_initials, logoColor: r.logo_color, coverImage: r.cover_image,
  status: r.status, verified: r.verified, zones: r.zones, operating: r.operating, fulfilment: r.fulfilment, categories: r.categories, businessType: r.business_type,
  city: r.city, responseHours: r.response_hours, suppressedFromRecommendations: r.suppressed_from_recommendations, featured: r.featured, joinedAt: r.joined_at,
  returnPolicy: r.return_policy, deliveryPolicy: r.delivery_policy,
})

export const toProduct = (r: any, variants: any[]): Product => ({
  id: r.id, vendorId: r.vendor_id, slug: r.slug, title: r.title, summary: r.summary, description: r.description, included: r.included, dimensions: r.dimensions ?? undefined,
  images: r.images, category: r.category, occasions: r.occasions, interests: r.interests, status: r.status,
  variants: variants.filter((v) => v.product_id === r.id).sort((a, b) => a.position - b.position).map((v) => ({ id: v.id, productId: v.product_id, name: v.name, sku: v.sku, price: Number(v.price), compareAtPrice: v.compare_at_price ? Number(v.compare_at_price) : undefined, stock: v.stock })),
  prepHours: r.prep_hours, perishable: r.perishable, highlyCustomised: r.highly_customised, returnEligible: r.return_eligible, personalisation: r.personalisation ?? undefined,
  wrapping: r.wrapping, sponsored: r.sponsored, editorialScore: Number(r.editorial_score), createdAt: r.created_at, moderationNote: r.moderation_note ?? undefined,
})

export const toApplication = (a: any): VendorApplication => ({
  id: a.id, vendorId: a.vendor_id, status: a.status, submittedAt: a.submitted_at, reviewer: a.reviewer, decisionReason: a.decision_reason, history: a.history,
  ownerName: a.owner_name, ownerEmail: a.owner_email, ownerPhone: a.owner_phone, address: a.address, payoutBank: a.payout_bank, payoutAccountMasked: a.payout_account_masked,
  termsAcceptedAt: a.terms_accepted_at, responses: a.responses ?? [],
})

export const toStorefront = (r: any): Storefront => ({
  id: r.id, vendorId: r.vendor_id, slug: r.slug, status: r.status, headline: r.headline, intro: r.intro, accent: r.accent, layout: r.layout, coverImage: r.cover_image,
  featuredProductIds: r.featured_product_ids, collections: r.collections, publishedAt: r.published_at, updatedAt: r.updated_at, slugHistory: r.slug_history,
})

export const toHold = (r: any): StockHold => ({ id: r.id, variantId: r.variant_id, wishlistItemId: r.wishlist_item_id, quantity: r.quantity, status: r.status, expiresAt: r.expires_at, orderId: r.order_id, createdAt: r.created_at })

export const toWish = (r: any): WishlistItem => ({
  id: r.id, eventId: r.event_id, productId: r.product_id, variantId: r.variant_id, desiredQty: r.desired_qty, purchasedQty: r.purchased_qty, priority: r.priority, note: r.note, status: r.status, alternativeProductIds: r.alternative_product_ids, addedAt: r.added_at,
})

export const toEvent = (r: any, wishes: any[]): OccasionEvent => ({
  id: r.id, slug: r.slug, hostUserId: r.host_user_id, status: r.status, visibility: r.visibility, draft: r.draft, draftDesign: r.draft_design, published: r.published,
  wishlist: wishes.filter((w) => w.event_id === r.id).map(toWish), deliveryZoneId: r.delivery_zone_id, hasDeliveryAddress: r.has_delivery_address, surpriseMode: r.surprise_mode,
  surpriseRevealDate: r.surprise_reveal_date, inviteCodeHash: r.invite_code_hash, coHosts: r.co_hosts, createdAt: r.created_at, updatedAt: r.updated_at,
})

export const toOrder = (r: any): Order => ({
  id: r.id, reference: r.reference, vendorId: r.vendor_id, buyerUserId: r.buyer_user_id, buyerName: r.buyer_name, buyerEmail: r.buyer_email, buyerPhone: r.buyer_phone ?? undefined,
  source: r.source, storefrontId: r.storefront_id, campaign: r.campaign ?? undefined, eventId: r.event_id, wishlistItemId: r.wishlist_item_id, purchaseType: r.purchase_type,
  lines: r.lines, pricing: r.pricing, status: r.status, paymentStatus: r.payment_status, delivery: r.delivery, giftId: r.gift_id, acceptBy: r.accept_by, timeline: r.timeline,
  createdAt: r.created_at, paidAt: r.paid_at, updatedAt: r.updated_at, holdId: r.hold_ids?.[0] ?? null, cancellationReason: r.cancellation_reason ?? undefined, commissionBps: r.commission_bps,
})

export const toGift = (r: any): Gift => ({
  id: r.id, orderId: r.order_id, recipientName: r.recipient_name, recipientEmail: r.recipient_email ?? undefined, recipientPhone: r.recipient_phone ?? undefined, contactMasked: r.contact_masked,
  senderDisplayName: r.sender_display_name, anonymous: r.anonymous, message: r.message, revealStyle: r.reveal_style, revealAt: r.reveal_at, timezone: r.timezone, revealStatus: r.reveal_status,
  access: r.access, claimStatus: r.claim_status, claimDeadline: r.claim_deadline, tokenHash: r.token_hash ?? "", previewTokenHash: r.preview_token_hash, notifiedAt: r.notified_at,
  openedAt: r.opened_at, thankYouNote: r.thank_you_note ?? undefined, thankYouAt: r.thank_you_at ?? undefined, declinedAt: r.declined_at ?? undefined, contactStopped: r.contact_stopped,
  reported: r.reported, wishlistItemId: r.wishlist_item_id,
})

// ---------------------------------------------------------------- Loaders

let settingsCache: { at: number; value: PlatformSettings } | null = null
export async function settings(): Promise<PlatformSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.value
  const { data } = await db().from("platform_settings").select("settings").maybeSingle()
  settingsCache = { at: Date.now(), value: { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) } }
  return settingsCache.value
}

export async function vendorsById(ids?: string[]) {
  let q = db().from("vendors").select("*")
  if (ids) q = q.in("id", ids.length ? ids : ["-"])
  return new Map((must(await q) as any[]).map((r) => [r.id, toVendor(r)]))
}

export async function products(filter: { ids?: string[]; vendorId?: string; status?: string[]; idOrSlug?: string } = {}): Promise<Product[]> {
  let q = db().from("products").select("*")
  if (filter.ids) q = q.in("id", filter.ids.length ? filter.ids : ["-"])
  if (filter.vendorId) q = q.eq("vendor_id", filter.vendorId)
  if (filter.status) q = q.in("status", filter.status)
  if (filter.idOrSlug) {
    // Interpolated into a PostgREST filter, so only plain slug characters are allowed.
    if (!/^[a-z0-9_-]{1,120}$/i.test(filter.idOrSlug)) return []
    q = q.or(`id.eq.${filter.idOrSlug},slug.eq.${filter.idOrSlug}`)
  }
  const rows = must(await q) as any[]
  if (!rows.length) return []
  const variants = must(await db().from("variants").select("*").in("product_id", rows.map((r) => r.id))) as any[]
  return rows.map((r) => toProduct(r, variants))
}

export async function activeHolds(variantIds?: string[]): Promise<StockHold[]> {
  let q = db().from("stock_holds").select("*").eq("status", "active").gt("expires_at", new Date().toISOString())
  if (variantIds) q = q.in("variant_id", variantIds.length ? variantIds : ["-"])
  return (must(await q) as any[]).map(toHold)
}

export async function eventBy(col: "id" | "slug", value: string): Promise<OccasionEvent | null> {
  const row = must(await db().from("events").select("*").eq(col, value).maybeSingle()) as any
  if (!row) return null
  const wishes = must(await db().from("wishlist_items").select("*").eq("event_id", row.id)) as any[]
  return toEvent(row, wishes)
}

export async function orderBy(col: "id" | "reference", value: string): Promise<Order | null> {
  const row = must(await db().from("orders").select("*").eq(col, value).maybeSingle())
  return row ? toOrder(row) : null
}

export async function giftBy(col: "id" | "order_id" | "token_hash" | "preview_token_hash", value: string): Promise<Gift | null> {
  const row = must(await db().from("gifts").select("*").eq(col, value).maybeSingle())
  return row ? toGift(row) : null
}

export async function bookedByDate(vendorId: string) {
  const rows = must(await db().from("orders").select("delivery").eq("vendor_id", vendorId).not("status", "in", "(cancelled,declined,payment_expired,awaiting_payment)")) as any[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.delivery.requestedDate] = (out[r.delivery.requestedDate] ?? 0) + 1
  return out
}

// ---------------------------------------------------------------- Writers

export async function saveOrder(o: Order, patch: Partial<Record<string, unknown>> = {}) {
  must(await db().from("orders").update({ status: o.status, payment_status: o.paymentStatus, delivery: o.delivery, accept_by: o.acceptBy, timeline: o.timeline, cancellation_reason: o.cancellationReason ?? null, pricing: o.pricing, updated_at: new Date().toISOString(), ...patch }).eq("id", o.id))
}

export async function saveGift(g: Gift) {
  must(await db().from("gifts").update({
    message: g.message, sender_display_name: g.senderDisplayName, reveal_at: g.revealAt, reveal_status: g.revealStatus, access: g.access, claim_status: g.claimStatus, claim_deadline: g.claimDeadline,
    token_hash: g.tokenHash || null, notified_at: g.notifiedAt, opened_at: g.openedAt, thank_you_note: g.thankYouNote ?? null, thank_you_at: g.thankYouAt ?? null, declined_at: g.declinedAt ?? null,
    contact_stopped: g.contactStopped, reported: g.reported,
  }).eq("id", g.id))
}

export async function audit(actor: string, action: string, targetType: string, targetId: string, detail = "") {
  await db().from("audit_events").insert({ id: uid("aud"), actor, action, target_type: targetType, target_id: targetId, detail })
}

export async function enqueueJob(kind: string, runAt: string, idempotencyKey: string, payload: Record<string, string>) {
  await db().from("jobs").upsert({ id: uid("job"), kind, run_at: runAt, idempotency_key: idempotencyKey, payload }, { onConflict: "idempotency_key", ignoreDuplicates: true })
}

export function timelineEntry(status: string, label: string, actor: TimelineEntry["actor"], note?: string): TimelineEntry {
  return { at: new Date().toISOString(), status, label, actor, note }
}

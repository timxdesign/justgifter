import type { OccasionEvent, Order, Product, Vendor, ZoneId } from "@domain/index.ts"
import {
  canSendWithoutAddress,
  earliestDelivery,
  highestPrice,
  lowestPrice,
  ORDER_STATUS_LABEL,
  sellableUnits,
  wishAvailability,
} from "@domain/index.ts"
import type { OrderSummary, ProductCard, VendorPublic, WishlistItemView } from "../types"
import type { Store } from "./store"

export function vendorPublic(s: Store, v: Vendor): VendorPublic {
  const sf = s.db.storefronts.find((x) => x.vendorId === v.id)
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    about: v.about,
    logoInitials: v.logoInitials,
    logoColor: v.logoColor,
    coverImage: v.coverImage,
    verified: v.verified,
    status: v.status,
    zones: v.zones,
    operating: v.operating,
    fulfilment: v.fulfilment,
    categories: v.categories,
    city: v.city,
    responseHours: v.responseHours,
    returnPolicy: v.returnPolicy,
    deliveryPolicy: v.deliveryPolicy,
    featured: v.featured,
    storefrontSlug: sf?.slug ?? null,
    storefrontStatus: sf?.status ?? null,
    productCount: s.db.products.filter((p) => p.vendorId === v.id && p.status === "active").length,
  }
}

/** Products a customer may purchase: active listing, approved vendor. */
export function isPurchasable(s: Store, p: Product) {
  const v = s.db.vendors.find((x) => x.id === p.vendorId)
  return p.status === "active" && v?.status === "approved"
}

export function productCard(s: Store, p: Product, zoneId?: ZoneId): ProductCard {
  const v = s.db.vendors.find((x) => x.id === p.vendorId)!
  const now = s.now()
  const sellable = p.variants.map((variant) => sellableUnits(variant, s.db.holds, now))
  const total = sellable.reduce((a, b) => a + b, 0)
  const zone = zoneId ?? v.zones[0]?.zoneId
  const slot = zone
    ? earliestDelivery({ now, timezone: s.db.settings.timezone, vendor: v, zoneId: zone, prepHours: p.prepHours, maxAdvanceDays: s.db.settings.maxAdvanceDays })
    : null
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    images: p.images,
    category: p.category,
    occasions: p.occasions,
    vendor: { id: v.id, name: v.name, slug: v.slug, verified: v.verified },
    priceFrom: lowestPrice(p),
    priceTo: highestPrice(p),
    inStock: total > 0,
    lowStock: total > 0 && total <= 3 ? total : null,
    sponsored: p.sponsored,
    perishable: p.perishable,
    personalisable: Boolean(p.personalisation),
    canSendWithoutAddress: canSendWithoutAddress(p),
    earliest: slot && zone ? { date: slot.date, sameDay: slot.sameDay, zoneId: zone } : null,
  }
}

export function wishlistViews(s: Store, ev: OccasionEvent): WishlistItemView[] {
  const now = s.now()
  return ev.wishlist
    .filter((w) => w.status !== "removed")
    .map((w) => {
      const product = s.db.products.find((p) => p.id === w.productId)!
      const variant = product.variants.find((v) => v.id === w.variantId)
      return {
        item: {
          id: w.id,
          desiredQty: w.desiredQty,
          purchasedQty: w.purchasedQty,
          priority: w.priority,
          note: w.note,
          status: w.status,
          variantId: w.variantId,
          productId: w.productId,
          alternativeProductIds: w.alternativeProductIds,
        },
        product: productCard(s, product, ev.deliveryZoneId ?? undefined),
        variantName: variant?.name ?? "Unavailable option",
        price: variant?.price ?? 0,
        availability: wishAvailability(w, variant, isPurchasable(s, product), s.db.holds, now),
      }
    })
    .sort((a, b) => priorityRank(a.item.priority) - priorityRank(b.item.priority))
}

const priorityRank = (p: string) => (p === "must" ? 0 : p === "love" ? 1 : 2)

export function orderSummary(s: Store, o: Order): OrderSummary {
  const vendor = s.db.vendors.find((v) => v.id === o.vendorId)
  const gift = o.giftId ? s.db.gifts.find((g) => g.id === o.giftId) : null
  return {
    id: o.id,
    reference: o.reference,
    createdAt: o.createdAt,
    status: o.status,
    paymentStatus: o.paymentStatus,
    purchaseType: o.purchaseType,
    source: o.source,
    total: o.pricing.total,
    vendorName: vendor?.name ?? "Vendor",
    title: o.lines[0]?.title + (o.lines.length > 1 ? ` + ${o.lines.length - 1} more` : ""),
    image: o.lines[0]?.image ?? "",
    itemCount: o.lines.reduce((n, l) => n + l.quantity, 0),
    recipientName: gift?.recipientName ?? null,
    revealStatus: gift?.revealStatus ?? null,
    requestedDate: o.delivery.requestedDate,
  }
}

export const statusLabel = (o: Order) => ORDER_STATUS_LABEL[o.status]

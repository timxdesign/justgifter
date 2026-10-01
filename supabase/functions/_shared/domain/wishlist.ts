import type { Iso, StockHold, Variant, WishlistItem } from "./types.ts"

/**
 * Wishlist and stock availability (WIS 03–05, STF 06).
 * The database enforces these atomically (see `create_stock_hold` in the migrations);
 * these helpers mirror the same arithmetic for display and for the in-browser demo backend.
 */

export const isHoldActive = (h: StockHold, now: Date) => h.status === "active" && new Date(h.expiresAt) > now

/** Units of a variant held by active checkouts. */
export function activeHeldUnits(holds: StockHold[], variantId: string, now: Date, excludeHoldId?: string): number {
  return holds
    .filter((h) => h.variantId === variantId && h.id !== excludeHoldId && isHoldActive(h, now))
    .reduce((n, h) => n + h.quantity, 0)
}

/** Sellable units = stock not yet committed minus units held by in-flight checkouts. */
export function sellableUnits(variant: Pick<Variant, "id" | "stock">, holds: StockHold[], now: Date, excludeHoldId?: string) {
  return Math.max(0, variant.stock - activeHeldUnits(holds, variant.id, now, excludeHoldId))
}

/** WIS 03: desired − verified purchases − active checkout holds. */
export function wishlistRemaining(item: Pick<WishlistItem, "id" | "desiredQty" | "purchasedQty">, holds: StockHold[], now: Date, excludeHoldId?: string) {
  const held = holds
    .filter((h) => h.wishlistItemId === item.id && h.id !== excludeHoldId && isHoldActive(h, now))
    .reduce((n, h) => n + h.quantity, 0)
  return Math.max(0, item.desiredQty - item.purchasedQty - held)
}

export type WishAvailability =
  | { state: "available"; remaining: number }
  | { state: "held"; until: Iso }
  | { state: "fulfilled" }
  | { state: "unavailable"; reason: "out_of_stock" | "listing_unavailable" | "removed" }

/**
 * What a guest sees for a wishlist item. "held" means every remaining unit is in someone
 * else's checkout right now — it may come back if their payment doesn't complete.
 */
export function wishAvailability(
  item: WishlistItem,
  variant: Pick<Variant, "id" | "stock"> | undefined,
  listingActive: boolean,
  holds: StockHold[],
  now: Date,
): WishAvailability {
  if (item.status === "removed") return { state: "unavailable", reason: "removed" }
  if (item.purchasedQty >= item.desiredQty) return { state: "fulfilled" }
  if (!variant || !listingActive || item.status === "unavailable") return { state: "unavailable", reason: "listing_unavailable" }
  const remaining = wishlistRemaining(item, holds, now)
  if (remaining === 0) {
    const until = holds
      .filter((h) => h.wishlistItemId === item.id && isHoldActive(h, now))
      .map((h) => h.expiresAt)
      .sort()
      .at(-1)
    return { state: "held", until: until ?? now.toISOString() }
  }
  if (sellableUnits(variant, holds, now) === 0) return { state: "unavailable", reason: "out_of_stock" }
  return { state: "available", remaining: Math.min(remaining, sellableUnits(variant, holds, now)) }
}

/**
 * WIS 04/AC 05: a verified payment that arrives after its hold expired. If units remain it
 * can still be honoured; otherwise it must go to operations for a funded alternative or refund —
 * never an oversell.
 */
export function resolveLatePayment(remainingWithoutHold: number, stockWithoutHold: number, quantity: number) {
  if (remainingWithoutHold >= quantity && stockWithoutHold >= quantity) return "honour" as const
  return "conflict" as const
}

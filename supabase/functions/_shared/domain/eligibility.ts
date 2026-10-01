import type { DateOnly, OrderSource, PlatformSettings, Product, StockHold, Storefront, Vendor, ZoneId } from "./types.ts"
import { checkDeliveryDate, type DeliveryCheck } from "./delivery.ts"
import { sellableUnits } from "./wishlist.ts"

/**
 * Server-side checkout eligibility (CAT 05, STF 06/10, AC 01, AC 19, AC 20).
 * Runs again inside the payment-creation transaction; a cached product page is never trusted.
 */

export type EligibilityCode =
  | "EMPTY_CART"
  | "MIXED_VENDORS"
  | "VENDOR_UNAVAILABLE"
  | "STOREFRONT_PAUSED"
  | "LISTING_UNAVAILABLE"
  | "VARIANT_NOT_FOUND"
  | "QUANTITY_INVALID"
  | "INSUFFICIENT_STOCK"
  | "PERSONALISATION_REQUIRED"
  | "PERSONALISATION_TOO_LONG"
  | "ZONE_UNSUPPORTED"
  | "DATE_INFEASIBLE"
  | "ADDRESS_UNKNOWN_NOT_ALLOWED"
  | "PRICE_CHANGED"

export interface EligibilityIssue {
  code: EligibilityCode
  message: string
  lineIndex?: number
}

export interface CheckoutLineRequest {
  productId: string
  variantId: string
  quantity: number
  personalisationText?: string
  wrappingId?: string
  /** Price the buyer saw; a mismatch is reported so the UI can refresh rather than silently charge more. */
  expectedUnitPrice?: number
}

export interface EligibilityInput {
  now: Date
  settings: Pick<PlatformSettings, "timezone" | "maxAdvanceDays">
  source: OrderSource
  vendor: Vendor | undefined
  storefront?: Storefront | null
  products: Product[]
  lines: CheckoutLineRequest[]
  zoneId: ZoneId
  requestedDate: DateOnly | null
  addressKnown: boolean
  holds: StockHold[]
  /** A wishlist checkout carries its own hold, which must not count against itself. */
  ownHoldId?: string
  bookedByDate?: Record<DateOnly, number>
}

export interface EligibilityResult {
  ok: boolean
  issues: EligibilityIssue[]
  delivery: DeliveryCheck | null
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const issues: EligibilityIssue[] = []
  const { vendor, lines } = input

  if (lines.length === 0) return { ok: false, issues: [{ code: "EMPTY_CART", message: "Your bag is empty." }], delivery: null }

  const products = new Map(input.products.map((p) => [p.id, p]))
  const vendorIds = new Set(lines.map((l) => products.get(l.productId)?.vendorId))
  if (vendorIds.size > 1) {
    issues.push({ code: "MIXED_VENDORS", message: "Each checkout can include items from one vendor. Check out the other vendor's items separately." })
  }

  if (!vendor || vendor.status !== "approved") {
    issues.push({ code: "VENDOR_UNAVAILABLE", message: "This vendor isn't taking new orders right now." })
  }
  if (input.source === "storefront" && input.storefront && input.storefront.status !== "published") {
    issues.push({ code: "STOREFRONT_PAUSED", message: "This store has paused ordering. Existing orders are unaffected." })
  }

  let prepHours = 0
  lines.forEach((line, i) => {
    const product = products.get(line.productId)
    if (!product || product.status !== "active" || product.vendorId !== vendor?.id) {
      issues.push({ code: "LISTING_UNAVAILABLE", message: "This item is no longer available.", lineIndex: i })
      return
    }
    const variant = product.variants.find((v) => v.id === line.variantId)
    if (!variant) {
      issues.push({ code: "VARIANT_NOT_FOUND", message: "That option is no longer available.", lineIndex: i })
      return
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
      issues.push({ code: "QUANTITY_INVALID", message: "Choose a quantity between 1 and 20.", lineIndex: i })
    }
    const available = sellableUnits(variant, input.holds, input.now, input.ownHoldId)
    if (available < line.quantity) {
      issues.push({
        code: "INSUFFICIENT_STOCK",
        message: available === 0 ? `${product.title} has just sold out.` : `Only ${available} left of ${product.title}.`,
        lineIndex: i,
      })
    }
    if (line.expectedUnitPrice !== undefined && line.expectedUnitPrice !== variant.price) {
      issues.push({ code: "PRICE_CHANGED", message: `The price of ${product.title} has changed. Review the new total.`, lineIndex: i })
    }
    const spec = product.personalisation
    const text = line.personalisationText?.trim() ?? ""
    if (spec?.required && !text) {
      issues.push({ code: "PERSONALISATION_REQUIRED", message: `Add the ${spec.label.toLowerCase()} for ${product.title}.`, lineIndex: i })
    }
    if (spec && text.length > spec.maxLength) {
      issues.push({ code: "PERSONALISATION_TOO_LONG", message: `Keep the ${spec.label.toLowerCase()} under ${spec.maxLength} characters.`, lineIndex: i })
    }
    if (!input.addressKnown && (product.perishable || product.highlyCustomised || !product.returnEligible)) {
      issues.push({
        code: "ADDRESS_UNKNOWN_NOT_ALLOWED",
        message: `${product.title} can't be sent without an address because it can't be returned if the gift isn't claimed.`,
        lineIndex: i,
      })
    }
    const extra = text ? (spec?.extraPrepHours ?? 0) : 0
    prepHours = Math.max(prepHours, product.prepHours + extra)
  })

  let delivery: DeliveryCheck | null = null
  if (vendor) {
    delivery = checkDeliveryDate(
      {
        now: input.now,
        timezone: input.settings.timezone,
        vendor,
        zoneId: input.zoneId,
        prepHours,
        bookedByDate: input.bookedByDate,
        maxAdvanceDays: input.settings.maxAdvanceDays,
      },
      input.requestedDate,
    )
    if (!delivery.feasible) {
      issues.push({
        code: delivery.reason === "zone_unsupported" ? "ZONE_UNSUPPORTED" : "DATE_INFEASIBLE",
        message: delivery.message,
      })
    }
  }

  return { ok: issues.length === 0, issues, delivery }
}

/** Address-unknown gifting is only allowed for items that can be safely cancelled (§5). */
export const canSendWithoutAddress = (p: Pick<Product, "perishable" | "highlyCustomised" | "returnEligible">) =>
  !p.perishable && !p.highlyCustomised && p.returnEligible

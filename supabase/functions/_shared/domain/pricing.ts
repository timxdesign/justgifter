import type { Minor, OrderLine, PlatformSettings, PriceBreakdown, Product, Variant } from "./types.ts"
import { applyBps } from "./money.ts"

/**
 * Checkout pricing (PAY 01/02). The server recomputes this from current validated prices and
 * stores the result as an immutable snapshot on the order; the client copy is only a preview.
 */

export interface LineInput {
  product: Product
  variant: Variant
  quantity: number
  personalisationText?: string
  wrappingId?: string
}

export function buildLine(input: LineInput): OrderLine {
  const { product, variant, quantity } = input
  const wrapping = input.wrappingId ? product.wrapping.find((w) => w.id === input.wrappingId) : undefined
  const hasPersonalisation = Boolean(product.personalisation && input.personalisationText?.trim())
  const personalisationFee = hasPersonalisation ? (product.personalisation?.fee ?? 0) * quantity : 0
  const wrappingFee = (wrapping?.fee ?? 0) * quantity
  return {
    productId: product.id,
    variantId: variant.id,
    title: product.title,
    variantName: variant.name,
    image: product.images[0] ?? "",
    unitPrice: variant.price,
    quantity,
    personalisationText: hasPersonalisation ? input.personalisationText!.trim() : undefined,
    personalisationFee,
    wrappingId: wrapping?.id,
    wrappingName: wrapping?.name,
    wrappingFee,
    lineTotal: variant.price * quantity,
  }
}

export interface QuoteInput {
  lines: OrderLine[]
  deliveryFee: Minor
  deliveryProvisional: boolean
  discount?: Minor
  settings: Pick<PlatformSettings, "buyerFeeBps" | "taxIncludedInPrices" | "currency">
}

export function quote(input: QuoteInput): PriceBreakdown {
  const items = sum(input.lines.map((l) => l.lineTotal))
  const wrapping = sum(input.lines.map((l) => l.wrappingFee))
  const personalisation = sum(input.lines.map((l) => l.personalisationFee))
  const discount = Math.min(input.discount ?? 0, items)
  const platformFee = applyBps(items - discount, input.settings.buyerFeeBps)
  // Launch assumption: listed prices are VAT-inclusive, so no tax line is added on top.
  const tax = 0
  const total = items + wrapping + personalisation + input.deliveryFee - discount + platformFee + tax
  return {
    items,
    wrapping,
    personalisation,
    delivery: input.deliveryFee,
    discount,
    platformFee,
    tax,
    total,
    currency: input.settings.currency,
    deliveryProvisional: input.deliveryProvisional,
    taxIncludedInPrices: input.settings.taxIncludedInPrices,
  }
}

export interface Settlement {
  gross: Minor
  commission: Minor
  vendorPayable: Minor
  platformRevenue: Minor
}

/**
 * Splits a paid order between platform and vendor. Commission applies to item value only;
 * wrapping, personalisation and vendor-run delivery pass through to the vendor.
 */
export function settlementFor(pricing: PriceBreakdown, commissionBps: number): Settlement {
  const commissionBase = pricing.items - pricing.discount
  const commission = applyBps(commissionBase, commissionBps)
  const vendorPayable = pricing.total - pricing.platformFee - commission
  return { gross: pricing.total, commission, vendorPayable, platformRevenue: commission + pricing.platformFee }
}

export const lowestPrice = (p: Pick<Product, "variants">): Minor => Math.min(...p.variants.map((v) => v.price))
export const highestPrice = (p: Pick<Product, "variants">): Minor => Math.max(...p.variants.map((v) => v.price))
/** CAT 04: a "from" price must make clear that variants can cost more. */
export const hasPriceRange = (p: Pick<Product, "variants">) => lowestPrice(p) !== highestPrice(p)

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

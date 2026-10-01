import type { Iso, LedgerEntry, Minor, Order, Refund } from "./types.ts"
import { settlementFor } from "./pricing.ts"
import { applyBps } from "./money.ts"

/**
 * Append-only financial entries (§10 Ledger and settlement). Each entry carries an idempotency
 * key derived from its business event, so replayed webhooks cannot double-post (PAY 04, AC 03).
 * Corrections are compensating entries; nothing is updated in place.
 */

type Draft = Omit<LedgerEntry, "id" | "createdAt">

export function entriesForPayment(order: Pick<Order, "id" | "vendorId" | "pricing" | "commissionBps" | "reference">): Draft[] {
  const s = settlementFor(order.pricing, order.commissionBps)
  const base = { orderId: order.id, vendorId: order.vendorId, currency: order.pricing.currency }
  return [
    { ...base, type: "charge", amount: s.gross, idempotencyKey: `charge:${order.id}`, memo: `Payment for ${order.reference}` },
    { ...base, type: "platform_commission", amount: s.platformRevenue, idempotencyKey: `commission:${order.id}`, memo: "Platform commission" },
    { ...base, type: "vendor_payable", amount: s.vendorPayable, idempotencyKey: `payable:${order.id}`, memo: "Owed to vendor" },
  ]
}

/**
 * Refund entries split the refunded amount between the vendor's payable and the platform's
 * commission in proportion to the original settlement.
 */
export function entriesForRefund(order: Pick<Order, "id" | "vendorId" | "pricing" | "commissionBps">, refund: Pick<Refund, "id" | "amount">): Draft[] {
  const s = settlementFor(order.pricing, order.commissionBps)
  const ratio = s.gross === 0 ? 0 : refund.amount / s.gross
  const commissionBack = Math.round(s.platformRevenue * ratio)
  const payableBack = refund.amount - commissionBack
  const base = { orderId: order.id, vendorId: order.vendorId, currency: order.pricing.currency }
  return [
    { ...base, type: "refund", amount: refund.amount, idempotencyKey: `refund:${refund.id}`, memo: "Refund to buyer" },
    { ...base, type: "commission_reversal", amount: commissionBack, idempotencyKey: `refund-commission:${refund.id}`, memo: "Commission reversed" },
    { ...base, type: "vendor_payable_reversal", amount: payableBack, idempotencyKey: `refund-payable:${refund.id}`, memo: "Vendor payable reversed" },
  ]
}

/** Appends only entries whose idempotency key hasn't been seen. */
export function appendIdempotent(ledger: LedgerEntry[], drafts: Draft[], now: Iso, makeId: () => string): LedgerEntry[] {
  const seen = new Set(ledger.map((e) => e.idempotencyKey))
  const fresh = drafts.filter((d) => !seen.has(d.idempotencyKey)).map((d) => ({ ...d, id: makeId(), createdAt: now }))
  return [...ledger, ...fresh]
}

export interface VendorBalance {
  gross: Minor
  commission: Minor
  refunds: Minor
  payable: Minor
  paidOut: Minor
  outstanding: Minor
}

export function vendorBalance(entries: LedgerEntry[], vendorId: string): VendorBalance {
  const mine = entries.filter((e) => e.vendorId === vendorId)
  const total = (t: LedgerEntry["type"]) => mine.filter((e) => e.type === t).reduce((n, e) => n + e.amount, 0)
  const payable = total("vendor_payable") - total("vendor_payable_reversal")
  const paidOut = total("payout")
  return {
    gross: total("charge"),
    commission: total("platform_commission") - total("commission_reversal"),
    refunds: total("refund"),
    payable,
    paidOut,
    outstanding: payable - paidOut,
  }
}

/** Proportional refund of item value only (e.g. one of several units), excluding delivery. */
export const partialItemRefund = (unitPrice: Minor, quantity: number, bps = 10_000) => applyBps(unitPrice * quantity, bps)

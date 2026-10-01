import type { ClaimStatus, EventStatus, OrderStatus, RefundStatus, RevealStatus, VendorStatus } from "./types.ts"

/**
 * State models (PRD §14 "State models"). Every transition goes through `assertTransition`
 * so an illegal jump (e.g. delivered → preparing) fails loudly in both runtimes.
 */

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["paid", "payment_expired", "cancelled"],
  paid: ["awaiting_recipient_details", "awaiting_vendor_acceptance", "cancelled"],
  awaiting_recipient_details: ["awaiting_vendor_acceptance", "cancelled"],
  awaiting_vendor_acceptance: ["accepted", "declined", "cancelled"],
  accepted: ["preparing", "cancelled", "delivery_issue"],
  preparing: ["ready_for_dispatch", "dispatched", "delivery_issue", "cancelled"],
  ready_for_dispatch: ["dispatched", "delivery_issue"],
  dispatched: ["delivered", "delivery_issue"],
  delivery_issue: ["dispatched", "delivered", "cancelled", "disputed"],
  delivered: ["disputed"],
  disputed: ["delivered", "cancelled"],
  declined: [],
  cancelled: [],
  payment_expired: [],
}

export const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["submitted"],
  submitted: ["completed", "failed"],
  failed: ["submitted"],
  completed: [],
  rejected: [],
}

export const REVEAL_TRANSITIONS: Record<RevealStatus, RevealStatus[]> = {
  draft: ["scheduled", "available"],
  scheduled: ["available", "scheduled"],
  available: ["opened"],
  opened: ["opened"],
}

export const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ["published", "archived"],
  published: ["closed", "draft", "archived"],
  closed: ["published", "archived"],
  archived: [],
}

export const VENDOR_TRANSITIONS: Record<VendorStatus, VendorStatus[]> = {
  draft: ["submitted"],
  submitted: ["under_review"],
  under_review: ["approved", "rejected", "needs_information"],
  needs_information: ["submitted"],
  approved: ["suspended"],
  suspended: ["approved"],
  rejected: [],
}

export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  not_required: [],
  pending: ["submitted", "declined", "expired", "needs_sender_approval"],
  needs_sender_approval: ["submitted", "declined", "expired"],
  submitted: [],
  declined: [],
  expired: [],
}

export function canTransition<S extends string>(table: Record<S, S[]>, from: S, to: S): boolean {
  return table[from]?.includes(to) ?? false
}

export class TransitionError extends Error {
  constructor(public from: string, public to: string, public entity: string) {
    super(`Cannot move ${entity} from ${from} to ${to}`)
  }
}

export function assertTransition<S extends string>(table: Record<S, S[]>, from: S, to: S, entity: string) {
  if (!canTransition(table, from, to)) throw new TransitionError(from, to, entity)
}

/**
 * Plain-language labels (§13 UX writing rules): distinct wording for payment, preparation,
 * opening and delivery — never "Completed" for all four.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Waiting for payment",
  paid: "Payment confirmed",
  awaiting_recipient_details: "Waiting for the recipient's address",
  awaiting_vendor_acceptance: "Waiting for the vendor to accept",
  accepted: "Vendor accepted",
  preparing: "Vendor preparing your gift",
  ready_for_dispatch: "Ready for dispatch",
  dispatched: "On its way",
  delivered: "Delivered",
  declined: "Vendor couldn't fulfil",
  cancelled: "Cancelled",
  delivery_issue: "Delivery needs attention",
  disputed: "Under review by support",
  payment_expired: "Payment not completed",
}

export const ORDER_STATUS_LABEL_SELF: Partial<Record<OrderStatus, string>> = {
  preparing: "Vendor preparing your order",
  awaiting_recipient_details: "Waiting for delivery details",
}

export type StatusTone = "neutral" | "progress" | "success" | "warning" | "danger"

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  awaiting_payment: "neutral",
  paid: "progress",
  awaiting_recipient_details: "warning",
  awaiting_vendor_acceptance: "progress",
  accepted: "progress",
  preparing: "progress",
  ready_for_dispatch: "progress",
  dispatched: "progress",
  delivered: "success",
  declined: "danger",
  cancelled: "neutral",
  delivery_issue: "warning",
  disputed: "warning",
  payment_expired: "neutral",
}

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  requested: "Refund requested",
  approved: "Refund approved",
  submitted: "Refund sent to payment provider",
  completed: "Refund completed",
  failed: "Refund failed — support is retrying",
  rejected: "Refund declined",
}

export const REVEAL_STATUS_LABEL: Record<RevealStatus, string> = {
  draft: "Not scheduled",
  scheduled: "Reveal scheduled",
  available: "Reveal sent",
  opened: "Gift opened",
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  not_required: "Address provided by sender",
  pending: "Waiting for recipient's address",
  submitted: "Address received",
  needs_sender_approval: "Address outside the quoted area — needs your approval",
  declined: "Recipient declined",
  expired: "Claim window ended",
}

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  needs_information: "Needs information",
  approved: "Approved",
  rejected: "Not approved",
  suspended: "Suspended",
}

/** Statuses that represent live fulfilment work for the vendor dashboard. */
export const VENDOR_ACTIONABLE: OrderStatus[] = [
  "awaiting_vendor_acceptance",
  "accepted",
  "preparing",
  "ready_for_dispatch",
  "dispatched",
  "delivery_issue",
]

/** Ordered milestones for the buyer's progress tracker. */
export const FULFILMENT_MILESTONES: OrderStatus[] = [
  "paid",
  "awaiting_vendor_acceptance",
  "preparing",
  "dispatched",
  "delivered",
]

export function milestoneIndex(status: OrderStatus): number {
  switch (status) {
    case "awaiting_payment":
    case "payment_expired":
      return -1
    case "paid":
    case "awaiting_recipient_details":
      return 0
    case "awaiting_vendor_acceptance":
      return 1
    case "accepted":
    case "preparing":
    case "ready_for_dispatch":
      return 2
    case "dispatched":
    case "delivery_issue":
      return 3
    case "delivered":
    case "disputed":
      return 4
    default:
      return -1
  }
}

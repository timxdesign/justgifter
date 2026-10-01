/**
 * JustGifter domain model.
 * Shared verbatim by the web app (Vite) and Supabase Edge Functions (Deno), so it must stay
 * dependency-free and import siblings with explicit `.ts` extensions.
 *
 * Money is always integer minor units (kobo for NGN) with an explicit currency (PRD PAY 02).
 * Timestamps are UTC ISO strings; calendar dates are `YYYY-MM-DD` in the launch timezone.
 */

export type Iso = string
export type DateOnly = string
export type Currency = "NGN"
export type Minor = number

export type ZoneId = "lagos-island" | "lagos-mainland" | "lekki-ajah" | "abuja-central" | "port-harcourt"

export interface Zone {
  id: ZoneId
  name: string
  city: string
  state: string
  areas: string[]
}

export type OccasionId =
  | "birthday"
  | "wedding"
  | "anniversary"
  | "baby-shower"
  | "graduation"
  | "housewarming"
  | "appreciation"
  | "get-well"
  | "just-because"
  | "sympathy"

export type EventType =
  | "birthday"
  | "wedding"
  | "anniversary"
  | "baby-shower"
  | "graduation"
  | "housewarming"
  | "appreciation"
  | "remembrance"
  | "custom"

export type CategoryId =
  | "flowers"
  | "hampers"
  | "cakes"
  | "jewellery"
  | "home"
  | "kitchen"
  | "beauty"
  | "baby"
  | "plants"
  | "books"
  | "fashion"

export type InterestId =
  | "foodie"
  | "coffee-tea"
  | "wellness"
  | "fashion"
  | "reading"
  | "home-decor"
  | "cooking"
  | "gardening"
  | "music"
  | "art"
  | "sweet-tooth"
  | "minimalist"

export type Relationship =
  | "partner"
  | "parent"
  | "friend"
  | "sibling"
  | "colleague"
  | "child"
  | "client"
  | "other"

// ---------------------------------------------------------------- Vendors

export type VendorStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected"
  | "suspended"

export interface VendorZone {
  zoneId: ZoneId
  /** Delivery charge quoted to the buyer for this zone. */
  fee: Minor
  /** Extra calendar days beyond local delivery (e.g. inter-city). */
  leadDays: number
}

export interface OperatingCalendar {
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  openHour: number
  closeHour: number
  /** Orders confirmed after this local hour start preparation the next operating day. */
  cutoffHour: number
  blackoutDates: DateOnly[]
  /** Maximum orders the vendor can deliver per day. */
  dailyCapacity: number
  /** Local delivery window shown to buyers, e.g. 10–18. */
  deliveryWindow: [number, number]
}

export type FulfilmentModel = "vendor_delivery" | "courier"

export interface Vendor {
  id: string
  slug: string
  name: string
  tagline: string
  about: string
  logoInitials: string
  logoColor: string
  coverImage: string
  status: VendorStatus
  /** Only true when backed by the platform review process (STF 02). */
  verified: boolean
  zones: VendorZone[]
  operating: OperatingCalendar
  fulfilment: FulfilmentModel
  categories: CategoryId[]
  businessType: "sole_proprietor" | "limited_company" | "partnership"
  city: string
  /** Typical acceptance time in operating hours. */
  responseHours: number
  /** Operational quality signal; poor stock accuracy suppresses recommendations (§9). */
  suppressedFromRecommendations: boolean
  featured: boolean
  joinedAt: Iso
  returnPolicy: string
  deliveryPolicy: string
}

export type StorefrontStatus = "draft" | "published" | "paused"
export type StoreAccent = "tangerine" | "plum" | "sage" | "ink" | "rose" | "gold"

export interface StoreCollection {
  id: string
  name: string
  description: string
  productIds: string[]
}

export interface Storefront {
  id: string
  vendorId: string
  slug: string
  status: StorefrontStatus
  headline: string
  intro: string
  accent: StoreAccent
  layout: "grid" | "editorial"
  coverImage: string
  featuredProductIds: string[]
  collections: StoreCollection[]
  publishedAt: Iso | null
  updatedAt: Iso
  /** Previous slugs that redirect to the current one (STF 11). */
  slugHistory: string[]
}

// ---------------------------------------------------------------- Catalogue

export type ListingStatus = "draft" | "pending_review" | "active" | "rejected" | "archived"

export interface Variant {
  id: string
  productId: string
  name: string
  sku: string
  price: Minor
  compareAtPrice?: Minor
  /** Physical units on hand that are not yet committed to a paid order. */
  stock: number
}

export interface PersonalisationSpec {
  label: string
  maxLength: number
  required: boolean
  fee: Minor
  extraPrepHours: number
  helpText: string
}

export interface WrappingOption {
  id: string
  name: string
  fee: Minor
}

export interface Product {
  id: string
  vendorId: string
  slug: string
  title: string
  summary: string
  description: string
  included: string[]
  dimensions?: string
  images: string[]
  category: CategoryId
  occasions: OccasionId[]
  interests: InterestId[]
  status: ListingStatus
  variants: Variant[]
  prepHours: number
  perishable: boolean
  /** Highly customised or non-refundable items cannot be sent address-unknown (§5 scheduling rules). */
  highlyCustomised: boolean
  returnEligible: boolean
  personalisation?: PersonalisationSpec
  wrapping: WrappingOption[]
  sponsored: boolean
  /** Editorial relevance 0–1 set by merchandising, used for ranking (AI 03). */
  editorialScore: number
  createdAt: Iso
  moderationNote?: string
}

// ---------------------------------------------------------------- Orders & payments

export type OrderSource = "marketplace" | "wishlist" | "storefront"
export type PurchaseType = "gift" | "self"

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "awaiting_recipient_details"
  | "awaiting_vendor_acceptance"
  | "accepted"
  | "preparing"
  | "ready_for_dispatch"
  | "dispatched"
  | "delivered"
  | "declined"
  | "cancelled"
  | "delivery_issue"
  | "disputed"
  | "payment_expired"

export type PaymentStatus = "pending" | "successful" | "failed" | "expired"
export type RefundStatus = "requested" | "approved" | "submitted" | "completed" | "failed" | "rejected"

export interface PriceBreakdown {
  items: Minor
  wrapping: Minor
  personalisation: Minor
  delivery: Minor
  discount: Minor
  platformFee: Minor
  tax: Minor
  total: Minor
  currency: Currency
  /** True when the delivery charge is based on a zone, not a confirmed address. */
  deliveryProvisional: boolean
  taxIncludedInPrices: boolean
}

export interface OrderLine {
  productId: string
  variantId: string
  title: string
  variantName: string
  image: string
  unitPrice: Minor
  quantity: number
  personalisationText?: string
  personalisationFee: Minor
  wrappingId?: string
  wrappingName?: string
  wrappingFee: Minor
  lineTotal: Minor
}

export type DeliveryWindowKind = "requested" | "estimated" | "confirmed"

export interface DeliveryAddress {
  recipientName: string
  phone: string
  line1: string
  line2?: string
  landmark?: string
  area: string
  city: string
  state: string
  zoneId: ZoneId
  instructions?: string
}

export interface OrderDelivery {
  zoneId: ZoneId
  addressKnown: boolean
  requestedDate: DateOnly
  windowKind: DeliveryWindowKind
  windowStart: Iso
  windowEnd: Iso
  responsibleParty: FulfilmentModel
  trackingNote?: string
  attempts: number
}

export interface TimelineEntry {
  at: Iso
  status: string
  label: string
  note?: string
  actor: "system" | "buyer" | "vendor" | "recipient" | "support"
}

export interface Order {
  id: string
  reference: string
  vendorId: string
  buyerUserId: string | null
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  source: OrderSource
  storefrontId: string | null
  campaign?: string
  eventId: string | null
  wishlistItemId: string | null
  purchaseType: PurchaseType
  lines: OrderLine[]
  pricing: PriceBreakdown
  status: OrderStatus
  paymentStatus: PaymentStatus
  delivery: OrderDelivery
  giftId: string | null
  acceptBy: Iso | null
  timeline: TimelineEntry[]
  createdAt: Iso
  paidAt: Iso | null
  updatedAt: Iso
  holdId: string | null
  cancellationReason?: string
  /** Commission placeholder applied at payment; snapshot so later rate changes never rewrite history. */
  commissionBps: number
}

export interface PaymentAttempt {
  id: string
  orderId: string
  reference: string
  provider: "paystack" | "demo"
  amount: Minor
  currency: Currency
  status: PaymentStatus
  authorizationUrl: string | null
  createdAt: Iso
  verifiedAt: Iso | null
  expiresAt: Iso
}

export interface Refund {
  id: string
  orderId: string
  amount: Minor
  currency: Currency
  reason: RefundReason
  includesFees: boolean
  status: RefundStatus
  requestedBy: "buyer" | "support" | "system"
  createdAt: Iso
  updatedAt: Iso
  providerReference?: string
  note?: string
}

export type RefundReason =
  | "pre_acceptance_cancellation"
  | "vendor_declined"
  | "recipient_declined"
  | "claim_expired"
  | "out_of_stock"
  | "damaged"
  | "missing"
  | "personalisation_error"
  | "late_delivery"
  | "hold_conflict"
  | "other"

export type LedgerEntryType =
  | "charge"
  | "platform_commission"
  | "vendor_payable"
  | "refund"
  | "commission_reversal"
  | "vendor_payable_reversal"
  | "payout"
  | "adjustment"

export interface LedgerEntry {
  id: string
  orderId: string | null
  vendorId: string | null
  type: LedgerEntryType
  /** Positive amounts only; direction is implied by the entry type. */
  amount: Minor
  currency: Currency
  idempotencyKey: string
  createdAt: Iso
  memo: string
}

export type PayoutStatus = "scheduled" | "processing" | "paid" | "failed" | "on_hold"

export interface Payout {
  id: string
  vendorId: string
  amount: Minor
  currency: Currency
  status: PayoutStatus
  orderIds: string[]
  scheduledFor: DateOnly
  createdAt: Iso
}

// ---------------------------------------------------------------- Gifts

export type RevealStyle = "envelope" | "wrapped_box"
export type RevealStatus = "draft" | "scheduled" | "available" | "opened"
export type RevealAccess = "active" | "revoked" | "expired"
export type ClaimStatus = "not_required" | "pending" | "submitted" | "needs_sender_approval" | "declined" | "expired"

export interface Gift {
  id: string
  orderId: string
  recipientName: string
  recipientEmail?: string
  recipientPhone?: string
  contactMasked: string
  senderDisplayName: string
  anonymous: boolean
  message: string
  revealStyle: RevealStyle
  revealAt: Iso
  timezone: string
  revealStatus: RevealStatus
  access: RevealAccess
  claimStatus: ClaimStatus
  claimDeadline: Iso | null
  /** sha256 of the live gift token; the raw token only exists in the recipient's link. */
  tokenHash: string
  previewTokenHash: string
  notifiedAt: Iso | null
  openedAt: Iso | null
  thankYouNote?: string
  thankYouAt?: Iso
  declinedAt?: Iso
  contactStopped: boolean
  reported: boolean
  wishlistItemId: string | null
}

// ---------------------------------------------------------------- Occasions

export type EventVisibility = "public" | "unlisted" | "private"
export type EventStatus = "draft" | "published" | "closed" | "archived"
export type SectionId = "hero" | "story" | "details" | "agenda" | "wishlist" | "message"
export type PaletteId = "ivory-gold" | "blush" | "midnight" | "tangerine" | "sage" | "ink"
export type FontId = "classic-serif" | "soft-serif" | "modern-sans"
export type MotionPreset = "curtain" | "card" | "invitation" | "none"
export type Tone = "playful" | "elegant" | "calm" | "restrained"

export interface EventDesign {
  templateId: string
  templateVersion: number
  palette: PaletteId
  font: FontId
  sectionOrder: SectionId[]
  motionPreset: MotionPreset
  tone: Tone
}

export interface AgendaItem {
  time: string
  label: string
}

export interface EventContent {
  title: string
  hostDisplayName: string
  type: EventType
  date: DateOnly | null
  time: string | null
  timezone: string
  story: string
  venue: string
  showVenue: boolean
  showTime: boolean
  agenda: AgendaItem[]
  dressCode: string
  coverImage: string
  closingMessage: string
}

export type WishPriority = "must" | "love" | "nice"
export type WishlistItemStatus = "active" | "removed" | "unavailable"

export interface WishlistItem {
  id: string
  eventId: string
  productId: string
  variantId: string
  desiredQty: number
  /** Count of verified paid purchases only (WIS 05). */
  purchasedQty: number
  priority: WishPriority
  note: string
  status: WishlistItemStatus
  alternativeProductIds: string[]
  addedAt: Iso
}

export interface CoHost {
  userId: string | null
  email: string
  displayName: string
  permissions: ("edit_content" | "manage_wishlist" | "publish")[]
  status: "invited" | "accepted" | "revoked"
  invitedAt: Iso
  respondedAt: Iso | null
}

export interface OccasionEvent {
  id: string
  slug: string
  hostUserId: string
  status: EventStatus
  visibility: EventVisibility
  draft: EventContent
  draftDesign: EventDesign
  published: { content: EventContent; design: EventDesign; version: number; publishedAt: Iso } | null
  wishlist: WishlistItem[]
  /** Delivery zone shown to guests; the full address lives in a separate private record (WIS 02). */
  deliveryZoneId: ZoneId | null
  hasDeliveryAddress: boolean
  surpriseMode: boolean
  surpriseRevealDate: DateOnly | null
  inviteCodeHash: string | null
  coHosts: CoHost[]
  createdAt: Iso
  updatedAt: Iso
}

export type HoldStatus = "active" | "converted" | "released" | "expired"

export interface StockHold {
  id: string
  variantId: string
  wishlistItemId: string | null
  quantity: number
  status: HoldStatus
  expiresAt: Iso
  orderId: string | null
  createdAt: Iso
}

// ---------------------------------------------------------------- Operations

export type CaseStatus = "open" | "investigating" | "awaiting_customer" | "resolved"
export type CaseKind = "damaged" | "missing" | "late" | "wrong_item" | "personalisation_error" | "chargeback" | "general"

export interface SupportCase {
  id: string
  orderId: string | null
  vendorId: string | null
  kind: CaseKind
  status: CaseStatus
  subject: string
  description: string
  openedBy: "buyer" | "recipient" | "vendor" | "support"
  owner: string | null
  evidence: string[]
  resolution?: string
  createdAt: Iso
  updatedAt: Iso
}

export type ReportKind = "abusive_message" | "harassment" | "fraudulent_vendor" | "impersonation" | "prohibited_item" | "other"

export interface ContentReport {
  id: string
  kind: ReportKind
  targetType: "gift" | "event" | "product" | "vendor" | "storefront"
  targetId: string
  details: string
  status: "open" | "actioned" | "dismissed"
  createdAt: Iso
  decision?: string
}

export interface AuditEvent {
  id: string
  at: Iso
  actor: string
  action: string
  targetType: string
  targetId: string
  detail: string
}

export type JobKind =
  | "reveal_notification"
  | "claim_reminder"
  | "claim_expiry"
  | "hold_expiry"
  | "acceptance_timeout"
  | "notification_retry"
  | "reconciliation"

export interface ScheduledJob {
  id: string
  kind: JobKind
  runAt: Iso
  status: "queued" | "running" | "done" | "failed"
  attempts: number
  idempotencyKey: string
  payload: Record<string, string>
  lastError?: string
}

export interface VendorApplication {
  id: string
  vendorId: string
  status: VendorStatus
  submittedAt: Iso | null
  reviewer: string | null
  decisionReason: string | null
  history: { at: Iso; status: VendorStatus; by: string; reason?: string }[]
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  address: string
  payoutBank: string
  payoutAccountMasked: string
  termsAcceptedAt: Iso | null
}

export interface PlatformSettings {
  currency: Currency
  timezone: string
  /** Wishlist/stock checkout hold (WIS 04, proposed 10 minutes). */
  holdMinutes: number
  /** Address-unknown claim window (proposed 72 hours). */
  claimWindowHours: number
  /** Vendor acceptance target in operating hours (proposed 4). */
  acceptanceHours: number
  /** Placeholder commission — an open commercial decision (§19). */
  commissionBps: number
  /** Buyer-facing platform fee; 0 until a fee schedule is approved. */
  buyerFeeBps: number
  taxIncludedInPrices: boolean
  maxAdvanceDays: number
  /** Admin financial adjustments above this need a second approver (§10). */
  adjustmentApprovalThreshold: Minor
}

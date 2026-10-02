import type {
  CaseKind,
  ClaimStatus,
  CoHost,
  ContentReport,
  DateOnly,
  DeliveryAddress,
  EventContent,
  EventDesign,
  EventStatus,
  EventType,
  EventVisibility,
  Gift,
  GiftPreferences,
  Iso,
  LedgerEntry,
  LimitingConstraint,
  Minor,
  OccasionId,
  Order,
  OrderLine,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  Payout,
  PriceBreakdown,
  Product,
  PurchaseType,
  Refund,
  RefundReason,
  RevealStyle,
  ReportKind,
  ScheduledJob,
  AuditEvent,
  StoreAccent,
  StoreCollection,
  Storefront,
  SupportCase,
  Vendor,
  VendorApplication,
  VendorStatus,
  WishAvailability,
  WishPriority,
  ZoneId,
  CategoryId,
  EligibilityIssue,
  RevealStatus,
  VendorBalance,
  DeliveryFailure,
  ListingStatus,
} from "@domain/index.ts"

// ---------------------------------------------------------------- Identity

export type Role = "customer" | "vendor_owner" | "vendor_staff" | "support" | "admin"

export interface SessionUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  roles: Role[]
  vendorId: string | null
  /** Vendor owners and platform staff need MFA (identity rules, §2). */
  mfaVerified: boolean
  avatar?: string
}

export interface DemoPersona {
  id: string
  label: string
  description: string
  user: SessionUser | null
}

// ---------------------------------------------------------------- Catalogue

export interface VendorPublic {
  id: string
  slug: string
  name: string
  tagline: string
  about: string
  logoInitials: string
  logoColor: string
  coverImage: string
  verified: boolean
  status: VendorStatus
  zones: Vendor["zones"]
  operating: Vendor["operating"]
  fulfilment: Vendor["fulfilment"]
  categories: CategoryId[]
  city: string
  responseHours: number
  returnPolicy: string
  deliveryPolicy: string
  featured: boolean
  storefrontSlug: string | null
  storefrontStatus: Storefront["status"] | null
  productCount: number
}

export interface ProductCard {
  id: string
  slug: string
  title: string
  summary: string
  images: string[]
  category: CategoryId
  occasions: OccasionId[]
  vendor: { id: string; name: string; slug: string; verified: boolean }
  priceFrom: Minor
  priceTo: Minor
  inStock: boolean
  /** Truthful scarcity: only shown when sellable units ≤ 3. */
  lowStock: number | null
  sponsored: boolean
  perishable: boolean
  personalisable: boolean
  canSendWithoutAddress: boolean
  earliest: { date: DateOnly; sameDay: boolean; zoneId: ZoneId } | null
}

export type ProductSort = "relevance" | "price_asc" | "price_desc" | "earliest"

export interface ProductQuery {
  q?: string
  occasion?: OccasionId
  category?: CategoryId
  budgetMin?: Minor
  budgetMax?: Minor
  zoneId?: ZoneId
  deliverBy?: DateOnly
  vendorId?: string
  personalisable?: boolean
  inStockOnly?: boolean
  sort?: ProductSort
  page?: number
  pageSize?: number
  collectionId?: string
  ids?: string[]
}

export interface ProductPage {
  items: ProductCard[]
  total: number
  page: number
  pageSize: number
  facets: { categories: { id: CategoryId; count: number }[]; occasions: { id: OccasionId; count: number }[] }
}

export interface ProductDetail {
  product: Product
  vendor: VendorPublic
  /** Sellable units per variant after active holds (STF 06). */
  availability: Record<string, number>
  related: ProductCard[]
}

export interface DeliveryQuote {
  feasible: boolean
  reason?: DeliveryFailure
  message?: string
  earliest: DateOnly | null
  date: DateOnly | null
  windowStart: Iso | null
  windowEnd: Iso | null
  fee: Minor | null
  sameDay: boolean
  dates: DateOnly[]
  responsibleParty: Vendor["fulfilment"]
}

export interface GiftGuide {
  id: string
  title: string
  description: string
  image: string
  productIds: string[]
}

export interface HomeFeed {
  featured: ProductCard[]
  trending: ProductCard[]
  vendors: VendorPublic[]
  guides: GiftGuide[]
  stats: { vendors: number; zones: number; products: number }
}

export interface StorefrontView {
  storefront: Storefront
  vendor: VendorPublic
  products: ProductCard[]
}

export type StorefrontLookup =
  | { kind: "found"; view: StorefrontView }
  | { kind: "redirect"; slug: string }
  | { kind: "unavailable"; vendorName: string; reason: "paused" | "suspended" | "draft" }
  | { kind: "not_found" }

// ---------------------------------------------------------------- Assistant

export interface AssistantRequest {
  message?: string
  prefs?: GiftPreferences
}

export interface AssistantPick {
  product: ProductCard
  variantId: string
  explanation: string
  reasons: string[]
  totalWithDelivery: Minor | null
}

export interface AssistantResponse {
  prefs: GiftPreferences
  picks: AssistantPick[]
  limiting: LimitingConstraint
  limitingMessage: string | null
  followUps: string[]
  deliveryUncertain: boolean
  source: "ai" | "rules"
  sessionId: string
}

// ---------------------------------------------------------------- Cart & checkout

export interface CartLine {
  productId: string
  variantId: string
  quantity: number
  personalisationText?: string
  wrappingId?: string
  /** Snapshot for display only; the server always re-prices. */
  title: string
  variantName: string
  image: string
  unitPrice: Minor
  vendorId: string
  vendorName: string
  addedAt: Iso
}

export interface CheckoutRecipient {
  name: string
  email?: string
  phone?: string
}

export interface CheckoutGift {
  senderDisplayName: string
  anonymous: boolean
  message: string
  revealStyle: RevealStyle
  /** UTC instant; null means reveal immediately after payment is verified. */
  revealAt: Iso | null
  timezone: string
}

export interface CheckoutDraft {
  vendorId: string
  source: OrderSource
  storefrontId?: string | null
  campaign?: string
  eventSlug?: string
  wishlistItemId?: string
  holdId?: string
  purchaseType: PurchaseType
  lines: { productId: string; variantId: string; quantity: number; personalisationText?: string; wrappingId?: string; expectedUnitPrice?: Minor }[]
  buyer: { name: string; email: string; phone?: string }
  zoneId: ZoneId
  requestedDate: DateOnly | null
  addressKnown: boolean
  address?: DeliveryAddress
  recipient?: CheckoutRecipient
  gift?: CheckoutGift
  personalisationConfirmed?: boolean
  marketingOptIn?: boolean
}

export interface CheckoutPreview {
  ok: boolean
  issues: EligibilityIssue[]
  lines: OrderLine[]
  pricing: PriceBreakdown | null
  delivery: DeliveryQuote | null
  claimWindowHours: number
  holdExpiresAt: Iso | null
}

export interface CheckoutSession {
  orderId: string
  reference: string
  /** Hosted payment page (Paystack) or the in-app demo payment screen. */
  paymentUrl: string
  /** Lets a guest view this order without signing in; stored in session storage only. */
  orderAccessToken: string
  expiresAt: Iso
}

export interface PaymentStatusView {
  reference: string
  orderId: string
  status: PaymentStatus
  orderStatus: OrderStatus
  amount: Minor
}

// ---------------------------------------------------------------- Orders

export interface OrderSummary {
  id: string
  reference: string
  createdAt: Iso
  status: OrderStatus
  paymentStatus: PaymentStatus
  purchaseType: PurchaseType
  source: OrderSource
  total: Minor
  vendorName: string
  title: string
  image: string
  itemCount: number
  recipientName: string | null
  revealStatus: RevealStatus | null
  requestedDate: DateOnly
}

export interface OrderGiftView {
  id: string
  recipientName: string
  contactMasked: string
  senderDisplayName: string
  anonymous: boolean
  message: string
  revealStyle: RevealStyle
  revealAt: Iso
  timezone: string
  revealStatus: RevealStatus
  claimStatus: ClaimStatus
  claimDeadline: Iso | null
  openedAt: Iso | null
  thankYouNote?: string
  editable: boolean
  previewToken: string | null
}

export interface OrderDetail {
  order: Order
  vendor: Pick<VendorPublic, "id" | "name" | "slug" | "logoInitials" | "logoColor" | "returnPolicy" | "deliveryPolicy" | "fulfilment">
  gift: OrderGiftView | null
  refunds: Refund[]
  cases: SupportCase[]
  /** Address is shown only to the buyer who entered it, masked otherwise. */
  addressSummary: string | null
  eventTitle: string | null
  canCancel: boolean
  canRequestRefund: boolean
}

// ---------------------------------------------------------------- Recipient

export interface GiftEntry {
  state: "ready" | "scheduled" | "revoked" | "expired" | "declined" | "not_found"
  /** Only first name, and only when the gift isn't fully anonymous to link previews. */
  recipientFirstName: string | null
  contactMasked: string | null
  verificationRequired: boolean
  revealAt: Iso | null
  revealStyle: RevealStyle
}

export interface GiftRevealView {
  giftId: string
  preview: boolean
  recipientName: string
  senderDisplayName: string | null
  anonymous: boolean
  message: string
  revealStyle: RevealStyle
  revealStatus: RevealStatus
  openedAt: Iso | null
  item: { title: string; variantName: string; image: string; images: string[]; vendorName: string; summary: string; quantity: number; personalisationText?: string }
  claim: { status: ClaimStatus; deadline: Iso | null; zoneId: ZoneId; zoneName: string; areas: string[] }
  fulfilment: { status: OrderStatus; label: string; dispatched: boolean; delivered: boolean; window: { start: Iso; end: Iso; kind: string } | null }
  occasionTitle: string | null
  thankYouNote?: string
}

export interface GiftSession {
  token: string
  expiresAt: Iso
}

// ---------------------------------------------------------------- Events

export interface WishlistItemView {
  item: { id: string; desiredQty: number; purchasedQty: number; priority: WishPriority; note: string; status: string; variantId: string; productId: string; alternativeProductIds: string[] }
  product: ProductCard
  variantName: string
  price: Minor
  availability: WishAvailability
}

export interface EventSummary {
  id: string
  slug: string
  title: string
  type: EventType
  date: DateOnly | null
  status: EventStatus
  visibility: EventVisibility
  coverImage: string
  wishlistCount: number
  purchasedCount: number
  hasUnpublishedChanges: boolean
  updatedAt: Iso
  role: "host" | "co_host"
}

export interface HostEventDetail {
  event: {
    id: string
    slug: string
    status: EventStatus
    visibility: EventVisibility
    draft: EventContent
    draftDesign: EventDesign
    publishedVersion: number | null
    publishedAt: Iso | null
    hasUnpublishedChanges: boolean
    deliveryZoneId: ZoneId | null
    surpriseMode: boolean
    surpriseRevealDate: DateOnly | null
    coHosts: CoHost[]
    updatedAt: Iso
    createdAt: Iso
    inviteCode: string | null
  }
  wishlist: WishlistItemView[]
  /** Private: returned only to the host/authorised co-host. */
  deliveryAddress: DeliveryAddress | null
  hostEmailVerified: boolean
  shareUrl: string
}

export interface EventGiftView {
  orderId: string
  itemTitle: string | null
  image: string | null
  buyerName: string | null
  message: string | null
  status: OrderStatus
  statusLabel: string
  createdAt: Iso
  hiddenBySurprise: boolean
}

export interface PublicEventView {
  event: { id: string; slug: string; status: EventStatus; content: EventContent; design: EventDesign; deliveryZoneId: ZoneId | null; acceptingGifts: boolean; visibility: EventVisibility }
  wishlist: WishlistItemView[]
}

export type PublicEventLookup =
  | { kind: "found"; view: PublicEventView }
  | { kind: "invite_required"; title: string }
  | { kind: "unavailable" }

export interface CreateEventInput {
  type: EventType
  title: string
  hostDisplayName: string
  date: DateOnly | null
  visibility: EventVisibility
}

export interface ComposeRequest {
  tone: "playful" | "elegant" | "calm" | "restrained"
  colours?: string
  notes?: string
}

export interface ComposeResult {
  design: EventDesign
  copy: { story: string; closingMessage: string; prompts: string[] }
  source: "ai" | "rules"
  rejected: string[]
}

export interface HoldResult {
  ok: boolean
  holdId?: string
  expiresAt?: Iso
  message?: string
}

// ---------------------------------------------------------------- Vendor

export interface VendorApplicationInput {
  businessName: string
  businessType: Vendor["businessType"]
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  address: string
  city: string
  zones: ZoneId[]
  categories: CategoryId[]
  fulfilment: Vendor["fulfilment"]
  openHour: number
  closeHour: number
  days: number[]
  prepHours: number
  payoutBank: string
  payoutAccount: string
  about: string
  acceptTerms: boolean
}

export interface VendorWorkspace {
  vendor: Vendor
  storefront: Storefront | null
  application: VendorApplication | null
  role: "owner" | "staff"
}

export interface VendorOrderView {
  order: Pick<Order, "id" | "reference" | "status" | "paymentStatus" | "source" | "purchaseType" | "lines" | "pricing" | "createdAt" | "acceptBy" | "timeline" | "delivery" | "storefrontId" | "campaign">
  /** Only what's needed to fulfil: first name + masked contact, full address once accepted (§9). */
  customerLabel: string
  deliveryAddress: DeliveryAddress | null
  isGift: boolean
  giftNote: string | null
  settlement: { gross: Minor; commission: Minor; vendorPayable: Minor }
  revealHidden: boolean
}

export type VendorOrderAction = "accept" | "decline" | "start_preparing" | "mark_ready" | "dispatch" | "deliver" | "report_issue"

export interface VendorDashboard {
  vendorName: string
  status: VendorStatus
  storefrontStatus: Storefront["status"] | null
  storefrontSlug: string | null
  metrics: { needsAcceptance: number; inProgress: number; deliveredThisWeek: number; netSales30d: Minor; lowStock: number; pendingListings: number }
  actionable: VendorOrderView[]
  lowStockVariants: { productId: string; productTitle: string; variantId: string; variantName: string; stock: number }[]
  salesByDay: { date: DateOnly; net: Minor; orders: number }[]
}

export interface ProductDraftInput {
  id?: string
  title: string
  summary: string
  description: string
  category: CategoryId
  occasions: OccasionId[]
  interests: Product["interests"]
  included: string[]
  dimensions?: string
  images: string[]
  prepHours: number
  perishable: boolean
  highlyCustomised: boolean
  returnEligible: boolean
  personalisation?: Product["personalisation"]
  wrapping: Product["wrapping"]
  variants: { id?: string; name: string; sku: string; price: Minor; stock: number }[]
}

export interface VendorProductRow {
  product: Product
  sellable: Record<string, number>
  committed: number
  reserved: number
}

export interface StorefrontDraftInput {
  slug: string
  headline: string
  intro: string
  accent: StoreAccent
  layout: Storefront["layout"]
  coverImage: string
  featuredProductIds: string[]
  collections: StoreCollection[]
}

export interface StorefrontAnalytics {
  range: { from: DateOnly; to: DateOnly }
  totals: { visits: number; productViews: number; checkoutStarts: number; paidOrders: number; conversion: number; netSales: Minor }
  byDay: { date: DateOnly; visits: number; paidOrders: number; netSales: Minor }[]
  topProducts: { productId: string; title: string; views: number; orders: number }[]
  bySource: { source: OrderSource; orders: number; netSales: Minor }[]
}

export interface PayoutStatement {
  balance: VendorBalance
  payouts: Payout[]
  lines: { orderId: string; reference: string; date: Iso; gross: Minor; discount: Minor; commission: Minor; refunds: Minor; net: Minor; payoutStatus: "pending_delivery" | "in_dispute_window" | "eligible" | "paid" | "held" }[]
  bank: { name: string; accountMasked: string; pendingChange: boolean }
  disputeWindowDays: number
}

export interface StaffMember {
  id: string
  name: string
  email: string
  role: "owner" | "staff"
  scopes: ("catalogue" | "orders" | "support")[]
  status: "active" | "invited"
}

// ---------------------------------------------------------------- Admin

export interface OpsOverview {
  paidAwaitingAcceptance: number
  overdueAcceptance: number
  unresolvedClaims: number
  stuckRefunds: number
  openCases: number
  openReports: number
  pendingVendors: number
  pendingListings: number
  failedJobs: number
  unmatchedPayments: number
  holdConflicts: number
  gmv7d: Minor
  orders7d: number
  successfulGiftRate: number
}

export interface AdminOrderRow {
  order: OrderSummary
  vendorId: string
  buyerEmailMasked: string
  flags: string[]
}

export interface ReconciliationRow {
  id: string
  providerReference: string
  amount: Minor
  status: "matched" | "unmatched" | "amount_mismatch"
  orderReference: string | null
  occurredAt: Iso
  note: string
}

export interface AdminVendorRow {
  vendor: Vendor
  application: VendorApplication | null
  productCount: number
  openOrders: number
}

export type ModerationDecision = "approve" | "reject"
export type VendorDecision = "start_review" | "approve" | "reject" | "needs_information" | "suspend" | "reinstate"
export type RefundAction = "approve" | "reject" | "submit" | "mark_completed" | "mark_failed"

export interface Api {
  mode: "demo" | "supabase"

  // identity
  getSession(): Promise<SessionUser | null>
  /** `next` is where the person is heading; the sign-in email is tailored to it. */
  signInWithEmail(email: string, next?: string): Promise<{ devCode?: string }>
  verifyEmailCode(email: string, code: string): Promise<SessionUser>
  signOut(): Promise<void>
  listPersonas(): DemoPersona[]
  switchPersona(id: string): Promise<SessionUser | null>
  resetDemo(): Promise<void>

  // catalogue
  getHomeFeed(): Promise<HomeFeed>
  listProducts(q: ProductQuery): Promise<ProductPage>
  getProduct(idOrSlug: string): Promise<ProductDetail | null>
  getDeliveryQuote(input: { productId: string; variantId?: string; zoneId: ZoneId; date?: DateOnly | null; personalised?: boolean }): Promise<DeliveryQuote>
  listVendors(input?: { featured?: boolean }): Promise<VendorPublic[]>
  getStorefront(slug: string): Promise<StorefrontLookup>
  recordStoreVisit(storefrontId: string, kind: "visit" | "product_view" | "checkout_start", productId?: string): Promise<void>
  recommend(req: AssistantRequest): Promise<AssistantResponse>
  recordRecommendationFeedback(sessionId: string, productId: string, helpful: boolean): Promise<void>

  // checkout
  previewCheckout(draft: CheckoutDraft): Promise<CheckoutPreview>
  createCheckout(draft: CheckoutDraft): Promise<CheckoutSession>
  getPaymentStatus(reference: string): Promise<PaymentStatusView>
  /** Demo only: the sandbox "provider" calls this the way Paystack would call the webhook. */
  simulatePayment(reference: string, outcome: "success" | "failure" | "abandon"): Promise<void>

  // buyer orders
  requestOrderAccess(email: string): Promise<{ devCode?: string }>
  verifyOrderAccess(email: string, code: string): Promise<void>
  listMyOrders(): Promise<OrderSummary[]>
  getOrder(id: string): Promise<OrderDetail>
  updateGift(orderId: string, patch: { message?: string; senderDisplayName?: string; revealAt?: Iso | null }): Promise<void>
  respondToRevisedQuote(orderId: string, approve: boolean): Promise<void>
  cancelOrder(orderId: string, reason: string): Promise<void>
  requestRefund(orderId: string, reason: RefundReason, note: string): Promise<void>
  openCase(input: { orderId: string; kind: CaseKind; description: string }): Promise<SupportCase>

  // recipient
  getGiftEntry(token: string): Promise<GiftEntry>
  sendGiftCode(token: string): Promise<{ devCode?: string }>
  verifyGiftCode(token: string, code: string): Promise<GiftSession>
  getGiftReveal(token: string, session: string): Promise<GiftRevealView>
  getGiftPreview(previewToken: string): Promise<GiftRevealView>
  markGiftOpened(token: string, session: string): Promise<void>
  submitGiftAddress(token: string, session: string, address: DeliveryAddress): Promise<{ status: ClaimStatus; message: string }>
  declineGift(token: string, session: string, reason: string): Promise<void>
  sendThankYou(token: string, session: string, note: string): Promise<void>
  reportGift(token: string, session: string, input: { kind: ReportKind; details: string; stopContact: boolean }): Promise<void>

  // host
  listMyEvents(): Promise<EventSummary[]>
  createEvent(input: CreateEventInput): Promise<{ id: string }>
  getMyEvent(id: string): Promise<HostEventDetail>
  saveEventDraft(id: string, patch: { content?: Partial<EventContent>; design?: EventDesign }): Promise<{ updatedAt: Iso }>
  publishEvent(id: string): Promise<{ ok: boolean; errors: string[] }>
  setEventStatus(id: string, status: "draft" | "closed" | "archived" | "published"): Promise<void>
  setEventVisibility(id: string, visibility: EventVisibility): Promise<{ inviteCode: string | null }>
  setEventDeliveryAddress(id: string, address: DeliveryAddress): Promise<void>
  setSurpriseMode(id: string, enabled: boolean, revealDate: DateOnly | null): Promise<void>
  addWishlistItem(eventId: string, input: { productId: string; variantId: string; desiredQty: number; priority: WishPriority; note: string }): Promise<void>
  updateWishlistItem(eventId: string, itemId: string, patch: { desiredQty?: number; priority?: WishPriority; note?: string; variantId?: string }): Promise<void>
  removeWishlistItem(eventId: string, itemId: string): Promise<{ hadActiveOrders: boolean }>
  composeEvent(eventId: string, req: ComposeRequest): Promise<ComposeResult>
  getEventGifts(eventId: string): Promise<EventGiftView[]>
  inviteCoHost(eventId: string, input: { email: string; displayName: string; permissions: CoHost["permissions"] }): Promise<void>
  revokeCoHost(eventId: string, email: string): Promise<void>

  // occasion visitors
  getPublicEvent(slug: string, inviteCode?: string): Promise<PublicEventLookup>
  holdWishlistItem(slug: string, itemId: string, quantity: number): Promise<HoldResult>
  releaseHold(holdId: string): Promise<void>

  // vendor
  submitVendorApplication(input: VendorApplicationInput): Promise<{ vendorId: string }>
  getVendorWorkspace(): Promise<VendorWorkspace | null>
  getVendorDashboard(): Promise<VendorDashboard>
  listVendorOrders(filter: { source?: OrderSource; purchaseType?: PurchaseType; status?: "actionable" | "completed" | "all" }): Promise<VendorOrderView[]>
  getVendorOrder(id: string): Promise<VendorOrderView>
  vendorOrderAction(id: string, action: VendorOrderAction, note?: string): Promise<void>
  listVendorProducts(): Promise<VendorProductRow[]>
  saveVendorProduct(input: ProductDraftInput): Promise<{ id: string; status: ListingStatus; needsReview: boolean }>
  updateStock(productId: string, variantId: string, stock: number): Promise<void>
  archiveProduct(productId: string): Promise<void>
  saveStorefront(input: StorefrontDraftInput): Promise<{ slugChanged: boolean }>
  setStorefrontStatus(status: "published" | "paused"): Promise<void>
  getStorefrontAnalytics(days: number): Promise<StorefrontAnalytics>
  getPayoutStatement(): Promise<PayoutStatement>
  requestBankChange(input: { bank: string; account: string; code: string }): Promise<void>
  listStaff(): Promise<StaffMember[]>
  inviteStaff(input: { name: string; email: string; scopes: StaffMember["scopes"] }): Promise<void>
  removeStaff(id: string): Promise<void>
  /** Stores an already re-encoded image (see lib/images.ts) and returns its public URL. */
  uploadMedia(blob: Blob, purpose: "product" | "storefront"): Promise<string>
  updateVendorSettings(input: { blackoutDates: DateOnly[]; dailyCapacity: number; cutoffHour: number; openHour: number; closeHour: number; days: number[] }): Promise<void>

  // platform operations
  getOpsOverview(): Promise<OpsOverview>
  listVendorsForReview(): Promise<AdminVendorRow[]>
  reviewVendor(vendorId: string, decision: VendorDecision, reason: string): Promise<void>
  listModerationQueue(): Promise<(Product & { vendorName: string })[]>
  moderateListing(productId: string, decision: ModerationDecision, note: string): Promise<void>
  listAllOrders(filter: { q?: string; status?: OrderStatus | "exceptions" }): Promise<AdminOrderRow[]>
  getAdminOrder(id: string): Promise<OrderDetail & { buyerEmailMasked: string; ledger: LedgerEntry[]; gift: (OrderGiftView & { tokenIssued: boolean }) | null }>
  adminOrderAction(id: string, action: "cancel_and_refund" | "mark_delivery_issue" | "resolve_delivered" | "extend_claim", note: string): Promise<void>
  listRefunds(): Promise<(Refund & { orderReference: string })[]>
  refundAction(refundId: string, action: RefundAction, note: string): Promise<void>
  listCases(): Promise<(SupportCase & { orderReference: string | null })[]>
  updateCase(id: string, patch: { status?: SupportCase["status"]; resolution?: string; owner?: string }): Promise<void>
  listReconciliation(): Promise<ReconciliationRow[]>
  listReports(): Promise<ContentReport[]>
  actionReport(id: string, decision: "actioned" | "dismissed", note: string): Promise<void>
  listAuditLog(): Promise<AuditEvent[]>
  listJobs(): Promise<ScheduledJob[]>
  retryJob(id: string): Promise<void>
  runDueJobs(): Promise<{ processed: number }>
  listStorefrontsForModeration(): Promise<(Storefront & { vendorName: string; vendorStatus: VendorStatus })[]>
  setStorefrontModeration(storefrontId: string, action: "unpublish" | "restore", reason: string): Promise<void>
}

export type { Gift, Order, OrderLine, PriceBreakdown }

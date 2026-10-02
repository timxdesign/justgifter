import type {
  AuditEvent,
  ContentReport,
  DeliveryAddress,
  Gift,
  LedgerEntry,
  OccasionEvent,
  Order,
  PaymentAttempt,
  Payout,
  PlatformSettings,
  Product,
  Refund,
  ScheduledJob,
  StockHold,
  Storefront,
  SupportCase,
  Vendor,
  VendorApplication,
  JobKind,
  Iso,
} from "@domain/index.ts"
import { DEFAULT_SETTINGS, uid } from "@domain/index.ts"
import type { ReconciliationRow, Role, StaffMember, TeamInvite } from "../types"
import { ApiError } from "../errors"

/**
 * In-browser stand-in for the Supabase database used when no backend is configured.
 * It persists to localStorage so a demo survives reloads, and every response is cloned so
 * the UI can never mutate "server" state by accident.
 */

export interface DemoUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  roles: Role[]
  vendorId: string | null
  avatar?: string
}

export interface OutboxMessage {
  id: string
  at: Iso
  channel: "email"
  to: string
  subject: string
  body: string
  /** Primary call to action, e.g. a gift link. */
  link?: { label: string; href: string }
  kind: "receipt" | "gift_reveal" | "claim_reminder" | "vendor_new_order" | "otp" | "status" | "host" | "refund" | "ops" | "team_invite"
  /** Provider acceptance only — never treated as confirmed inbox delivery (§14 Zoho requirements). */
  status: "accepted" | "failed"
}

export interface OtpRecord {
  key: string
  code: string
  expiresAt: Iso
  attempts: number
}

export interface AnalyticsEvent {
  storefrontId: string
  vendorId: string
  at: Iso
  kind: "visit" | "product_view" | "checkout_start"
  productId?: string
}

export interface DemoDb {
  version: number
  settings: PlatformSettings
  vendors: Vendor[]
  storefronts: Storefront[]
  products: Product[]
  users: DemoUser[]
  sessionUserId: string | null
  guestAccessEmails: string[]
  orderAccessTokens: Record<string, string>
  orders: Order[]
  orderAddresses: Record<string, DeliveryAddress>
  payments: PaymentAttempt[]
  processedWebhookIds: string[]
  gifts: Gift[]
  giftSessions: Record<string, { giftId: string; expiresAt: Iso }>
  previewTokens: Record<string, string>
  events: OccasionEvent[]
  eventAddresses: Record<string, DeliveryAddress>
  holds: StockHold[]
  refunds: Refund[]
  ledger: LedgerEntry[]
  payouts: Payout[]
  cases: SupportCase[]
  reports: ContentReport[]
  audit: AuditEvent[]
  jobs: ScheduledJob[]
  applications: VendorApplication[]
  staff: (StaffMember & { vendorId: string })[]
  analytics: AnalyticsEvent[]
  outbox: OutboxMessage[]
  otps: OtpRecord[]
  reconciliation: ReconciliationRow[]
  recommendationFeedback: { sessionId: string; productId: string; helpful: boolean; at: Iso }[]
  pendingBankChanges: Record<string, { bank: string; accountMasked: string; requestedAt: Iso }>
  blockedContacts: string[]
  /** Address-unknown gifts whose final address falls outside the quoted zone (§3). */
  revisedQuotes: Record<string, { zoneId: import("@domain/index.ts").ZoneId; fee: number | null; address: DeliveryAddress }>
  platformInvites: (TeamInvite & { status: "pending" | "accepted" | "revoked" })[]
}

export const DB_VERSION = 9
const STORAGE_KEY = "jg-demo-db"

function loadDb(): DemoDb | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoDb
    return parsed.version === DB_VERSION ? parsed : null
  } catch {
    return null
  }
}

export class Store {
  private listeners = new Set<() => void>()

  constructor(
    public db: DemoDb,
    private opts: { ephemeral?: boolean; reseed?: () => Promise<DemoDb> } = {},
  ) {}

  /** Loads the persisted demo database, or builds a fresh one from the seed flows. */
  static async open(reseed: () => Promise<DemoDb>): Promise<Store> {
    const store = new Store(loadDb() ?? (await reseed()), { reseed })
    store.persist()
    return store
  }

  persist() {
    if (this.opts.ephemeral) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db))
    } catch {
      /* storage full or unavailable: the demo continues in memory */
    }
    this.listeners.forEach((l) => l())
  }

  async reset() {
    if (!this.opts.reseed) return
    this.db = await this.opts.reseed()
    this.persist()
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  now() {
    return new Date()
  }

  nowIso() {
    return new Date().toISOString()
  }

  user(): DemoUser | null {
    return this.db.users.find((u) => u.id === this.db.sessionUserId) ?? null
  }

  requireUser(): DemoUser {
    const u = this.user()
    if (!u) throw new ApiError("unauthorised", "Sign in to continue.")
    return u
  }

  requireRole(...roles: Role[]): DemoUser {
    const u = this.requireUser()
    if (!roles.some((r) => u.roles.includes(r))) {
      this.audit(u.email, "access_denied", "role", roles.join(","), "Attempted access without the required role")
      throw new ApiError("forbidden", "You don't have access to this area.")
    }
    return u
  }

  requireVendor(): { user: DemoUser; vendor: Vendor } {
    const user = this.requireRole("vendor_owner", "vendor_staff")
    const vendor = this.db.vendors.find((v) => v.id === user.vendorId)
    if (!vendor) throw new ApiError("forbidden", "Your account isn't linked to a vendor.")
    return { user, vendor }
  }

  audit(actor: string, action: string, targetType: string, targetId: string, detail: string) {
    this.db.audit.unshift({ id: uid("aud"), at: this.nowIso(), actor, action, targetType, targetId, detail })
    if (this.db.audit.length > 400) this.db.audit.length = 400
  }

  notify(msg: Omit<OutboxMessage, "id" | "at" | "status" | "channel">) {
    const blocked = this.db.blockedContacts.includes(msg.to.toLowerCase())
    this.db.outbox.unshift({ ...msg, id: uid("msg"), at: this.nowIso(), channel: "email", status: blocked ? "failed" : "accepted" })
    if (this.db.outbox.length > 200) this.db.outbox.length = 200
  }

  enqueue(kind: JobKind, runAt: Iso, idempotencyKey: string, payload: Record<string, string>) {
    if (this.db.jobs.some((j) => j.idempotencyKey === idempotencyKey)) return
    this.db.jobs.push({ id: uid("job"), kind, runAt, status: "queued", attempts: 0, idempotencyKey, payload })
  }
}

export const emptyDb = (): DemoDb => ({
  version: DB_VERSION,
  settings: DEFAULT_SETTINGS,
  vendors: [],
  storefronts: [],
  products: [],
  users: [],
  sessionUserId: null,
  guestAccessEmails: [],
  orderAccessTokens: {},
  orders: [],
  orderAddresses: {},
  payments: [],
  processedWebhookIds: [],
  gifts: [],
  giftSessions: {},
  previewTokens: {},
  events: [],
  eventAddresses: {},
  holds: [],
  refunds: [],
  ledger: [],
  payouts: [],
  cases: [],
  reports: [],
  audit: [],
  jobs: [],
  applications: [],
  staff: [],
  analytics: [],
  outbox: [],
  otps: [],
  reconciliation: [],
  recommendationFeedback: [],
  pendingBankChanges: {},
  blockedContacts: [],
  revisedQuotes: {},
  platformInvites: [],
})

export const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v))

/** Simulated network latency keeps loading states honest in demos. */
export const latency = (ms = 180 + Math.random() * 220) => new Promise((r) => setTimeout(r, ms))

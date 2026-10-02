import {
  assertTransition,
  addHours,
  REFUND_TRANSITIONS,
  VENDOR_TRANSITIONS,
  maskContact,
  LAUNCH_TIMEZONE,
  toDateOnly,
  addDays,
  uid,
} from "@domain/index.ts"
import type { Api, AdminOrderRow, OpsOverview, PlatformRole, Role } from "../types"
import { ApiError } from "../errors"
import { clone, latency, type Store } from "./store"
import { orderSummary } from "./views"
import { cancelWithRefund, completeRefund, runDueJobs, timeline, transition } from "./commerce"
import { giftView, orderDetail } from "./api-orders"

export function adminApi(s: Store): Pick<Api,
  | "getOpsOverview" | "listVendorsForReview" | "reviewVendor" | "listModerationQueue" | "moderateListing" | "listAllOrders" | "getAdminOrder" | "adminOrderAction"
  | "listRefunds" | "refundAction" | "listCases" | "updateCase" | "listReconciliation" | "listReports" | "actionReport" | "listAuditLog" | "listJobs" | "retryJob" | "runDueJobs"
  | "listStorefrontsForModeration" | "setStorefrontModeration" | "listTeam" | "inviteTeamMember" | "revokeTeamInvite" | "setTeamRole"
> {
  const staff = () => s.requireRole("admin", "support")
  const admin = () => s.requireRole("admin")

  const flagsFor = (id: string) => {
    const o = s.db.orders.find((x) => x.id === id)!
    const flags: string[] = []
    if (o.status === "awaiting_vendor_acceptance" && o.acceptBy && new Date(o.acceptBy) < s.now()) flags.push("Acceptance overdue")
    if (o.status === "delivery_issue") flags.push("Delivery issue")
    if (o.status === "awaiting_recipient_details") flags.push("Awaiting claim")
    if (s.db.cases.some((c) => c.orderId === o.id && c.status !== "resolved")) flags.push("Open case")
    if (s.db.refunds.some((r) => r.orderId === o.id && ["requested", "approved", "submitted", "failed"].includes(r.status))) flags.push("Refund in progress")
    const gift = o.giftId ? s.db.gifts.find((g) => g.id === o.giftId) : null
    if (gift?.claimStatus === "needs_sender_approval") flags.push("Out-of-zone address")
    return flags
  }

  return {
    async getOpsOverview() {
      await latency(200)
      staff()
      await runDueJobs(s)
      const now = s.now()
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
      const paid = s.db.orders.filter((o) => o.paymentStatus === "successful")
      const recent = paid.filter((o) => new Date(o.createdAt) >= weekAgo)
      const giftOrders = paid.filter((o) => o.purchaseType === "gift" && ["delivered", "cancelled", "declined"].includes(o.status))
      const successful = giftOrders.filter((o) => o.status === "delivered" && !s.db.refunds.some((r) => r.orderId === o.id && r.status === "completed"))
      const overview: OpsOverview = {
        paidAwaitingAcceptance: paid.filter((o) => o.status === "awaiting_vendor_acceptance").length,
        overdueAcceptance: paid.filter((o) => o.status === "awaiting_vendor_acceptance" && o.acceptBy && new Date(o.acceptBy) < now).length,
        unresolvedClaims: s.db.gifts.filter((g) => g.claimStatus === "pending" || g.claimStatus === "needs_sender_approval").length,
        stuckRefunds: s.db.refunds.filter((r) => ["requested", "approved", "submitted", "failed"].includes(r.status)).length,
        openCases: s.db.cases.filter((c) => c.status !== "resolved").length,
        openReports: s.db.reports.filter((r) => r.status === "open").length,
        pendingVendors: s.db.vendors.filter((v) => ["submitted", "under_review", "needs_information"].includes(v.status)).length,
        pendingListings: s.db.products.filter((p) => p.status === "pending_review").length,
        failedJobs: s.db.jobs.filter((j) => j.status === "failed").length,
        unmatchedPayments: s.db.reconciliation.filter((r) => r.status !== "matched").length,
        holdConflicts: s.db.cases.filter((c) => c.subject.startsWith("Late payment conflict") && c.status !== "resolved").length,
        gmv7d: recent.reduce((n, o) => n + o.pricing.total, 0),
        orders7d: recent.length,
        successfulGiftRate: giftOrders.length ? successful.length / giftOrders.length : 1,
      }
      return overview
    },

    async listVendorsForReview() {
      await latency(180)
      staff()
      return clone(
        s.db.vendors
          .map((vendor) => ({
            vendor,
            application: s.db.applications.find((a) => a.vendorId === vendor.id) ?? null,
            productCount: s.db.products.filter((p) => p.vendorId === vendor.id && p.status === "active").length,
            openOrders: s.db.orders.filter((o) => o.vendorId === vendor.id && ["awaiting_vendor_acceptance", "accepted", "preparing", "ready_for_dispatch", "dispatched", "delivery_issue"].includes(o.status)).length,
          }))
          .sort((a, b) => statusRank(a.vendor.status) - statusRank(b.vendor.status)),
      )
    },

    async reviewVendor(vendorId, decision, reason) {
      await latency(400)
      const u = admin()
      const vendor = s.db.vendors.find((v) => v.id === vendorId)
      const app = s.db.applications.find((a) => a.vendorId === vendorId)
      if (!vendor) throw new ApiError("not_found", "Vendor not found.")
      if (["reject", "needs_information", "suspend"].includes(decision) && !reason.trim()) throw new ApiError("validation", "Add a reason — it's recorded and sent to the vendor.")
      const target = ({ start_review: "under_review", approve: "approved", reject: "rejected", needs_information: "needs_information", suspend: "suspended", reinstate: "approved" } as const)[decision]
      assertTransition(VENDOR_TRANSITIONS, vendor.status, target, "vendor")
      vendor.status = target
      if (target === "approved") vendor.verified = true
      if (app) {
        app.status = target
        app.reviewer = u.name
        app.decisionReason = reason || null
        app.history.push({ at: s.nowIso(), status: target, by: u.name, reason: reason || undefined })
      }
      if (target === "approved" && !s.db.storefronts.some((x) => x.vendorId === vendor.id)) {
        s.db.storefronts.push({ id: `stf_${vendor.id}`, vendorId: vendor.id, slug: vendor.slug, status: "draft", headline: vendor.tagline || vendor.name, intro: vendor.about, accent: "ink", layout: "grid", coverImage: vendor.coverImage, featuredProductIds: [], collections: [], publishedAt: null, updatedAt: s.nowIso(), slugHistory: [] })
      }
      // Suspension blocks new purchases everywhere but keeps existing orders supportable (STF 10, AC 20).
      const owner = s.db.users.find((x) => x.vendorId === vendor.id && x.roles.includes("vendor_owner"))
      if (owner) s.notify({ to: owner.email, kind: "status", subject: `Your JustGifter application: ${target.replace("_", " ")}`, body: reason || "No further action needed." })
      s.audit(u.email, `vendor.${decision}`, "vendor", vendor.id, reason)
      s.persist()
    },

    async listModerationQueue() {
      await latency(160)
      staff()
      return clone(s.db.products.filter((p) => p.status === "pending_review").map((p) => ({ ...p, vendorName: s.db.vendors.find((v) => v.id === p.vendorId)?.name ?? "" })))
    },

    async moderateListing(productId, decision, note) {
      await latency(300)
      const u = staff()
      const p = s.db.products.find((x) => x.id === productId)
      if (!p) throw new ApiError("not_found", "Listing not found.")
      if (decision === "reject" && !note.trim()) throw new ApiError("validation", "Tell the vendor what to change.")
      p.status = decision === "approve" ? "active" : "rejected"
      p.moderationNote = note || undefined
      const owner = s.db.users.find((x) => x.vendorId === p.vendorId && x.roles.includes("vendor_owner"))
      if (owner) s.notify({ to: owner.email, kind: "status", subject: `${p.title}: ${decision === "approve" ? "approved" : "changes needed"}`, body: note || "It's now live in your store and the marketplace." })
      s.audit(u.email, `listing.${decision}`, "product", p.id, note)
      s.persist()
    },

    async listAllOrders(filter) {
      await latency(180)
      staff()
      let orders = s.db.orders.filter((o) => o.status !== "payment_expired")
      if (filter.q) {
        const q = filter.q.toLowerCase()
        orders = orders.filter((o) => o.reference.toLowerCase().includes(q) || o.buyerEmail.includes(q) || o.lines.some((l) => l.title.toLowerCase().includes(q)))
      }
      if (filter.status === "exceptions") orders = orders.filter((o) => flagsFor(o.id).length > 0)
      else if (filter.status) orders = orders.filter((o) => o.status === filter.status)
      const rows: AdminOrderRow[] = orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => ({ order: orderSummary(s, o), vendorId: o.vendorId, buyerEmailMasked: maskContact(o.buyerEmail), flags: flagsFor(o.id) }))
      return clone(rows)
    },

    async getAdminOrder(id) {
      await latency(160)
      const u = staff()
      const o = s.db.orders.find((x) => x.id === id)
      if (!o) throw new ApiError("not_found", "Order not found.")
      s.audit(u.email, "order.view", "order", o.id, "Support viewed order (address masked)")
      const detail = orderDetail(s, o, { revealAddress: false })
      const gift = o.giftId ? s.db.gifts.find((g) => g.id === o.giftId) : null
      return clone({ ...detail, buyerEmailMasked: maskContact(o.buyerEmail), ledger: s.db.ledger.filter((l) => l.orderId === o.id), gift: gift ? { ...giftView(s, gift, o), previewToken: null, tokenIssued: Boolean(gift.tokenHash) } : null })
    },

    async adminOrderAction(id, action, note) {
      await latency(400)
      const u = staff()
      const o = s.db.orders.find((x) => x.id === id)
      if (!o) throw new ApiError("not_found", "Order not found.")
      if (!note.trim()) throw new ApiError("validation", "Add a note — support actions are audited.")
      switch (action) {
        case "cancel_and_refund":
          if (["dispatched", "delivered"].includes(o.status)) throw new ApiError("conflict", "This order has been dispatched. Use a refund instead of cancellation.")
          cancelWithRefund(s, o, "other", "support", note)
          break
        case "mark_delivery_issue":
          transition(s, o, "delivery_issue", "support", note)
          break
        case "resolve_delivered":
          transition(s, o, "delivered", "support", note)
          break
        case "extend_claim": {
          const g = s.db.gifts.find((x) => x.id === o.giftId)
          if (!g || g.claimStatus !== "pending" || !g.claimDeadline) throw new ApiError("conflict", "There's no open claim to extend.")
          g.claimDeadline = addHours(g.claimDeadline, 48)
          const job = s.db.jobs.find((j) => j.idempotencyKey === `claim-expiry:${g.id}`)
          if (job) job.runAt = g.claimDeadline
          timeline(o, "claim_extended", "Claim window extended by 48 hours", "support", note)
          break
        }
      }
      s.audit(u.email, `order.${action}`, "order", o.id, note)
      s.persist()
    },

    async listRefunds() {
      await latency(150)
      staff()
      return clone(s.db.refunds.map((r) => ({ ...r, orderReference: s.db.orders.find((o) => o.id === r.orderId)?.reference ?? "—" })))
    },

    async refundAction(refundId, action, note) {
      await latency(400)
      const u = staff()
      const r = s.db.refunds.find((x) => x.id === refundId)
      if (!r) throw new ApiError("not_found", "Refund not found.")
      // §10: adjustments above the threshold need approval from someone other than the requester.
      if (action === "approve" && r.amount > s.db.settings.adjustmentApprovalThreshold && !u.roles.includes("admin")) throw new ApiError("forbidden", "Refunds above the approval threshold need an administrator.")
      const target = ({ approve: "approved", reject: "rejected", submit: "submitted", mark_completed: "completed", mark_failed: "failed" } as const)[action]
      assertTransition(REFUND_TRANSITIONS, r.status, target, "refund")
      if (target === "completed") completeRefund(s, r)
      else {
        r.status = target
        r.updatedAt = s.nowIso()
        if (target === "submitted") r.providerReference = r.providerReference ?? `RF-${r.id.slice(-6).toUpperCase()}`
      }
      r.note = note || r.note
      s.audit(u.email, `refund.${action}`, "refund", r.id, note)
      s.persist()
    },

    async listCases() {
      await latency(150)
      staff()
      return clone(s.db.cases.map((c) => ({ ...c, orderReference: c.orderId ? s.db.orders.find((o) => o.id === c.orderId)?.reference ?? null : null })))
    },

    async updateCase(id, patch) {
      await latency(250)
      const u = staff()
      const c = s.db.cases.find((x) => x.id === id)
      if (!c) throw new ApiError("not_found", "Case not found.")
      if (patch.status === "resolved" && !(patch.resolution ?? c.resolution)?.trim()) throw new ApiError("validation", "Record the resolution before closing the case.")
      Object.assign(c, patch, { updatedAt: s.nowIso() })
      s.audit(u.email, "case.update", "case", c.id, JSON.stringify(patch))
      s.persist()
    },

    async listReconciliation() {
      await latency(150)
      admin()
      return clone(s.db.reconciliation)
    },

    async listReports() {
      await latency(150)
      staff()
      return clone(s.db.reports)
    },

    async actionReport(id, decision, note) {
      await latency(250)
      const u = staff()
      const r = s.db.reports.find((x) => x.id === id)
      if (!r) throw new ApiError("not_found", "Report not found.")
      if (!note.trim()) throw new ApiError("validation", "Record the decision so it can be reviewed on appeal.")
      r.status = decision
      r.decision = note
      if (decision === "actioned" && r.targetType === "product") {
        const p = s.db.products.find((x) => x.id === r.targetId)
        if (p) p.status = "rejected"
      }
      if (decision === "actioned" && r.targetType === "gift") {
        const g = s.db.gifts.find((x) => x.id === r.targetId)
        if (g) g.contactStopped = true
      }
      s.audit(u.email, `report.${decision}`, r.targetType, r.targetId, note)
      s.persist()
    },

    async listAuditLog() {
      await latency(150)
      admin()
      return clone(s.db.audit.slice(0, 200))
    },

    async listJobs() {
      await latency(150)
      staff()
      return clone([...s.db.jobs].sort((a, b) => (a.status === "failed" ? -1 : b.status === "failed" ? 1 : b.runAt.localeCompare(a.runAt))).slice(0, 100))
    },

    async retryJob(id) {
      const u = staff()
      const j = s.db.jobs.find((x) => x.id === id)
      if (!j) throw new ApiError("not_found", "Job not found.")
      j.status = "queued"
      j.attempts = 0
      j.runAt = s.nowIso()
      j.lastError = undefined
      s.audit(u.email, "job.retry", "job", j.id, j.kind)
      if (j.kind === "notification_retry") j.status = "done"
      await runDueJobs(s)
      s.persist()
    },

    async runDueJobs() {
      return { processed: await runDueJobs(s) }
    },

    async listStorefrontsForModeration() {
      await latency(150)
      staff()
      return clone(s.db.storefronts.map((sf) => {
        const v = s.db.vendors.find((x) => x.id === sf.vendorId)!
        return { ...sf, vendorName: v.name, vendorStatus: v.status }
      }))
    },

    async setStorefrontModeration(storefrontId, action, reason) {
      await latency(300)
      const u = admin()
      const sf = s.db.storefronts.find((x) => x.id === storefrontId)
      if (!sf) throw new ApiError("not_found", "Storefront not found.")
      if (!reason.trim()) throw new ApiError("validation", "Add a reason.")
      sf.status = action === "unpublish" ? "paused" : "published"
      s.audit(u.email, `storefront.${action}`, "storefront", sf.id, reason)
      s.persist()
    },

    async listTeam() {
      await latency(150)
      const u = admin()
      const now = s.nowIso()
      const members = s.db.users
        .filter((x) => platformRoleOf(x.roles))
        .map((x) => ({ userId: x.id, name: x.name, email: x.email, role: platformRoleOf(x.roles)!, mfaEnrolled: true, isYou: x.id === u.id }))
        .sort((a, b) => Number(b.isYou) - Number(a.isYou) || (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1))
      const invites = s.db.platformInvites.filter((i) => i.status === "pending" && i.expiresAt > now).map(({ status: _, ...i }) => i)
      return clone({ members, invites })
    },

    async inviteTeamMember({ email: raw, role, note }) {
      await latency(300)
      const u = admin()
      const email = raw.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("validation", "Enter a valid email address.")
      if (role !== "admin" && role !== "support") throw new ApiError("validation", "Choose Admin or Support.")
      const current = platformRoleOf(s.db.users.find((x) => x.email === email)?.roles ?? [])
      if (current === "admin" || current === role) throw new ApiError("conflict", `${email} already has ${current} access.`)
      s.db.platformInvites.forEach((i) => { if (i.email === email && i.status === "pending") i.status = "revoked" })
      const id = uid("inv")
      s.db.platformInvites.unshift({ id, email, role, invitedBy: u.email, note: note?.trim() || undefined, createdAt: s.nowIso(), expiresAt: addHours(s.nowIso(), 7 * 24), status: "pending" })
      s.notify({ to: email, kind: "team_invite", subject: `${u.name} invited you to the JustGifter ${role} team`, body: "Sign in with this email address to accept. You'll set up two-step sign-in first.", link: { label: "Accept invitation", href: "/signin?next=/admin" } })
      s.audit(u.email, "team.invited", "invite", id, `${email} as ${role}`)
      s.persist()
    },

    async revokeTeamInvite(inviteId) {
      await latency(200)
      const u = admin()
      const inv = s.db.platformInvites.find((i) => i.id === inviteId && i.status === "pending")
      if (!inv) throw new ApiError("not_found", "That invitation was already used or cancelled.")
      inv.status = "revoked"
      s.audit(u.email, "team.invite_revoked", "invite", inv.id, `${inv.email} (${inv.role})`)
      s.persist()
    },

    async setTeamRole(userId, role, reason) {
      await latency(300)
      const u = admin()
      if (!reason.trim()) throw new ApiError("validation", "Add a reason.")
      if (userId === u.id) throw new ApiError("forbidden", "You can't change your own access. Ask another admin.")
      const target = s.db.users.find((x) => x.id === userId)
      if (!target || !platformRoleOf(target.roles)) throw new ApiError("not_found", "That person isn't on the team.")
      const before = platformRoleOf(target.roles)
      target.roles = withPlatformRole(target.roles, role)
      s.audit(u.email, role === "none" ? "team.removed" : "team.role_changed", "user", userId, `${target.email}: ${before} → ${role}. ${reason}`)
      s.persist()
    },
  }
}

export const platformRoleOf = (roles: Role[]): PlatformRole | null => (roles.includes("admin") ? "admin" : roles.includes("support") ? "support" : null)

export function withPlatformRole(roles: Role[], role: PlatformRole | "none"): Role[] {
  const base = roles.filter((r) => r !== "admin" && r !== "support")
  if (!base.includes("customer")) base.unshift("customer")
  return role === "admin" ? [...base, "admin", "support"] : role === "support" ? [...base, "support"] : base
}

const statusRank = (st: string) => ["submitted", "under_review", "needs_information", "suspended", "approved", "rejected", "draft"].indexOf(st)

export const todayLagos = () => toDateOnly(new Date(), LAUNCH_TIMEZONE)
export const weekAgoLagos = () => addDays(todayLagos(), -7)

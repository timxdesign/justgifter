// deno-lint-ignore-file no-explicit-any
import { addHours, assertTransition, maskContact, REFUND_TRANSITIONS, uid, VENDOR_TRANSITIONS } from "../_shared/domain/index.ts"
import { db, must } from "../_shared/db.ts"
import { env } from "../_shared/env.ts"
import { fail } from "../_shared/http.ts"
import { requireRole } from "../_shared/auth.ts"
import { cancelWithRefund, completeRefund, runJob, submitRefund, transition } from "../_shared/commerce.ts"
import { enqueue } from "../_shared/notify.ts"
import { INVITE_DAYS, type PlatformRole, platformRoleOf, withPlatformRole } from "../_shared/team.ts"
import { audit, giftBy, orderBy, saveGift, saveOrder, settings, timelineEntry, toGift, toOrder, toStorefront, toVendor } from "../_shared/repo.ts"
import { caseView, giftView, orderDetail, orderSummary } from "../_shared/views.ts"
import type { Handler } from "./context.ts"
import { str } from "./context.ts"

const staff = (c: any) => requireRole(c, "admin", "support")
const adminOnly = (c: any) => requireRole(c, "admin")
const OPEN = ["awaiting_vendor_acceptance", "accepted", "preparing", "ready_for_dispatch", "dispatched", "delivery_issue"]

async function flagsFor(rows: any[]) {
  const ids = rows.map((r) => r.id).concat("-")
  const [cases, refunds, gifts] = await Promise.all([
    db().from("support_cases").select("order_id").in("order_id", ids).neq("status", "resolved"),
    db().from("refunds").select("order_id").in("order_id", ids).in("status", ["requested", "approved", "submitted", "failed"]),
    db().from("gifts").select("order_id, claim_status").in("order_id", ids),
  ])
  const now = new Date()
  return (r: any) => {
    const f: string[] = []
    if (r.status === "awaiting_vendor_acceptance" && r.accept_by && new Date(r.accept_by) < now) f.push("Acceptance overdue")
    if (r.status === "delivery_issue") f.push("Delivery issue")
    if (r.status === "awaiting_recipient_details") f.push("Awaiting claim")
    if ((cases.data ?? []).some((c: any) => c.order_id === r.id)) f.push("Open case")
    if ((refunds.data ?? []).some((x: any) => x.order_id === r.id)) f.push("Refund in progress")
    if ((gifts.data ?? []).some((g: any) => g.order_id === r.id && g.claim_status === "needs_sender_approval")) f.push("Out-of-zone address")
    return f
  }
}

const count = async (table: string, build: (q: any) => any) => (await build(db().from(table).select("id", { count: "exact", head: true }))).count ?? 0

export const admin: Record<string, Handler> = {
  async getOpsOverview({ caller }) {
    staff(caller)
    const now = new Date().toISOString()
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const recent = must(await db().from("orders").select("pricing").eq("payment_status", "successful").gte("created_at", week)) as any[]
    const giftDone = must(await db().from("orders").select("id,status").eq("purchase_type", "gift").eq("payment_status", "successful").in("status", ["delivered", "cancelled", "declined"])) as any[]
    const refunded = new Set((must(await db().from("refunds").select("order_id").eq("status", "completed")) as any[]).map((r) => r.order_id))
    return {
      paidAwaitingAcceptance: await count("orders", (q) => q.eq("status", "awaiting_vendor_acceptance")),
      overdueAcceptance: await count("orders", (q) => q.eq("status", "awaiting_vendor_acceptance").lt("accept_by", now)),
      unresolvedClaims: await count("gifts", (q) => q.in("claim_status", ["pending", "needs_sender_approval"])),
      stuckRefunds: await count("refunds", (q) => q.in("status", ["requested", "approved", "submitted", "failed"])),
      openCases: await count("support_cases", (q) => q.neq("status", "resolved")),
      openReports: await count("content_reports", (q) => q.eq("status", "open")),
      pendingVendors: await count("vendors", (q) => q.in("status", ["submitted", "under_review", "needs_information"])),
      pendingListings: await count("products", (q) => q.eq("status", "pending_review")),
      failedJobs: await count("jobs", (q) => q.eq("status", "failed")),
      unmatchedPayments: await count("reconciliation", (q) => q.neq("status", "matched")),
      holdConflicts: await count("support_cases", (q) => q.like("subject", "Late payment conflict%").neq("status", "resolved")),
      gmv7d: recent.reduce((n, r) => n + r.pricing.total, 0),
      orders7d: recent.length,
      successfulGiftRate: giftDone.length ? giftDone.filter((o) => o.status === "delivered" && !refunded.has(o.id)).length / giftDone.length : 1,
    }
  },

  async listVendorsForReview({ caller }) {
    staff(caller)
    const vendors = must(await db().from("vendors").select("*")) as any[]
    const apps = must(await db().from("vendor_applications").select("*")) as any[]
    const prods = must(await db().from("products").select("vendor_id").eq("status", "active")) as any[]
    const open = must(await db().from("orders").select("vendor_id").in("status", OPEN)) as any[]
    const rank = (s: string) => ["submitted", "under_review", "needs_information", "suspended", "approved", "rejected", "draft"].indexOf(s)
    return vendors.sort((a, b) => rank(a.status) - rank(b.status)).map((v) => {
      const a = apps.find((x) => x.vendor_id === v.id)
      return {
        vendor: toVendor(v), productCount: prods.filter((p) => p.vendor_id === v.id).length, openOrders: open.filter((o) => o.vendor_id === v.id).length,
        application: a ? { id: a.id, vendorId: a.vendor_id, status: a.status, submittedAt: a.submitted_at, reviewer: a.reviewer, decisionReason: a.decision_reason, history: a.history, ownerName: a.owner_name, ownerEmail: a.owner_email, ownerPhone: a.owner_phone, address: a.address, payoutBank: a.payout_bank, payoutAccountMasked: a.payout_account_masked, termsAcceptedAt: a.terms_accepted_at } : null,
      }
    })
  },

  async reviewVendor({ caller, args }) {
    const u = adminOnly(caller)
    const decision = String(args.decision)
    const reason = String(args.reason ?? "").slice(0, 500)
    const target = ({ start_review: "under_review", approve: "approved", reject: "rejected", needs_information: "needs_information", suspend: "suspended", reinstate: "approved" } as Record<string, any>)[decision]
    if (!target) throw fail("validation", "Unknown decision.")
    if (["reject", "needs_information", "suspend"].includes(decision) && !reason.trim()) throw fail("validation", "Add a reason — it's recorded and sent to the vendor.")
    const v = toVendor(must(await db().from("vendors").select("*").eq("id", str(args.vendorId, "vendor")).single()))
    assertTransition(VENDOR_TRANSITIONS, v.status, target, "vendor")
    await db().from("vendors").update({ status: target, verified: target === "approved" ? true : v.verified }).eq("id", v.id)
    const app = must(await db().from("vendor_applications").select("*").eq("vendor_id", v.id).maybeSingle()) as any
    if (app) await db().from("vendor_applications").update({ status: target, reviewer: u.name || u.email, decision_reason: reason || null, history: [...app.history, { at: new Date().toISOString(), status: target, by: u.name || u.email, reason: reason || undefined }] }).eq("id", app.id)
    if (target === "approved") await db().from("storefronts").upsert({ id: `stf_${v.id}`, vendor_id: v.id, slug: v.slug, status: "draft", headline: v.tagline || v.name, intro: v.about, cover_image: v.coverImage }, { onConflict: "vendor_id", ignoreDuplicates: true })
    if (app) await enqueue({ to: app.owner_email, kind: "status", subject: `Your JustGifter application: ${target.replace("_", " ")}`, body: reason || "No further action needed.", link: { label: "Open workspace", href: "/vendor" } })
    await audit(u.email, `vendor.${decision}`, "vendor", v.id, reason)
  },

  async listModerationQueue({ caller }) {
    staff(caller)
    const rows = must(await db().from("products").select("*, vendors!inner(name)").eq("status", "pending_review")) as any[]
    const variants = must(await db().from("variants").select("*").in("product_id", rows.map((r) => r.id).concat("-"))) as any[]
    const { toProduct } = await import("../_shared/repo.ts")
    return rows.map((r) => ({ ...toProduct(r, variants), vendorName: r.vendors.name }))
  },

  async moderateListing({ caller, args }) {
    const u = staff(caller)
    const note = String(args.note ?? "").slice(0, 500)
    if (args.decision === "reject" && !note.trim()) throw fail("validation", "Tell the vendor what to change.")
    const p = must(await db().from("products").select("id,title,vendor_id").eq("id", str(args.productId, "product")).single()) as any
    await db().from("products").update({ status: args.decision === "approve" ? "active" : "rejected", moderation_note: note || null }).eq("id", p.id)
    const owner = must(await db().from("profiles").select("email").eq("vendor_id", p.vendor_id).contains("roles", ["vendor_owner"]).maybeSingle()) as any
    if (owner) await enqueue({ to: owner.email, kind: "status", subject: `${p.title}: ${args.decision === "approve" ? "approved" : "changes needed"}`, body: note || "It's now live in your store and the marketplace." })
    await audit(u.email, `listing.${args.decision}`, "product", p.id, note)
  },

  async listAllOrders({ caller, args }) {
    staff(caller)
    let q = db().from("orders").select("*").neq("status", "payment_expired").order("created_at", { ascending: false }).limit(200)
    const f = args.filter ?? {}
    if (f.q) {
      const s = String(f.q).replace(/[^\w@.+-]/g, "").slice(0, 60)
      if (s) q = q.or(`reference.ilike.%${s}%,buyer_email.ilike.%${s}%`)
    }
    if (f.status && f.status !== "exceptions") q = q.eq("status", f.status)
    const rows = must(await q) as any[]
    const flags = await flagsFor(rows)
    const vendorNames = new Map((must(await db().from("vendors").select("id,name")) as any[]).map((v) => [v.id, v.name]))
    const gifts = must(await db().from("gifts").select("*").in("order_id", rows.map((r) => r.id).concat("-"))) as any[]
    return rows.map((r) => ({ order: orderSummary(toOrder(r), vendorNames.get(r.vendor_id) ?? "", gifts.find((g) => g.order_id === r.id) ? toGift(gifts.find((g) => g.order_id === r.id)) : null), vendorId: r.vendor_id, buyerEmailMasked: maskContact(r.buyer_email), flags: flags(r) })).filter((r) => f.status !== "exceptions" || r.flags.length)
  },

  async getAdminOrder({ caller, args }) {
    const u = staff(caller)
    const o = await orderBy("id", str(args.id, "order"))
    if (!o) throw fail("not_found", "Order not found.")
    // Support views mask contacts and addresses; access is audited (SEC 05).
    await audit(u.email, "order.view", "order", o.id, "Support viewed order (address masked)")
    const d = await orderDetail(o, { revealAddress: false, includePreview: false })
    const g = o.giftId ? await giftBy("id", o.giftId) : null
    const ledger = (must(await db().from("ledger_entries").select("*").eq("order_id", o.id)) as any[]).map((l) => ({ id: l.id, orderId: l.order_id, vendorId: l.vendor_id, type: l.type, amount: Number(l.amount), currency: l.currency, idempotencyKey: l.idempotency_key, createdAt: l.created_at, memo: l.memo }))
    return { ...d, buyerEmailMasked: maskContact(o.buyerEmail), ledger, gift: g ? { ...giftView(g, o, null), tokenIssued: Boolean(g.tokenHash) } : null }
  },

  async adminOrderAction({ caller, args }) {
    const u = staff(caller)
    const note = String(args.note ?? "").slice(0, 500)
    if (!note.trim()) throw fail("validation", "Add a note — support actions are audited.")
    const o = await orderBy("id", str(args.id, "order"))
    if (!o) throw fail("not_found", "Order not found.")
    switch (args.action) {
      case "cancel_and_refund":
        if (["dispatched", "delivered"].includes(o.status)) throw fail("conflict", "This order has been dispatched. Use a refund instead of cancellation.")
        await cancelWithRefund(o, "other", "support", note)
        break
      case "mark_delivery_issue": transition(o, "delivery_issue", "support", note); await saveOrder(o); break
      case "resolve_delivered": transition(o, "delivered", "support", note); await saveOrder(o); break
      case "extend_claim": {
        const g = o.giftId ? await giftBy("id", o.giftId) : null
        if (!g || g.claimStatus !== "pending" || !g.claimDeadline) throw fail("conflict", "There's no open claim to extend.")
        g.claimDeadline = addHours(g.claimDeadline, 48)
        await saveGift(g)
        await db().from("jobs").update({ run_at: g.claimDeadline }).eq("idempotency_key", `claim-expiry:${g.id}`)
        o.timeline = [...o.timeline, timelineEntry("claim_extended", "Claim window extended by 48 hours", "support", note)]
        await saveOrder(o)
        break
      }
      default: throw fail("validation", "Unknown action.")
    }
    await audit(u.email, `order.${args.action}`, "order", o.id, note)
  },

  async listRefunds({ caller }) {
    staff(caller)
    const rows = must(await db().from("refunds").select("*, orders!inner(reference)").order("created_at", { ascending: false }).limit(200)) as any[]
    return rows.map((r) => ({ id: r.id, orderId: r.order_id, amount: Number(r.amount), currency: r.currency, reason: r.reason, includesFees: r.includes_fees, status: r.status, requestedBy: r.requested_by, createdAt: r.created_at, updatedAt: r.updated_at, providerReference: r.provider_reference ?? undefined, note: r.note ?? undefined, orderReference: r.orders.reference }))
  },

  async refundAction({ caller, args }) {
    const u = staff(caller)
    const r = must(await db().from("refunds").select("*").eq("id", str(args.refundId, "refund")).single()) as any
    const s = await settings()
    // Approval separation above the threshold (§10).
    if (args.action === "approve" && Number(r.amount) > s.adjustmentApprovalThreshold && !u.roles.includes("admin")) throw fail("forbidden", "Refunds above the approval threshold need an administrator.")
    const target = ({ approve: "approved", reject: "rejected", submit: "submitted", mark_completed: "completed", mark_failed: "failed" } as Record<string, any>)[args.action]
    assertTransition(REFUND_TRANSITIONS, r.status, target, "refund")
    if (target === "submitted") await submitRefund(r.id)
    else if (target === "completed") await completeRefund(r.id)
    else await db().from("refunds").update({ status: target, note: args.note || r.note, updated_at: new Date().toISOString() }).eq("id", r.id)
    await audit(u.email, `refund.${args.action}`, "refund", r.id, String(args.note ?? ""))
  },

  async listCases({ caller }) {
    staff(caller)
    const rows = must(await db().from("support_cases").select("*, orders(reference)").order("created_at", { ascending: false }).limit(200)) as any[]
    return rows.map((c) => ({ ...caseView(c), orderReference: c.orders?.reference ?? null }))
  },

  async updateCase({ caller, args }) {
    const u = staff(caller)
    const p = args.patch ?? {}
    const c = must(await db().from("support_cases").select("*").eq("id", str(args.id, "case")).single()) as any
    if (p.status === "resolved" && !String(p.resolution ?? c.resolution ?? "").trim()) throw fail("validation", "Record the resolution before closing the case.")
    await db().from("support_cases").update({ ...(p.status ? { status: p.status } : {}), ...(p.owner !== undefined ? { owner: String(p.owner).slice(0, 80) } : {}), ...(p.resolution !== undefined ? { resolution: String(p.resolution).slice(0, 2000) } : {}), updated_at: new Date().toISOString() }).eq("id", c.id)
    await audit(u.email, "case.update", "case", c.id, JSON.stringify(p).slice(0, 300))
  },

  async listReconciliation({ caller }) {
    adminOnly(caller)
    return (must(await db().from("reconciliation").select("*").order("occurred_at", { ascending: false }).limit(300)) as any[]).map((r) => ({ id: r.id, providerReference: r.provider_reference, amount: Number(r.amount), status: r.status, orderReference: r.order_reference, occurredAt: r.occurred_at, note: r.note }))
  },

  async listReports({ caller }) {
    staff(caller)
    return (must(await db().from("content_reports").select("*").order("created_at", { ascending: false }).limit(200)) as any[]).map((r) => ({ id: r.id, kind: r.kind, targetType: r.target_type, targetId: r.target_id, details: r.details, status: r.status, createdAt: r.created_at, decision: r.decision ?? undefined }))
  },

  async actionReport({ caller, args }) {
    const u = staff(caller)
    const note = String(args.note ?? "").slice(0, 500)
    if (!note.trim()) throw fail("validation", "Record the decision so it can be reviewed on appeal.")
    const r = must(await db().from("content_reports").select("*").eq("id", str(args.id, "report")).single()) as any
    await db().from("content_reports").update({ status: args.decision === "actioned" ? "actioned" : "dismissed", decision: note }).eq("id", r.id)
    if (args.decision === "actioned" && r.target_type === "product") await db().from("products").update({ status: "rejected", moderation_note: note }).eq("id", r.target_id)
    if (args.decision === "actioned" && r.target_type === "gift") await db().from("gifts").update({ contact_stopped: true }).eq("id", r.target_id)
    await audit(u.email, `report.${args.decision}`, r.target_type, r.target_id, note)
  },

  async listAuditLog({ caller }) {
    adminOnly(caller)
    return (must(await db().from("audit_events").select("*").order("at", { ascending: false }).limit(200)) as any[]).map((a) => ({ id: a.id, at: a.at, actor: a.actor, action: a.action, targetType: a.target_type, targetId: a.target_id, detail: a.detail }))
  },

  async listJobs({ caller }) {
    staff(caller)
    const rows = must(await db().from("jobs").select("*").order("run_at", { ascending: false }).limit(100)) as any[]
    return rows.sort((a, b) => (a.status === "failed" ? -1 : b.status === "failed" ? 1 : 0)).map((j) => ({ id: j.id, kind: j.kind, runAt: j.run_at, status: j.status, attempts: j.attempts, idempotencyKey: j.idempotency_key, payload: j.payload, lastError: j.last_error ?? undefined }))
  },

  async retryJob({ caller, args }) {
    const u = staff(caller)
    const j = must(await db().from("jobs").select("*").eq("id", str(args.id, "job")).single()) as any
    await db().from("jobs").update({ status: "queued", attempts: 0, run_at: new Date().toISOString(), last_error: null }).eq("id", j.id)
    await audit(u.email, "job.retry", "job", j.id, j.kind)
  },

  async runDueJobs({ caller }) {
    staff(caller)
    // Manual trigger for operations; the scheduled worker does this every minute.
    const res = await fetch(`${env.supabaseUrl()}/functions/v1/jobs`, { method: "POST", headers: { "x-cron-secret": env.cronSecret() } })
    const body = await res.json().catch(() => ({ jobs: 0 }))
    return { processed: body.jobs ?? 0 }
  },

  async listStorefrontsForModeration({ caller }) {
    staff(caller)
    const rows = must(await db().from("storefronts").select("*, vendors!inner(name, status)")) as any[]
    return rows.map((r) => ({ ...toStorefront(r), vendorName: r.vendors.name, vendorStatus: r.vendors.status }))
  },

  async setStorefrontModeration({ caller, args }) {
    const u = adminOnly(caller)
    const reason = String(args.reason ?? "").slice(0, 500)
    if (!reason.trim()) throw fail("validation", "Add a reason.")
    await db().from("storefronts").update({ status: args.action === "unpublish" ? "paused" : "published", updated_at: new Date().toISOString() }).eq("id", str(args.storefrontId, "storefront"))
    await audit(u.email, `storefront.${args.action}`, "storefront", String(args.storefrontId), reason)
  },

  // ---------------------------------------------------------------- operations team

  async listTeam({ caller }) {
    const u = adminOnly(caller)
    const people = must(await db().from("profiles").select("id, name, email, roles").overlaps("roles", ["admin", "support"]).order("created_at")) as any[]
    const members = await Promise.all(people.map(async (p) => {
      const { data } = await db().auth.admin.mfa.listFactors({ userId: p.id })
      return {
        userId: p.id, name: p.name, email: p.email, role: platformRoleOf(p.roles)!,
        mfaEnrolled: (data?.factors ?? []).some((f: any) => f.status === "verified"), isYou: p.id === u.userId,
      }
    }))
    members.sort((a, b) => Number(b.isYou) - Number(a.isYou) || (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1))
    const invites = (must(await db().from("platform_invites").select("*").eq("status", "pending").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })) as any[])
      .map((i) => ({ id: i.id, email: i.email, role: i.role, invitedBy: i.invited_by, note: i.note ?? undefined, createdAt: i.created_at, expiresAt: i.expires_at }))
    return { members, invites }
  },

  async inviteTeamMember({ caller, args }) {
    const u = adminOnly(caller)
    const email = str(args.input?.email, "email", 200).trim().toLowerCase()
    const role = args.input?.role as PlatformRole
    const note = String(args.input?.note ?? "").trim().slice(0, 300)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("validation", "Enter a valid email address.")
    if (role !== "admin" && role !== "support") throw fail("validation", "Choose Admin or Support.")
    const existing = must(await db().from("profiles").select("roles").eq("email", email).maybeSingle()) as any
    const current = existing ? platformRoleOf(existing.roles) : null
    if (current === "admin" || current === role) throw fail("conflict", `${email} already has ${current === "admin" ? "admin" : "support"} access.`)
    // Re-inviting replaces any pending invitation, so the newest role and expiry win.
    await db().from("platform_invites").update({ status: "revoked", responded_at: new Date().toISOString() }).eq("email", email).eq("status", "pending")
    const id = uid("inv")
    must(await db().from("platform_invites").insert({ id, email, role, invited_by: u.email, note: note || null, expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString() }))
    const who = u.name && u.name.toLowerCase() !== u.email.split("@")[0] ? u.name : u.email
    await enqueue({
      to: email, kind: "team_invite",
      subject: `${who} invited you to the JustGifter ${role === "admin" ? "admin" : "support"} team`,
      body: `${role === "admin" ? "As an admin you'll review vendors and listings, manage orders, refunds and support, and decide who else has access." : "As part of support you'll help customers with orders, gifts, delivery issues and refunds."}${note ? ` ${who} added: “${note}”` : ""} Sign in with this email address to accept. You'll set up two-step sign-in with an authenticator app first. The invitation expires in ${INVITE_DAYS} days.`,
      link: { label: "Accept invitation", href: "/signin?next=/admin" },
    })
    await audit(u.email, "team.invited", "invite", id, `${email} as ${role}${note ? ` — ${note}` : ""}`)
  },

  async revokeTeamInvite({ caller, args }) {
    const u = adminOnly(caller)
    const inv = must(await db().from("platform_invites").select("*").eq("id", str(args.inviteId, "invite")).eq("status", "pending").maybeSingle()) as any
    if (!inv) throw fail("not_found", "That invitation was already used or cancelled.")
    must(await db().from("platform_invites").update({ status: "revoked", responded_at: new Date().toISOString() }).eq("id", inv.id))
    await audit(u.email, "team.invite_revoked", "invite", inv.id, `${inv.email} (${inv.role})`)
  },

  async setTeamRole({ caller, args }) {
    const u = adminOnly(caller)
    const userId = str(args.userId, "user")
    const role = args.role as PlatformRole | "none"
    const reason = String(args.reason ?? "").trim().slice(0, 500)
    if (!["admin", "support", "none"].includes(role)) throw fail("validation", "Choose a role.")
    if (!reason) throw fail("validation", "Add a reason.")
    if (userId === u.userId) throw fail("forbidden", "You can't change your own access. Ask another admin.")
    const target = must(await db().from("profiles").select("id, email, roles").eq("id", userId).maybeSingle()) as any
    if (!target || !platformRoleOf(target.roles)) throw fail("not_found", "That person isn't on the team.")
    const roles = withPlatformRole(target.roles, role)
    must(await db().from("profiles").update({ roles }).eq("id", userId))
    await audit(u.email, role === "none" ? "team.removed" : "team.role_changed", "user", userId, `${target.email}: ${platformRoleOf(target.roles)} → ${role}. ${reason}`)
    await enqueue({
      to: target.email, kind: "status",
      subject: role === "none" ? "Your JustGifter operations access was removed" : `You're now ${role === "admin" ? "an admin" : "on the support team"} at JustGifter`,
      body: role === "none" ? "You can still use JustGifter as a customer. If you think this is a mistake, contact an admin." : "The change applies the next time you open the operations workspace.",
      link: role === "none" ? undefined : { label: "Open operations", href: "/admin" },
    })
  },
}

export { runJob, uid }

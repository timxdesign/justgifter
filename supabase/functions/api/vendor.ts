// deno-lint-ignore-file no-explicit-any
import type { Order } from "../_shared/domain/index.ts"
import { addDays, daysBetween, settlementFor, toDateOnly, uid, VENDOR_ACTIONABLE, vendorBalance, LAUNCH_TIMEZONE, CATEGORIES, ZONES, maskContact } from "../_shared/domain/index.ts"
import { db, must } from "../_shared/db.ts"
import { env } from "../_shared/env.ts"
import { fail } from "../_shared/http.ts"
import { requireRole, requireUser, type Caller } from "../_shared/auth.ts"
import { cancelWithRefund, transition } from "../_shared/commerce.ts"
import { enqueue } from "../_shared/notify.ts"
import { activeHolds, audit, products, saveOrder, toApplication, toOrder, toStorefront, toVendor } from "../_shared/repo.ts"
import { vendorOrderView } from "../_shared/views.ts"
import type { Handler } from "./context.ts"
import { consumeOtp, issueOtp, str } from "./context.ts"

const RESERVED = ["admin", "api", "account", "vendor", "vendors", "stores", "store", "justgifter", "support", "help", "checkout", "cart", "orders", "gift", "gifts", "events", "e", "g", "login", "signup", "official", "staff", "security", "paystack"]
const DISPUTE_WINDOW_DAYS = 7

const DOC_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
const DOC_MAX_BYTES = 10 * 1024 * 1024

async function vendorCtx(caller: Caller, scope?: "catalogue" | "orders" | "support") {
  const u = requireRole(caller, "vendor_owner", "vendor_staff")
  if (!u.vendorId) throw fail("forbidden", "Your account isn't linked to a vendor.")
  const vendor = toVendor(must(await db().from("vendors").select("*").eq("id", u.vendorId).single()))
  const owner = u.roles.includes("vendor_owner")
  if (scope && !owner) {
    const staff = must(await db().from("vendor_staff").select("scopes").eq("vendor_id", vendor.id).eq("user_id", u.userId).maybeSingle()) as any
    if (!staff?.scopes.includes(scope)) throw fail("forbidden", `Your role doesn't include ${scope} access. Ask the store owner.`)
  }
  return { u, vendor, owner }
}
const ownerCtx = async (caller: Caller) => {
  const c = await vendorCtx(caller)
  if (!c.owner) throw fail("forbidden", "Only the store owner can do this.")
  return c
}

async function vendorOrder(vendorId: string, id: string, actor: string) {
  const row = must(await db().from("orders").select("*").eq("id", id).maybeSingle()) as any
  if (!row || row.vendor_id !== vendorId || row.payment_status !== "successful") {
    // AC 11: cross-vendor access is denied and logged.
    await audit(actor, "access_denied", "order", id, `Vendor ${vendorId} attempted to access an order outside its organisation`)
    throw fail("not_found", "We couldn't find that order in your store.")
  }
  return toOrder(row)
}

const net = (o: Order) => (["cancelled", "declined"].includes(o.status) ? 0 : settlementFor(o.pricing, o.commissionBps).vendorPayable)

export const vendor: Record<string, Handler> = {
  async submitVendorApplication({ caller, args }) {
    const u = requireUser(caller)
    if (u.vendorId) throw fail("conflict", "You already have a vendor workspace.")
    const i = args.input ?? {}
    if (!i.acceptTerms) throw fail("validation", "Accept the marketplace, delivery and returns terms to continue.")
    const name = str(i.businessName, "business name", 80).trim()
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    if (!name || RESERVED.includes(slug) || /justgifter|official/.test(slug)) throw fail("validation", "That business name can't be used. Names that look like JustGifter or other brands are reserved.")
    const zones = (i.zones ?? []).filter((z: string) => ZONES.some((x) => x.id === z))
    const cats = (i.categories ?? []).filter((c: string) => CATEGORIES.some((x) => x.id === c))
    if (!zones.length || !cats.length) throw fail("validation", "Choose at least one delivery area and one category.")
    const account = String(i.payoutAccount ?? "").replace(/\s/g, "")
    if (!/^\d{10}$/.test(account)) throw fail("validation", "Enter a 10-digit NUBAN account number.")
    const { data: clash } = await db().from("vendors").select("id").eq("slug", slug).maybeSingle()
    const id = uid("ven")
    must(await db().from("vendors").insert({
      id, slug: clash ? `${slug}-${id.slice(-3)}` : slug, name, about: String(i.about ?? "").slice(0, 1000), logo_initials: name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      status: "submitted", zones: zones.map((z: string) => ({ zoneId: z, fee: 300_000, leadDays: 0 })), fulfilment: i.fulfilment === "courier" ? "courier" : "vendor_delivery", categories: cats,
      operating: { days: i.days ?? [1, 2, 3, 4, 5, 6], openHour: i.openHour ?? 8, closeHour: i.closeHour ?? 18, cutoffHour: Math.max((i.openHour ?? 8) + 1, (i.closeHour ?? 18) - 4), blackoutDates: [], dailyCapacity: 15, deliveryWindow: [Math.max(i.openHour ?? 8, 9), i.closeHour ?? 18] },
      business_type: i.businessType ?? "sole_proprietor", city: String(i.city ?? "").slice(0, 60),
    }))
    const now = new Date().toISOString()
    must(await db().from("vendor_applications").insert({ id: uid("app"), vendor_id: id, status: "submitted", submitted_at: now, history: [{ at: now, status: "submitted", by: u.email }], owner_name: String(i.ownerName ?? "").slice(0, 80), owner_email: u.email, owner_phone: String(i.ownerPhone ?? "").slice(0, 30), address: String(i.address ?? "").slice(0, 200), payout_bank: String(i.payoutBank ?? "").slice(0, 60), payout_account_masked: `•••• ${account.slice(-4)}`, terms_accepted_at: now }))
    must(await db().from("vendor_payout_accounts").insert({ vendor_id: id, bank: String(i.payoutBank ?? "").slice(0, 60), account_number: account }))
    // Registration creates an application, not permission to sell (§9). The role only opens the workspace.
    must(await db().from("profiles").update({ vendor_id: id, roles: [...new Set([...u.roles, "vendor_owner"])] }).eq("id", u.userId))
    must(await db().from("vendor_staff").insert({ id: uid("stf"), vendor_id: id, user_id: u.userId, name: String(i.ownerName ?? ""), email: u.email, role: "owner", scopes: ["catalogue", "orders", "support"], status: "active" }))
    await enqueue({ to: u.email, kind: "status", subject: "We've received your application", body: "Our team reviews applications within 3 working days. We'll email you if we need anything else." })
    await audit(u.email, "vendor.apply", "vendor", id, name)
    return { vendorId: id }
  },

  async getVendorWorkspace({ caller }) {
    if (!caller.userId || !caller.vendorId) return null
    const v = must(await db().from("vendors").select("*").eq("id", caller.vendorId).maybeSingle())
    if (!v) return null
    const sf = must(await db().from("storefronts").select("*").eq("vendor_id", caller.vendorId).maybeSingle())
    const app = must(await db().from("vendor_applications").select("*").eq("vendor_id", caller.vendorId).maybeSingle()) as any
    return {
      vendor: toVendor(v), storefront: sf ? toStorefront(sf) : null, role: caller.roles.includes("vendor_owner") ? "owner" : "staff",
      application: app ? toApplication(app) : null,
    }
  },

  // ---------------------------------------------------------------- application replies

  async applicationDocumentUploadUrl({ caller, args }) {
    const { vendor: v } = await ownerCtx(caller)
    if (v.status !== "needs_information") throw fail("conflict", "Your application isn't waiting for documents.")
    const type = String(args.type ?? "")
    const ext = DOC_TYPES[type]
    if (!ext) throw fail("validation", "Upload a PDF, JPG or PNG.")
    if (Number(args.size) > DOC_MAX_BYTES) throw fail("validation", "Each file must be 10 MB or smaller.")
    const path = `applications/${v.id}/${uid("doc")}.${ext}`
    const { data, error } = await db().storage.from("private-evidence").createSignedUploadUrl(path)
    if (error) throw error
    return { path, token: data.token, bucket: "private-evidence" }
  },

  async respondToApplication({ caller, args }) {
    const { vendor: v, u } = await ownerCtx(caller)
    if (v.status !== "needs_information") throw fail("conflict", "Your application isn't waiting for a reply.")
    const message = String(args.input?.message ?? "").trim().slice(0, 2000)
    const docs = (Array.isArray(args.input?.documents) ? args.input.documents : []).slice(0, 5)
    if (!message && docs.length === 0) throw fail("validation", "Add a message or attach a document.")
    const folder = `applications/${v.id}/`
    const { data: stored } = await db().storage.from("private-evidence").list(folder.slice(0, -1), { limit: 1000 })
    const existing = new Set((stored ?? []).map((f: any) => folder + f.name))
    const documents = docs.map((d: any) => {
      const path = String(d.path ?? "")
      if (!path.startsWith(folder) || !existing.has(path)) throw fail("validation", "One of the files didn't finish uploading. Remove it and try again.")
      return { id: uid("doc"), name: String(d.name ?? "document").replace(/[^\w .()-]/g, "").slice(0, 120) || "document", path, size: Number(d.size) || 0, type: String(d.type ?? "") }
    })
    const app = must(await db().from("vendor_applications").select("*").eq("vendor_id", v.id).single()) as any
    const now = new Date().toISOString()
    const summary = [message && `“${message.length > 140 ? message.slice(0, 140) + "…" : message}”`, documents.length && `${documents.length} document${documents.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
    must(await db().from("vendor_applications").update({
      status: "under_review",
      responses: [...(app.responses ?? []), { at: now, by: u.email, message, documents }],
      history: [...app.history, { at: now, status: "under_review", by: u.email, reason: `Replied: ${summary}` }],
    }).eq("id", app.id))
    must(await db().from("vendors").update({ status: "under_review" }).eq("id", v.id))
    const team = must(await db().from("profiles").select("email").contains("roles", ["admin"])) as any[]
    for (const t of team) await enqueue({ to: t.email, kind: "status", subject: `${v.name} replied to your request`, body: `${summary}. The application is back in review.`, link: { label: "Review application", href: "/admin/vendors" } })
    await enqueue({ to: u.email, kind: "status", subject: "We've got your reply", body: "Thanks — your application is back with our team. We'll be in touch within 3 working days.", link: { label: "Open workspace", href: "/vendor" } })
    await audit(u.email, "vendor.replied", "vendor", v.id, summary)
  },

  async getVendorDashboard({ caller }) {
    const { vendor: v } = await vendorCtx(caller)
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString()
    const rows = must(await db().from("orders").select("*").eq("vendor_id", v.id).eq("payment_status", "successful").or(`created_at.gte.${since},status.in.(${VENDOR_ACTIONABLE.join(",")})`)) as any[]
    const orders = rows.map(toOrder)
    const today = toDateOnly(new Date(), LAUNCH_TIMEZONE)
    const prods = await products({ vendorId: v.id })
    const sf = must(await db().from("storefronts").select("slug,status").eq("vendor_id", v.id).maybeSingle()) as any
    const salesByDay = Array.from({ length: 30 }, (_, i) => {
      const date = addDays(today, i - 29)
      const day = orders.filter((o) => toDateOnly(new Date(o.createdAt), LAUNCH_TIMEZONE) === date)
      return { date, net: day.reduce((n, o) => n + net(o), 0), orders: day.length }
    })
    const lowStockVariants = prods.filter((p) => p.status === "active").flatMap((p) => p.variants.filter((x) => x.stock <= 3).map((x) => ({ productId: p.id, productTitle: p.title, variantId: x.id, variantName: x.name, stock: x.stock })))
    const actionable = orders.filter((o) => VENDOR_ACTIONABLE.includes(o.status)).sort((a, b) => (a.acceptBy ?? a.createdAt).localeCompare(b.acceptBy ?? b.createdAt)).slice(0, 8)
    return {
      vendorName: v.name, status: v.status, storefrontStatus: sf?.status ?? null, storefrontSlug: sf?.slug ?? null,
      metrics: {
        needsAcceptance: orders.filter((o) => o.status === "awaiting_vendor_acceptance").length,
        inProgress: orders.filter((o) => ["accepted", "preparing", "ready_for_dispatch", "dispatched", "delivery_issue"].includes(o.status)).length,
        deliveredThisWeek: orders.filter((o) => o.status === "delivered" && daysBetween(toDateOnly(new Date(o.updatedAt), LAUNCH_TIMEZONE), today) <= 7).length,
        netSales30d: salesByDay.reduce((n, d) => n + d.net, 0), lowStock: lowStockVariants.length, pendingListings: prods.filter((p) => p.status === "pending_review").length,
      },
      actionable: await Promise.all(actionable.map(vendorOrderView)), lowStockVariants, salesByDay,
    }
  },

  async listVendorOrders({ caller, args }) {
    const { vendor: v } = await vendorCtx(caller, "orders")
    let q = db().from("orders").select("*").eq("vendor_id", v.id).eq("payment_status", "successful").order("created_at", { ascending: false }).limit(200)
    const f = args.filter ?? {}
    if (["marketplace", "wishlist", "storefront"].includes(f.source)) q = q.eq("source", f.source)
    if (["gift", "self"].includes(f.purchaseType)) q = q.eq("purchase_type", f.purchaseType)
    if (f.status === "actionable") q = q.in("status", VENDOR_ACTIONABLE)
    if (f.status === "completed") q = q.in("status", ["delivered", "cancelled", "declined", "disputed"])
    return Promise.all((must(await q) as any[]).map((r) => vendorOrderView(toOrder(r))))
  },

  async getVendorOrder({ caller, args }) {
    const { vendor: v, u } = await vendorCtx(caller, "orders")
    return vendorOrderView(await vendorOrder(v.id, str(args.id, "order"), u.email))
  },

  async vendorOrderAction({ caller, args }) {
    const { vendor: v, u } = await vendorCtx(caller, "orders")
    const o = await vendorOrder(v.id, str(args.id, "order"), u.email)
    const note = args.note ? String(args.note).slice(0, 500) : undefined
    switch (args.action) {
      case "accept":
        transition(o, "accepted", "vendor", note)
        o.delivery.windowKind = "confirmed"
        await saveOrder(o)
        await db().from("jobs").update({ status: "done" }).eq("idempotency_key", `accept:${o.id}`)
        await enqueue({ to: o.buyerEmail, kind: "status", subject: `${v.name} accepted your order`, body: `Delivery is confirmed for ${o.delivery.requestedDate}.`, link: { label: "Track order", href: `/account/orders/${o.id}` } })
        break
      case "decline":
        // Automatic substitution is prohibited; a decline always refunds and informs the buyer (§9).
        await cancelWithRefund(o, "vendor_declined", "vendor", note ? `The vendor couldn't fulfil this order: ${note}` : "The vendor couldn't fulfil this order.", "declined")
        break
      case "start_preparing": transition(o, "preparing", "vendor", note); await saveOrder(o); break
      case "mark_ready": transition(o, "ready_for_dispatch", "vendor", note); await saveOrder(o); break
      case "dispatch":
        transition(o, "dispatched", "vendor", note)
        await saveOrder(o)
        await enqueue({ to: o.buyerEmail, kind: "status", subject: `${o.reference} is on its way`, body: note ? `Rider note: ${note}` : `Arriving ${o.delivery.requestedDate}.`, link: { label: "Track order", href: `/account/orders/${o.id}` } })
        break
      case "deliver":
        transition(o, "delivered", "vendor", note)
        await saveOrder(o)
        await enqueue({ to: o.buyerEmail, kind: "status", subject: `${o.reference} was delivered`, body: "If anything isn't right, open a case from your order within 48 hours." })
        break
      case "report_issue":
        if (!note?.trim()) throw fail("validation", "Describe what happened so support can help.")
        transition(o, "delivery_issue", "vendor", note)
        o.delivery.attempts += 1
        await saveOrder(o)
        await enqueue({ to: o.buyerEmail, kind: "status", subject: `Delivery update for ${o.reference}`, body: `${note} We'll keep you posted with the next attempt.` })
        break
      default:
        throw fail("validation", "Unknown action.")
    }
    await audit(u.email, `order.${args.action}`, "order", o.id, note ?? "")
  },

  async listVendorProducts({ caller }) {
    const { vendor: v } = await vendorCtx(caller, "catalogue")
    const prods = (await products({ vendorId: v.id })).filter((p) => p.status !== "archived")
    const holds = await activeHolds(prods.flatMap((p) => p.variants.map((x) => x.id)))
    const open = (must(await db().from("orders").select("lines").eq("vendor_id", v.id).eq("payment_status", "successful").in("status", ["paid", "awaiting_recipient_details", "awaiting_vendor_acceptance", "accepted", "preparing", "ready_for_dispatch"])) as any[]).flatMap((r) => r.lines)
    return prods.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => ({
      product: p,
      sellable: Object.fromEntries(p.variants.map((x) => [x.id, Math.max(0, x.stock - holds.filter((h) => h.variantId === x.id).reduce((n, h) => n + h.quantity, 0))])),
      committed: open.filter((l: any) => l.productId === p.id).reduce((n: number, l: any) => n + l.quantity, 0),
      reserved: holds.filter((h) => p.variants.some((x) => x.id === h.variantId)).reduce((n, h) => n + h.quantity, 0),
    }))
  },

  async saveVendorProduct({ caller, args }) {
    const { vendor: v, u } = await vendorCtx(caller, "catalogue")
    const i = args.input ?? {}
    const title = str(i.title, "title", 100).trim()
    if (!title) throw fail("validation", "Add a product title.")
    if (!Array.isArray(i.variants) || !i.variants.length) throw fail("validation", "Add at least one option with a price.")
    if (i.variants.some((x: any) => !Number.isInteger(x.price) || x.price <= 0)) throw fail("validation", "Every option needs a price above ₦0.")
    const images = (i.images ?? []).filter((s: string) => typeof s === "string" && (s.startsWith("/media/") || s.startsWith(`${env.supabaseUrl()}/storage/v1/object/public/product-media/`))).slice(0, 6)
    if (!images.length) throw fail("validation", "Add at least one photo.")
    if (!CATEGORIES.some((c) => c.id === i.category)) throw fail("validation", "Choose a category.")
    const flagged = /\b(cure|cures|heal|heals|treat(s)? (illness|disease)|guaranteed results|miracle)\b/i.test(`${title} ${i.description} ${i.summary}`)
    const existing = i.id ? (await products({ ids: [i.id] }))[0] : undefined
    if (i.id && (!existing || existing.vendorId !== v.id)) throw fail("not_found", "That product isn't in your catalogue.")
    const id = existing?.id ?? uid("prd")
    const row = {
      id, vendor_id: v.id, slug: existing?.slug ?? `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${id.slice(-4)}`, title, summary: String(i.summary ?? "").slice(0, 160), description: String(i.description ?? "").slice(0, 4000),
      included: (i.included ?? []).map(String).filter(Boolean).slice(0, 20), dimensions: i.dimensions ? String(i.dimensions).slice(0, 80) : null, images, category: i.category, occasions: i.occasions ?? [], interests: i.interests ?? [],
      prep_hours: Math.max(1, Number(i.prepHours) || 4), perishable: Boolean(i.perishable), highly_customised: Boolean(i.highlyCustomised), return_eligible: Boolean(i.returnEligible), personalisation: i.personalisation ?? null, wrapping: i.wrapping ?? [],
      moderation_note: flagged ? "Flagged automatically: possible medical or guaranteed-results claim." : null,
    }
    // VEN 05: material changes go back to moderation. Order prices are snapshots, so history never changes (VEN 06).
    const material = !existing || flagged || ["title", "summary", "description", "category", "images", "included", "perishable", "returnEligible", "highlyCustomised"].some((k) => JSON.stringify((existing as any)[k]) !== JSON.stringify(k === "returnEligible" ? row.return_eligible : k === "highlyCustomised" ? row.highly_customised : (row as any)[k]))
    must(await db().from("products").upsert({ ...row, status: material ? "pending_review" : existing!.status }))
    for (const [idx, x] of i.variants.entries()) {
      const vid = x.id && existing?.variants.some((e) => e.id === x.id) ? x.id : `${id}_v${idx + 1}_${uid("").slice(-4)}`
      must(await db().from("variants").upsert({ id: vid, product_id: id, name: String(x.name).slice(0, 60), sku: String(x.sku ?? "").slice(0, 40), price: x.price, stock: Math.max(0, Math.floor(x.stock)), position: idx }))
    }
    await audit(u.email, existing ? "product.update" : "product.create", "product", id, material ? "Sent for review" : "Price/stock update")
    return { id, status: material ? "pending_review" : existing!.status, needsReview: material }
  },

  async updateStock({ caller, args }) {
    const { vendor: v } = await vendorCtx(caller, "catalogue")
    const stock = Number(args.stock)
    if (!Number.isInteger(stock) || stock < 0 || stock > 10_000) throw fail("validation", "Enter a whole number between 0 and 10,000.")
    const [p] = await products({ ids: [str(args.productId, "product")] })
    if (!p || p.vendorId !== v.id || !p.variants.some((x) => x.id === args.variantId)) throw fail("not_found", "That option no longer exists.")
    must(await db().from("variants").update({ stock }).eq("id", args.variantId))
  },

  async archiveProduct({ caller, args }) {
    const { vendor: v, u } = await vendorCtx(caller, "catalogue")
    const [p] = await products({ ids: [str(args.productId, "product")] })
    if (!p || p.vendorId !== v.id) throw fail("not_found", "That product isn't in your catalogue.")
    await db().from("products").update({ status: "archived" }).eq("id", p.id)
    await db().from("wishlist_items").update({ status: "unavailable" }).eq("product_id", p.id).eq("status", "active")
    await audit(u.email, "product.archive", "product", p.id, p.title)
  },

  async uploadMediaUrl({ caller, args }) {
    // Signed upload URL into the public product-media bucket; the client re-encodes images first (SEC 04).
    const { vendor: v } = await vendorCtx(caller, "catalogue")
    const path = `${v.id}/${uid("img")}.webp`
    const { data, error } = await db().storage.from(args.purpose === "storefront" ? "storefront-media" : "product-media").createSignedUploadUrl(path)
    if (error) throw error
    return { path, token: data.token, bucket: args.purpose === "storefront" ? "storefront-media" : "product-media" }
  },

  async saveStorefront({ caller, args }) {
    const { vendor: v, u } = await ownerCtx(caller)
    const i = args.input ?? {}
    const slug = str(i.slug, "link", 40).trim().toLowerCase()
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) throw fail("validation", "Use 3–40 lowercase letters, numbers and hyphens for your link.")
    if (RESERVED.includes(slug) || /justgifter|official|support/.test(slug)) throw fail("validation", "That link is reserved. Try something based on your business name.")
    const sf = must(await db().from("storefronts").select("*").eq("vendor_id", v.id).maybeSingle()) as any
    const ownIds = new Set((must(await db().from("products").select("id").eq("vendor_id", v.id)) as any[]).map((r) => r.id))
    const collections = (i.collections ?? []).slice(0, 12).map((c: any) => ({ id: String(c.id).slice(0, 40), name: String(c.name).slice(0, 40), description: String(c.description ?? "").slice(0, 140), productIds: (c.productIds ?? []).filter((id: string) => ownIds.has(id)) }))
    const row = { headline: String(i.headline ?? "").slice(0, 90), intro: String(i.intro ?? "").slice(0, 1500), accent: i.accent, layout: i.layout === "editorial" ? "editorial" : "grid", cover_image: String(i.coverImage ?? ""), featured_product_ids: (i.featuredProductIds ?? []).filter((id: string) => ownIds.has(id)).slice(0, 6), collections, updated_at: new Date().toISOString() }
    let slugChanged = false
    if (sf) {
      const history = sf.slug !== slug ? [...new Set([...sf.slug_history, sf.slug])] : sf.slug_history
      slugChanged = sf.slug !== slug
      const { error } = await db().from("storefronts").update({ ...row, slug, slug_history: history }).eq("id", sf.id)
      if (error) throw fail("conflict", "That link is already in use.")
      if (slugChanged) await audit(u.email, "storefront.slug_change", "storefront", sf.id, `${sf.slug} → ${slug}`)
    } else {
      const { error } = await db().from("storefronts").insert({ id: uid("stf"), vendor_id: v.id, slug, status: "draft", ...row })
      if (error) throw fail("conflict", "That link is already in use.")
    }
    return { slugChanged }
  },

  async setStorefrontStatus({ caller, args }) {
    const { vendor: v, u } = await ownerCtx(caller)
    const sf = must(await db().from("storefronts").select("*").eq("vendor_id", v.id).maybeSingle()) as any
    if (!sf) throw fail("not_found", "Set up your storefront first.")
    if (args.status === "published") {
      if (v.status !== "approved") throw fail("forbidden", "Your store can be published once your application is approved.")
      const { count } = await db().from("products").select("id", { count: "exact", head: true }).eq("vendor_id", v.id).eq("status", "active")
      if (!count) throw fail("validation", "Add at least one approved product before publishing.")
    }
    await db().from("storefronts").update({ status: args.status === "published" ? "published" : "paused", published_at: sf.published_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sf.id)
    await audit(u.email, `storefront.${args.status}`, "storefront", sf.id, "")
  },

  async getStorefrontAnalytics({ caller, args }) {
    const { vendor: v } = await vendorCtx(caller)
    const days = Math.min(90, Math.max(1, Number(args.days) || 30))
    const today = toDateOnly(new Date(), LAUNCH_TIMEZONE)
    const from = addDays(today, -(days - 1))
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const events = must(await db().from("analytics_events").select("*").eq("vendor_id", v.id).gte("at", since)) as any[]
    const orders = (must(await db().from("orders").select("*").eq("vendor_id", v.id).eq("payment_status", "successful").gte("created_at", since)) as any[]).map(toOrder).filter((o) => !["cancelled", "declined"].includes(o.status))
    const store = orders.filter((o) => o.source === "storefront")
    const day = (iso: string) => toDateOnly(new Date(iso), LAUNCH_TIMEZONE)
    const visits = events.filter((e) => e.kind === "visit").length
    const views = events.filter((e) => e.kind === "product_view")
    const titles = new Map((must(await db().from("products").select("id,title").eq("vendor_id", v.id)) as any[]).map((p) => [p.id, p.title]))
    return {
      range: { from, to: today },
      totals: { visits, productViews: views.length, checkoutStarts: events.filter((e) => e.kind === "checkout_start").length, paidOrders: store.length, conversion: visits ? store.length / visits : 0, netSales: store.reduce((n, o) => n + net(o), 0) },
      byDay: Array.from({ length: days }, (_, i) => { const d = addDays(from, i); const ds = store.filter((o) => day(o.createdAt) === d); return { date: d, visits: events.filter((e) => e.kind === "visit" && day(e.at) === d).length, paidOrders: ds.length, netSales: ds.reduce((n, o) => n + net(o), 0) } }),
      topProducts: [...new Set(views.map((e) => e.product_id))].map((pid) => ({ productId: pid, title: titles.get(pid) ?? pid, views: views.filter((e) => e.product_id === pid).length, orders: store.filter((o) => o.lines.some((l) => l.productId === pid)).length })).sort((a, b) => b.views - a.views).slice(0, 5),
      bySource: (["storefront", "marketplace", "wishlist"] as const).map((source) => { const list = orders.filter((o) => o.source === source); return { source, orders: list.length, netSales: list.reduce((n, o) => n + net(o), 0) } }),
    }
  },

  async getPayoutStatement({ caller }) {
    const { vendor: v } = await ownerCtx(caller)
    const ledger = (must(await db().from("ledger_entries").select("*").eq("vendor_id", v.id)) as any[]).map((l) => ({ id: l.id, orderId: l.order_id, vendorId: l.vendor_id, type: l.type, amount: Number(l.amount), currency: l.currency, idempotencyKey: l.idempotency_key, createdAt: l.created_at, memo: l.memo }))
    const payouts = must(await db().from("payouts").select("*").eq("vendor_id", v.id).order("created_at", { ascending: false })) as any[]
    const paidIds = new Set(payouts.filter((p) => p.status === "paid").flatMap((p) => p.order_ids))
    const orders = (must(await db().from("orders").select("*").eq("vendor_id", v.id).eq("payment_status", "successful").order("created_at", { ascending: false }).limit(300)) as any[]).map(toOrder)
    const refunds = must(await db().from("refunds").select("order_id, amount").eq("status", "completed").in("order_id", orders.map((o) => o.id).concat("-"))) as any[]
    const openCases = new Set((must(await db().from("support_cases").select("order_id").eq("vendor_id", v.id).neq("status", "resolved")) as any[]).map((c) => c.order_id))
    const app = must(await db().from("vendor_applications").select("payout_bank, payout_account_masked").eq("vendor_id", v.id).maybeSingle()) as any
    const pending = must(await db().from("vendor_payout_accounts").select("pending_requested_at").eq("vendor_id", v.id).maybeSingle()) as any
    const today = toDateOnly(new Date(), LAUNCH_TIMEZONE)
    return {
      balance: vendorBalance(ledger as any, v.id),
      payouts: payouts.map((p) => ({ id: p.id, vendorId: p.vendor_id, amount: Number(p.amount), currency: p.currency, status: p.status, orderIds: p.order_ids, scheduledFor: p.scheduled_for, createdAt: p.created_at })),
      lines: orders.map((o) => {
        const st = settlementFor(o.pricing, o.commissionBps)
        const refunded = refunds.filter((r) => r.order_id === o.id).reduce((n, r) => n + Number(r.amount), 0)
        const daysSince = o.status === "delivered" ? daysBetween(toDateOnly(new Date(o.updatedAt), LAUNCH_TIMEZONE), today) : -1
        const payoutStatus = paidIds.has(o.id) ? "paid" : openCases.has(o.id) ? "held" : o.status !== "delivered" ? "pending_delivery" : daysSince < DISPUTE_WINDOW_DAYS ? "in_dispute_window" : "eligible"
        return { orderId: o.id, reference: o.reference, date: o.createdAt, gross: st.gross, discount: o.pricing.discount, commission: st.commission, refunds: refunded, net: Math.max(0, st.vendorPayable - (st.gross ? Math.round((refunded * st.vendorPayable) / st.gross) : 0)), payoutStatus }
      }),
      bank: { name: app?.payout_bank ?? "—", accountMasked: app?.payout_account_masked ?? "—", pendingChange: Boolean(pending?.pending_requested_at) },
      disputeWindowDays: DISPUTE_WINDOW_DAYS,
    }
  },

  async requestBankChange({ caller, args }) {
    const { vendor: v, u } = await ownerCtx(caller)
    if (!args.input?.code) {
      // Re-authentication with a fresh code (AC 14).
      await issueOtp(`bank:${v.id}`, u.email, { kind: "bank", store: v.name }, u.name?.split(" ")[0])
      throw fail("unauthorised", `We've sent a code to ${maskContact(u.email)}. Enter it to confirm.`)
    }
    await consumeOtp(`bank:${v.id}`, String(args.input.code))
    const account = String(args.input.account ?? "").replace(/\s/g, "")
    if (!/^\d{10}$/.test(account)) throw fail("validation", "Enter a 10-digit NUBAN account number.")
    await db().from("vendor_payout_accounts").update({ pending_bank: String(args.input.bank).slice(0, 60), pending_account_number: account, pending_requested_at: new Date().toISOString() }).eq("vendor_id", v.id)
    await db().from("payouts").update({ status: "on_hold" }).eq("vendor_id", v.id).eq("status", "scheduled")
    await enqueue({ to: u.email, kind: "status", subject: "Bank details change requested", body: "Payouts are paused until our team confirms the new account, usually within one working day." })
    await audit(u.email, "vendor.bank_change_requested", "vendor", v.id, `${args.input.bank} •••• ${account.slice(-4)}`)
  },

  async listStaff({ caller }) {
    const { vendor: v } = await vendorCtx(caller)
    return (must(await db().from("vendor_staff").select("*").eq("vendor_id", v.id)) as any[]).map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, scopes: m.scopes, status: m.status }))
  },

  async inviteStaff({ caller, args }) {
    const { vendor: v, u } = await ownerCtx(caller)
    if (v.status !== "approved") throw fail("forbidden", "You can invite staff once your store is approved.")
    const email = str(args.input?.email, "email", 200).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("validation", "Enter a valid email address.")
    const scopes = (args.input?.scopes ?? []).filter((s: string) => ["catalogue", "orders", "support"].includes(s))
    if (!scopes.length) throw fail("validation", "Choose at least one area they can access.")
    must(await db().from("vendor_staff").upsert({ id: uid("stf"), vendor_id: v.id, name: String(args.input?.name ?? "").slice(0, 80), email, role: "staff", scopes, status: "invited" }, { onConflict: "vendor_id,email" }))
    await enqueue({ to: email, kind: "status", subject: `You've been invited to help run ${v.name}`, body: `Sign in with this email to accept. Access: ${scopes.join(", ")}. Payout settings stay with the owner.`, link: { label: "Open JustGifter", href: "/signin?next=/vendor" } })
    await audit(u.email, "vendor.staff_invite", "vendor", v.id, `${email}: ${scopes.join(", ")}`)
  },

  async removeStaff({ caller, args }) {
    const { vendor: v, u } = await ownerCtx(caller)
    const m = must(await db().from("vendor_staff").select("*").eq("id", str(args.id, "staff")).eq("vendor_id", v.id).maybeSingle()) as any
    if (!m || m.role === "owner") throw fail("forbidden", "The owner can't be removed.")
    await db().from("vendor_staff").delete().eq("id", m.id)
    if (m.user_id) await db().from("profiles").update({ vendor_id: null }).eq("id", m.user_id).eq("vendor_id", v.id)
    await audit(u.email, "vendor.staff_remove", "vendor", v.id, m.email)
  },

  async updateVendorSettings({ caller, args }) {
    const { vendor: v, u } = await ownerCtx(caller)
    const i = args.input ?? {}
    if (!(i.openHour < i.closeHour)) throw fail("validation", "Closing time must be after opening time.")
    if (!Array.isArray(i.days) || !i.days.length) throw fail("validation", "Choose at least one operating day.")
    const operating = { ...v.operating, blackoutDates: [...new Set((i.blackoutDates ?? []) as string[])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort(), dailyCapacity: Math.max(1, Number(i.dailyCapacity) || 1), cutoffHour: Number(i.cutoffHour), openHour: Number(i.openHour), closeHour: Number(i.closeHour), days: i.days, deliveryWindow: [Math.max(Number(i.openHour), 9), Number(i.closeHour)] }
    await db().from("vendors").update({ operating }).eq("id", v.id)
    await audit(u.email, "vendor.settings", "vendor", v.id, "Operating calendar updated")
  },
}

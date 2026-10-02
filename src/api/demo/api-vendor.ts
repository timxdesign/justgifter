import type { Order, Product, Vendor } from "@domain/index.ts"
import {
  addDays,
  LAUNCH_TIMEZONE,
  settlementFor,
  toDateOnly,
  uid,
  VENDOR_ACTIONABLE,
  vendorBalance,
  maskContact,
  daysBetween,
} from "@domain/index.ts"
import { RESERVED_SLUGS } from "@/data/seed-catalog"
import type { Api, PayoutStatement, StorefrontAnalytics, VendorDashboard, VendorOrderView, VendorProductRow } from "../types"
import { ApiError } from "../errors"
import { clone, latency, type Store } from "./store"
import { cancelWithRefund, timeline, transition } from "./commerce"
import { consumeOtp, issueOtp } from "./api-catalog"

const DISPUTE_WINDOW_DAYS = 7

function vendorOrderView(s: Store, o: Order): VendorOrderView {
  const addr = s.db.orderAddresses[o.id]
  const gift = o.giftId ? s.db.gifts.find((g) => g.id === o.giftId) : null
  const accepted = !["awaiting_payment", "paid", "awaiting_recipient_details", "awaiting_vendor_acceptance", "cancelled", "declined", "payment_expired"].includes(o.status)
  const st = settlementFor(o.pricing, o.commissionBps)
  const card = o.lines.find((l) => l.personalisationText)
  return {
    order: {
      id: o.id, reference: o.reference, status: o.status, paymentStatus: o.paymentStatus, source: o.source, purchaseType: o.purchaseType,
      lines: o.lines, pricing: o.pricing, createdAt: o.createdAt, acceptBy: o.acceptBy, timeline: o.timeline, delivery: o.delivery, storefrontId: o.storefrontId, campaign: o.campaign,
    },
    // §9: only the delivery information needed for the order — full address once accepted.
    customerLabel: `${o.buyerName.split(" ")[0]} · ${maskContact(o.buyerEmail)}`,
    deliveryAddress: accepted ? addr ?? null : null,
    isGift: o.purchaseType === "gift",
    giftNote: card?.personalisationText ?? null,
    settlement: { gross: st.gross, commission: st.commission, vendorPayable: st.vendorPayable },
    revealHidden: Boolean(gift && (gift.revealStatus === "scheduled" || gift.revealStatus === "draft")),
  }
}

function requireVendorOrder(s: Store, vendor: Vendor, id: string) {
  const o = s.db.orders.find((x) => x.id === id)
  if (!o || o.vendorId !== vendor.id) {
    // AC 11: cross-vendor access is denied and logged.
    s.audit(s.user()?.email ?? "unknown", "access_denied", "order", id, `Vendor ${vendor.id} attempted to access another vendor's order`)
    s.persist()
    throw new ApiError("not_found", "We couldn't find that order in your store.")
  }
  return o
}

const requireOwner = (s: Store) => {
  const ctx = s.requireVendor()
  if (!ctx.user.roles.includes("vendor_owner")) throw new ApiError("forbidden", "Only the store owner can do this.")
  return ctx
}

const requireScope = (s: Store, scope: "catalogue" | "orders" | "support") => {
  const ctx = s.requireVendor()
  if (ctx.user.roles.includes("vendor_owner")) return ctx
  const staff = s.db.staff.find((m) => m.email === ctx.user.email && m.vendorId === ctx.vendor.id)
  if (!staff?.scopes.includes(scope)) throw new ApiError("forbidden", `Your role doesn't include ${scope} access. Ask the store owner.`)
  return ctx
}

const MATERIAL_FIELDS: (keyof Product)[] = ["title", "summary", "description", "category", "images", "included", "perishable", "returnEligible", "highlyCustomised"]

export function vendorApi(s: Store): Pick<Api,
  | "submitVendorApplication" | "getVendorWorkspace" | "getVendorDashboard" | "listVendorOrders" | "getVendorOrder" | "vendorOrderAction"
  | "listVendorProducts" | "saveVendorProduct" | "updateStock" | "archiveProduct" | "saveStorefront" | "setStorefrontStatus" | "getStorefrontAnalytics"
  | "getPayoutStatement" | "requestBankChange" | "listStaff" | "inviteStaff" | "removeStaff" | "updateVendorSettings" | "uploadMedia"
  | "uploadApplicationDocument" | "respondToApplication"
> {
  return {
    async submitVendorApplication(input) {
      await latency(600)
      const user = s.requireUser()
      if (!input.acceptTerms) throw new ApiError("validation", "Accept the marketplace, delivery and returns terms to continue.")
      if (!input.businessName.trim()) throw new ApiError("validation", "Add your business name.")
      if (!input.zones.length) throw new ApiError("validation", "Choose at least one delivery area.")
      if (!input.categories.length) throw new ApiError("validation", "Choose at least one product category.")
      if (!/^\d{10}$/.test(input.payoutAccount.replace(/\s/g, ""))) throw new ApiError("validation", "Enter a 10-digit NUBAN account number.")
      const slug = input.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      if (RESERVED_SLUGS.includes(slug) || /justgifter|official/.test(slug)) throw new ApiError("validation", "That business name can't be used. Names that look like JustGifter or other brands are reserved.")
      const now = s.nowIso()
      const vendor: Vendor = {
        id: uid("ven"), slug: s.db.vendors.some((v) => v.slug === slug) ? `${slug}-${Math.random().toString(36).slice(2, 5)}` : slug,
        name: input.businessName.trim(), tagline: "", about: input.about, logoInitials: input.businessName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), logoColor: "oklch(0.5 0.08 40)",
        coverImage: "/media/v/gifts-dark.webp", status: "submitted", verified: false,
        zones: input.zones.map((z) => ({ zoneId: z, fee: 300_000, leadDays: 0 })),
        operating: { days: input.days, openHour: input.openHour, closeHour: input.closeHour, cutoffHour: Math.max(input.openHour + 1, input.closeHour - 4), blackoutDates: [], dailyCapacity: 15, deliveryWindow: [Math.max(input.openHour, 9), input.closeHour] },
        fulfilment: input.fulfilment, categories: input.categories, businessType: input.businessType, city: input.city, responseHours: 4, suppressedFromRecommendations: false, featured: false, joinedAt: now,
        returnPolicy: "", deliveryPolicy: "",
      }
      s.db.vendors.push(vendor)
      s.db.applications.push({
        id: uid("app"), vendorId: vendor.id, status: "submitted", submittedAt: now, reviewer: null, decisionReason: null,
        history: [{ at: now, status: "submitted", by: user.email }], ownerName: input.ownerName, ownerEmail: input.ownerEmail, ownerPhone: input.ownerPhone,
        address: input.address, payoutBank: input.payoutBank, payoutAccountMasked: `•••• ${input.payoutAccount.slice(-4)}`, termsAcceptedAt: now, responses: [],
      })
      // Registration creates an application, not permission to sell (§9).
      const u = s.db.users.find((x) => x.id === user.id)!
      if (!u.roles.includes("vendor_owner")) u.roles.push("vendor_owner")
      u.vendorId = vendor.id
      s.notify({ to: input.ownerEmail, kind: "status", subject: "We've received your application", body: "Our team reviews applications within 3 working days. We'll email you if we need anything else." })
      s.audit(user.email, "vendor.apply", "vendor", vendor.id, vendor.name)
      s.persist()
      return { vendorId: vendor.id }
    },

    async uploadApplicationDocument(file) {
      await latency(500)
      const { vendor } = requireOwner(s)
      if (vendor.status !== "needs_information") throw new ApiError("conflict", "Your application isn't waiting for documents.")
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ApiError("validation", "Upload a PDF, JPG or PNG.")
      if (file.size > 10 * 1024 * 1024) throw new ApiError("validation", "Each file must be 10 MB or smaller.")
      // Demo storage keeps small files as data URLs so admins can open them; larger ones keep metadata only.
      const path = file.size <= 400_000
        ? await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new ApiError("validation", "Couldn't read that file.")); r.readAsDataURL(file) })
        : `applications/${vendor.id}/${uid("doc")}`
      return { id: uid("doc"), name: file.name, path, size: file.size, type: file.type }
    },

    async respondToApplication({ message, documents }) {
      await latency(400)
      const { vendor, user } = requireOwner(s)
      if (vendor.status !== "needs_information") throw new ApiError("conflict", "Your application isn't waiting for a reply.")
      const text = message.trim().slice(0, 2000)
      if (!text && documents.length === 0) throw new ApiError("validation", "Add a message or attach a document.")
      const app = s.db.applications.find((a) => a.vendorId === vendor.id)!
      const now = s.nowIso()
      const summary = [text && `“${text.length > 140 ? text.slice(0, 140) + "…" : text}”`, documents.length && `${documents.length} document${documents.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
      app.responses.push({ at: now, by: user.email, message: text, documents: documents.slice(0, 5) })
      app.status = "under_review"
      app.history.push({ at: now, status: "under_review", by: user.email, reason: `Replied: ${summary}` })
      vendor.status = "under_review"
      s.db.users.filter((u) => u.roles.includes("admin")).forEach((a) => s.notify({ to: a.email, kind: "status", subject: `${vendor.name} replied to your request`, body: `${summary}. The application is back in review.`, link: { label: "Review application", href: "/admin/vendors" } }))
      s.audit(user.email, "vendor.replied", "vendor", vendor.id, summary)
      s.persist()
    },

    async getVendorWorkspace() {
      await latency(120)
      const user = s.user()
      if (!user?.vendorId) return null
      const vendor = s.db.vendors.find((v) => v.id === user.vendorId)
      if (!vendor) return null
      return clone({
        vendor,
        storefront: s.db.storefronts.find((x) => x.vendorId === vendor.id) ?? null,
        application: s.db.applications.find((a) => a.vendorId === vendor.id) ?? null,
        role: user.roles.includes("vendor_owner") ? ("owner" as const) : ("staff" as const),
      })
    },

    async getVendorDashboard() {
      await latency(200)
      const { vendor } = s.requireVendor()
      const orders = s.db.orders.filter((o) => o.vendorId === vendor.id && o.paymentStatus === "successful")
      const now = s.now()
      const today = toDateOnly(now, LAUNCH_TIMEZONE)
      const sf = s.db.storefronts.find((x) => x.vendorId === vendor.id)
      const products = s.db.products.filter((p) => p.vendorId === vendor.id)
      const lowStockVariants = products.filter((p) => p.status === "active").flatMap((p) => p.variants.filter((v) => v.stock <= 3).map((v) => ({ productId: p.id, productTitle: p.title, variantId: v.id, variantName: v.name, stock: v.stock })))
      const net = (o: Order) => (["cancelled", "declined"].includes(o.status) ? 0 : settlementFor(o.pricing, o.commissionBps).vendorPayable)
      const salesByDay = Array.from({ length: 30 }, (_, i) => {
        const date = addDays(today, i - 29)
        const day = orders.filter((o) => toDateOnly(new Date(o.createdAt), LAUNCH_TIMEZONE) === date)
        return { date, net: day.reduce((n, o) => n + net(o), 0), orders: day.length }
      })
      const dash: VendorDashboard = {
        vendorName: vendor.name,
        status: vendor.status,
        storefrontStatus: sf?.status ?? null,
        storefrontSlug: sf?.slug ?? null,
        metrics: {
          needsAcceptance: orders.filter((o) => o.status === "awaiting_vendor_acceptance").length,
          inProgress: orders.filter((o) => ["accepted", "preparing", "ready_for_dispatch", "dispatched", "delivery_issue"].includes(o.status)).length,
          deliveredThisWeek: orders.filter((o) => o.status === "delivered" && daysBetween(toDateOnly(new Date(o.updatedAt), LAUNCH_TIMEZONE), today) <= 7).length,
          netSales30d: salesByDay.reduce((n, d) => n + d.net, 0),
          lowStock: lowStockVariants.length,
          pendingListings: products.filter((p) => p.status === "pending_review").length,
        },
        actionable: orders.filter((o) => VENDOR_ACTIONABLE.includes(o.status)).sort((a, b) => (a.acceptBy ?? a.createdAt).localeCompare(b.acceptBy ?? b.createdAt)).slice(0, 8).map((o) => vendorOrderView(s, o)),
        lowStockVariants,
        salesByDay,
      }
      return clone(dash)
    },

    async listVendorOrders(filter) {
      await latency(160)
      const { vendor } = requireScope(s, "orders")
      let orders = s.db.orders.filter((o) => o.vendorId === vendor.id && o.paymentStatus === "successful")
      if (filter.source) orders = orders.filter((o) => o.source === filter.source)
      if (filter.purchaseType) orders = orders.filter((o) => o.purchaseType === filter.purchaseType)
      if (filter.status === "actionable") orders = orders.filter((o) => VENDOR_ACTIONABLE.includes(o.status))
      if (filter.status === "completed") orders = orders.filter((o) => ["delivered", "cancelled", "declined", "disputed"].includes(o.status))
      return clone(orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => vendorOrderView(s, o)))
    },

    async getVendorOrder(id) {
      await latency(120)
      const { vendor } = requireScope(s, "orders")
      return clone(vendorOrderView(s, requireVendorOrder(s, vendor, id)))
    },

    async vendorOrderAction(id, action, note) {
      await latency(350)
      const { vendor, user } = requireScope(s, "orders")
      const o = requireVendorOrder(s, vendor, id)
      switch (action) {
        case "accept":
          transition(s, o, "accepted", "vendor", note)
          o.delivery.windowKind = "confirmed"
          s.db.jobs.filter((j) => j.idempotencyKey === `accept:${o.id}`).forEach((j) => (j.status = "done"))
          s.notify({ to: o.buyerEmail, kind: "status", subject: `${vendor.name} accepted your order`, body: `Delivery is confirmed for ${o.delivery.requestedDate}.`, link: { label: "Track order", href: `/account/orders/${o.id}` } })
          break
        case "decline":
          // §9: automatic substitution is prohibited — a decline always opens the buyer's resolution.
          cancelWithRefund(s, o, "vendor_declined", "vendor", note ? `The vendor couldn't fulfil this order: ${note}` : "The vendor couldn't fulfil this order.", "declined")
          break
        case "start_preparing":
          transition(s, o, "preparing", "vendor", note)
          break
        case "mark_ready":
          transition(s, o, "ready_for_dispatch", "vendor", note)
          break
        case "dispatch": {
          transition(s, o, "dispatched", "vendor", note)
          const gift = o.giftId ? s.db.gifts.find((g) => g.id === o.giftId) : null
          s.notify({ to: o.buyerEmail, kind: "status", subject: `${o.reference} is on its way`, body: note ? `Rider note: ${note}` : `Arriving ${o.delivery.requestedDate}.`, link: { label: "Track order", href: `/account/orders/${o.id}` } })
          if (gift && gift.revealStatus !== "scheduled" && !gift.contactStopped && gift.recipientEmail) {
            s.notify({ to: gift.recipientEmail, kind: "status", subject: "Your gift is on its way", body: "It's out for delivery today." })
          }
          break
        }
        case "deliver":
          transition(s, o, "delivered", "vendor", note)
          s.notify({ to: o.buyerEmail, kind: "status", subject: `${o.reference} was delivered`, body: "If anything isn't right, open a case from your order within 48 hours." })
          break
        case "report_issue":
          if (!note?.trim()) throw new ApiError("validation", "Describe what happened so support can help.")
          transition(s, o, "delivery_issue", "vendor", note)
          o.delivery.attempts += 1
          s.notify({ to: o.buyerEmail, kind: "status", subject: `Delivery update for ${o.reference}`, body: `${note} We'll keep you posted with the next attempt.` })
          break
      }
      s.audit(user.email, `order.${action}`, "order", o.id, note ?? "")
      s.persist()
    },

    async listVendorProducts() {
      await latency(150)
      const { vendor } = requireScope(s, "catalogue")
      const now = s.now()
      const rows: VendorProductRow[] = s.db.products
        .filter((p) => p.vendorId === vendor.id && p.status !== "archived")
        .map((p) => {
          const holds = s.db.holds.filter((h) => p.variants.some((v) => v.id === h.variantId) && h.status === "active" && new Date(h.expiresAt) > now)
          const committed = s.db.orders.filter((o) => o.vendorId === vendor.id && o.paymentStatus === "successful" && !["delivered", "cancelled", "declined", "dispatched"].includes(o.status)).flatMap((o) => o.lines).filter((l) => l.productId === p.id).reduce((n, l) => n + l.quantity, 0)
          return {
            product: p,
            sellable: Object.fromEntries(p.variants.map((v) => [v.id, Math.max(0, v.stock - holds.filter((h) => h.variantId === v.id).reduce((n, h) => n + h.quantity, 0))])),
            committed,
            reserved: holds.reduce((n, h) => n + h.quantity, 0),
          }
        })
      return clone(rows.sort((a, b) => b.product.createdAt.localeCompare(a.product.createdAt)))
    },

    async saveVendorProduct(input) {
      await latency(500)
      const { vendor, user } = requireScope(s, "catalogue")
      if (!input.title.trim()) throw new ApiError("validation", "Add a product title.")
      if (!input.variants.length) throw new ApiError("validation", "Add at least one option with a price.")
      if (input.variants.some((v) => !Number.isInteger(v.price) || v.price <= 0)) throw new ApiError("validation", "Every option needs a price above ₦0.")
      if (input.images.length === 0) throw new ApiError("validation", "Add at least one photo.")
      const flagged = /\b(cure|cures|heal|heals|treat(s)? (illness|disease)|guaranteed results|miracle)\b/i.test(`${input.title} ${input.description} ${input.summary}`)
      const existing = input.id ? s.db.products.find((p) => p.id === input.id && p.vendorId === vendor.id) : undefined
      if (input.id && !existing) throw new ApiError("not_found", "That product isn't in your catalogue.")
      const id = existing?.id ?? uid("prd")
      const next: Product = {
        id,
        vendorId: vendor.id,
        slug: existing?.slug ?? `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${id.slice(-4)}`,
        title: input.title.trim(), summary: input.summary.trim(), description: input.description.trim(), included: input.included.filter(Boolean), dimensions: input.dimensions,
        images: input.images, category: input.category, occasions: input.occasions, interests: input.interests, status: existing?.status ?? "pending_review",
        variants: input.variants.map((v, i) => {
          const old = existing?.variants.find((x) => x.id === v.id)
          return { id: old?.id ?? `${id}_v${i + 1}_${Math.random().toString(36).slice(2, 5)}`, productId: id, name: v.name, sku: v.sku, price: v.price, stock: Math.max(0, Math.floor(v.stock)) }
        }),
        prepHours: input.prepHours, perishable: input.perishable, highlyCustomised: input.highlyCustomised, returnEligible: input.returnEligible,
        personalisation: input.personalisation, wrapping: input.wrapping, sponsored: existing?.sponsored ?? false, editorialScore: existing?.editorialScore ?? 0.6,
        createdAt: existing?.createdAt ?? s.nowIso(), moderationNote: flagged ? "Flagged automatically: possible medical or guaranteed-results claim." : undefined,
      }
      // VEN 05: new listings and material changes go back to moderation. Historical order prices are snapshots and never change (VEN 06).
      const material = !existing || MATERIAL_FIELDS.some((f) => JSON.stringify(existing[f]) !== JSON.stringify(next[f])) || flagged
      if (material) next.status = "pending_review"
      if (existing) Object.assign(existing, next)
      else s.db.products.push(next)
      s.audit(user.email, existing ? "product.update" : "product.create", "product", id, material ? "Sent for review" : "Price/stock update")
      s.persist()
      return { id, status: next.status, needsReview: material }
    },

    async updateStock(productId, variantId, stock) {
      const { vendor } = requireScope(s, "catalogue")
      const p = s.db.products.find((x) => x.id === productId && x.vendorId === vendor.id)
      const v = p?.variants.find((x) => x.id === variantId)
      if (!v) throw new ApiError("not_found", "That option no longer exists.")
      if (!Number.isInteger(stock) || stock < 0 || stock > 10_000) throw new ApiError("validation", "Enter a whole number between 0 and 10,000.")
      v.stock = stock
      s.persist()
    },

    async archiveProduct(productId) {
      await latency(250)
      const { vendor, user } = requireScope(s, "catalogue")
      const p = s.db.products.find((x) => x.id === productId && x.vendorId === vendor.id)
      if (!p) throw new ApiError("not_found", "That product isn't in your catalogue.")
      p.status = "archived"
      // Wishlists keep historical purchases; open wishes become unavailable with host-approved alternatives (WIS 07).
      s.db.events.flatMap((e) => e.wishlist).filter((w) => w.productId === p.id && w.status === "active").forEach((w) => (w.status = "unavailable"))
      s.audit(user.email, "product.archive", "product", p.id, p.title)
      s.persist()
    },

    async saveStorefront(input) {
      await latency(400)
      const { vendor, user } = requireOwner(s)
      const sf = s.db.storefronts.find((x) => x.vendorId === vendor.id)
      const slug = input.slug.trim().toLowerCase()
      if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) throw new ApiError("validation", "Use 3–40 lowercase letters, numbers and hyphens for your link.")
      if (RESERVED_SLUGS.includes(slug) || /justgifter|official|support/.test(slug)) throw new ApiError("validation", "That link is reserved. Try something based on your business name.")
      const taken = s.db.storefronts.some((x) => x.vendorId !== vendor.id && (x.slug === slug || x.slugHistory.includes(slug)))
      if (taken) throw new ApiError("conflict", "That link is already in use.")
      const productIds = new Set(s.db.products.filter((p) => p.vendorId === vendor.id).map((p) => p.id))
      const collections = input.collections.map((c) => ({ ...c, productIds: c.productIds.filter((id) => productIds.has(id)) }))
      let slugChanged = false
      if (sf) {
        if (sf.slug !== slug) {
          // STF 11: old slugs keep redirecting and are never reassigned.
          sf.slugHistory = [...new Set([...sf.slugHistory, sf.slug])]
          slugChanged = true
          s.audit(user.email, "storefront.slug_change", "storefront", sf.id, `${sf.slug} → ${slug}`)
        }
        Object.assign(sf, { slug, headline: input.headline, intro: input.intro, accent: input.accent, layout: input.layout, coverImage: input.coverImage, featuredProductIds: input.featuredProductIds.filter((id) => productIds.has(id)), collections, updatedAt: s.nowIso() })
        vendor.slug = slug
      } else {
        s.db.storefronts.push({ id: uid("stf"), vendorId: vendor.id, slug, status: "draft", headline: input.headline, intro: input.intro, accent: input.accent, layout: input.layout, coverImage: input.coverImage, featuredProductIds: input.featuredProductIds, collections, publishedAt: null, updatedAt: s.nowIso(), slugHistory: [] })
      }
      s.persist()
      return { slugChanged }
    },

    async setStorefrontStatus(status) {
      await latency(300)
      const { vendor, user } = requireOwner(s)
      const sf = s.db.storefronts.find((x) => x.vendorId === vendor.id)
      if (!sf) throw new ApiError("not_found", "Set up your storefront first.")
      if (status === "published") {
        if (vendor.status !== "approved") throw new ApiError("forbidden", "Your store can be published once your application is approved.")
        if (!s.db.products.some((p) => p.vendorId === vendor.id && p.status === "active")) throw new ApiError("validation", "Add at least one approved product before publishing.")
        sf.publishedAt = sf.publishedAt ?? s.nowIso()
      }
      sf.status = status
      sf.updatedAt = s.nowIso()
      s.audit(user.email, `storefront.${status}`, "storefront", sf.id, "")
      s.persist()
    },

    async getStorefrontAnalytics(days) {
      await latency(250)
      const { vendor } = s.requireVendor()
      const today = toDateOnly(s.now(), LAUNCH_TIMEZONE)
      const from = addDays(today, -(days - 1))
      const events = s.db.analytics.filter((a) => a.vendorId === vendor.id && toDateOnly(new Date(a.at), LAUNCH_TIMEZONE) >= from)
      const orders = s.db.orders.filter((o) => o.vendorId === vendor.id && o.paymentStatus === "successful" && toDateOnly(new Date(o.createdAt), LAUNCH_TIMEZONE) >= from && !["cancelled", "declined"].includes(o.status))
      const net = (o: Order) => settlementFor(o.pricing, o.commissionBps).vendorPayable
      const storeOrders = orders.filter((o) => o.source === "storefront")
      const visits = events.filter((e) => e.kind === "visit").length
      const productViews = events.filter((e) => e.kind === "product_view")
      const out: StorefrontAnalytics = {
        range: { from, to: today },
        totals: {
          visits,
          productViews: productViews.length,
          checkoutStarts: events.filter((e) => e.kind === "checkout_start").length,
          paidOrders: storeOrders.length,
          conversion: visits ? storeOrders.length / visits : 0,
          netSales: storeOrders.reduce((n, o) => n + net(o), 0),
        },
        byDay: Array.from({ length: days }, (_, i) => {
          const date = addDays(from, i)
          const dayOrders = storeOrders.filter((o) => toDateOnly(new Date(o.createdAt), LAUNCH_TIMEZONE) === date)
          return { date, visits: events.filter((e) => e.kind === "visit" && toDateOnly(new Date(e.at), LAUNCH_TIMEZONE) === date).length, paidOrders: dayOrders.length, netSales: dayOrders.reduce((n, o) => n + net(o), 0) }
        }),
        topProducts: [...new Set(productViews.map((e) => e.productId!))].map((pid) => ({
          productId: pid,
          title: s.db.products.find((p) => p.id === pid)?.title ?? pid,
          views: productViews.filter((e) => e.productId === pid).length,
          orders: storeOrders.filter((o) => o.lines.some((l) => l.productId === pid)).length,
        })).sort((a, b) => b.views - a.views).slice(0, 5),
        bySource: (["storefront", "marketplace", "wishlist"] as const).map((source) => {
          const list = orders.filter((o) => o.source === source)
          return { source, orders: list.length, netSales: list.reduce((n, o) => n + net(o), 0) }
        }),
      }
      return clone(out)
    },

    async getPayoutStatement() {
      await latency(220)
      const { vendor } = requireOwner(s)
      const app = s.db.applications.find((a) => a.vendorId === vendor.id)
      const paidIds = new Set(s.db.payouts.filter((p) => p.vendorId === vendor.id && p.status === "paid").flatMap((p) => p.orderIds))
      const today = toDateOnly(s.now(), LAUNCH_TIMEZONE)
      const lines: PayoutStatement["lines"] = s.db.orders
        .filter((o) => o.vendorId === vendor.id && o.paymentStatus === "successful")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((o) => {
          const st = settlementFor(o.pricing, o.commissionBps)
          const refunds = s.db.refunds.filter((r) => r.orderId === o.id && r.status === "completed").reduce((n, r) => n + r.amount, 0)
          const openCase = s.db.cases.some((c) => c.orderId === o.id && c.status !== "resolved")
          const deliveredDaysAgo = o.status === "delivered" ? daysBetween(toDateOnly(new Date(o.updatedAt), LAUNCH_TIMEZONE), today) : -1
          const payoutStatus = paidIds.has(o.id) ? "paid" : openCase ? "held" : o.status !== "delivered" ? "pending_delivery" : deliveredDaysAgo < DISPUTE_WINDOW_DAYS ? "in_dispute_window" : "eligible"
          const refundShare = st.gross ? Math.round((refunds * st.vendorPayable) / st.gross) : 0
          return { orderId: o.id, reference: o.reference, date: o.createdAt, gross: st.gross, discount: o.pricing.discount, commission: st.commission, refunds, net: Math.max(0, st.vendorPayable - refundShare), payoutStatus }
        })
      return clone({
        balance: vendorBalance(s.db.ledger, vendor.id),
        payouts: s.db.payouts.filter((p) => p.vendorId === vendor.id),
        lines,
        bank: { name: app?.payoutBank ?? "—", accountMasked: app?.payoutAccountMasked ?? "—", pendingChange: Boolean(s.db.pendingBankChanges[vendor.id]) },
        disputeWindowDays: DISPUTE_WINDOW_DAYS,
      })
    },

    async requestBankChange({ bank, account, code }) {
      await latency(500)
      const { vendor, user } = requireOwner(s)
      if (!code) {
        // Step 1: re-authenticate the owner with a fresh code (AC 14).
        const otp = issueOtp(s, `bank:${vendor.id}`)
        s.notify({ to: user.email, kind: "otp", subject: "Confirm your bank detail change", body: `Your code is ${otp}. If you didn't request this, contact support immediately.` })
        s.persist()
        throw new ApiError("unauthorised", `We've sent a code to ${maskContact(user.email)}. Enter it to confirm. (Demo code: ${otp})`)
      }
      consumeOtp(s, `bank:${vendor.id}`, code)
      if (!/^\d{10}$/.test(account.replace(/\s/g, ""))) throw new ApiError("validation", "Enter a 10-digit NUBAN account number.")
      s.db.pendingBankChanges[vendor.id] = { bank, accountMasked: `•••• ${account.slice(-4)}`, requestedAt: s.nowIso() }
      // Pending payouts are held until operations reviews the change.
      s.db.payouts.filter((p) => p.vendorId === vendor.id && p.status === "scheduled").forEach((p) => (p.status = "on_hold"))
      s.notify({ to: user.email, kind: "status", subject: "Bank details change requested", body: "Payouts are paused until our team confirms the new account, usually within one working day." })
      s.audit(user.email, "vendor.bank_change_requested", "vendor", vendor.id, `${bank} •••• ${account.slice(-4)}`)
      s.persist()
    },

    async listStaff() {
      await latency(120)
      const { vendor } = s.requireVendor()
      return clone(s.db.staff.filter((m) => m.vendorId === vendor.id).map(({ vendorId: _v, ...m }) => m))
    },

    async inviteStaff(input) {
      await latency(300)
      const { vendor, user } = requireOwner(s)
      if (vendor.status !== "approved") throw new ApiError("forbidden", "You can invite staff once your store is approved.")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new ApiError("validation", "Enter a valid email address.")
      if (!input.scopes.length) throw new ApiError("validation", "Choose at least one area they can access.")
      s.db.staff.push({ id: uid("stf"), vendorId: vendor.id, name: input.name, email: input.email.toLowerCase(), role: "staff", scopes: input.scopes, status: "invited" })
      s.notify({ to: input.email, kind: "status", subject: `You've been invited to help run ${vendor.name}`, body: `Access: ${input.scopes.join(", ")}. Payout settings stay with the owner.` })
      s.audit(user.email, "vendor.staff_invite", "vendor", vendor.id, `${input.email}: ${input.scopes.join(", ")}`)
      s.persist()
    },

    async removeStaff(id) {
      const { vendor, user } = requireOwner(s)
      const m = s.db.staff.find((x) => x.id === id && x.vendorId === vendor.id)
      if (!m || m.role === "owner") throw new ApiError("forbidden", "The owner can't be removed.")
      s.db.staff = s.db.staff.filter((x) => x.id !== id)
      s.audit(user.email, "vendor.staff_remove", "vendor", vendor.id, m.email)
      s.persist()
    },

    async uploadMedia(blob) {
      requireScope(s, "catalogue")
      // Demo storage: a data URL kept with the product. Supabase uses the product-media bucket.
      return new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new ApiError("validation", "Couldn't read that image."))
        r.readAsDataURL(blob)
      })
    },

    async updateVendorSettings(input) {
      await latency(300)
      const { vendor, user } = requireOwner(s)
      if (input.openHour >= input.closeHour) throw new ApiError("validation", "Closing time must be after opening time.")
      if (!input.days.length) throw new ApiError("validation", "Choose at least one operating day.")
      vendor.operating = { ...vendor.operating, blackoutDates: [...new Set(input.blackoutDates)].sort(), dailyCapacity: Math.max(1, input.dailyCapacity), cutoffHour: input.cutoffHour, openHour: input.openHour, closeHour: input.closeHour, days: input.days, deliveryWindow: [Math.max(input.openHour, 9), input.closeHour] }
      s.audit(user.email, "vendor.settings", "vendor", vendor.id, "Operating calendar updated")
      s.persist()
    },
  }
}

export { timeline }

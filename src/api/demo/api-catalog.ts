import type { Product } from "@domain/index.ts"
import {
  checkDeliveryDate,
  deliverableDates,
  extractPreferences,
  limitingMessage,
  recommend,
  sanitisePreferences,
  uid,
  randomOtp,
  addMinutes,
  safeEqual,
} from "@domain/index.ts"
import type { Api, AssistantPick, DeliveryQuote, GiftGuide, ProductCard, ProductPage, SessionUser } from "../types"
import { platformRoleOf, withPlatformRole } from "./api-admin"
import { ApiError } from "../errors"
import { clone, latency, type Store, type DemoUser } from "./store"
import { isPurchasable, productCard, vendorPublic } from "./views"
import { recordAnalytics } from "./commerce"
import { DEMO_USERS } from "./seed-demo"

export const toSession = (u: DemoUser): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  emailVerified: u.emailVerified,
  roles: u.roles,
  vendorId: u.vendorId,
  // Demo personas stand in for users who completed MFA; the Supabase backend checks aal2.
  mfaVerified: true,
  avatar: u.avatar,
})

export function issueOtp(s: Store, key: string): string {
  const code = randomOtp()
  const recent = s.db.otps.filter((o) => o.key === key && new Date(o.expiresAt).getTime() - Date.now() > 9 * 60_000)
  if (recent.length >= 3) throw new ApiError("rate_limited", "Too many codes requested. Wait a minute before asking for another.")
  s.db.otps.push({ key, code, expiresAt: addMinutes(s.now(), 10), attempts: 0 })
  return code
}

export function consumeOtp(s: Store, key: string, code: string) {
  const candidates = s.db.otps.filter((o) => o.key === key && new Date(o.expiresAt) > s.now())
  const latest = candidates.at(-1)
  if (!latest) throw new ApiError("expired", "That code has expired. Request a new one.")
  latest.attempts += 1
  if (latest.attempts > 5) throw new ApiError("rate_limited", "Too many attempts. Request a new code.")
  if (!safeEqual(latest.code, code.trim())) {
    s.persist()
    throw new ApiError("invalid_code", "That code doesn't match. Check the latest message and try again.")
  }
  s.db.otps = s.db.otps.filter((o) => o.key !== key)
}

export function authApi(s: Store): Pick<Api, "getSession" | "signInWithEmail" | "verifyEmailCode" | "signOut" | "listPersonas" | "switchPersona" | "resetDemo"> {
  return {
    async getSession() {
      const u = s.user()
      return u ? toSession(u) : null
    },
    async signInWithEmail(email) {
      await latency()
      const normalised = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) throw new ApiError("validation", "Enter a valid email address.")
      const code = issueOtp(s, `signin:${normalised}`)
      // Same response whether or not an account exists, to prevent user enumeration (SEC 03).
      s.notify({ to: normalised, kind: "otp", subject: "Your JustGifter sign-in code", body: `Your code is ${code}. It expires in 10 minutes.` })
      s.persist()
      return { devCode: code }
    },
    async verifyEmailCode(email, code) {
      await latency()
      const normalised = email.trim().toLowerCase()
      consumeOtp(s, `signin:${normalised}`, code)
      let user = s.db.users.find((u) => u.email === normalised)
      if (!user) {
        user = { id: uid("usr"), name: normalised.split("@")[0], email: normalised, emailVerified: true, roles: ["customer"], vendorId: null }
        s.db.users.push(user)
      }
      user.emailVerified = true
      s.db.sessionUserId = user.id
      // A live operations-team invitation for this verified email is accepted on sign-in.
      const invite = s.db.platformInvites.find((i) => i.email === normalised && i.status === "pending" && i.expiresAt > s.nowIso())
      if (invite) {
        user.roles = withPlatformRole(user.roles, platformRoleOf(user.roles) === "admin" ? "admin" : invite.role)
        invite.status = "accepted"
        s.audit(normalised, "team.joined", "user", user.id, `Accepted ${invite.role} invitation from ${invite.invitedBy}`)
      }
      // Link guest orders placed with this email to the new session.
      s.db.orders.filter((o) => o.buyerEmail === normalised && !o.buyerUserId).forEach((o) => (o.buyerUserId = user!.id))
      s.persist()
      return toSession(user)
    },
    async signOut() {
      s.db.sessionUserId = null
      s.db.guestAccessEmails = []
      s.persist()
    },
    listPersonas() {
      const label: Record<string, [string, string]> = {
        usr_ada: ["Adaeze — customer & host", "Sends gifts, hosts “Ada turns 30”"],
        usr_tunde: ["Tunde — customer", "Has bought from Ada's wishlist"],
        usr_bisi: ["Bisi — vendor owner", "Runs Bloom & Bisi florist"],
        usr_tomi: ["Tomi — vendor staff", "Orders-only access at Bloom & Bisi"],
        usr_kelechi: ["Kelechi — platform ops", "Admin & support tools"],
      }
      return [
        { id: "guest", label: "Guest", description: "Browse and buy without an account", user: null },
        ...DEMO_USERS.filter((u) => label[u.id]).map((u) => ({ id: u.id, label: label[u.id][0], description: label[u.id][1], user: toSession(u) })),
      ]
    },
    async switchPersona(id) {
      s.db.sessionUserId = id === "guest" ? null : id
      s.db.guestAccessEmails = []
      s.persist()
      const u = s.user()
      return u ? toSession(u) : null
    },
    async resetDemo() {
      await s.reset()
    },
  }
}

const GUIDES: GiftGuide[] = [
  { id: "under-25k", title: "Thoughtful under ₦25k", description: "Small gifts that don't feel small.", image: "/media/p/kraft-box.webp", productIds: ["prd_kraft_treats", "prd_amber_candle", "prd_ceramic_mug", "prd_succulent", "prd_face_oil", "prd_cupcakes", "prd_notebook", "prd_tote"] },
  { id: "same-day", title: "Arrives today in Lagos", description: "Order before early afternoon for same-day delivery.", image: "/media/p/sunflowers.webp", productIds: ["prd_velvet_roses", "prd_sunflower_box", "prd_peony_cloud", "prd_kraft_treats", "prd_celebration_box", "prd_tulip_vase"] },
  { id: "new-home", title: "For a new home", description: "Things that make a house feel lived in.", image: "/media/e/house.webp", productIds: ["prd_knit_throw", "prd_cloud_pillow", "prd_barista_cups", "prd_cactus", "prd_amber_candle", "prd_bread_basket"] },
  { id: "self-care", title: "A little self-care", description: "For someone who needs a slower evening.", image: "/media/p/ritual-kit.webp", productIds: ["prd_ritual_kit", "prd_face_oil", "prd_serum", "prd_tea_ritual", "prd_amber_candle"] },
]

export function catalogApi(s: Store): Pick<Api, "getHomeFeed" | "listProducts" | "getProduct" | "getDeliveryQuote" | "listVendors" | "getStorefront" | "recordStoreVisit" | "recommend" | "recordRecommendationFeedback"> {
  const purchasable = () => s.db.products.filter((p) => isPurchasable(s, p))

  return {
    async getHomeFeed() {
      await latency(120)
      const all = purchasable()
      const cards = (ids: string[]) => ids.map((id) => all.find((p) => p.id === id)).filter(Boolean).map((p) => productCard(s, p!))
      return clone({
        featured: cards(["prd_celebration_box", "prd_peony_cloud", "prd_amber_candle", "prd_pendant", "prd_ritual_kit", "prd_coffee_box", "prd_choc_drip_cake", "prd_velvet_roses"]),
        trending: cards(["prd_velvet_roses", "prd_book_bundle", "prd_red_bag", "prd_swaddle", "prd_espresso", "prd_tulip_vase"]),
        vendors: s.db.vendors.filter((v) => v.status === "approved" && v.featured).map((v) => vendorPublic(s, v)),
        guides: GUIDES,
        stats: { vendors: s.db.vendors.filter((v) => v.status === "approved").length, zones: 5, products: all.length },
      })
    },

    async listProducts(q) {
      await latency(140)
      let items = purchasable()
      if (q.ids) items = items.filter((p) => q.ids!.includes(p.id))
      if (q.collectionId) {
        const col = s.db.storefronts.flatMap((sf) => sf.collections).find((c) => c.id === q.collectionId)
        items = items.filter((p) => col?.productIds.includes(p.id))
      }
      if (q.vendorId) items = items.filter((p) => p.vendorId === q.vendorId)
      if (q.q) {
        const terms = q.q.toLowerCase().split(/\s+/).filter(Boolean)
        items = items.filter((p) => {
          const vendor = s.db.vendors.find((v) => v.id === p.vendorId)!
          const hay = `${p.title} ${p.summary} ${p.description} ${p.category} ${p.occasions.join(" ")} ${p.interests.join(" ")} ${vendor.name}`.toLowerCase()
          return terms.every((t) => hay.includes(t))
        })
      }
      const facetBase = items
      if (q.occasion) items = items.filter((p) => p.occasions.includes(q.occasion!))
      if (q.category) items = items.filter((p) => p.category === q.category)
      if (q.personalisable) items = items.filter((p) => p.personalisation)
      let cards = items.map((p) => productCard(s, p, q.zoneId))
      if (q.budgetMin !== undefined) cards = cards.filter((c) => c.priceTo >= q.budgetMin!)
      if (q.budgetMax !== undefined) cards = cards.filter((c) => c.priceFrom <= q.budgetMax!)
      if (q.zoneId) cards = cards.filter((c) => s.db.vendors.find((v) => v.id === c.vendor.id)!.zones.some((z) => z.zoneId === q.zoneId))
      if (q.deliverBy) cards = cards.filter((c) => c.earliest && c.earliest.date <= q.deliverBy!)
      if (q.inStockOnly) cards = cards.filter((c) => c.inStock)

      const score = (c: ProductCard) => {
        const p = items.find((x) => x.id === c.id)!
        return p.editorialScore + (c.inStock ? 1 : 0) + (q.occasion && p.occasions[0] === q.occasion ? 0.3 : 0)
      }
      switch (q.sort ?? "relevance") {
        case "price_asc": cards.sort((a, b) => a.priceFrom - b.priceFrom); break
        case "price_desc": cards.sort((a, b) => b.priceFrom - a.priceFrom); break
        case "earliest": cards.sort((a, b) => (a.earliest?.date ?? "9999").localeCompare(b.earliest?.date ?? "9999") || a.priceFrom - b.priceFrom); break
        default: cards.sort((a, b) => score(b) - score(a))
      }
      const page = q.page ?? 1
      const pageSize = q.pageSize ?? 24
      const count = <K extends "category" | "occasions">(key: K) => {
        const m = new Map<string, number>()
        facetBase.forEach((p) => (key === "category" ? [p.category] : p.occasions).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)))
        return [...m.entries()].map(([id, n]) => ({ id, count: n }))
      }
      const result: ProductPage = {
        items: cards.slice((page - 1) * pageSize, page * pageSize),
        total: cards.length,
        page,
        pageSize,
        facets: { categories: count("category") as ProductPage["facets"]["categories"], occasions: count("occasions") as ProductPage["facets"]["occasions"] },
      }
      return clone(result)
    },

    async getProduct(idOrSlug) {
      await latency(120)
      const p = s.db.products.find((x) => x.id === idOrSlug || x.slug === idOrSlug)
      if (!p) return null
      const vendor = s.db.vendors.find((v) => v.id === p.vendorId)!
      const user = s.user()
      const canSeeUnapproved = user && (user.vendorId === p.vendorId || user.roles.includes("admin"))
      if (!isPurchasable(s, p) && !canSeeUnapproved && p.status !== "archived") return null
      const now = s.now()
      const availability = Object.fromEntries(p.variants.map((v) => [v.id, Math.max(0, v.stock - s.db.holds.filter((h) => h.variantId === v.id && h.status === "active" && new Date(h.expiresAt) > now).reduce((n, h) => n + h.quantity, 0))]))
      const related = purchasable()
        .filter((x) => x.id !== p.id && (x.category === p.category || x.occasions.some((o) => p.occasions.includes(o))))
        .sort((a, b) => b.editorialScore - a.editorialScore)
        .slice(0, 8)
        .map((x) => productCard(s, x))
      return clone({ product: p, vendor: vendorPublic(s, vendor), availability, related })
    },

    async getDeliveryQuote({ productId, zoneId, date, personalised }) {
      await latency(90)
      const p = s.db.products.find((x) => x.id === productId)
      const vendor = p && s.db.vendors.find((v) => v.id === p.vendorId)
      if (!p || !vendor) throw new ApiError("not_found", "This item is no longer available.")
      const prepHours = p.prepHours + (personalised ? p.personalisation?.extraPrepHours ?? 0 : 0)
      const ctx = { now: s.now(), timezone: s.db.settings.timezone, vendor, zoneId, prepHours, maxAdvanceDays: s.db.settings.maxAdvanceDays }
      const check = checkDeliveryDate(ctx, date ?? null)
      const quote: DeliveryQuote = check.feasible
        ? { feasible: true, earliest: check.earliest, date: check.date, windowStart: check.windowStart, windowEnd: check.windowEnd, fee: check.fee, sameDay: check.sameDay, dates: deliverableDates(ctx, 45), responsibleParty: vendor.fulfilment }
        : { feasible: false, reason: check.reason, message: check.message, earliest: check.earliest, date: null, windowStart: null, windowEnd: null, fee: check.fee, sameDay: false, dates: check.reason === "zone_unsupported" ? [] : deliverableDates(ctx, 45), responsibleParty: vendor.fulfilment }
      return quote
    },

    async listVendors(input) {
      await latency(100)
      return clone(s.db.vendors.filter((v) => v.status === "approved" && (!input?.featured || v.featured)).map((v) => vendorPublic(s, v)))
    },

    async getStorefront(slug) {
      await latency(140)
      let sf = s.db.storefronts.find((x) => x.slug === slug)
      if (!sf) {
        const moved = s.db.storefronts.find((x) => x.slugHistory.includes(slug))
        if (moved) return { kind: "redirect", slug: moved.slug }
        return { kind: "not_found" }
      }
      const vendor = s.db.vendors.find((v) => v.id === sf!.vendorId)!
      const user = s.user()
      const isOwner = user?.vendorId === vendor.id
      if (vendor.status === "suspended") return { kind: "unavailable", vendorName: vendor.name, reason: "suspended" }
      if (sf.status !== "published" && !isOwner) return { kind: "unavailable", vendorName: vendor.name, reason: sf.status === "paused" ? "paused" : "draft" }
      sf = clone(sf)
      const products = s.db.products.filter((p) => p.vendorId === vendor.id && p.status === "active").map((p) => productCard(s, p))
      return clone({ kind: "found" as const, view: { storefront: sf, vendor: vendorPublic(s, vendor), products } })
    },

    async recordStoreVisit(storefrontId, kind, productId) {
      recordAnalytics(s, storefrontId, kind, productId)
      s.persist()
    },

    async recommend(req) {
      await latency(500)
      const now = s.now()
      const fromText = req.message ? extractPreferences(req.message, now, s.db.settings.timezone) : { interests: [] }
      const prefs = sanitisePreferences({ ...fromText, ...Object.fromEntries(Object.entries(req.prefs ?? {}).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) })
      if (req.prefs?.interests?.length || fromText.interests.length) prefs.interests = [...new Set([...(fromText.interests ?? []), ...(req.prefs?.interests ?? [])])]
      const products: Product[] = s.db.products.filter((p) => isPurchasable(s, p))
      const result = recommend(products, prefs, { now, timezone: s.db.settings.timezone, maxAdvanceDays: s.db.settings.maxAdvanceDays, vendors: new Map(s.db.vendors.map((v) => [v.id, v])), holds: s.db.holds }, 9)
      // AI 02: every suggested ID is re-validated against the live catalogue before rendering.
      const picks: AssistantPick[] = result.results.flatMap((r) => {
        const p = products.find((x) => x.id === r.productId)
        if (!p || !p.variants.some((v) => v.id === r.variantId && v.price === r.price)) return []
        return [{ product: productCard(s, p, prefs.zoneId), variantId: r.variantId, explanation: r.explanation, reasons: r.reasons, totalWithDelivery: r.deliveryFee !== null ? r.price + r.deliveryFee : null }]
      })
      return clone({
        prefs,
        picks,
        limiting: result.limiting,
        limitingMessage: picks.length ? null : limitingMessage(result.limiting, prefs),
        followUps: result.followUps,
        deliveryUncertain: result.deliveryUncertain,
        source: "rules" as const,
        sessionId: uid("rs"),
      })
    },

    async recordRecommendationFeedback(sessionId, productId, helpful) {
      s.db.recommendationFeedback.push({ sessionId, productId, helpful, at: s.nowIso() })
      s.persist()
    },
  }
}

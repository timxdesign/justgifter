// deno-lint-ignore-file no-explicit-any
import type { Product, ZoneId } from "../_shared/domain/index.ts"
import { checkDeliveryDate, deliverableDates, extractPreferences, limitingMessage, recommend, sanitisePreferences, toDateOnly, uid } from "../_shared/domain/index.ts"
import { db, must } from "../_shared/db.ts"
import { fail } from "../_shared/http.ts"
import { claude, PROMPT_VERSION } from "../_shared/ai.ts"
import { activeHolds, products, settings, toStorefront, vendorsById } from "../_shared/repo.ts"
import { productCard, vendorPublic } from "../_shared/views.ts"
import type { Handler } from "./context.ts"
import { str } from "./context.ts"

const GUIDES = [
  { id: "under-25k", title: "Thoughtful under ₦25k", description: "Small gifts that don't feel small.", image: "/media/p/kraft-box.webp", productIds: ["prd_kraft_treats", "prd_amber_candle", "prd_ceramic_mug", "prd_succulent", "prd_face_oil", "prd_cupcakes", "prd_notebook", "prd_tote"] },
  { id: "same-day", title: "Arrives today in Lagos", description: "Order before early afternoon for same-day delivery.", image: "/media/p/sunflowers.webp", productIds: ["prd_velvet_roses", "prd_sunflower_box", "prd_peony_cloud", "prd_kraft_treats", "prd_celebration_box", "prd_tulip_vase"] },
  { id: "new-home", title: "For a new home", description: "Things that make a house feel lived in.", image: "/media/e/house.webp", productIds: ["prd_knit_throw", "prd_cloud_pillow", "prd_barista_cups", "prd_cactus", "prd_amber_candle", "prd_bread_basket"] },
  { id: "self-care", title: "A little self-care", description: "For someone who needs a slower evening.", image: "/media/p/ritual-kit.webp", productIds: ["prd_ritual_kit", "prd_face_oil", "prd_serum", "prd_tea_ritual", "prd_amber_candle"] },
]

/** Purchasable catalogue: active listings from approved vendors, with live holds. */
async function catalogue(filter: { ids?: string[]; vendorId?: string } = {}) {
  const vendors = await vendorsById()
  const prods = (await products({ ...filter, status: ["active"] })).filter((p) => vendors.get(p.vendorId)?.status === "approved")
  const holds = await activeHolds(prods.flatMap((p) => p.variants.map((v) => v.id)))
  return { vendors, prods, holds, s: await settings() }
}

async function storefrontsByVendor() {
  const rows = must(await db().from("storefronts").select("*")) as any[]
  return new Map(rows.map((r) => [r.vendor_id, r]))
}

export const catalog: Record<string, Handler> = {
  async getSession({ caller }) {
    if (!caller.userId) return null
    if (caller.emailVerified && caller.email) {
      // Accept pending staff and co-host invitations addressed to this verified email.
      const invite = must(await db().from("vendor_staff").select("*").eq("email", caller.email).eq("status", "invited").maybeSingle()) as any
      if (invite && !caller.vendorId) {
        await db().from("vendor_staff").update({ status: "active", user_id: caller.userId }).eq("id", invite.id)
        await db().from("profiles").update({ vendor_id: invite.vendor_id, roles: [...new Set([...caller.roles, "vendor_staff"])] }).eq("id", caller.userId)
        caller.vendorId = invite.vendor_id
        caller.roles = [...new Set([...caller.roles, "vendor_staff" as const])]
      }
      const invited = must(await db().from("events").select("id, co_hosts").contains("co_hosts", JSON.stringify([{ email: caller.email, status: "invited" }]))) as any[]
      for (const ev of invited) {
        await db().from("events").update({ co_hosts: ev.co_hosts.map((c: any) => (c.email === caller.email && c.status === "invited" ? { ...c, status: "accepted", userId: caller.userId, respondedAt: new Date().toISOString() } : c)) }).eq("id", ev.id)
      }
    }
    return { id: caller.userId, name: caller.name, email: caller.email, emailVerified: caller.emailVerified, roles: caller.roles, vendorId: caller.vendorId, mfaVerified: caller.aal === "aal2" }
  },

  async getHomeFeed() {
    const { vendors, prods, holds, s } = await catalogue()
    const sfs = await storefrontsByVendor()
    const card = (ids: string[]) => ids.flatMap((id) => { const p = prods.find((x) => x.id === id); return p ? [productCard(p, vendors.get(p.vendorId)!, holds, s)] : [] })
    const fallback = [...prods].sort((a, b) => b.editorialScore - a.editorialScore).map((p) => p.id)
    const featured = card(["prd_celebration_box", "prd_peony_cloud", "prd_amber_candle", "prd_pendant", "prd_ritual_kit", "prd_coffee_box", "prd_choc_drip_cake", "prd_velvet_roses"])
    return {
      featured: featured.length >= 4 ? featured : card(fallback.slice(0, 8)),
      trending: card(fallback.slice(8, 14)),
      vendors: [...vendors.values()].filter((v) => v.status === "approved" && v.featured).map((v) => vendorPublic(v, sfs.get(v.id) ?? null, prods.filter((p) => p.vendorId === v.id).length)),
      guides: GUIDES,
      stats: { vendors: [...vendors.values()].filter((v) => v.status === "approved").length, zones: 5, products: prods.length },
    }
  },

  async listProducts({ args: q }) {
    const { vendors, prods, holds, s } = await catalogue({ ids: Array.isArray(q.ids) ? q.ids.slice(0, 200) : undefined, vendorId: q.vendorId })
    let items: Product[] = prods
    if (q.collectionId) {
      const sf = must(await db().from("storefronts").select("collections").filter("collections", "cs", JSON.stringify([{ id: q.collectionId }])).maybeSingle()) as any
      const col = sf?.collections?.find((c: any) => c.id === q.collectionId)
      items = items.filter((p) => col?.productIds.includes(p.id))
    }
    if (q.q) {
      // Postgres full-text search with structured filters (§14 Search).
      const { data } = await db().from("products").select("id").textSearch("search", String(q.q).slice(0, 100), { type: "websearch", config: "english" })
      const vendorHits = [...vendors.values()].filter((v) => v.name.toLowerCase().includes(String(q.q).toLowerCase())).map((v) => v.id)
      const ids = new Set((data ?? []).map((r: any) => r.id))
      items = items.filter((p) => ids.has(p.id) || vendorHits.includes(p.vendorId) || p.occasions.some((o) => String(q.q).toLowerCase().includes(o)))
    }
    const facetBase = items
    if (q.occasion) items = items.filter((p) => p.occasions.includes(q.occasion))
    if (q.category) items = items.filter((p) => p.category === q.category)
    if (q.personalisable) items = items.filter((p) => p.personalisation)
    let cards = items.map((p) => productCard(p, vendors.get(p.vendorId)!, holds, s, q.zoneId))
    if (q.budgetMin !== undefined) cards = cards.filter((c) => c.priceTo >= q.budgetMin)
    if (q.budgetMax !== undefined) cards = cards.filter((c) => c.priceFrom <= q.budgetMax)
    if (q.zoneId) cards = cards.filter((c) => vendors.get(c.vendor.id)!.zones.some((z) => z.zoneId === q.zoneId))
    if (q.deliverBy) cards = cards.filter((c) => c.earliest && c.earliest.date <= q.deliverBy)
    if (q.inStockOnly) cards = cards.filter((c) => c.inStock)
    const score = (c: any) => (items.find((x) => x.id === c.id)!.editorialScore) + (c.inStock ? 1 : 0)
    switch (q.sort ?? "relevance") {
      case "price_asc": cards.sort((a, b) => a.priceFrom - b.priceFrom); break
      case "price_desc": cards.sort((a, b) => b.priceFrom - a.priceFrom); break
      case "earliest": cards.sort((a, b) => (a.earliest?.date ?? "9999").localeCompare(b.earliest?.date ?? "9999")); break
      default: cards.sort((a, b) => score(b) - score(a))
    }
    const page = Math.max(1, Number(q.page ?? 1))
    const pageSize = Math.min(100, Number(q.pageSize ?? 24))
    const count = (key: "category" | "occasions") => {
      const m = new Map<string, number>()
      facetBase.forEach((p) => (key === "category" ? [p.category] : p.occasions).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)))
      return [...m.entries()].map(([id, n]) => ({ id, count: n }))
    }
    return { items: cards.slice((page - 1) * pageSize, page * pageSize), total: cards.length, page, pageSize, facets: { categories: count("category"), occasions: count("occasions") } }
  },

  async getProduct({ args, caller }) {
    const [p] = await products({ idOrSlug: str(args.idOrSlug, "product", 120) })
    if (!p) return null
    const vendor = (await vendorsById([p.vendorId])).get(p.vendorId)!
    const visible = (p.status === "active" && vendor.status === "approved") || caller.vendorId === p.vendorId || caller.roles.includes("admin")
    if (!visible) return null
    const { vendors, prods, holds, s } = await catalogue()
    const now = new Date()
    const { sellableUnits } = await import("../_shared/domain/index.ts")
    const ownHolds = await activeHolds(p.variants.map((v) => v.id))
    const sf = (await storefrontsByVendor()).get(vendor.id) ?? null
    const related = prods.filter((x) => x.id !== p.id && (x.category === p.category || x.occasions.some((o) => p.occasions.includes(o)))).sort((a, b) => b.editorialScore - a.editorialScore).slice(0, 8).map((x) => productCard(x, vendors.get(x.vendorId)!, holds, s))
    return { product: p, vendor: vendorPublic(vendor, sf, prods.filter((x) => x.vendorId === vendor.id).length), availability: Object.fromEntries(p.variants.map((v) => [v.id, sellableUnits(v, ownHolds, now)])), related }
  },

  async getDeliveryQuote({ args }) {
    const [p] = await products({ ids: [str(args.productId, "product")] })
    if (!p) throw fail("not_found", "This item is no longer available.")
    const vendor = (await vendorsById([p.vendorId])).get(p.vendorId)!
    const s = await settings()
    const ctx = { now: new Date(), timezone: s.timezone, vendor, zoneId: args.zoneId as ZoneId, prepHours: p.prepHours + (args.personalised ? p.personalisation?.extraPrepHours ?? 0 : 0), maxAdvanceDays: s.maxAdvanceDays }
    const c = checkDeliveryDate(ctx, args.date ?? null)
    return c.feasible
      ? { feasible: true, earliest: c.earliest, date: c.date, windowStart: c.windowStart, windowEnd: c.windowEnd, fee: c.fee, sameDay: c.sameDay, dates: deliverableDates(ctx, 45), responsibleParty: vendor.fulfilment }
      : { feasible: false, reason: c.reason, message: c.message, earliest: c.earliest, date: null, windowStart: null, windowEnd: null, fee: c.fee, sameDay: false, dates: c.reason === "zone_unsupported" ? [] : deliverableDates(ctx, 45), responsibleParty: vendor.fulfilment }
  },

  async listVendors({ args }) {
    const { vendors, prods } = await catalogue()
    const sfs = await storefrontsByVendor()
    return [...vendors.values()].filter((v) => v.status === "approved" && (!args.featured || v.featured)).map((v) => vendorPublic(v, sfs.get(v.id) ?? null, prods.filter((p) => p.vendorId === v.id).length))
  },

  async getStorefront({ args, caller }) {
    const slug = str(args.slug, "slug", 60).toLowerCase()
    let row = must(await db().from("storefronts").select("*").eq("slug", slug).maybeSingle()) as any
    if (!row) {
      const moved = must(await db().from("storefronts").select("slug").contains("slug_history", [slug]).maybeSingle()) as any
      return moved ? { kind: "redirect", slug: moved.slug } : { kind: "not_found" }
    }
    const vendor = (await vendorsById([row.vendor_id])).get(row.vendor_id)!
    if (vendor.status === "suspended") return { kind: "unavailable", vendorName: vendor.name, reason: "suspended" }
    if (row.status !== "published" && caller.vendorId !== vendor.id) return { kind: "unavailable", vendorName: vendor.name, reason: row.status === "paused" ? "paused" : "draft" }
    const { prods, holds, s } = await catalogue({ vendorId: vendor.id })
    row = toStorefront(row)
    return { kind: "found", view: { storefront: row, vendor: vendorPublic(vendor, { slug: row.slug, status: row.status }, prods.length), products: prods.map((p) => productCard(p, vendor, holds, s)) } }
  },

  async recordStoreVisit({ args, caller }) {
    const sf = must(await db().from("storefronts").select("vendor_id").eq("id", str(args.storefrontId, "store")).maybeSingle()) as any
    // Vendor previews and staff traffic are excluded from analytics (STF 12).
    if (!sf || caller.vendorId === sf.vendor_id || caller.roles.includes("admin") || caller.roles.includes("support")) return
    if (!["visit", "product_view", "checkout_start"].includes(args.kind)) return
    await db().from("analytics_events").insert({ storefront_id: args.storefrontId, vendor_id: sf.vendor_id, kind: args.kind, product_id: args.productId ?? null })
  },

  async recommend({ args }) {
    const { vendors, prods, holds, s } = await catalogue()
    const now = new Date()
    const today = toDateOnly(now, s.timezone)
    let source: "ai" | "rules" = "rules"
    let fromText = args.message ? extractPreferences(String(args.message).slice(0, 1000), now, s.timezone) : { interests: [] }
    if (args.message) {
      const ai = await claude.extractPreferences(String(args.message), today)
      if (ai) {
        fromText = { ...fromText, ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))), interests: [...new Set([...(fromText.interests ?? []), ...ai.interests])] }
        source = "ai"
      }
    }
    const explicit = sanitisePreferences(args.prefs ?? {})
    const prefs = sanitisePreferences({ ...fromText, ...Object.fromEntries(Object.entries(explicit).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) })
    prefs.interests = [...new Set([...(fromText.interests ?? []), ...(explicit.interests ?? [])])]
    // Hard filters first: stock, delivery, budget and restrictions are deterministic (AI 01).
    const result = recommend(prods, prefs, { now, timezone: s.timezone, maxAdvanceDays: s.maxAdvanceDays, vendors, holds }, 12)
    let ranked = result.results
    if (ranked.length > 1 && env_ai()) {
      const ai = await claude.rankAndExplain({ prefs, candidates: ranked.map((r) => { const p = prods.find((x) => x.id === r.productId)!; return { id: p.id, title: p.title, summary: p.summary, category: p.category, price: r.price } }) })
      if (ai?.length) {
        const byId = new Map(ranked.map((r) => [r.productId, r]))
        // The AI may only reorder and explain eligible ids; deterministic reasons stay first.
        ranked = [...ai.flatMap((a) => (byId.has(a.id) ? [{ ...byId.get(a.id)!, explanation: `${byId.get(a.id)!.reasons[0] ?? ""}${byId.get(a.id)!.reasons[0] ? " · " : ""}${a.explanation}` }] : [])), ...ranked.filter((r) => !ai.some((a) => a.id === r.productId))]
        source = "ai"
      }
    }
    const picks = ranked.slice(0, 9).flatMap((r) => {
      const p = prods.find((x) => x.id === r.productId)
      if (!p || !p.variants.some((v) => v.id === r.variantId && v.price === r.price)) return []
      return [{ product: productCard(p, vendors.get(p.vendorId)!, holds, s, prefs.zoneId), variantId: r.variantId, explanation: r.explanation, reasons: r.reasons, totalWithDelivery: r.deliveryFee !== null ? r.price + r.deliveryFee : null }]
    })
    const sessionId = uid("rs")
    await db().from("recommendation_sessions").insert({ id: sessionId, model: source === "ai" ? claude.model : null, prompt_version: PROMPT_VERSION, preferences: prefs, retrieved_ids: picks.map((p) => p.product.id), validation: { excluded: result.excluded, limiting: result.limiting }, source })
    return { prefs, picks, limiting: result.limiting, limitingMessage: picks.length ? null : limitingMessage(result.limiting, prefs), followUps: result.followUps, deliveryUncertain: result.deliveryUncertain, source, sessionId }
  },

  async recordRecommendationFeedback({ args }) {
    await db().from("recommendation_feedback").insert({ session_id: str(args.sessionId, "session"), product_id: str(args.productId, "product"), helpful: Boolean(args.helpful) })
  },
}

const env_ai = () => Boolean(Deno.env.get("ANTHROPIC_API_KEY"))

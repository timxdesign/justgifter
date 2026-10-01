import type { CategoryId, DateOnly, InterestId, Minor, OccasionId, Product, Relationship, StockHold, Vendor, ZoneId } from "./types.ts"
import { earliestDelivery, minimumZoneFee } from "./delivery.ts"
import { formatMoney } from "./money.ts"
import { lowestPrice } from "./pricing.ts"
import { interestName, occasionById, zoneById, ZONES, INTERESTS, OCCASIONS } from "./catalog.ts"
import { addDays, compareDates, toDateOnly, weekdayOf } from "./time.ts"
import { sellableUnits } from "./wishlist.ts"

/**
 * Gift recommendations (AI 01–03). Eligibility is deterministic and runs first: only approved,
 * in-stock, deliverable, in-budget listings ever reach ranking. An LLM may extract preferences
 * and re-order/explain the eligible IDs, but it can never add a product that isn't in this set.
 */

export interface GiftPreferences {
  occasion?: OccasionId
  relationship?: Relationship
  budgetMax?: Minor
  interests: InterestId[]
  zoneId?: ZoneId
  deliverBy?: DateOnly
  categories?: CategoryId[]
  wantsWrapping?: boolean
}

export interface Recommendation {
  productId: string
  variantId: string
  score: number
  price: Minor
  deliveryFee: Minor | null
  earliest: DateOnly | null
  reasons: string[]
  explanation: string
}

export type LimitingConstraint = "budget" | "zone" | "date" | "stock" | "none"

export interface RecommendationResult {
  results: Recommendation[]
  excluded: Record<Exclude<LimitingConstraint, "none">, number>
  limiting: LimitingConstraint
  followUps: string[]
  /** True when no zone was given, so delivery fees are the vendor's lowest, not a confirmed quote. */
  deliveryUncertain: boolean
}

interface Ctx {
  now: Date
  timezone: string
  maxAdvanceDays: number
  vendors: Map<string, Vendor>
  holds: StockHold[]
}

const RELATIONSHIP_AFFINITY: Partial<Record<Relationship, CategoryId[]>> = {
  partner: ["jewellery", "flowers", "beauty", "fashion"],
  parent: ["home", "hampers", "beauty", "plants"],
  friend: ["hampers", "home", "beauty", "books", "cakes"],
  sibling: ["fashion", "hampers", "books", "cakes"],
  colleague: ["plants", "hampers", "books", "home"],
  child: ["cakes", "books", "baby"],
  client: ["hampers", "plants", "home"],
}

export function recommend(products: Product[], prefs: GiftPreferences, ctx: Ctx, limit = 12): RecommendationResult {
  const excluded = { budget: 0, zone: 0, date: 0, stock: 0 }
  const scored: Recommendation[] = []
  const deliveryUncertain = !prefs.zoneId

  for (const p of products) {
    const vendor = ctx.vendors.get(p.vendorId)
    if (!vendor || vendor.status !== "approved" || p.status !== "active") continue
    if (vendor.suppressedFromRecommendations) continue
    if (prefs.categories?.length && !prefs.categories.includes(p.category)) continue

    const inStock = p.variants
      .filter((v) => sellableUnits(v, ctx.holds, ctx.now) > 0)
      .sort((a, b) => a.price - b.price)
    if (inStock.length === 0) {
      excluded.stock++
      continue
    }

    let deliveryFee: Minor | null
    let earliest: DateOnly | null = null
    if (prefs.zoneId) {
      const zone = vendor.zones.find((z) => z.zoneId === prefs.zoneId)
      if (!zone) {
        excluded.zone++
        continue
      }
      deliveryFee = zone.fee
      const slot = earliestDelivery({
        now: ctx.now,
        timezone: ctx.timezone,
        vendor,
        zoneId: prefs.zoneId,
        prepHours: p.prepHours,
        maxAdvanceDays: ctx.maxAdvanceDays,
      })
      earliest = slot?.date ?? null
      if (prefs.deliverBy && (!earliest || compareDates(earliest, prefs.deliverBy) > 0)) {
        excluded.date++
        continue
      }
    } else {
      deliveryFee = minimumZoneFee(vendor)
    }

    const wrapFee = prefs.wantsWrapping ? Math.min(...p.wrapping.map((w) => w.fee), Infinity) : 0
    const extras = (deliveryFee ?? 0) + (Number.isFinite(wrapFee) ? wrapFee : 0)
    const variant = prefs.budgetMax !== undefined ? inStock.find((v) => v.price + extras <= prefs.budgetMax!) : inStock[0]
    if (!variant) {
      excluded.budget++
      continue
    }

    const reasons: string[] = []
    let score = p.editorialScore * 2

    if (prefs.occasion && p.occasions.includes(prefs.occasion)) {
      score += 3
      reasons.push(`Suits a ${occasionById(prefs.occasion)?.name.toLowerCase()}`)
    }
    const matched = prefs.interests.filter((i) => p.interests.includes(i))
    if (matched.length) {
      score += 2 * matched.length
      reasons.push(`Matches ${joinList(matched.map((m) => interestName(m).toLowerCase()))}`)
    }
    if (prefs.relationship && RELATIONSHIP_AFFINITY[prefs.relationship]?.includes(p.category)) score += 1
    if (prefs.budgetMax !== undefined) {
      const total = variant.price + extras
      // Prefer gifts that use the budget well rather than the cheapest possible item.
      score += 1.5 * (1 - Math.abs(prefs.budgetMax * 0.8 - total) / prefs.budgetMax)
      reasons.unshift(`${formatMoney(total)} with delivery — within your ${formatMoney(prefs.budgetMax)} budget`)
    }
    if (earliest && prefs.zoneId) {
      const zoneName = zoneById(prefs.zoneId)?.name
      reasons.push(prefs.deliverBy ? `Can arrive in ${zoneName} by ${friendlyDate(prefs.deliverBy, ctx)}` : `Delivers to ${zoneName} from ${friendlyDate(earliest, ctx)}`)
    }

    scored.push({
      productId: p.id,
      variantId: variant.id,
      score,
      price: variant.price,
      deliveryFee,
      earliest,
      reasons,
      explanation: reasons.slice(0, 3).join(" · ") || "A well-reviewed pick from an approved vendor",
    })
  }

  scored.sort((a, b) => b.score - a.score || a.price - b.price)
  const results = diversify(scored, products, limit)

  let limiting: LimitingConstraint = "none"
  if (results.length === 0) {
    const top = (Object.entries(excluded) as [Exclude<LimitingConstraint, "none">, number][]).sort((a, b) => b[1] - a[1])[0]
    limiting = top && top[1] > 0 ? top[0] : "none"
  }

  return { results, excluded, limiting, followUps: followUpsFor(prefs), deliveryUncertain }
}

/** Avoids a page of near-identical items from one vendor. */
function diversify(scored: Recommendation[], products: Product[], limit: number) {
  const vendorOf = new Map(products.map((p) => [p.id, p.vendorId]))
  const perVendor = new Map<string, number>()
  const out: Recommendation[] = []
  const deferred: Recommendation[] = []
  for (const r of scored) {
    const v = vendorOf.get(r.productId)!
    const n = perVendor.get(v) ?? 0
    if (n >= 3) deferred.push(r)
    else {
      out.push(r)
      perVendor.set(v, n + 1)
    }
    if (out.length >= limit) break
  }
  return [...out, ...deferred].slice(0, limit)
}

function followUpsFor(prefs: GiftPreferences): string[] {
  const q: string[] = []
  if (!prefs.zoneId) q.push("Where will the gift be delivered?")
  if (prefs.budgetMax === undefined) q.push("What would you like to spend?")
  if (!prefs.interests.length) q.push("What do they enjoy?")
  if (!prefs.deliverBy) q.push("When does it need to arrive?")
  return q.slice(0, 2)
}

export function limitingMessage(limiting: LimitingConstraint, prefs: GiftPreferences): string {
  switch (limiting) {
    case "budget":
      return `Nothing deliverable fits ${prefs.budgetMax ? formatMoney(prefs.budgetMax) : "that budget"} once delivery is included. Would you like to raise the budget a little?`
    case "zone":
      return `None of the matching vendors deliver to ${zoneById(prefs.zoneId)?.name ?? "that area"} yet. Try a different delivery area?`
    case "date":
      return "Nothing matching can arrive by that date. A later date would open up more options."
    case "stock":
      return "The closest matches are sold out right now."
    default:
      return "Nothing matches all of those details. Try removing a filter."
  }
}

const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)

function friendlyDate(date: DateOnly, ctx: Pick<Ctx, "now" | "timezone">) {
  const today = toDateOnly(ctx.now, ctx.timezone)
  if (date === today) return "today"
  if (date === addDays(today, 1)) return "tomorrow"
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const [, m, d] = date.split("-").map(Number)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${days[weekdayOf(date)]} ${d} ${months[m - 1]}`
}

// ---------------------------------------------------------------- Deterministic preference extraction

const OCCASION_WORDS: [RegExp, OccasionId][] = [
  [/birthday|bday|turning \d+/i, "birthday"],
  [/wedding|getting married|bride|groom/i, "wedding"],
  [/anniversary/i, "anniversary"],
  [/baby|newborn|shower/i, "baby-shower"],
  [/graduat|convocation|passed (her|his|their) exams/i, "graduation"],
  [/housewarming|new (home|house|flat|apartment)|moved/i, "housewarming"],
  [/thank|appreciat|grateful/i, "appreciation"],
  [/get well|sick|hospital|recover/i, "get-well"],
  [/sympathy|condolence|loss|passed away|bereave/i, "sympathy"],
  [/just because|no reason/i, "just-because"],
]

const RELATIONSHIP_WORDS: [RegExp, Relationship][] = [
  [/\b(wife|husband|girlfriend|boyfriend|partner|fianc[eé]e?|bae)\b/i, "partner"],
  [/\b(mum|mom|mother|dad|father|parent)s?\b/i, "parent"],
  [/\b(sister|brother|sibling)s?\b/i, "sibling"],
  [/\b(colleague|coworker|boss|manager|team ?mate)s?\b/i, "colleague"],
  [/\b(client|customer)s?\b/i, "client"],
  [/\b(son|daughter|kid|child|niece|nephew)s?\b/i, "child"],
  [/\b(friend|bestie|bff)s?\b/i, "friend"],
]

const INTEREST_WORDS: [RegExp, InterestId][] = [
  [/coffee|tea|latte/i, "coffee-tea"],
  [/cook|kitchen|chef/i, "cooking"],
  [/food|snack|eat/i, "foodie"],
  [/spa|self[- ]care|skincare|relax|wellness/i, "wellness"],
  [/fashion|style|stylish|bag|outfit/i, "fashion"],
  [/read|book|novel|journal/i, "reading"],
  [/decor|interior|candle|home/i, "home-decor"],
  [/plant|garden/i, "gardening"],
  [/music|song/i, "music"],
  [/art|design|creative/i, "art"],
  [/sweet|chocolate|cake|dessert/i, "sweet-tooth"],
  [/minimal|simple/i, "minimalist"],
]

/** Rule-based fallback used when the AI service is unavailable, slow or returns invalid output. */
export function extractPreferences(text: string, now: Date, timezone: string): GiftPreferences {
  const prefs: GiftPreferences = { interests: [] }
  for (const [re, id] of OCCASION_WORDS) if (re.test(text)) { prefs.occasion = id; break }
  for (const [re, id] of RELATIONSHIP_WORDS) if (re.test(text)) { prefs.relationship = id; break }
  for (const [re, id] of INTEREST_WORDS) if (re.test(text) && !prefs.interests.includes(id)) prefs.interests.push(id)

  const budget = text.match(/(?:under|below|less than|max(?:imum)?|budget(?: of| is)?|around|about|₦|ngn|n)\s*₦?\s*([\d,.]+)\s*(k|m|thousand|million)?/i)
  if (budget) {
    let n = parseFloat(budget[1].replace(/,/g, ""))
    const unit = budget[2]?.toLowerCase()
    if (unit === "k" || unit === "thousand") n *= 1_000
    if (unit === "m" || unit === "million") n *= 1_000_000
    if (n >= 1_000) prefs.budgetMax = Math.round(n * 100)
  }

  const lower = text.toLowerCase()
  for (const z of ZONES) {
    const names = [z.name, ...z.areas].map((s) => s.toLowerCase())
    if (names.some((n) => lower.includes(n))) { prefs.zoneId = z.id; break }
  }
  if (!prefs.zoneId) {
    if (/\babuja\b/.test(lower)) prefs.zoneId = "abuja-central"
    else if (/port harcourt|\bph\b/.test(lower)) prefs.zoneId = "port-harcourt"
    else if (/\blekki\b|\bajah\b/.test(lower)) prefs.zoneId = "lekki-ajah"
    else if (/\blagos\b/.test(lower)) prefs.zoneId = "lagos-mainland"
  }

  const today = toDateOnly(now, timezone)
  if (/\btoday\b/.test(lower)) prefs.deliverBy = today
  else if (/\btomorrow\b/.test(lower)) prefs.deliverBy = addDays(today, 1)
  else {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const m = lower.match(/\b(?:by|on|before|for)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
    if (m) {
      const target = days.indexOf(m[1])
      const delta = (target - weekdayOf(today) + 7) % 7 || 7
      prefs.deliverBy = addDays(today, delta)
    } else if (/next week/.test(lower)) prefs.deliverBy = addDays(today, 7)
  }
  return prefs
}

/** Validates untrusted structured preferences (e.g. from an LLM) against known values. */
export function sanitisePreferences(input: unknown): GiftPreferences {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const occasion = OCCASIONS.find((o) => o.id === d.occasion)?.id
  const relationship = (["partner", "parent", "friend", "sibling", "colleague", "child", "client", "other"] as const).find((r) => r === d.relationship)
  const zoneId = ZONES.find((z) => z.id === d.zoneId)?.id
  const interests = Array.isArray(d.interests) ? INTERESTS.filter((i) => (d.interests as unknown[]).includes(i.id)).map((i) => i.id) : []
  const budgetMax = typeof d.budgetMax === "number" && Number.isFinite(d.budgetMax) && d.budgetMax > 0 ? Math.round(d.budgetMax) : undefined
  const deliverBy = typeof d.deliverBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.deliverBy) ? d.deliverBy : undefined
  return { occasion, relationship, zoneId, interests, budgetMax, deliverBy }
}

export const productFromPrice = (p: Product) => lowestPrice(p)

import { describe, expect, it } from "vitest"
import type { Order, Product, StockHold, Vendor, WishlistItem } from "./types.ts"
import { checkDeliveryDate, earliestDelivery, deliverableDates } from "./delivery.ts"
import { buildLine, quote, settlementFor, hasPriceRange } from "./pricing.ts"
import { checkEligibility, canSendWithoutAddress } from "./eligibility.ts"
import { assertTransition, canTransition, ORDER_TRANSITIONS, REFUND_TRANSITIONS, ORDER_STATUS_LABEL } from "./states.ts"
import { wishAvailability, wishlistRemaining, sellableUnits, resolveLatePayment } from "./wishlist.ts"
import { validateDesign, switchTemplate, defaultDesign } from "./templates.ts"
import { recommend, extractPreferences, sanitisePreferences } from "./recommend.ts"
import { entriesForPayment, entriesForRefund, appendIdempotent, vendorBalance } from "./ledger.ts"
import { maskContact, orderReference, randomOtp, randomToken, sha256Hex } from "./tokens.ts"
import { zonedTimeToUtc, toDateOnly } from "./time.ts"
import { DEFAULT_SETTINGS } from "./catalog.ts"
import { formatMoney } from "./money.ts"

const TZ = "Africa/Lagos"
/** Lagos is UTC+1 year-round. */
const lagos = (date: string, hour: number, minute = 0) => zonedTimeToUtc(date, hour, minute, TZ)

const vendor: Vendor = {
  id: "v1",
  slug: "bloom",
  name: "Bloom",
  tagline: "",
  about: "",
  logoInitials: "B",
  logoColor: "",
  coverImage: "",
  status: "approved",
  verified: true,
  zones: [
    { zoneId: "lagos-island", fee: 250_000, leadDays: 0 },
    { zoneId: "abuja-central", fee: 900_000, leadDays: 1 },
  ],
  operating: {
    days: [1, 2, 3, 4, 5, 6],
    openHour: 8,
    closeHour: 18,
    cutoffHour: 15,
    blackoutDates: ["2026-10-09"],
    dailyCapacity: 5,
    deliveryWindow: [10, 18],
  },
  fulfilment: "vendor_delivery",
  categories: ["flowers"],
  businessType: "sole_proprietor",
  city: "Lagos",
  responseHours: 2,
  suppressedFromRecommendations: false,
  featured: false,
  joinedAt: "2026-01-01T00:00:00Z",
  returnPolicy: "",
  deliveryPolicy: "",
}

const product: Product = {
  id: "p1",
  vendorId: "v1",
  slug: "roses",
  title: "Red roses",
  summary: "",
  description: "",
  included: [],
  images: ["/a.webp"],
  category: "flowers",
  occasions: ["anniversary", "birthday"],
  interests: ["home-decor"],
  status: "active",
  variants: [
    { id: "v-12", productId: "p1", name: "12 stems", sku: "R12", price: 2_500_000, stock: 3 },
    { id: "v-24", productId: "p1", name: "24 stems", sku: "R24", price: 4_500_000, stock: 1 },
  ],
  prepHours: 3,
  perishable: true,
  highlyCustomised: false,
  returnEligible: false,
  personalisation: { label: "Card message", maxLength: 10, required: false, fee: 50_000, extraPrepHours: 0, helpText: "" },
  wrapping: [{ id: "w1", name: "Silk ribbon", fee: 150_000 }],
  sponsored: false,
  editorialScore: 0.8,
  createdAt: "2026-01-01T00:00:00Z",
}

const ctx = (now: Date, zoneId: "lagos-island" | "abuja-central" | "port-harcourt" = "lagos-island", prepHours = 3) => ({
  now,
  timezone: TZ,
  vendor,
  zoneId,
  prepHours,
  maxAdvanceDays: 90,
})

describe("delivery feasibility (FUL 02, AC 01)", () => {
  it("offers same-day delivery when ordered before cutoff with time to prepare", () => {
    // Tuesday 6 Oct 2026, 10:00 Lagos
    const slot = earliestDelivery(ctx(lagos("2026-10-06", 10)))
    expect(slot?.date).toBe("2026-10-06")
    expect(slot?.sameDay).toBe(true)
  })

  it("moves to the next operating day after the cutoff", () => {
    const slot = earliestDelivery(ctx(lagos("2026-10-06", 16)))
    expect(slot?.date).toBe("2026-10-07")
  })

  it("skips closed days and blackout dates", () => {
    // Saturday after cutoff → Sunday closed → Monday
    expect(earliestDelivery(ctx(lagos("2026-10-03", 17)))?.date).toBe("2026-10-05")
    // Thursday 8 Oct after cutoff → Friday 9 Oct is a blackout → Saturday 10 Oct
    expect(earliestDelivery(ctx(lagos("2026-10-08", 17)))?.date).toBe("2026-10-10")
  })

  it("adds inter-city lead time", () => {
    const slot = earliestDelivery(ctx(lagos("2026-10-06", 10), "abuja-central"))
    expect(slot?.date).toBe("2026-10-07")
    expect(slot?.fee).toBe(900_000)
  })

  it("rejects unsupported zones and impossible dates with a reason", () => {
    const zone = checkDeliveryDate(ctx(lagos("2026-10-06", 10), "port-harcourt"), "2026-10-07")
    expect(zone.feasible).toBe(false)
    if (!zone.feasible) expect(zone.reason).toBe("zone_unsupported")

    const early = checkDeliveryDate(ctx(lagos("2026-10-06", 16)), "2026-10-06")
    expect(early.feasible).toBe(false)
    if (!early.feasible) {
      expect(early.reason).toBe("before_earliest")
      expect(early.earliest).toBe("2026-10-07")
    }
    const sunday = checkDeliveryDate(ctx(lagos("2026-10-06", 10)), "2026-10-11")
    expect(sunday.feasible).toBe(false)
  })

  it("respects daily capacity", () => {
    const full = checkDeliveryDate({ ...ctx(lagos("2026-10-06", 10)), bookedByDate: { "2026-10-07": 5 } }, "2026-10-07")
    expect(full.feasible).toBe(false)
    if (!full.feasible) expect(full.reason).toBe("at_capacity")
  })

  it("lists only deliverable dates", () => {
    const dates = deliverableDates(ctx(lagos("2026-10-06", 10)), 6)
    expect(dates).not.toContain("2026-10-09")
    expect(dates).not.toContain("2026-10-11")
    expect(dates[0]).toBe("2026-10-06")
  })

  it("converts Lagos wall time to UTC correctly (AC 16)", () => {
    expect(lagos("2026-10-06", 9).toISOString()).toBe("2026-10-06T08:00:00.000Z")
    expect(toDateOnly(new Date("2026-10-06T23:30:00Z"), TZ)).toBe("2026-10-07")
  })
})

describe("pricing (PAY 01/02)", () => {
  it("computes a full breakdown in minor units", () => {
    const line = buildLine({ product, variant: product.variants[0], quantity: 2, personalisationText: "Love you", wrappingId: "w1" })
    expect(line.lineTotal).toBe(5_000_000)
    expect(line.wrappingFee).toBe(300_000)
    expect(line.personalisationFee).toBe(100_000)
    const q = quote({ lines: [line], deliveryFee: 250_000, deliveryProvisional: false, settings: DEFAULT_SETTINGS })
    expect(q.total).toBe(5_000_000 + 300_000 + 100_000 + 250_000)
    expect(Number.isInteger(q.total)).toBe(true)
    expect(q.currency).toBe("NGN")
  })

  it("ignores empty personalisation and caps discount at item value", () => {
    const line = buildLine({ product, variant: product.variants[0], quantity: 1, personalisationText: "   " })
    expect(line.personalisationFee).toBe(0)
    const q = quote({ lines: [line], deliveryFee: 0, deliveryProvisional: false, discount: 99_999_999, settings: DEFAULT_SETTINGS })
    expect(q.discount).toBe(line.lineTotal)
    expect(q.total).toBe(0)
  })

  it("settles commission on items only and conserves money", () => {
    const line = buildLine({ product, variant: product.variants[0], quantity: 1, wrappingId: "w1" })
    const q = quote({ lines: [line], deliveryFee: 250_000, deliveryProvisional: false, settings: DEFAULT_SETTINGS })
    const s = settlementFor(q, 1000)
    expect(s.commission).toBe(250_000)
    expect(s.vendorPayable + s.platformRevenue).toBe(q.total)
  })

  it("flags price ranges for 'from' labels (CAT 04)", () => {
    expect(hasPriceRange(product)).toBe(true)
  })
})

describe("checkout eligibility (CAT 05, AC 01, AC 19, AC 20, AC 22)", () => {
  const base = {
    now: lagos("2026-10-06", 10),
    settings: DEFAULT_SETTINGS,
    source: "marketplace" as const,
    vendor,
    products: [product],
    lines: [{ productId: "p1", variantId: "v-12", quantity: 1 }],
    zoneId: "lagos-island" as const,
    requestedDate: "2026-10-07",
    addressKnown: true,
    holds: [] as StockHold[],
  }

  it("passes a valid checkout", () => {
    const r = checkEligibility(base)
    expect(r.ok).toBe(true)
    expect(r.delivery?.feasible).toBe(true)
  })

  it("blocks suspended vendors and paused storefronts", () => {
    expect(checkEligibility({ ...base, vendor: { ...vendor, status: "suspended" } }).issues.map((i) => i.code)).toContain("VENDOR_UNAVAILABLE")
    const paused = checkEligibility({
      ...base,
      source: "storefront",
      storefront: { id: "s1", vendorId: "v1", slug: "bloom", status: "paused", headline: "", intro: "", accent: "ink", layout: "grid", coverImage: "", featuredProductIds: [], collections: [], publishedAt: null, updatedAt: "", slugHistory: [] },
    })
    expect(paused.issues.map((i) => i.code)).toContain("STOREFRONT_PAUSED")
  })

  it("counts other buyers' active holds against stock (shared across channels)", () => {
    const holds: StockHold[] = [{ id: "h1", variantId: "v-24", wishlistItemId: null, quantity: 1, status: "active", expiresAt: "2026-10-06T09:05:00Z", orderId: null, createdAt: "" }]
    const r = checkEligibility({ ...base, lines: [{ productId: "p1", variantId: "v-24", quantity: 1 }], holds })
    expect(r.issues.map((i) => i.code)).toContain("INSUFFICIENT_STOCK")
    // …but not against the buyer's own hold
    expect(checkEligibility({ ...base, lines: [{ productId: "p1", variantId: "v-24", quantity: 1 }], holds, ownHoldId: "h1" }).ok).toBe(true)
  })

  it("rejects impossible dates and unsupported zones", () => {
    expect(checkEligibility({ ...base, requestedDate: "2026-10-11" }).issues.map((i) => i.code)).toContain("DATE_INFEASIBLE")
    expect(checkEligibility({ ...base, zoneId: "port-harcourt" }).issues.map((i) => i.code)).toContain("ZONE_UNSUPPORTED")
  })

  it("does not allow perishable items to be sent address-unknown", () => {
    expect(canSendWithoutAddress(product)).toBe(false)
    expect(checkEligibility({ ...base, addressKnown: false }).issues.map((i) => i.code)).toContain("ADDRESS_UNKNOWN_NOT_ALLOWED")
  })

  it("rejects mixed-vendor carts", () => {
    const other = { ...product, id: "p2", vendorId: "v2" }
    const r = checkEligibility({ ...base, products: [product, other], lines: [...base.lines, { productId: "p2", variantId: "v-12", quantity: 1 }] })
    expect(r.issues.map((i) => i.code)).toContain("MIXED_VENDORS")
  })

  it("reports price changes and personalisation limits", () => {
    const r = checkEligibility({ ...base, lines: [{ productId: "p1", variantId: "v-12", quantity: 1, expectedUnitPrice: 1, personalisationText: "this is far too long" }] })
    const codes = r.issues.map((i) => i.code)
    expect(codes).toContain("PRICE_CHANGED")
    expect(codes).toContain("PERSONALISATION_TOO_LONG")
  })
})

describe("state machines (§14 state models)", () => {
  it("allows the happy path and blocks illegal jumps", () => {
    const path = ["awaiting_payment", "paid", "awaiting_vendor_acceptance", "accepted", "preparing", "dispatched", "delivered"] as const
    for (let i = 1; i < path.length; i++) expect(canTransition(ORDER_TRANSITIONS, path[i - 1], path[i])).toBe(true)
    expect(() => assertTransition(ORDER_TRANSITIONS, "delivered", "preparing", "order")).toThrow()
    expect(canTransition(ORDER_TRANSITIONS, "awaiting_payment", "dispatched")).toBe(false)
  })

  it("keeps refunds on their own lifecycle", () => {
    expect(canTransition(REFUND_TRANSITIONS, "requested", "completed")).toBe(false)
    expect(canTransition(REFUND_TRANSITIONS, "submitted", "completed")).toBe(true)
  })

  it("never labels distinct milestones as 'Completed'", () => {
    const labels = Object.values(ORDER_STATUS_LABEL)
    expect(labels).not.toContain("Completed")
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe("wishlist coordination (WIS 03–05, AC 02, AC 05)", () => {
  const now = new Date("2026-10-06T10:00:00Z")
  const item: WishlistItem = { id: "w1", eventId: "e1", productId: "p1", variantId: "v-12", desiredQty: 2, purchasedQty: 1, priority: "must", note: "", status: "active", alternativeProductIds: [], addedAt: "" }
  const hold = (id: string, minutesFromNow: number, status: StockHold["status"] = "active"): StockHold => ({
    id, variantId: "v-12", wishlistItemId: "w1", quantity: 1, status, expiresAt: new Date(now.getTime() + minutesFromNow * 60000).toISOString(), orderId: null, createdAt: "",
  })

  it("subtracts verified purchases and active holds only", () => {
    expect(wishlistRemaining(item, [], now)).toBe(1)
    expect(wishlistRemaining(item, [hold("a", 5)], now)).toBe(0)
    expect(wishlistRemaining(item, [hold("a", -1)], now)).toBe(1) // expired
    expect(wishlistRemaining(item, [hold("a", 5, "released")], now)).toBe(1)
  })

  it("shows the final unit as held while another guest checks out", () => {
    const v = product.variants[0]
    expect(wishAvailability(item, v, true, [hold("a", 5)], now).state).toBe("held")
    expect(wishAvailability({ ...item, purchasedQty: 2 }, v, true, [], now).state).toBe("fulfilled")
    expect(wishAvailability(item, { ...v, stock: 0 }, true, [], now).state).toBe("unavailable")
  })

  it("resolves late payments without overselling", () => {
    expect(resolveLatePayment(1, 3, 1)).toBe("honour")
    expect(resolveLatePayment(0, 3, 1)).toBe("conflict")
    expect(sellableUnits({ id: "v-12", stock: 1 }, [hold("a", 5)], now)).toBe(0)
  })
})

describe("templates and AI validation (AI 04, AC 10)", () => {
  it("accepts allowlisted designs and rejects anything else", () => {
    const ok = validateDesign({ templateId: "soiree", palette: "midnight", font: "classic-serif", motionPreset: "curtain", sectionOrder: ["story", "hero", "wishlist"] }, "wedding")
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.design.sectionOrder[0]).toBe("hero")
    expect(validateDesign({ templateId: "made-up" }, "wedding").ok).toBe(false)
    expect(validateDesign({ templateId: "soiree", palette: "neon", font: "classic-serif", motionPreset: "curtain", sectionOrder: [] }, "wedding").ok).toBe(false)
    expect(validateDesign({ templateId: "confetti-pop", palette: "tangerine", font: "soft-serif", motionPreset: "card", sectionOrder: ["hero"] }, "remembrance").ok).toBe(false)
  })

  it("keeps content-independent design when switching templates", () => {
    const d = switchTemplate(defaultDesign("birthday"), "soiree")
    expect(d.templateId).toBe("soiree")
    expect(d.sectionOrder).toContain("wishlist")
    expect(defaultDesign("remembrance").motionPreset).toBe("none")
  })
})

describe("recommendations (AI 01–02)", () => {
  const vendors = new Map([[vendor.id, vendor]])
  const now = lagos("2026-10-06", 10)
  const rctx = { now, timezone: TZ, maxAdvanceDays: 90, vendors, holds: [] as StockHold[] }

  it("hard-filters by budget including delivery and explains relevance", () => {
    const r = recommend([product], { interests: ["home-decor"], occasion: "birthday", budgetMax: 3_000_000, zoneId: "lagos-island" }, rctx)
    expect(r.results).toHaveLength(1)
    expect(r.results[0].variantId).toBe("v-12")
    expect(r.results[0].explanation).toMatch(/within your/)
    expect(r.results[0].explanation).not.toMatch(/will love/i)
  })

  it("reports the limiting constraint when nothing qualifies", () => {
    expect(recommend([product], { interests: [], budgetMax: 1_000_000, zoneId: "lagos-island" }, rctx).limiting).toBe("budget")
    expect(recommend([product], { interests: [], zoneId: "port-harcourt" }, rctx).limiting).toBe("zone")
    expect(recommend([{ ...product, variants: product.variants.map((v) => ({ ...v, stock: 0 })) }], { interests: [] }, rctx).limiting).toBe("stock")
  })

  it("never returns suspended vendors or inactive listings", () => {
    expect(recommend([product], { interests: [] }, { ...rctx, vendors: new Map([[vendor.id, { ...vendor, status: "suspended" as const }]]) }).results).toHaveLength(0)
    expect(recommend([{ ...product, status: "pending_review" }], { interests: [] }, rctx).results).toHaveLength(0)
  })

  it("extracts preferences from plain language", () => {
    const p = extractPreferences("Birthday gift for my sister in Lekki, she loves coffee, under 40k, by Friday", now, TZ)
    expect(p.occasion).toBe("birthday")
    expect(p.relationship).toBe("sibling")
    expect(p.zoneId).toBe("lekki-ajah")
    expect(p.interests).toContain("coffee-tea")
    expect(p.budgetMax).toBe(4_000_000)
    expect(p.deliverBy).toBe("2026-10-09")
  })

  it("sanitises untrusted model output", () => {
    const p = sanitisePreferences({ occasion: "birthday", zoneId: "mars", interests: ["coffee-tea", "hacking"], budgetMax: -5 })
    expect(p).toEqual({ occasion: "birthday", relationship: undefined, zoneId: undefined, interests: ["coffee-tea"], budgetMax: undefined, deliverBy: undefined })
  })
})

describe("ledger (§10, AC 03, AC 21)", () => {
  const order = {
    id: "o1",
    vendorId: "v1",
    reference: "JG-TEST",
    commissionBps: 1000,
    pricing: quote({ lines: [buildLine({ product, variant: product.variants[0], quantity: 1 })], deliveryFee: 250_000, deliveryProvisional: false, settings: DEFAULT_SETTINGS }),
  } as Pick<Order, "id" | "vendorId" | "pricing" | "commissionBps" | "reference">

  it("posts each payment exactly once even when the webhook repeats", () => {
    let ledger = appendIdempotent([], entriesForPayment(order), "t", () => crypto.randomUUID())
    ledger = appendIdempotent(ledger, entriesForPayment(order), "t", () => crypto.randomUUID())
    expect(ledger).toHaveLength(3)
    const bal = vendorBalance(ledger, "v1")
    expect(bal.payable).toBe(2_500_000 - 250_000 + 250_000)
  })

  it("reverses proportionally on refund and conserves totals", () => {
    const refund = { id: "r1", amount: order.pricing.total }
    const drafts = entriesForRefund(order, refund)
    const back = drafts.filter((d) => d.type !== "refund").reduce((n, d) => n + d.amount, 0)
    expect(back).toBe(refund.amount)
    let ledger = appendIdempotent([], entriesForPayment(order), "t", () => crypto.randomUUID())
    ledger = appendIdempotent(ledger, drafts, "t", () => crypto.randomUUID())
    expect(vendorBalance(ledger, "v1").payable).toBe(0)
  })
})

describe("tokens (SEC 03)", () => {
  it("generates high-entropy, URL-safe tokens and hashes them", async () => {
    const t = randomToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(t)
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(randomOtp()).toMatch(/^\d{6}$/)
    expect(orderReference()).toMatch(/^JG-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  })

  it("masks contacts", () => {
    expect(maskContact("adaeze@example.com")).toBe("a•••••@example.com")
    expect(maskContact("+234 803 555 0192")).toBe("••• ••• 0192")
  })

  it("formats naira", () => {
    expect(formatMoney(2_500_000)).toBe("₦25,000")
    expect(formatMoney(2_500_050)).toBe("₦25,000.50")
  })
})

import { acceptanceDeadline } from "./delivery.ts"
describe("acceptance deadline (§9)", () => {
  it("counts only operating hours", () => {
    // Paid Tuesday 23:00 Lagos → opens Wed 08:00 → due 12:00
    expect(acceptanceDeadline(vendor, lagos("2026-10-06", 23), 4, TZ).toISOString()).toBe(lagos("2026-10-07", 12).toISOString())
    // Paid Tuesday 16:00 → 2h left that day → 2h Wednesday → due Wed 10:00
    expect(acceptanceDeadline(vendor, lagos("2026-10-06", 16), 4, TZ).toISOString()).toBe(lagos("2026-10-07", 10).toISOString())
  })
})

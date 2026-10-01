import type { CategoryId, EventType, InterestId, OccasionId, PlatformSettings, Relationship, Zone, ZoneId } from "./types.ts"

/**
 * Launch working assumptions (PRD §1): Nigeria, NGN, Africa/Lagos, a small set of explicit zones.
 * These are proposals pending founder confirmation, so they live in one place.
 */
export const LAUNCH_TIMEZONE = "Africa/Lagos"

export const DEFAULT_SETTINGS: PlatformSettings = {
  currency: "NGN",
  timezone: LAUNCH_TIMEZONE,
  holdMinutes: 10,
  claimWindowHours: 72,
  acceptanceHours: 4,
  commissionBps: 1000,
  buyerFeeBps: 0,
  taxIncludedInPrices: true,
  maxAdvanceDays: 90,
  adjustmentApprovalThreshold: 5_000_000,
}

export const ZONES: Zone[] = [
  { id: "lagos-island", name: "Lagos Island", city: "Lagos", state: "Lagos", areas: ["Ikoyi", "Victoria Island", "Lagos Island", "Obalende"] },
  { id: "lagos-mainland", name: "Lagos Mainland", city: "Lagos", state: "Lagos", areas: ["Yaba", "Surulere", "Ikeja", "Gbagada", "Maryland", "Ogba"] },
  { id: "lekki-ajah", name: "Lekki & Ajah", city: "Lagos", state: "Lagos", areas: ["Lekki Phase 1", "Chevron", "Ikate", "Osapa", "Ajah", "Sangotedo"] },
  { id: "abuja-central", name: "Abuja Central", city: "Abuja", state: "FCT", areas: ["Maitama", "Wuse", "Wuse II", "Garki", "Asokoro", "Jabi", "Utako"] },
  { id: "port-harcourt", name: "Port Harcourt", city: "Port Harcourt", state: "Rivers", areas: ["GRA Phase 1", "GRA Phase 2", "Old GRA", "Rumuola", "Trans-Amadi"] },
]

export const zoneById = (id: ZoneId | string | null | undefined): Zone | undefined => ZONES.find((z) => z.id === id)

export interface OccasionMeta {
  id: OccasionId
  name: string
  blurb: string
  image: string
  /** Sensitive occasions never get default confetti or playful copy (§6). */
  sensitive: boolean
}

export const OCCASIONS: OccasionMeta[] = [
  { id: "birthday", name: "Birthday", blurb: "Make their day feel like theirs.", image: "/media/occasions/birthday.webp", sensitive: false },
  { id: "wedding", name: "Wedding", blurb: "Gifts for the new home they're building.", image: "/media/occasions/wedding.webp", sensitive: false },
  { id: "anniversary", name: "Anniversary", blurb: "Another year, worth marking.", image: "/media/occasions/anniversary.webp", sensitive: false },
  { id: "baby-shower", name: "Baby shower", blurb: "Soft things for small arrivals.", image: "/media/occasions/baby.webp", sensitive: false },
  { id: "graduation", name: "Graduation", blurb: "For the next chapter.", image: "/media/occasions/graduation.webp", sensitive: false },
  { id: "housewarming", name: "Housewarming", blurb: "Help a new place feel like home.", image: "/media/occasions/housewarming.webp", sensitive: false },
  { id: "appreciation", name: "Thank you", blurb: "Say it with more than words.", image: "/media/occasions/appreciation.webp", sensitive: false },
  { id: "get-well", name: "Get well", blurb: "Comfort, delivered gently.", image: "/media/occasions/get-well.webp", sensitive: true },
  { id: "just-because", name: "Just because", blurb: "No reason needed.", image: "/media/occasions/just-because.webp", sensitive: false },
  { id: "sympathy", name: "Sympathy", blurb: "Quiet, thoughtful support.", image: "/media/occasions/sympathy.webp", sensitive: true },
]

export const occasionById = (id: string | null | undefined) => OCCASIONS.find((o) => o.id === id)

export const CATEGORIES: { id: CategoryId; name: string }[] = [
  { id: "flowers", name: "Flowers" },
  { id: "hampers", name: "Hampers & treats" },
  { id: "cakes", name: "Cakes & bakes" },
  { id: "jewellery", name: "Jewellery" },
  { id: "home", name: "Home & candles" },
  { id: "kitchen", name: "Kitchen" },
  { id: "beauty", name: "Beauty & wellness" },
  { id: "baby", name: "Baby" },
  { id: "plants", name: "Plants" },
  { id: "books", name: "Books & stationery" },
  { id: "fashion", name: "Bags & accessories" },
]

export const categoryName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id

export const INTERESTS: { id: InterestId; name: string }[] = [
  { id: "foodie", name: "Food lover" },
  { id: "coffee-tea", name: "Coffee & tea" },
  { id: "wellness", name: "Self-care" },
  { id: "fashion", name: "Style" },
  { id: "reading", name: "Reading" },
  { id: "home-decor", name: "Home decor" },
  { id: "cooking", name: "Cooking" },
  { id: "gardening", name: "Plants" },
  { id: "music", name: "Music" },
  { id: "art", name: "Art & design" },
  { id: "sweet-tooth", name: "Sweet tooth" },
  { id: "minimalist", name: "Minimalist" },
]

export const interestName = (id: string) => INTERESTS.find((i) => i.id === id)?.name ?? id

export const RELATIONSHIPS: { id: Relationship; name: string }[] = [
  { id: "partner", name: "Partner" },
  { id: "parent", name: "Parent" },
  { id: "friend", name: "Friend" },
  { id: "sibling", name: "Sibling" },
  { id: "colleague", name: "Colleague" },
  { id: "child", name: "Child" },
  { id: "client", name: "Client" },
  { id: "other", name: "Someone else" },
]

export const EVENT_TYPES: { id: EventType; name: string; sensitive: boolean; occasion: OccasionId | null }[] = [
  { id: "birthday", name: "Birthday", sensitive: false, occasion: "birthday" },
  { id: "wedding", name: "Wedding", sensitive: false, occasion: "wedding" },
  { id: "anniversary", name: "Anniversary", sensitive: false, occasion: "anniversary" },
  { id: "baby-shower", name: "Baby shower", sensitive: false, occasion: "baby-shower" },
  { id: "graduation", name: "Graduation", sensitive: false, occasion: "graduation" },
  { id: "housewarming", name: "Housewarming", sensitive: false, occasion: "housewarming" },
  { id: "appreciation", name: "Appreciation", sensitive: false, occasion: "appreciation" },
  { id: "remembrance", name: "Remembrance", sensitive: true, occasion: "sympathy" },
  { id: "custom", name: "Something else", sensitive: false, occasion: null },
]

export const eventTypeMeta = (id: string) => EVENT_TYPES.find((e) => e.id === id)

export const BUDGET_BANDS: { id: string; label: string; min: number; max: number | null }[] = [
  { id: "under-25k", label: "Under ₦25k", min: 0, max: 2_500_000 },
  { id: "25k-50k", label: "₦25k – ₦50k", min: 2_500_000, max: 5_000_000 },
  { id: "50k-100k", label: "₦50k – ₦100k", min: 5_000_000, max: 10_000_000 },
  { id: "100k-plus", label: "₦100k and up", min: 10_000_000, max: null },
]

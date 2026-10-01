import type { DeliveryAddress, EventContent, OccasionEvent, Order, OrderStatus, WishlistItem, ZoneId } from "@domain/index.ts"
import { addDays, defaultDesign, LAUNCH_TIMEZONE, sha256Hex, switchTemplate, toDateOnly, uid, earliestDelivery } from "@domain/index.ts"
import { seedProducts, seedStorefronts, seedVendors } from "@/data/seed-catalog"
import type { CheckoutDraft } from "../types"
import { Store, emptyDb, type DemoUser } from "./store"
import { cancelWithRefund, createCheckout, processPaymentSuccess, transition, createRefund } from "./commerce"

const DAY = 86_400_000

export const DEMO_USERS: DemoUser[] = [
  { id: "usr_ada", name: "Adaeze Okafor", email: "ada@example.com", emailVerified: true, roles: ["customer"], vendorId: null, avatar: "/media/e/portrait-ada.webp" },
  { id: "usr_tunde", name: "Tunde Bakare", email: "tunde@example.com", emailVerified: true, roles: ["customer"], vendorId: null, avatar: "/media/e/portrait-man.webp" },
  { id: "usr_tolu", name: "Tolu Adebayo", email: "tolu@example.com", emailVerified: true, roles: ["customer"], vendorId: null },
  { id: "usr_bisi", name: "Bisi Adeyemi", email: "bisi@bloomandbisi.example", emailVerified: true, roles: ["customer", "vendor_owner"], vendorId: "ven_bloom", avatar: "/media/e/portrait-woman.webp" },
  { id: "usr_tomi", name: "Tomi Lawal", email: "tomi@bloomandbisi.example", emailVerified: true, roles: ["customer", "vendor_staff"], vendorId: "ven_bloom" },
  { id: "usr_kelechi", name: "Kelechi Obi", email: "kelechi@justgifter.example", emailVerified: true, roles: ["admin", "support"], vendorId: null },
]

const OTHER_OWNERS = ["hamper", "kemi", "adire", "gold", "nest", "little", "leaf", "ink", "glow", "leather", "pending"].map((k) => ({
  id: `usr_owner_${k}`,
  name: `Owner (${k})`,
  email: `owner@${k}.example`,
  emailVerified: true,
  roles: ["customer", "vendor_owner"] as DemoUser["roles"],
  vendorId: `ven_${k}`,
}))

const ADA_ADDRESS: DeliveryAddress = { recipientName: "Adaeze Okafor", phone: "+234 803 555 0192", line1: "14 Admiralty Way", area: "Lekki Phase 1", city: "Lagos", state: "Lagos", zoneId: "lekki-ajah", landmark: "Opposite the filling station" }
const WEDDING_ADDRESS: DeliveryAddress = { recipientName: "Tolu Adebayo", phone: "+234 809 555 0144", line1: "7 Bourdillon Road", area: "Ikoyi", city: "Lagos", state: "Lagos", zoneId: "lagos-island" }

function content(c: Partial<EventContent> & Pick<EventContent, "title" | "hostDisplayName" | "type">): EventContent {
  return { date: null, time: null, timezone: LAUNCH_TIMEZONE, story: "", venue: "", showVenue: false, showTime: false, agenda: [], dressCode: "", coverImage: "", closingMessage: "", ...c }
}

export async function buildDemoDb(): Promise<Store["db"]> {
  const now = new Date()
  const db = emptyDb()
  db.vendors = seedVendors(now)
  db.products = seedProducts(now)
  db.storefronts = seedStorefronts(now, db.vendors, db.products)
  db.users = [...DEMO_USERS, ...OTHER_OWNERS]
  const s = new Store(db, { ephemeral: true })
  const today = toDateOnly(now, LAUNCH_TIMEZONE)

  // ---------------------------------------------------------------- Events
  const wish = (eventId: string, productId: string, qty: number, priority: WishlistItem["priority"], note = "", variant = 1): WishlistItem => ({
    id: uid("wsh"), eventId, productId, variantId: `${productId}_v${variant}`, desiredQty: qty, purchasedQty: 0, priority, note, status: "active", alternativeProductIds: [], addedAt: new Date(now.getTime() - 12 * DAY).toISOString(),
  })

  const adaBirthdayId = "evt_ada30"
  const adaContent = content({
    title: "Ada turns 30",
    hostDisplayName: "Adaeze",
    type: "birthday",
    date: addDays(today, 9),
    time: "19:00",
    story: "Thirty years of loud laughter, questionable dance moves and the best people anyone could ask for. Come and celebrate with me — and if you'd like to bring something, I've put together a few things I'd genuinely love.",
    venue: "The Terrace, Victoria Island",
    showVenue: true,
    showTime: true,
    agenda: [{ time: "19:00", label: "Drinks & small chops" }, { time: "20:30", label: "Dinner" }, { time: "22:00", label: "Cake, speeches, dancing" }],
    dressCode: "Something gold",
    coverImage: "/media/e/portrait-ada@2x.webp",
    closingMessage: "Your presence is honestly the gift. Everything else is a bonus. ✨",
  })
  const adaDesign = { ...defaultDesign("birthday"), palette: "tangerine" as const, font: "soft-serif" as const }
  const adaEvent: OccasionEvent = {
    id: adaBirthdayId, slug: "ada-turns-30", hostUserId: "usr_ada", status: "published", visibility: "unlisted",
    draft: adaContent, draftDesign: adaDesign,
    published: { content: adaContent, design: adaDesign, version: 3, publishedAt: new Date(now.getTime() - 6 * DAY).toISOString() },
    wishlist: [
      wish(adaBirthdayId, "prd_pendant", 1, "must", "The blue one — I've been eyeing it for months."),
      wish(adaBirthdayId, "prd_ritual_kit", 1, "love"),
      wish(adaBirthdayId, "prd_amber_candle", 2, "love", "Amber & oud please!"),
      wish(adaBirthdayId, "prd_celebration_box", 1, "nice"),
      wish(adaBirthdayId, "prd_red_bag", 1, "nice", "Black, if you're choosing.", 2),
    ],
    deliveryZoneId: "lekki-ajah", hasDeliveryAddress: true, surpriseMode: false, surpriseRevealDate: null, inviteCodeHash: null, coHosts: [],
    createdAt: new Date(now.getTime() - 14 * DAY).toISOString(), updatedAt: new Date(now.getTime() - 6 * DAY).toISOString(),
  }

  const weddingId = "evt_tolu_kunle"
  const weddingContent = content({
    title: "Tolu & Kunle",
    hostDisplayName: "Tolu & Kunle",
    type: "wedding",
    date: addDays(today, 24),
    time: "14:00",
    story: "We met in a queue at the passport office in 2019 and haven't stopped talking since. We're so happy to be celebrating with the people who've cheered us on. If you'd like to help us set up our first home together, here are a few things we'd love.",
    venue: "Eko Hotel Gardens, Victoria Island",
    showVenue: true,
    showTime: true,
    agenda: [{ time: "14:00", label: "Ceremony" }, { time: "16:00", label: "Reception" }, { time: "19:00", label: "After party" }],
    dressCode: "Emerald & gold",
    coverImage: "/media/occasions/wedding@2x.webp",
    closingMessage: "With love and gratitude — Tolu & Kunle",
  })
  const weddingDesign = switchTemplate(defaultDesign("wedding"), "soiree")
  const wedding: OccasionEvent = {
    id: weddingId, slug: "tolu-and-kunle", hostUserId: "usr_tolu", status: "published", visibility: "public",
    draft: weddingContent, draftDesign: { ...weddingDesign, palette: "ivory-gold" },
    published: { content: weddingContent, design: { ...weddingDesign, palette: "ivory-gold" }, version: 2, publishedAt: new Date(now.getTime() - 20 * DAY).toISOString() },
    wishlist: [
      wish(weddingId, "prd_espresso", 1, "must", "For Sunday mornings."),
      wish(weddingId, "prd_cookware", 1, "must"),
      wish(weddingId, "prd_blender", 1, "love", "", 2),
      wish(weddingId, "prd_knit_throw", 2, "love"),
      wish(weddingId, "prd_cloud_pillow", 2, "nice"),
      wish(weddingId, "prd_barista_cups", 2, "nice"),
      wish(weddingId, "prd_pearls", 1, "nice", "For the bride's mother — a surprise!"),
    ],
    deliveryZoneId: "lagos-island", hasDeliveryAddress: true, surpriseMode: true, surpriseRevealDate: addDays(today, 24), inviteCodeHash: null,
    coHosts: [{ userId: null, email: "kunle@example.com", displayName: "Kunle", permissions: ["edit_content", "manage_wishlist"], status: "accepted", invitedAt: new Date(now.getTime() - 19 * DAY).toISOString(), respondedAt: new Date(now.getTime() - 19 * DAY).toISOString() }],
    createdAt: new Date(now.getTime() - 30 * DAY).toISOString(), updatedAt: new Date(now.getTime() - 20 * DAY).toISOString(),
  }

  const babyId = "evt_baby_chidera"
  const babyContent = content({ title: "Welcoming baby Chidera", hostDisplayName: "Adaeze & Obi", type: "baby-shower", date: addDays(today, 40), story: "", coverImage: "/media/e/baby-blanket@2x.webp" })
  const babyDesign = switchTemplate(defaultDesign("baby-shower"), "garden")
  const baby: OccasionEvent = {
    id: babyId, slug: "welcoming-chidera", hostUserId: "usr_ada", status: "draft", visibility: "private",
    draft: babyContent, draftDesign: babyDesign, published: null,
    wishlist: [wish(babyId, "prd_swaddle", 2, "must"), wish(babyId, "prd_toy_bundle", 1, "love")],
    deliveryZoneId: null, hasDeliveryAddress: false, surpriseMode: false, surpriseRevealDate: null, inviteCodeHash: await sha256Hex("CHIDERA24"), coHosts: [],
    createdAt: new Date(now.getTime() - 2 * DAY).toISOString(), updatedAt: new Date(now.getTime() - 1 * DAY).toISOString(),
  }

  db.events = [adaEvent, wedding, baby]
  db.eventAddresses[adaBirthdayId] = ADA_ADDRESS
  db.eventAddresses[weddingId] = WEDDING_ADDRESS

  // ---------------------------------------------------------------- Orders, created through the real flows
  let webhookSeq = 0
  const nextDate = (vendorId: string, zoneId: ZoneId, productId: string) => {
    const v = db.vendors.find((x) => x.id === vendorId)!
    const p = db.products.find((x) => x.id === productId)!
    return earliestDelivery({ now, timezone: LAUNCH_TIMEZONE, vendor: v, zoneId, prepHours: p.prepHours + 30, maxAdvanceDays: 90 })!.date
  }

  async function place(
    buyerId: string | null,
    draft: Omit<CheckoutDraft, "requestedDate" | "buyer"> & { buyer?: CheckoutDraft["buyer"] },
    path: OrderStatus[],
    opts: { daysAgo?: number; pay?: boolean } = {},
  ): Promise<Order> {
    db.sessionUserId = buyerId
    const buyer = draft.buyer ?? (() => { const u = db.users.find((x) => x.id === buyerId)!; return { name: u.name, email: u.email } })()
    const requestedDate = nextDate(draft.vendorId, draft.zoneId, draft.lines[0].productId)
    const session = await createCheckout(s, { ...draft, buyer, requestedDate, personalisationConfirmed: true } as CheckoutDraft)
    if (opts.pay !== false) await processPaymentSuccess(s, session.reference, `seed_evt_${++webhookSeq}`)
    const order = db.orders.find((o) => o.id === session.orderId)!
    db.sessionUserId = null
    for (const to of path) {
      if (to === "declined") cancelWithRefund(s, order, "vendor_declined", "vendor", "The vendor couldn't make this cake for the requested date.", "declined")
      else transition(s, order, to, to === "delivered" || to === "dispatched" ? "vendor" : "vendor")
      if (to === "accepted") order.delivery.windowKind = "confirmed"
    }
    if (opts.daysAgo) backdate(order, opts.daysAgo)
    return order
  }

  const backdate = (o: Order, days: number) => {
    const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - days * DAY).toISOString() : iso)
    o.createdAt = shift(o.createdAt)!
    o.paidAt = shift(o.paidAt)
    o.updatedAt = shift(o.updatedAt)!
    o.acceptBy = shift(o.acceptBy)
    o.timeline.forEach((t, i) => (t.at = new Date(new Date(o.createdAt).getTime() + i * 3.1 * 3_600_000).toISOString()))
    o.delivery.requestedDate = addDays(toDateOnly(new Date(o.createdAt), LAUNCH_TIMEZONE), 1)
    o.delivery.windowStart = shift(o.delivery.windowStart)!
    o.delivery.windowEnd = shift(o.delivery.windowEnd)!
    db.ledger.filter((l) => l.orderId === o.id).forEach((l) => (l.createdAt = shift(l.createdAt)!))
    db.payments.filter((p) => p.orderId === o.id).forEach((p) => { p.createdAt = shift(p.createdAt)!; p.verifiedAt = shift(p.verifiedAt) })
    db.jobs.filter((j) => j.kind === "acceptance_timeout" && j.payload.orderId === o.id).forEach((j) => (j.status = "done"))
    const g = o.giftId ? db.gifts.find((x) => x.id === o.giftId) : null
    if (g && g.notifiedAt) {
      g.revealAt = shift(g.revealAt)!
      g.notifiedAt = shift(g.notifiedAt)
    }
  }

  const giftTo = (name: string, email: string, message: string, extra: Partial<NonNullable<CheckoutDraft["gift"]>> = {}) => ({
    recipient: { name, email },
    gift: { senderDisplayName: "Ada", anonymous: false, message, revealStyle: "wrapped_box" as const, revealAt: null, timezone: LAUNCH_TIMEZONE, ...extra },
  })

  // Ada → her mum, delivered, opened, thanked
  const mum = await place("usr_ada", {
    vendorId: "ven_bloom", source: "marketplace", purchaseType: "gift", zoneId: "lagos-mainland", addressKnown: true,
    lines: [{ productId: "prd_peony_cloud", variantId: "prd_peony_cloud_v1", quantity: 1, personalisationText: "Happy birthday Mummy. Thank you for everything. — Ada" }],
    address: { recipientName: "Ngozi Okafor", phone: "+234 802 555 0110", line1: "22 Adeniran Ogunsanya Street", area: "Surulere", city: "Lagos", state: "Lagos", zoneId: "lagos-mainland" },
    ...giftTo("Mummy", "ngozi@example.com", "Happy birthday, Mummy! I hope these make the house smell like a garden. I'll call you tonight. Love you always.", { revealStyle: "envelope" }),
  }, ["accepted", "preparing", "dispatched", "delivered"], { daysAgo: 10 })
  const mumGift = db.gifts.find((g) => g.id === mum.giftId)!
  mumGift.revealStatus = "opened"
  mumGift.openedAt = new Date(now.getTime() - 9.6 * DAY).toISOString()
  mumGift.thankYouNote = "My darling Ada, the flowers are beautiful. Everyone at church asked who sent them! Thank you, nne. ❤️"
  mumGift.thankYouAt = new Date(now.getTime() - 9.5 * DAY).toISOString()

  // Ada → Chioma, address unknown, claim pending
  await place("usr_ada", {
    vendorId: "ven_hamper", source: "marketplace", purchaseType: "gift", zoneId: "abuja-central", addressKnown: false,
    lines: [{ productId: "prd_celebration_box", variantId: "prd_celebration_box_v1", quantity: 1, wrappingId: "wrap-silk" }],
    ...giftTo("Chioma", "chioma@example.com", "Congratulations on the new job, Chi! So proud of you. Treat yourself this weekend."),
  }, [], { daysAgo: 0 })

  // Ada → self purchase from a storefront, dispatched
  await place("usr_ada", {
    vendorId: "ven_adire", source: "storefront", storefrontId: "stf_adire", campaign: "instagram-bio", purchaseType: "self", zoneId: "lekki-ajah", addressKnown: true,
    lines: [{ productId: "prd_amber_candle", variantId: "prd_amber_candle_v2", quantity: 2 }],
    address: ADA_ADDRESS,
  }, ["accepted", "preparing", "dispatched"], { daysAgo: 2 })

  // Ada → scheduled reveal for a friend, accepted
  await place("usr_ada", {
    vendorId: "ven_bloom", source: "marketplace", purchaseType: "gift", zoneId: "lagos-island", addressKnown: true,
    lines: [{ productId: "prd_tulip_vase", variantId: "prd_tulip_vase_v1", quantity: 1 }],
    address: { recipientName: "Yemi Balogun", phone: "+234 805 555 0177", line1: "3 Kofo Abayomi Street", area: "Victoria Island", city: "Lagos", state: "Lagos", zoneId: "lagos-island" },
    ...giftTo("Yemi", "yemi@example.com", "Happy anniversary to my favourite couple. Here's to many more!", { revealAt: new Date(now.getTime() + 2 * DAY).toISOString() }),
  }, ["accepted"])

  // Tunde → Ada's wishlist (candle), preparing
  const adaCandle = adaEvent.wishlist.find((w) => w.productId === "prd_amber_candle")!
  await place("usr_tunde", {
    vendorId: "ven_adire", source: "wishlist", eventSlug: "ada-turns-30", wishlistItemId: adaCandle.id, purchaseType: "gift", zoneId: "lekki-ajah", addressKnown: true,
    lines: [{ productId: "prd_amber_candle", variantId: adaCandle.variantId, quantity: 1 }],
    recipient: { name: "Adaeze", email: "ada@example.com" },
    gift: { senderDisplayName: "Tunde", anonymous: false, message: "Happy 30th, Ada! Light this when you need a moment of calm.", revealStyle: "wrapped_box", revealAt: null, timezone: LAUNCH_TIMEZONE },
  }, ["accepted", "preparing"], { daysAgo: 1 })

  // Wedding wishlist purchases (surprise mode)
  const espresso = wedding.wishlist.find((w) => w.productId === "prd_espresso")!
  await place(null, {
    vendorId: "ven_nest", source: "wishlist", eventSlug: "tolu-and-kunle", wishlistItemId: espresso.id, purchaseType: "gift", zoneId: "lagos-island", addressKnown: true,
    buyer: { name: "Ngozi Eze", email: "ngozi.eze@example.com" },
    lines: [{ productId: "prd_espresso", variantId: espresso.variantId, quantity: 1 }],
    recipient: { name: "Tolu & Kunle", email: "tolu@example.com" },
    gift: { senderDisplayName: "Aunty Ngozi", anonymous: false, message: "May your home always smell of coffee and laughter.", revealStyle: "envelope", revealAt: new Date(now.getTime() + 24 * DAY).toISOString(), timezone: LAUNCH_TIMEZONE },
  }, ["accepted", "preparing", "dispatched", "delivered"], { daysAgo: 8 })
  const throwItem = wedding.wishlist.find((w) => w.productId === "prd_knit_throw")!
  await place(null, {
    vendorId: "ven_adire", source: "wishlist", eventSlug: "tolu-and-kunle", wishlistItemId: throwItem.id, purchaseType: "gift", zoneId: "lagos-island", addressKnown: true,
    buyer: { name: "Femi Ade", email: "femi@example.com" },
    lines: [{ productId: "prd_knit_throw", variantId: throwItem.variantId, quantity: 1 }],
    recipient: { name: "Tolu & Kunle", email: "tolu@example.com" },
    gift: { senderDisplayName: "Femi", anonymous: false, message: "For cosy movie nights!", revealStyle: "wrapped_box", revealAt: new Date(now.getTime() + 24 * DAY).toISOString(), timezone: LAUNCH_TIMEZONE },
  }, ["accepted", "preparing"], { daysAgo: 3 })

  // Bloom & Bisi: a new storefront gift waiting for acceptance (the vendor demo starts here)
  await place(null, {
    vendorId: "ven_bloom", source: "storefront", storefrontId: "stf_bloom", campaign: "whatsapp-status", purchaseType: "gift", zoneId: "lekki-ajah", addressKnown: true,
    buyer: { name: "Funke Akindele", email: "funke@example.com", phone: "+234 806 555 0101" },
    lines: [{ productId: "prd_velvet_roses", variantId: "prd_velvet_roses_v2", quantity: 1, personalisationText: "Dayo — every day with you is my favourite. F." }],
    address: { recipientName: "Dayo Akindele", phone: "+234 806 555 0102", line1: "5 Fola Osibo Road", area: "Lekki Phase 1", city: "Lagos", state: "Lagos", zoneId: "lekki-ajah" },
    recipient: { name: "Dayo", email: "dayo@example.com" },
    gift: { senderDisplayName: "Funke", anonymous: false, message: "Just because. I love you.", revealStyle: "envelope", revealAt: null, timezone: LAUNCH_TIMEZONE },
  }, [])
  await place(null, {
    vendorId: "ven_bloom", source: "marketplace", purchaseType: "self", zoneId: "lagos-mainland", addressKnown: true,
    buyer: { name: "Emeka Nwosu", email: "emeka@example.com" },
    lines: [{ productId: "prd_sunflower_box", variantId: "prd_sunflower_box_v1", quantity: 1 }],
    address: { recipientName: "Emeka Nwosu", phone: "+234 807 555 0123", line1: "40 Herbert Macaulay Way", area: "Yaba", city: "Lagos", state: "Lagos", zoneId: "lagos-mainland" },
  }, ["accepted", "preparing"])

  // Bloom & Bisi sales history for the dashboard and payouts
  const historyProducts = ["prd_velvet_roses", "prd_peony_cloud", "prd_sunflower_box", "prd_tulip_vase"]
  const zones: ZoneId[] = ["lagos-island", "lagos-mainland", "lekki-ajah"]
  const names = ["Bola", "Ifeoma", "Kunle", "Zainab", "Seyi", "Uche", "Amaka", "Ibrahim", "Nneka", "Tobi", "Halima", "Chuka"]
  for (let i = 0; i < 12; i++) {
    const pid = historyProducts[i % historyProducts.length]
    const zoneId = zones[i % zones.length]
    const fromStore = i % 3 !== 0
    await place(null, {
      vendorId: "ven_bloom", source: fromStore ? "storefront" : "marketplace", storefrontId: fromStore ? "stf_bloom" : null, purchaseType: i % 2 ? "gift" : "self", zoneId, addressKnown: true,
      buyer: { name: `${names[i]} Customer`, email: `${names[i].toLowerCase()}@example.com` },
      lines: [{ productId: pid, variantId: `${pid}_v1`, quantity: 1 }],
      address: { recipientName: names[i], phone: "+234 800 555 0000", line1: `${10 + i} Example Street`, area: "Lagos", city: "Lagos", state: "Lagos", zoneId },
      ...(i % 2 ? { recipient: { name: names[(i + 3) % names.length], email: `friend${i}@example.com` }, gift: { senderDisplayName: names[i], anonymous: i === 5, message: "Thinking of you.", revealStyle: "envelope" as const, revealAt: null, timezone: LAUNCH_TIMEZONE } } : {}),
    }, ["accepted", "preparing", "dispatched", "delivered"], { daysAgo: 3 + i * 2 })
  }

  // Kemi Bakes: declined → automatic refund
  await place(null, {
    vendorId: "ven_kemi", source: "marketplace", purchaseType: "self", zoneId: "lagos-mainland", addressKnown: true,
    buyer: { name: "Sade Oyelaran", email: "sade@example.com" },
    lines: [{ productId: "prd_choc_drip_cake", variantId: "prd_choc_drip_cake_v1", quantity: 1, personalisationText: "Happy 40th Femi" }],
    address: { recipientName: "Sade Oyelaran", phone: "+234 808 555 0155", line1: "9 Ogunlana Drive", area: "Surulere", city: "Lagos", state: "Lagos", zoneId: "lagos-mainland" },
  }, ["declined"], { daysAgo: 4 })

  // The Hamper Room: failed delivery attempt (operations exception)
  const issue = await place("usr_tunde", {
    vendorId: "ven_hamper", source: "marketplace", purchaseType: "gift", zoneId: "lagos-mainland", addressKnown: true,
    lines: [{ productId: "prd_coffee_box", variantId: "prd_coffee_box_v1", quantity: 1 }],
    address: { recipientName: "Kemi Bakare", phone: "+234 809 555 0166", line1: "18 Allen Avenue", area: "Ikeja", city: "Lagos", state: "Lagos", zoneId: "lagos-mainland" },
    recipient: { name: "Mum", email: "kemi.bakare@example.com" },
    gift: { senderDisplayName: "Tunde", anonymous: false, message: "Happy retirement, Mum!", revealStyle: "wrapped_box", revealAt: null, timezone: LAUNCH_TIMEZONE },
  }, ["accepted", "preparing", "dispatched", "delivery_issue"], { daysAgo: 1 })
  issue.delivery.attempts = 1
  issue.timeline.at(-1)!.note = "Rider couldn't reach the recipient by phone at 2:40pm. Second attempt scheduled for tomorrow."

  // ---------------------------------------------------------------- Operations records
  const damaged = db.orders.find((o) => o.vendorId === "ven_bloom" && o.status === "delivered" && o.id !== mum.id)!
  db.cases.push({
    id: uid("case"), orderId: damaged.id, vendorId: "ven_bloom", kind: "damaged", status: "investigating", subject: "Bouquet arrived with broken stems",
    description: "Three stems snapped in transit. Customer shared a photo within 2 hours of delivery.", openedBy: "buyer", owner: "Kelechi Obi",
    evidence: ["photo-1.jpg"], createdAt: new Date(now.getTime() - 2 * DAY).toISOString(), updatedAt: new Date(now.getTime() - 1 * DAY).toISOString(),
  })
  createRefund(s, damaged, "damaged", { amount: Math.round(damaged.pricing.items * 0.5), includesFees: false, requestedBy: "support", note: "Partial refund for damaged stems (50%) — awaiting approval." })

  db.reports.push(
    { id: uid("rpt"), kind: "abusive_message", targetType: "gift", targetId: db.gifts[db.gifts.length - 3]?.id ?? "gift", details: "I don't know the sender and the message made me uncomfortable.", status: "open", createdAt: new Date(now.getTime() - 5 * 3_600_000).toISOString() },
    { id: uid("rpt"), kind: "prohibited_item", targetType: "product", targetId: "prd_bloom_pending", details: "Listing claims flowers cure illness.", status: "open", createdAt: new Date(now.getTime() - 26 * 3_600_000).toISOString() },
  )

  for (const p of db.payments.filter((x) => x.status === "successful")) {
    const o = db.orders.find((x) => x.id === p.orderId)!
    db.reconciliation.push({ id: uid("rec"), providerReference: `PSK_${p.reference.replace(/-/g, "")}`, amount: p.amount, status: "matched", orderReference: o.reference, occurredAt: p.verifiedAt!, note: "Matched by reference and amount" })
  }
  db.reconciliation.unshift({ id: uid("rec"), providerReference: "PSK_T88QW1Z", amount: 4_100_000, status: "unmatched", orderReference: null, occurredAt: new Date(now.getTime() - 7 * 3_600_000).toISOString(), note: "Provider settlement with no matching payment attempt — investigate" })

  db.jobs.push({ id: uid("job"), kind: "notification_retry", runAt: new Date(now.getTime() - 3 * 3_600_000).toISOString(), status: "failed", attempts: 5, idempotencyKey: "notify:receipt:legacy-1", payload: { to: "b•••@example.com", template: "receipt" }, lastError: "SMTP 421: temporary rate limit from mail provider" })

  const bloomDelivered = db.orders.filter((o) => o.vendorId === "ven_bloom" && o.status === "delivered" && new Date(o.createdAt).getTime() < now.getTime() - 14 * DAY)
  if (bloomDelivered.length) {
    const amount = bloomDelivered.reduce((n, o) => n + db.ledger.filter((l) => l.orderId === o.id && l.type === "vendor_payable").reduce((a, l) => a + l.amount, 0), 0)
    const payoutId = uid("po")
    db.payouts.push({ id: payoutId, vendorId: "ven_bloom", amount, currency: "NGN", status: "paid", orderIds: bloomDelivered.map((o) => o.id), scheduledFor: addDays(today, -3), createdAt: new Date(now.getTime() - 4 * DAY).toISOString() })
    db.ledger.push({ id: uid("led"), orderId: null, vendorId: "ven_bloom", type: "payout", amount, currency: "NGN", idempotencyKey: `payout:${payoutId}`, createdAt: new Date(now.getTime() - 3 * DAY).toISOString(), memo: "Weekly payout" })
  }

  db.applications = db.vendors.map((v) => ({
    id: uid("app"), vendorId: v.id, status: v.status, submittedAt: v.joinedAt, reviewer: v.status === "approved" ? "Kelechi Obi" : null,
    decisionReason: v.status === "approved" ? "Documents verified; sample order passed quality check." : null,
    history: [
      { at: v.joinedAt, status: "submitted" as const, by: "applicant" },
      ...(v.status === "approved" ? [{ at: new Date(new Date(v.joinedAt).getTime() + 2 * DAY).toISOString(), status: "approved" as const, by: "Kelechi Obi", reason: "Documents verified" }] : [{ at: new Date(new Date(v.joinedAt).getTime() + DAY).toISOString(), status: "under_review" as const, by: "Kelechi Obi" }]),
    ],
    ownerName: v.id === "ven_bloom" ? "Bisi Adeyemi" : `${v.name} owner`,
    ownerEmail: db.users.find((u) => u.vendorId === v.id && u.roles.includes("vendor_owner"))?.email ?? "owner@example.com",
    ownerPhone: "+234 800 555 0000",
    address: `${v.city}, Nigeria`,
    payoutBank: "GTBank",
    payoutAccountMasked: "•••• 4821",
    termsAcceptedAt: v.joinedAt,
  }))

  db.staff = [
    { id: "stf_bisi", vendorId: "ven_bloom", name: "Bisi Adeyemi", email: "bisi@bloomandbisi.example", role: "owner", scopes: ["catalogue", "orders", "support"], status: "active" },
    { id: "stf_tomi", vendorId: "ven_bloom", name: "Tomi Lawal", email: "tomi@bloomandbisi.example", role: "staff", scopes: ["orders"], status: "active" },
  ]

  // 30 days of storefront traffic (deterministic)
  for (let d = 29; d >= 0; d--) {
    const visits = 18 + ((d * 37) % 23)
    for (let i = 0; i < visits; i++) {
      const at = new Date(now.getTime() - d * DAY - (i * 41 % 600) * 60_000).toISOString()
      db.analytics.push({ storefrontId: "stf_bloom", vendorId: "ven_bloom", at, kind: "visit" })
      if (i % 2 === 0) db.analytics.push({ storefrontId: "stf_bloom", vendorId: "ven_bloom", at, kind: "product_view", productId: historyProducts[i % 4] })
      if (i % 7 === 0) db.analytics.push({ storefrontId: "stf_bloom", vendorId: "ven_bloom", at, kind: "checkout_start" })
    }
  }

  db.audit = [
    { id: uid("aud"), at: new Date(now.getTime() - 3 * DAY).toISOString(), actor: "kelechi@justgifter.example", action: "vendor.start_review", targetType: "vendor", targetId: "ven_pending", detail: "Opened review for Aso & Co." },
    { id: uid("aud"), at: new Date(now.getTime() - 5 * DAY).toISOString(), actor: "bisi@bloomandbisi.example", action: "storefront.slug_change", targetType: "storefront", targetId: "stf_bloom", detail: "bisi-flowers → bloom-and-bisi (old slug redirects)" },
    ...db.audit,
  ]

  db.sessionUserId = "usr_ada"
  return db
}

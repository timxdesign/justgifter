import type {
  CategoryId,
  InterestId,
  OccasionId,
  OperatingCalendar,
  PersonalisationSpec,
  Product,
  StoreAccent,
  Storefront,
  Vendor,
  VendorZone,
  WrappingOption,
} from "../../supabase/functions/_shared/domain/types.ts"

/**
 * Seed catalogue: fictional vendors and products for development, staging and demos.
 * Shared by the in-browser demo backend and `scripts/generate-seed-sql.ts`.
 * Prices are integer kobo. Photography: Unsplash License (see docs/CREDITS.md).
 */

const img = (key: string) => `/media/p/${key}.webp`
const naira = (n: number) => n * 100

const STANDARD_WRAP: WrappingOption[] = [
  { id: "wrap-kraft", name: "Kraft paper & twine", fee: naira(1_500) },
  { id: "wrap-silk", name: "Ivory box with silk ribbon", fee: naira(3_500) },
]

const LAGOS_ZONES = (local: number, lekki = local + 1_000): VendorZone[] => [
  { zoneId: "lagos-island", fee: naira(local), leadDays: 0 },
  { zoneId: "lagos-mainland", fee: naira(local), leadDays: 0 },
  { zoneId: "lekki-ajah", fee: naira(lekki), leadDays: 0 },
]

const calendar = (o: Partial<OperatingCalendar> = {}): OperatingCalendar => ({
  days: [1, 2, 3, 4, 5, 6],
  openHour: 8,
  closeHour: 19,
  cutoffHour: 15,
  blackoutDates: [],
  dailyCapacity: 25,
  deliveryWindow: [10, 19],
  ...o,
})

type VendorSeed = Omit<Vendor, "joinedAt" | "suppressedFromRecommendations" | "status"> & { status?: Vendor["status"]; joinedDaysAgo: number }

const VENDOR_SEEDS: VendorSeed[] = [
  {
    id: "ven_bloom",
    slug: "bloom-and-bisi",
    name: "Bloom & Bisi",
    tagline: "Hand-tied flowers, delivered the same day across Lagos.",
    about:
      "Bisi started arranging flowers for friends' weddings in Surulere in 2017. Today her studio sources stems from growers in Jos and Plateau every week and ties every bouquet by hand on the day it leaves.",
    logoInitials: "BB",
    logoColor: "oklch(0.62 0.13 10)",
    coverImage: "/media/v/flower-shop.webp",
    verified: true,
    zones: LAGOS_ZONES(3_000),
    operating: calendar({ days: [0, 1, 2, 3, 4, 5, 6], openHour: 7, cutoffHour: 14, dailyCapacity: 40 }),
    fulfilment: "vendor_delivery",
    categories: ["flowers"],
    businessType: "limited_company",
    city: "Lagos",
    responseHours: 1,
    featured: true,
    joinedDaysAgo: 420,
    returnPolicy: "Fresh flowers can't be returned. If your bouquet arrives damaged, tell us within 24 hours with a photo and we'll replace it.",
    deliveryPolicy: "Same-day delivery for orders confirmed before 2pm. Our own riders deliver between 10am and 7pm.",
  },
  {
    id: "ven_hamper",
    slug: "the-hamper-room",
    name: "The Hamper Room",
    tagline: "Generous hampers and treat boxes, packed to order.",
    about:
      "A small team in Ikeja building hampers around Nigerian-made snacks, single-origin coffee from Mambilla and chocolate from Ondo cocoa. Every box is packed by hand and checked twice.",
    logoInitials: "HR",
    logoColor: "oklch(0.55 0.1 60)",
    coverImage: "/media/v/gifts-dark.webp",
    verified: true,
    zones: [...LAGOS_ZONES(3_500), { zoneId: "abuja-central", fee: naira(7_500), leadDays: 1 }, { zoneId: "port-harcourt", fee: naira(8_000), leadDays: 2 }],
    operating: calendar({ cutoffHour: 13, dailyCapacity: 30 }),
    fulfilment: "vendor_delivery",
    categories: ["hampers"],
    businessType: "limited_company",
    city: "Lagos",
    responseHours: 2,
    featured: true,
    joinedDaysAgo: 300,
    returnPolicy: "Unopened, non-perishable hampers can be returned within 7 days of delivery. Perishable items are non-returnable.",
    deliveryPolicy: "Lagos orders before 1pm arrive the same day. Abuja and Port Harcourt are delivered by our courier partner in 1–2 days.",
  },
  {
    id: "ven_kemi",
    slug: "kemi-bakes",
    name: "Kemi Bakes",
    tagline: "Celebration cakes baked fresh for your date.",
    about: "Kemi bakes every cake to order in her Yaba kitchen. Butter, real chocolate and no shortcuts — so please give her a day's notice.",
    logoInitials: "KB",
    logoColor: "oklch(0.55 0.13 30)",
    coverImage: "/media/v/baking.webp",
    verified: true,
    zones: LAGOS_ZONES(3_500, 5_000),
    operating: calendar({ days: [2, 3, 4, 5, 6], cutoffHour: 12, dailyCapacity: 8 }),
    fulfilment: "vendor_delivery",
    categories: ["cakes"],
    businessType: "sole_proprietor",
    city: "Lagos",
    responseHours: 3,
    featured: false,
    joinedDaysAgo: 160,
    returnPolicy: "Cakes are baked to order and can't be returned. If something isn't right on arrival, message us the same day.",
    deliveryPolicy: "Cakes need at least 24 hours. Delivered in a temperature-safe box between 10am and 6pm.",
  },
  {
    id: "ven_adire",
    slug: "adire-home",
    name: "Adire Home Co.",
    tagline: "Candles, ceramics and soft things for slow evenings.",
    about: "Adire Home works with ceramicists in Abeokuta and candle makers in Ibadan. Everything is small-batch, and most of it is made within a day's drive of our studio.",
    logoInitials: "AH",
    logoColor: "oklch(0.45 0.08 250)",
    coverImage: "/media/v/living-room.webp",
    verified: true,
    zones: [...LAGOS_ZONES(3_000), { zoneId: "abuja-central", fee: naira(6_500), leadDays: 1 }],
    operating: calendar(),
    fulfilment: "vendor_delivery",
    categories: ["home"],
    businessType: "partnership",
    city: "Lagos",
    responseHours: 2,
    featured: true,
    joinedDaysAgo: 260,
    returnPolicy: "Return unused items in original packaging within 14 days. Personalised pieces can't be returned unless they arrive damaged.",
    deliveryPolicy: "Ready in a day. Lagos delivery by our riders; Abuja next day by courier.",
  },
  {
    id: "ven_gold",
    slug: "gold-thread",
    name: "Gold Thread Jewellery",
    tagline: "Fine jewellery, engraved by hand in Lagos.",
    about: "A family jeweller on Lagos Island since 1998. Every piece is hallmarked, and engraving is done in-house by Uncle Femi, who has been doing it for twenty years.",
    logoInitials: "GT",
    logoColor: "oklch(0.6 0.11 80)",
    coverImage: "/media/v/jewellery.webp",
    verified: true,
    zones: [...LAGOS_ZONES(4_000), { zoneId: "abuja-central", fee: naira(8_000), leadDays: 1 }, { zoneId: "port-harcourt", fee: naira(8_000), leadDays: 1 }],
    operating: calendar({ cutoffHour: 14 }),
    fulfilment: "courier",
    categories: ["jewellery", "fashion"],
    businessType: "limited_company",
    city: "Lagos",
    responseHours: 2,
    featured: true,
    joinedDaysAgo: 380,
    returnPolicy: "Return unworn, non-engraved jewellery within 14 days. Engraved pieces are final sale unless we made an error.",
    deliveryPolicy: "Insured courier delivery with signature on arrival.",
  },
  {
    id: "ven_nest",
    slug: "nest-and-nook",
    name: "Nest & Nook",
    tagline: "Kitchen essentials couples actually use.",
    about: "The wedding registry favourite. We stock appliances with local warranties and test every unit before it leaves the warehouse in Lekki.",
    logoInitials: "NN",
    logoColor: "oklch(0.5 0.08 160)",
    coverImage: "/media/v/kitchen.webp",
    verified: true,
    zones: [...LAGOS_ZONES(4_500, 4_500), { zoneId: "abuja-central", fee: naira(9_500), leadDays: 2 }],
    operating: calendar({ cutoffHour: 12 }),
    fulfilment: "courier",
    categories: ["kitchen"],
    businessType: "limited_company",
    city: "Lagos",
    responseHours: 3,
    featured: false,
    joinedDaysAgo: 210,
    returnPolicy: "Unopened appliances can be returned within 14 days. Opened appliances are covered by the manufacturer's 12-month warranty.",
    deliveryPolicy: "Delivered by courier within 1–2 days in Lagos, 2–3 days in Abuja.",
  },
  {
    id: "ven_little",
    slug: "little-ones",
    name: "Little Ones Co.",
    tagline: "Soft, safe gifts for new arrivals.",
    about: "Organic cotton, non-toxic toys and practical bundles chosen by two mums in Abuja who were tired of gifts that went straight into a cupboard.",
    logoInitials: "LO",
    logoColor: "oklch(0.6 0.09 200)",
    coverImage: "/media/v/baby.webp",
    verified: true,
    zones: [{ zoneId: "abuja-central", fee: naira(3_000), leadDays: 0 }, ...LAGOS_ZONES(7_000).map((z) => ({ ...z, leadDays: 1 }))],
    operating: calendar({ cutoffHour: 15 }),
    fulfilment: "vendor_delivery",
    categories: ["baby"],
    businessType: "sole_proprietor",
    city: "Abuja",
    responseHours: 2,
    featured: false,
    joinedDaysAgo: 140,
    returnPolicy: "Unused items in original packaging can be returned within 14 days.",
    deliveryPolicy: "Same-day in Abuja Central before 3pm. Lagos delivery next day by courier.",
  },
  {
    id: "ven_leaf",
    slug: "leaf-and-clay",
    name: "Leaf & Clay",
    tagline: "Easy-going plants in handmade pots.",
    about: "Plants that forgive a missed watering, potted in terracotta made in Ilorin. We include care cards with every plant.",
    logoInitials: "LC",
    logoColor: "oklch(0.5 0.1 140)",
    coverImage: "/media/v/garden.webp",
    verified: false,
    zones: [{ zoneId: "abuja-central", fee: naira(2_500), leadDays: 0 }],
    operating: calendar({ days: [1, 2, 3, 4, 5], cutoffHour: 15 }),
    fulfilment: "vendor_delivery",
    categories: ["plants"],
    businessType: "sole_proprietor",
    city: "Abuja",
    responseHours: 4,
    featured: false,
    joinedDaysAgo: 60,
    returnPolicy: "Living plants can't be returned. If a plant arrives damaged, we'll replace it.",
    deliveryPolicy: "Abuja Central only, Monday to Friday.",
  },
  {
    id: "ven_ink",
    slug: "ink-and-page",
    name: "Ink & Page",
    tagline: "Books and stationery for people who still write things down.",
    about: "An independent bookshop in Yaba with a stationery counter. We'll hand-letter a name on any notebook.",
    logoInitials: "IP",
    logoColor: "oklch(0.35 0.03 260)",
    coverImage: "/media/v/library.webp",
    verified: true,
    zones: LAGOS_ZONES(2_500),
    operating: calendar(),
    fulfilment: "vendor_delivery",
    categories: ["books"],
    businessType: "sole_proprietor",
    city: "Lagos",
    responseHours: 2,
    featured: false,
    joinedDaysAgo: 190,
    returnPolicy: "Books in new condition can be returned within 14 days. Personalised notebooks are final sale.",
    deliveryPolicy: "Delivered by our riders the next working day.",
  },
  {
    id: "ven_glow",
    slug: "glow-ritual",
    name: "Glow Ritual",
    tagline: "Clean skincare made with shea from Kwara.",
    about: "Small-batch oils, serums and body care. Every product is dermatologically tested, and we never make medical claims about what it'll do.",
    logoInitials: "GR",
    logoColor: "oklch(0.6 0.12 70)",
    coverImage: "/media/v/serum.webp",
    verified: true,
    zones: [...LAGOS_ZONES(3_000), { zoneId: "abuja-central", fee: naira(6_000), leadDays: 1 }, { zoneId: "port-harcourt", fee: naira(6_000), leadDays: 1 }],
    operating: calendar(),
    fulfilment: "courier",
    categories: ["beauty"],
    businessType: "limited_company",
    city: "Lagos",
    responseHours: 2,
    featured: true,
    joinedDaysAgo: 230,
    returnPolicy: "Unopened products can be returned within 14 days.",
    deliveryPolicy: "Courier delivery within 1–2 days.",
  },
  {
    id: "ven_leather",
    slug: "lagos-leather",
    name: "Lagos Leather Co.",
    tagline: "Bags and accessories built to be used every day.",
    about: "Full-grain leather, stitched in our workshop in Surulere. We'll emboss initials on any bag.",
    logoInitials: "LL",
    logoColor: "oklch(0.45 0.1 40)",
    coverImage: "/media/v/backpack.webp",
    verified: true,
    zones: [...LAGOS_ZONES(3_500), { zoneId: "abuja-central", fee: naira(7_000), leadDays: 1 }],
    operating: calendar(),
    fulfilment: "courier",
    categories: ["fashion"],
    businessType: "limited_company",
    city: "Lagos",
    responseHours: 3,
    featured: false,
    joinedDaysAgo: 110,
    returnPolicy: "Return unused items within 14 days. Embossed items are final sale.",
    deliveryPolicy: "Courier delivery within 1–2 days.",
  },
  {
    id: "ven_pending",
    slug: "aso-and-co",
    name: "Aso & Co.",
    tagline: "Hand-woven aso-oke accessories.",
    about: "A weaving collective from Iseyin making aso-oke fans, clutches and gele.",
    logoInitials: "AC",
    logoColor: "oklch(0.5 0.12 300)",
    coverImage: "/media/v/gifts-dark.webp",
    status: "under_review",
    verified: false,
    zones: LAGOS_ZONES(4_000),
    operating: calendar(),
    fulfilment: "courier",
    categories: ["fashion"],
    businessType: "partnership",
    city: "Iseyin",
    responseHours: 4,
    featured: false,
    joinedDaysAgo: 3,
    returnPolicy: "Returns within 7 days on unused items.",
    deliveryPolicy: "Courier from Iseyin, 2–3 days.",
  },
]

export function seedVendors(now: Date): Vendor[] {
  return VENDOR_SEEDS.map(({ joinedDaysAgo, status, ...v }) => ({
    ...v,
    status: status ?? "approved",
    suppressedFromRecommendations: false,
    joinedAt: new Date(now.getTime() - joinedDaysAgo * 86_400_000).toISOString(),
  }))
}

// ---------------------------------------------------------------- Products

interface ProductSeed {
  id: string
  vendorId: string
  title: string
  summary: string
  description: string
  included: string[]
  dimensions?: string
  images: string[]
  category: CategoryId
  occasions: OccasionId[]
  interests: InterestId[]
  variants: [string, number, number][] // name, price (naira), stock
  prepHours: number
  perishable?: boolean
  highlyCustomised?: boolean
  returnEligible?: boolean
  personalisation?: PersonalisationSpec
  wrapping?: WrappingOption[]
  sponsored?: boolean
  editorialScore: number
  status?: Product["status"]
  moderationNote?: string
}

const CARD_NOTE: PersonalisationSpec = { label: "Handwritten card", maxLength: 160, required: false, fee: 0, extraPrepHours: 0, helpText: "We'll handwrite this on a card tucked inside." }
const ENGRAVING: PersonalisationSpec = { label: "Engraving", maxLength: 20, required: false, fee: naira(5_000), extraPrepHours: 24, helpText: "Up to 20 characters. Engraved pieces can't be returned." }

const PRODUCT_SEEDS: ProductSeed[] = [
  // Bloom & Bisi
  {
    id: "prd_velvet_roses", vendorId: "ven_bloom", title: "Velvet red roses",
    summary: "Long-stem red roses, hand-tied with eucalyptus.",
    description: "Deep red Kenyan roses with a velvety finish, hand-tied with silver-dollar eucalyptus and wrapped in matte black paper. Classic for a reason.",
    included: ["Hand-tied bouquet", "Flower food sachet", "Care card"], dimensions: "About 55cm tall",
    images: [img("red-roses"), img("single-rose")], category: "flowers", occasions: ["anniversary", "birthday", "just-because", "wedding"], interests: ["home-decor"],
    variants: [["12 stems", 38_000, 14], ["24 stems", 65_000, 8], ["50 stems", 120_000, 3]], prepHours: 3, perishable: true, returnEligible: false,
    personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.92,
  },
  {
    id: "prd_peony_cloud", vendorId: "ven_bloom", title: "Peony cloud bouquet",
    summary: "Blush peonies at their fullest, seasonal and fragrant.",
    description: "When peonies are in season, this is the bouquet people remember. Full blush blooms with garden roses and waxflower, wrapped in soft linen paper.",
    included: ["Hand-tied bouquet", "Flower food sachet"], dimensions: "About 45cm tall",
    images: [img("peony"), img("heart-bouquet")], category: "flowers", occasions: ["birthday", "anniversary", "baby-shower", "appreciation"], interests: ["home-decor", "art"],
    variants: [["Classic", 45_000, 10], ["Grand", 78_000, 4]], prepHours: 3, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.95, sponsored: true,
  },
  {
    id: "prd_tulip_vase", vendorId: "ven_bloom", title: "Tulips in a glass vase",
    summary: "Twenty pink tulips arranged in a reusable glass vase.",
    description: "Ready to set on a table — no trimming, no hunting for a vase. Twenty pink tulips arranged in clear glass that they'll keep long after.",
    included: ["20 tulips", "Glass vase", "Care card"], dimensions: "Vase 22cm",
    images: [img("tulip-vase")], category: "flowers", occasions: ["get-well", "appreciation", "housewarming", "just-because"], interests: ["home-decor", "minimalist"],
    variants: [["Pink", 52_000, 6], ["White", 52_000, 5]], prepHours: 3, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.84,
  },
  {
    id: "prd_sunflower_box", vendorId: "ven_bloom", title: "Sunshine sunflower box",
    summary: "A hatbox of sunflowers for an instant good mood.",
    description: "Bright, cheerful sunflowers arranged in a round hatbox, so there's nothing to unwrap or arrange. Good for desks, bedsides and hospital windowsills.",
    included: ["Hatbox arrangement", "Care card"], dimensions: "25cm box",
    images: [img("sunflowers")], category: "flowers", occasions: ["get-well", "birthday", "graduation", "just-because"], interests: ["home-decor"],
    variants: [["Standard", 34_000, 12]], prepHours: 3, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.8,
  },
  {
    id: "prd_white_lily", vendorId: "ven_bloom", title: "Quiet white arrangement",
    summary: "White roses and greenery, simple and calm.",
    description: "A restrained arrangement of white roses, lisianthus and soft greenery in a low ceramic bowl. Appropriate for sympathy and remembrance.",
    included: ["Arrangement in ceramic bowl", "Plain card"], dimensions: "30cm wide",
    images: [img("single-rose")], category: "flowers", occasions: ["sympathy", "get-well"], interests: ["minimalist"],
    variants: [["Standard", 48_000, 6]], prepHours: 4, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.78,
  },

  // The Hamper Room
  {
    id: "prd_celebration_box", vendorId: "ven_hamper", title: "The celebration box",
    summary: "Our bestselling hamper: chocolate, coffee, snacks and a candle.",
    description: "Everything for a slow afternoon: Ondo dark chocolate, Mambilla ground coffee, plantain chips, cashew brittle, a soy candle and a handwritten note, packed in a keepsake box.",
    included: ["Ondo dark chocolate bar", "250g Mambilla coffee", "Plantain chips", "Cashew brittle", "Soy candle", "Keepsake box"], dimensions: "35 × 25 × 12cm",
    images: [img("celebration-box"), img("chocolates"), img("coffee-box")], category: "hampers", occasions: ["birthday", "appreciation", "just-because", "anniversary", "graduation"], interests: ["foodie", "coffee-tea", "sweet-tooth"],
    variants: [["Classic", 65_000, 20], ["Deluxe", 98_000, 9]], prepHours: 4, returnEligible: true,
    personalisation: CARD_NOTE, wrapping: STANDARD_WRAP, editorialScore: 0.97,
  },
  {
    id: "prd_kraft_treats", vendorId: "ven_hamper", title: "Little treat box",
    summary: "A small, thoughtful box of sweet and savoury snacks.",
    description: "When you want to say thank you without overdoing it. Chin-chin, coconut candy, kuli-kuli bites and a mini chocolate, tied with ribbon.",
    included: ["Chin-chin", "Coconut candy", "Kuli-kuli bites", "Mini chocolate"], dimensions: "20 × 15 × 8cm",
    images: [img("kraft-box")], category: "hampers", occasions: ["appreciation", "just-because", "birthday"], interests: ["foodie", "sweet-tooth"],
    variants: [["Standard", 18_500, 40]], prepHours: 2, returnEligible: true, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.82,
  },
  {
    id: "prd_chocolate_collection", vendorId: "ven_hamper", title: "Artisan chocolate collection",
    summary: "Sixteen hand-finished chocolates made with Nigerian cocoa.",
    description: "Sixteen bonbons in flavours like zobo, tiger nut, palm wine caramel and salted groundnut. Kept chilled and delivered in an insulated sleeve.",
    included: ["16 chocolates", "Flavour guide", "Insulated sleeve"],
    images: [img("chocolates"), img("truffles")], category: "hampers", occasions: ["birthday", "anniversary", "appreciation", "just-because"], interests: ["sweet-tooth", "foodie"],
    variants: [["Box of 16", 28_000, 18], ["Box of 32", 49_000, 7]], prepHours: 2, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: STANDARD_WRAP, editorialScore: 0.88,
  },
  {
    id: "prd_fruit_basket", vendorId: "ven_hamper", title: "Fresh fruit & pastry basket",
    summary: "Seasonal fruit with fresh pastries for a morning delivery.",
    description: "Pineapple, mango, oranges, grapes and seasonal fruit with croissants and banana bread from a partner bakery. Delivered in the morning so it's at its best.",
    included: ["Seasonal fruit", "4 pastries", "Banana bread loaf", "Woven basket"],
    images: [img("fruit-basket")], category: "hampers", occasions: ["get-well", "appreciation", "housewarming"], interests: ["foodie", "wellness"],
    variants: [["Standard", 42_000, 10]], prepHours: 4, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.79,
  },
  {
    id: "prd_coffee_box", vendorId: "ven_hamper", title: "Coffee lover's box",
    summary: "Mambilla coffee, a pour-over set and two stoneware cups.",
    description: "Single-origin coffee from the Mambilla Plateau, a ceramic pour-over dripper, filters and two stoneware cups. Everything to make a proper cup at home.",
    included: ["500g Mambilla coffee", "Pour-over dripper", "50 filters", "2 stoneware cups"],
    images: [img("coffee-box"), img("barista-cups")], category: "hampers", occasions: ["birthday", "housewarming", "appreciation", "just-because"], interests: ["coffee-tea", "foodie"],
    variants: [["Ground", 54_000, 12], ["Whole bean", 54_000, 9]], prepHours: 2, returnEligible: true, personalisation: CARD_NOTE, wrapping: STANDARD_WRAP, editorialScore: 0.9,
  },
  {
    id: "prd_tea_ritual", vendorId: "ven_hamper", title: "Tea ritual set",
    summary: "Loose-leaf hibiscus and lemongrass teas with a glass infuser.",
    description: "Three loose-leaf blends — zobo hibiscus, lemongrass & ginger, and a black tea with cinnamon — with a glass infuser and local honey.",
    included: ["3 loose-leaf teas", "Glass infuser", "Honey jar"],
    images: [img("tea-set"), img("tea-cup")], category: "hampers", occasions: ["get-well", "appreciation", "birthday", "sympathy"], interests: ["coffee-tea", "wellness"],
    variants: [["Standard", 26_000, 15]], prepHours: 2, returnEligible: true, personalisation: CARD_NOTE, wrapping: STANDARD_WRAP, editorialScore: 0.83,
  },

  // Kemi Bakes
  {
    id: "prd_choc_drip_cake", vendorId: "ven_kemi", title: "Chocolate drip cake",
    summary: "Three layers of chocolate sponge with ganache drip.",
    description: "Moist chocolate sponge, chocolate buttercream and a glossy ganache drip, finished with truffles. Serves 12–15.",
    included: ["8-inch cake", "Cake board & box", "Candles on request"], dimensions: "8 inch, serves 12–15",
    images: [img("choc-cake")], category: "cakes", occasions: ["birthday", "anniversary", "graduation"], interests: ["sweet-tooth"],
    variants: [["8 inch", 42_000, 6], ["10 inch", 58_000, 3]], prepHours: 24, perishable: true, highlyCustomised: false, returnEligible: false,
    personalisation: { label: "Writing on the cake", maxLength: 30, required: false, fee: naira(2_000), extraPrepHours: 0, helpText: "Piped in chocolate on top, up to 30 characters." },
    wrapping: [], editorialScore: 0.9,
  },
  {
    id: "prd_rainbow_cake", vendorId: "ven_kemi", title: "Rainbow sprinkle cake",
    summary: "Six colourful vanilla layers under a coat of sprinkles.",
    description: "Vanilla sponge in six colours with vanilla bean buttercream, covered in rainbow sprinkles. The one children (and most adults) ask for.",
    included: ["8-inch cake", "Cake box"], dimensions: "8 inch, serves 12–15",
    images: [img("rainbow-cake")], category: "cakes", occasions: ["birthday", "baby-shower"], interests: ["sweet-tooth"],
    variants: [["8 inch", 45_000, 5]], prepHours: 24, perishable: true, returnEligible: false,
    personalisation: { label: "Writing on the cake", maxLength: 30, required: false, fee: naira(2_000), extraPrepHours: 0, helpText: "Piped on top, up to 30 characters." },
    wrapping: [], editorialScore: 0.86,
  },
  {
    id: "prd_cupcakes", vendorId: "ven_kemi", title: "Strawberry cupcake dozen",
    summary: "Twelve vanilla cupcakes topped with strawberry cream.",
    description: "Light vanilla cupcakes with fresh strawberry buttercream and a white chocolate drizzle. Boxed in a window box for gifting.",
    included: ["12 cupcakes", "Window gift box"],
    images: [img("cupcakes")], category: "cakes", occasions: ["birthday", "baby-shower", "appreciation", "just-because"], interests: ["sweet-tooth"],
    variants: [["Dozen", 24_000, 10]], prepHours: 24, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.81,
  },
  {
    id: "prd_bread_basket", vendorId: "ven_kemi", title: "Weekend bread basket",
    summary: "Sourdough, agege-style loaf and homemade spreads.",
    description: "A sourdough loaf, a soft agege-style loaf, cinnamon rolls and two homemade spreads. A warm way to welcome someone to a new home.",
    included: ["Sourdough loaf", "Agege-style loaf", "4 cinnamon rolls", "2 spreads"],
    images: [img("bread")], category: "cakes", occasions: ["housewarming", "get-well", "appreciation"], interests: ["foodie", "cooking"],
    variants: [["Standard", 22_000, 8]], prepHours: 24, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.74,
  },

  // Adire Home
  {
    id: "prd_amber_candle", vendorId: "ven_adire", title: "Amber glow soy candle",
    summary: "Hand-poured soy candle with amber, oud and vanilla.",
    description: "A slow-burning soy candle with notes of amber, oud and vanilla, poured into a smoked glass jar you'll want to keep. Around 50 hours of burn time.",
    included: ["300g candle", "Wooden lid"], dimensions: "9cm × 10cm",
    images: [img("candle")], category: "home", occasions: ["birthday", "housewarming", "appreciation", "just-because", "anniversary"], interests: ["home-decor", "wellness", "minimalist"],
    variants: [["Amber & oud", 18_500, 30], ["Lemongrass & ginger", 18_500, 22], ["Fig & cedar", 18_500, 4]], prepHours: 2, returnEligible: true,
    personalisation: { label: "Custom label", maxLength: 24, required: false, fee: naira(2_500), extraPrepHours: 24, helpText: "Printed on the jar label, up to 24 characters." },
    wrapping: STANDARD_WRAP, editorialScore: 0.93,
  },
  {
    id: "prd_cloud_pillow", vendorId: "ven_adire", title: "Linen cloud pillow",
    summary: "A plump, washed-linen pillow for a better nap.",
    description: "Stone-washed linen with a soft fibre fill. Breathable in the heat, and it gets softer every wash.",
    included: ["Pillow with removable cover"], dimensions: "50 × 70cm",
    images: [img("pillow")], category: "home", occasions: ["housewarming", "wedding", "get-well"], interests: ["home-decor", "wellness"],
    variants: [["Ivory", 32_000, 14], ["Clay", 32_000, 9]], prepHours: 2, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.77,
  },
  {
    id: "prd_ceramic_mug", vendorId: "ven_adire", title: "Hand-thrown ceramic mug",
    summary: "A wheel-thrown stoneware mug from Abeokuta.",
    description: "Each mug is thrown by hand and glazed in matte white, so no two are identical. Holds 350ml and is dishwasher safe.",
    included: ["1 mug"], dimensions: "350ml",
    images: [img("mug"), img("tea-cup")], category: "home", occasions: ["birthday", "appreciation", "just-because", "housewarming"], interests: ["coffee-tea", "minimalist", "art"],
    variants: [["Single", 12_500, 26], ["Pair", 23_000, 12]], prepHours: 2, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.8,
  },
  {
    id: "prd_name_mug", vendorId: "ven_adire", title: "Personalised slogan mug",
    summary: "A bold printed mug with the words of your choice.",
    description: "Glossy white mug printed with your own short phrase. Great for colleagues, new managers and inside jokes.",
    included: ["1 printed mug", "Gift box"], dimensions: "330ml",
    images: [img("boss-mug")], category: "home", occasions: ["appreciation", "birthday", "graduation"], interests: ["coffee-tea"],
    variants: [["Standard", 14_000, 30]], prepHours: 4, highlyCustomised: true, returnEligible: false,
    personalisation: { label: "Mug text", maxLength: 24, required: true, fee: 0, extraPrepHours: 24, helpText: "Printed in bold capitals. Please check spelling — personalised mugs can't be returned." },
    wrapping: [], editorialScore: 0.7,
  },
  {
    id: "prd_knit_throw", vendorId: "ven_adire", title: "Chunky knit throw",
    summary: "A soft cotton-knit throw for cold air-conditioned evenings.",
    description: "Hand-knit in soft cotton, heavy enough to feel cosy and light enough for Lagos. Available in oat and blush.",
    included: ["Throw blanket"], dimensions: "120 × 150cm",
    images: [img("knit-throw")], category: "home", occasions: ["housewarming", "wedding", "anniversary", "get-well"], interests: ["home-decor", "wellness"],
    variants: [["Oat", 46_000, 7], ["Blush", 46_000, 5]], prepHours: 2, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.82,
  },

  // Gold Thread
  {
    id: "prd_pendant", vendorId: "ven_gold", title: "Midnight pendant necklace",
    summary: "A deep-blue stone on an 18k gold-plated chain.",
    description: "A faceted blue stone set in a gold-plated bezel on a fine 45cm chain. Delicate enough for every day, and arrives in a velvet box.",
    included: ["Necklace", "Velvet box", "Care cloth", "Certificate"], dimensions: "45cm chain",
    images: [img("pendant")], category: "jewellery", occasions: ["birthday", "anniversary", "graduation"], interests: ["fashion"],
    variants: [["45cm chain", 85_000, 6]], prepHours: 4, returnEligible: true, personalisation: ENGRAVING, wrapping: STANDARD_WRAP, editorialScore: 0.9,
  },
  {
    id: "prd_pearls", vendorId: "ven_gold", title: "Freshwater pearl strand",
    summary: "Classic freshwater pearls with a sterling silver clasp.",
    description: "Hand-knotted freshwater pearls with a sterling silver clasp. A piece for weddings, anniversaries and passing down.",
    included: ["Pearl necklace", "Leather box", "Certificate"], dimensions: "42cm",
    images: [img("pearls")], category: "jewellery", occasions: ["wedding", "anniversary", "birthday"], interests: ["fashion"],
    variants: [["42cm", 145_000, 4]], prepHours: 4, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.88,
  },
  {
    id: "prd_earrings", vendorId: "ven_gold", title: "Sapphire drop earrings",
    summary: "Statement drops with blue stones and crystal surround.",
    description: "Art-deco inspired drop earrings with lab-grown sapphires and a crystal halo, on sterling silver posts.",
    included: ["Pair of earrings", "Velvet box"], dimensions: "4cm drop",
    images: [img("earrings")], category: "jewellery", occasions: ["anniversary", "birthday", "wedding"], interests: ["fashion"],
    variants: [["Silver", 96_000, 5]], prepHours: 4, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.84,
  },
  {
    id: "prd_bands", vendorId: "ven_gold", title: "Engraved gold band pair",
    summary: "Matching 18k gold-plated bands, engraved inside.",
    description: "A matching pair of comfort-fit bands, engraved inside with initials or a date. Sized after purchase — we'll call to confirm sizes.",
    included: ["2 bands", "Ring box", "Sizing call"],
    images: [img("rings")], category: "jewellery", occasions: ["wedding", "anniversary"], interests: ["fashion"],
    variants: [["Pair", 160_000, 3]], prepHours: 8, highlyCustomised: true, returnEligible: false,
    personalisation: { ...ENGRAVING, required: true, helpText: "Engraved inside both bands, up to 20 characters. Engraved bands can't be returned." },
    wrapping: [], editorialScore: 0.76,
  },
  {
    id: "prd_watch", vendorId: "ven_gold", title: "Classic open-heart watch",
    summary: "An automatic watch with a tan leather strap.",
    description: "An automatic movement visible through an open-heart dial, with a tan leather strap and sapphire-coated glass. Two-year warranty.",
    included: ["Watch", "Presentation box", "2-year warranty"], dimensions: "40mm case",
    images: [img("watch")], category: "jewellery", occasions: ["graduation", "birthday", "anniversary", "wedding"], interests: ["fashion", "minimalist"],
    variants: [["Tan strap", 210_000, 3], ["Brown strap", 210_000, 2]], prepHours: 4, returnEligible: true, personalisation: ENGRAVING, wrapping: STANDARD_WRAP, editorialScore: 0.85,
  },

  // Nest & Nook
  {
    id: "prd_blender", vendorId: "ven_nest", title: "Pro blender 1.5L",
    summary: "A 1,200W blender for smoothies, soups and pepper.",
    description: "Six speeds, a pulse setting and a glass jug that doesn't stain. Strong enough for tatashe and ice. Comes with a 12-month local warranty.",
    included: ["Blender base", "1.5L glass jug", "Tamper", "12-month warranty"],
    images: [img("blender")], category: "kitchen", occasions: ["wedding", "housewarming"], interests: ["cooking", "wellness"],
    variants: [["Black", 120_000, 9], ["Cream", 125_000, 4]], prepHours: 4, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.83,
  },
  {
    id: "prd_espresso", vendorId: "ven_nest", title: "Home espresso station",
    summary: "Espresso machine with grinder — the big wedding gift.",
    description: "A 15-bar espresso machine with a matching burr grinder and milk jug. For the couple who already talk about coffee too much.",
    included: ["Espresso machine", "Burr grinder", "Milk jug", "Tamper"],
    images: [img("espresso")], category: "kitchen", occasions: ["wedding", "housewarming"], interests: ["coffee-tea", "cooking"],
    variants: [["Bundle", 380_000, 2]], prepHours: 4, returnEligible: true, wrapping: [], editorialScore: 0.8,
  },
  {
    id: "prd_cookware", vendorId: "ven_nest", title: "Enamel cookware set",
    summary: "Five pieces of enamelled cast iron in a warm orange.",
    description: "Two casseroles, a frying pan, a saucepan and a grill pan — enamelled cast iron that goes from stove to table.",
    included: ["5-piece set", "Care guide"],
    images: [img("cookware")], category: "kitchen", occasions: ["wedding", "housewarming"], interests: ["cooking", "home-decor"],
    variants: [["Orange", 265_000, 3]], prepHours: 4, returnEligible: true, wrapping: [], editorialScore: 0.78,
  },
  {
    id: "prd_barista_cups", vendorId: "ven_nest", title: "Barista cup set",
    summary: "Four stoneware cups with saucers, café style.",
    description: "Four 200ml stoneware cups with saucers in a speckled glaze. For flat whites at home.",
    included: ["4 cups", "4 saucers"],
    images: [img("barista-cups")], category: "kitchen", occasions: ["housewarming", "wedding", "birthday"], interests: ["coffee-tea"],
    variants: [["Set of 4", 36_000, 11]], prepHours: 4, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.72,
  },

  // Little Ones
  {
    id: "prd_swaddle", vendorId: "ven_little", title: "Organic cotton swaddle set",
    summary: "Three breathable muslin swaddles in soft prints.",
    description: "Three large organic cotton muslin swaddles that double as burp cloths and nursing covers. They soften with every wash.",
    included: ["3 swaddles", "Gift tin"], dimensions: "120 × 120cm",
    images: [img("swaddle")], category: "baby", occasions: ["baby-shower"], interests: ["minimalist"],
    variants: [["Neutral prints", 29_000, 16]], prepHours: 2, returnEligible: true, personalisation: CARD_NOTE, wrapping: STANDARD_WRAP, editorialScore: 0.88,
  },
  {
    id: "prd_toy_bundle", vendorId: "ven_little", title: "Play & learn bundle",
    summary: "Soft toys, wooden animals and a first book.",
    description: "A knitted rabbit, a set of wooden safari animals and a sturdy board book. All non-toxic and suitable from 6 months.",
    included: ["Knitted rabbit", "6 wooden animals", "Board book"],
    images: [img("toys")], category: "baby", occasions: ["baby-shower", "birthday"], interests: ["reading"],
    variants: [["Standard", 34_000, 9]], prepHours: 2, returnEligible: true, personalisation: CARD_NOTE, wrapping: STANDARD_WRAP, editorialScore: 0.84,
  },
  {
    id: "prd_baby_towel", vendorId: "ven_little", title: "Hooded bath towel",
    summary: "An extra-soft hooded towel for bath time.",
    description: "Bamboo-cotton terry with a hood, big enough to last until toddlerhood. Embroidered with a name on request.",
    included: ["Hooded towel"], dimensions: "90 × 90cm",
    images: [img("baby-towel")], category: "baby", occasions: ["baby-shower"], interests: [],
    variants: [["Lilac", 16_500, 12], ["Cream", 16_500, 10]], prepHours: 2, returnEligible: true,
    personalisation: { label: "Embroidered name", maxLength: 12, required: false, fee: naira(3_000), extraPrepHours: 24, helpText: "Embroidered on the hood, up to 12 letters." },
    wrapping: STANDARD_WRAP, editorialScore: 0.75,
  },

  // Leaf & Clay
  {
    id: "prd_succulent", vendorId: "ven_leaf", title: "Haworthia in a mint pot",
    summary: "A forgiving little succulent in a glazed pot.",
    description: "A striped haworthia in a glazed mint ceramic pot. Needs water about once every two weeks and bright, indirect light.",
    included: ["Plant", "Glazed pot", "Care card"], dimensions: "15cm tall",
    images: [img("succulent")], category: "plants", occasions: ["housewarming", "appreciation", "just-because", "get-well"], interests: ["gardening", "minimalist", "home-decor"],
    variants: [["Mint pot", 12_000, 20]], prepHours: 2, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.8,
  },
  {
    id: "prd_cactus", vendorId: "ven_leaf", title: "Terracotta cactus",
    summary: "A sculptural cactus in a hand-thrown terracotta pot.",
    description: "A columnar cactus in Ilorin terracotta. Almost impossible to kill, which makes it ideal for busy people.",
    included: ["Plant", "Terracotta pot", "Care card"], dimensions: "25cm tall",
    images: [img("cactus")], category: "plants", occasions: ["housewarming", "graduation", "appreciation"], interests: ["gardening", "minimalist"],
    variants: [["Medium", 15_500, 14]], prepHours: 2, perishable: true, returnEligible: false, personalisation: CARD_NOTE, wrapping: [], editorialScore: 0.76,
  },
  {
    id: "prd_cactus_trio", vendorId: "ven_leaf", title: "Desk cactus trio",
    summary: "Three small cacti for a desk or windowsill.",
    description: "Three different cacti in matching pots on a bamboo tray. A colleague favourite.",
    included: ["3 plants", "3 pots", "Bamboo tray"],
    images: [img("cactus-trio")], category: "plants", occasions: ["appreciation", "housewarming"], interests: ["gardening"],
    variants: [["Trio", 24_000, 0]], prepHours: 2, perishable: true, returnEligible: false, wrapping: [], editorialScore: 0.7,
  },

  // Ink & Page
  {
    id: "prd_notebook", vendorId: "ven_ink", title: "Hand-lettered notebook set",
    summary: "Two linen notebooks, one with a name lettered on the cover.",
    description: "Two A5 linen-bound notebooks with 120gsm paper. We hand-letter a name or short phrase on the cover in gold.",
    included: ["2 A5 notebooks", "Brass pen"], dimensions: "A5",
    images: [img("notebook")], category: "books", occasions: ["graduation", "birthday", "appreciation"], interests: ["reading", "art", "minimalist"],
    variants: [["Ivory & charcoal", 19_500, 18]], prepHours: 4, highlyCustomised: true, returnEligible: false,
    personalisation: { label: "Cover lettering", maxLength: 18, required: false, fee: 0, extraPrepHours: 24, helpText: "Hand-lettered in gold, up to 18 characters." },
    wrapping: STANDARD_WRAP, editorialScore: 0.82,
  },
  {
    id: "prd_book_bundle", vendorId: "ven_ink", title: "Staff picks book bundle",
    summary: "Three books chosen by our booksellers for the reader you describe.",
    description: "Tell us a little about who it's for in the card note and our booksellers will choose three books — mostly contemporary African fiction, wrapped in brown paper.",
    included: ["3 books", "Bookmark", "Bookseller's note"],
    images: [img("books")], category: "books", occasions: ["birthday", "graduation", "just-because", "get-well"], interests: ["reading"],
    variants: [["Fiction", 32_000, 15], ["Non-fiction", 34_000, 10]], prepHours: 4, returnEligible: true, personalisation: { ...CARD_NOTE, label: "About the reader" }, wrapping: STANDARD_WRAP, editorialScore: 0.86,
  },

  // Glow Ritual
  {
    id: "prd_face_oil", vendorId: "ven_glow", title: "Botanical face oil",
    summary: "A lightweight oil with shea, baobab and eucalyptus.",
    description: "A fast-absorbing face oil made with cold-pressed baobab, shea oil and a little eucalyptus. Unscented options available.",
    included: ["30ml dropper bottle"],
    images: [img("face-oil"), img("aroma-oil")], category: "beauty", occasions: ["birthday", "appreciation", "just-because"], interests: ["wellness"],
    variants: [["Eucalyptus", 22_000, 25], ["Unscented", 22_000, 18]], prepHours: 2, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.84,
  },
  {
    id: "prd_serum", vendorId: "ven_glow", title: "Amber glow serum",
    summary: "A brightening serum for evening routines.",
    description: "A water-light serum with niacinamide and hibiscus extract. Patch test before first use.",
    included: ["30ml bottle"],
    images: [img("serum")], category: "beauty", occasions: ["birthday", "just-because"], interests: ["wellness"],
    variants: [["30ml", 26_500, 20]], prepHours: 2, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.8,
  },
  {
    id: "prd_ritual_kit", vendorId: "ven_glow", title: "Self-care ritual kit",
    summary: "Body oil, shea butter, soap and a candle in one box.",
    description: "A full evening ritual: whipped shea body butter, black soap, body oil and a small lemongrass candle, packed in a reusable tin.",
    included: ["Body butter", "Black soap", "Body oil", "Mini candle", "Reusable tin"],
    images: [img("ritual-kit"), img("aroma-oil")], category: "beauty", occasions: ["birthday", "get-well", "appreciation", "anniversary"], interests: ["wellness", "home-decor"],
    variants: [["Standard", 48_000, 12]], prepHours: 2, returnEligible: true, personalisation: CARD_NOTE, wrapping: STANDARD_WRAP, editorialScore: 0.91,
  },

  // Lagos Leather
  {
    id: "prd_red_bag", vendorId: "ven_leather", title: "Structured top-handle bag",
    summary: "A glossy red leather bag with a polished clasp.",
    description: "Full-grain leather with a structured shape, a top handle and detachable strap. Fits a phone, wallet and the essentials.",
    included: ["Bag", "Shoulder strap", "Dust bag"], dimensions: "24 × 18 × 10cm",
    images: [img("red-bag")], category: "fashion", occasions: ["birthday", "anniversary", "graduation"], interests: ["fashion"],
    variants: [["Red", 95_000, 4], ["Black", 95_000, 6]], prepHours: 4, returnEligible: true,
    personalisation: { label: "Embossed initials", maxLength: 3, required: false, fee: naira(4_000), extraPrepHours: 24, helpText: "Up to 3 letters, embossed inside. Embossed bags can't be returned." },
    wrapping: STANDARD_WRAP, editorialScore: 0.85,
  },
  {
    id: "prd_backpack", vendorId: "ven_leather", title: "Everyday leather backpack",
    summary: "A roomy backpack with a padded laptop sleeve.",
    description: "Soft, tumbled leather in cognac with a padded 15-inch laptop sleeve and brass hardware.",
    included: ["Backpack", "Dust bag"], dimensions: "40 × 30 × 14cm",
    images: [img("leather-backpack")], category: "fashion", occasions: ["graduation", "birthday"], interests: ["fashion", "minimalist"],
    variants: [["Cognac", 120_000, 5]], prepHours: 4, returnEligible: true, wrapping: [], editorialScore: 0.79,
  },
  {
    id: "prd_tote", vendorId: "ven_leather", title: "Canvas market tote",
    summary: "A heavy canvas tote with leather handles.",
    description: "Heavyweight canvas with leather handles and an inside pocket. For market runs, beach days and everything else.",
    included: ["Tote"], dimensions: "40 × 38cm",
    images: [img("tote")], category: "fashion", occasions: ["appreciation", "just-because", "birthday"], interests: ["fashion", "minimalist"],
    variants: [["Natural", 21_000, 25]], prepHours: 2, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.72,
  },
  {
    id: "prd_headphones", vendorId: "ven_leather", title: "Wireless over-ear headphones",
    summary: "Comfortable wireless headphones with 30-hour battery.",
    description: "Cushioned over-ear headphones with Bluetooth, 30 hours of battery and a leather carry case.",
    included: ["Headphones", "Leather case", "USB-C cable"],
    images: [img("headphones")], category: "fashion", occasions: ["graduation", "birthday"], interests: ["music"],
    variants: [["Black", 88_000, 3]], prepHours: 2, returnEligible: true, wrapping: STANDARD_WRAP, editorialScore: 0.77,
  },
  {
    id: "prd_draft_pouch", vendorId: "ven_leather", title: "Leather card pouch",
    summary: "A slim card pouch — awaiting review.",
    description: "A slim leather card pouch with three slots.",
    included: ["Pouch"], images: [img("tote")], category: "fashion", occasions: ["appreciation"], interests: ["fashion"],
    variants: [["Tan", 12_000, 30]], prepHours: 2, returnEligible: true, wrapping: [], editorialScore: 0.5, status: "pending_review",
  },
  {
    id: "prd_bloom_pending", vendorId: "ven_bloom", title: "Miracle healing bouquet",
    summary: "Flowers that cure stress and illness.",
    description: "Our bouquet that heals stress and cures illness, guaranteed.",
    included: ["Bouquet"], images: [img("tulip-vase")], category: "flowers", occasions: ["get-well"], interests: ["wellness"],
    variants: [["Standard", 30_000, 10]], prepHours: 3, perishable: true, returnEligible: false, wrapping: [], editorialScore: 0.5, status: "pending_review",
    moderationNote: "Flagged automatically: possible medical claim (\"cures\").",
  },
]

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

export function seedProducts(now: Date): Product[] {
  return PRODUCT_SEEDS.map((s, i) => ({
    id: s.id,
    vendorId: s.vendorId,
    slug: slugify(s.title),
    title: s.title,
    summary: s.summary,
    description: s.description,
    included: s.included,
    dimensions: s.dimensions,
    images: s.images,
    category: s.category,
    occasions: s.occasions,
    interests: s.interests,
    status: s.status ?? "active",
    variants: s.variants.map(([name, price, stock], vi) => ({
      id: `${s.id}_v${vi + 1}`,
      productId: s.id,
      name,
      sku: `${s.id.replace("prd_", "").toUpperCase().slice(0, 10)}-${vi + 1}`,
      price: naira(price),
      stock,
    })),
    prepHours: s.prepHours,
    perishable: s.perishable ?? false,
    highlyCustomised: s.highlyCustomised ?? false,
    returnEligible: s.returnEligible ?? true,
    personalisation: s.personalisation,
    wrapping: s.wrapping ?? [],
    sponsored: s.sponsored ?? false,
    editorialScore: s.editorialScore,
    createdAt: new Date(now.getTime() - (90 - i) * 86_400_000).toISOString(),
    moderationNote: s.moderationNote,
  }))
}

// ---------------------------------------------------------------- Storefronts

const ACCENTS: Record<string, StoreAccent> = {
  ven_bloom: "rose",
  ven_hamper: "tangerine",
  ven_kemi: "rose",
  ven_adire: "ink",
  ven_gold: "gold",
  ven_nest: "sage",
  ven_little: "sage",
  ven_leaf: "sage",
  ven_ink: "ink",
  ven_glow: "gold",
  ven_leather: "plum",
}

export function seedStorefronts(now: Date, vendors: Vendor[], products: Product[]): Storefront[] {
  return vendors
    .filter((v) => v.status === "approved")
    .map((v) => {
      const mine = products.filter((p) => p.vendorId === v.id && p.status === "active")
      const byOccasion = (o: OccasionId) => mine.filter((p) => p.occasions.includes(o)).map((p) => p.id)
      const collections = [
        { id: `${v.id}_col_best`, name: "Bestsellers", description: "What people order most.", productIds: [...mine].sort((a, b) => b.editorialScore - a.editorialScore).slice(0, 6).map((p) => p.id) },
        { id: `${v.id}_col_bday`, name: "For birthdays", description: "Easy wins for the big day.", productIds: byOccasion("birthday") },
        { id: `${v.id}_col_thanks`, name: "Thank-you gifts", description: "Small, sincere, quick to send.", productIds: byOccasion("appreciation") },
      ].filter((c) => c.productIds.length > 0)
      return {
        id: `stf_${v.id.replace("ven_", "")}`,
        vendorId: v.id,
        slug: v.slug,
        status: v.id === "ven_ink" ? ("paused" as const) : ("published" as const),
        headline: v.tagline,
        intro: v.about,
        accent: ACCENTS[v.id] ?? "ink",
        layout: v.id === "ven_bloom" || v.id === "ven_gold" ? ("editorial" as const) : ("grid" as const),
        coverImage: v.coverImage,
        featuredProductIds: [...mine].sort((a, b) => b.editorialScore - a.editorialScore).slice(0, 3).map((p) => p.id),
        collections,
        publishedAt: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
        updatedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
        slugHistory: v.id === "ven_bloom" ? ["bisi-flowers"] : [],
      }
    })
}

/** Reserved slugs that vendors can't claim (STF 01 impersonation guard). */
export const RESERVED_SLUGS = [
  "admin", "api", "account", "vendor", "vendors", "stores", "store", "justgifter", "support", "help", "checkout",
  "cart", "orders", "gift", "gifts", "events", "e", "g", "login", "signup", "official", "staff", "security", "paystack",
]

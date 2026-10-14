import type { DateOnly, GiftPreferences, InterestId, LetterBrief, LetterTone, Minor, OccasionId, Relationship, ZoneId } from "@domain/index.ts"
import { AVOID_OPTIONS, extractPreferences, interestName, LAUNCH_TIMEZONE, LETTER_TONES, occasionById, RELATIONSHIPS, ZONES, zoneById } from "@domain/index.ts"
import { formatMoney } from "@domain/index.ts"
import type { AssistantPick } from "@/api"

/**
 * The send-gift conversation as pure data. Nothing here renders or calls the API, so the rules
 * that matter — never ask twice, letter-only never sees gift questions, answers stay editable —
 * are plain functions with tests (send-flow.test.ts).
 *
 * The transcript isn't stored: it's derived from what's known. The next question is always the
 * first relevant question that hasn't been answered, so editing an earlier answer, skipping, or
 * switching between gift and letter never loses anything and never repeats a question.
 */

export type SendIntent = "gift" | "letter" | "both"
export type Unsure = "unsure"
export type LetterMethod = "assistant" | "own" | "improve"

export interface SelectedGift {
  productId: string
  slug: string
  variantId: string
  variantName: string
  title: string
  image: string
  price: Minor
  deliveryFee: Minor | null
  vendorId: string
  vendorName: string
  explanation: string
  earliest: DateOnly | null
}

export interface SendState {
  v: 1
  /** Generated once; makes a retried letter send idempotent. */
  clientRef: string
  intent?: SendIntent
  /** `word` is how the sender put it ("sister", "boss"), so the assistant can say it back. */
  recipient: { name?: string; relationship?: Relationship | Unsure; word?: string; nameSkipped?: boolean }
  occasion?: OccasionId | Unsure
  /** Free-text reason for a letter when no listed occasion fits. */
  purpose?: string
  gift: {
    budgetMax?: Minor | Unsure
    /** undefined = not yet clarified. */
    budgetIncludesDelivery?: boolean
    interests: InterestId[]
    /** What they said about the recipient that didn't map to a listed interest. */
    interestNote?: string
    interestsDone?: boolean
    /** [] = answered "nothing to avoid". */
    avoid?: string[]
    zoneId?: ZoneId | Unsure
    deliverBy?: DateOnly | "any"
    personalisedOnly?: boolean
    excludeIds: string[]
  }
  selected?: SelectedGift
  /** Gift-only senders are offered a letter once; false means "no thanks". */
  letterWanted?: boolean
  letter: {
    method?: LetterMethod
    message?: string | Unsure
    tone?: LetterTone
    details?: string | "skip"
    signature?: string
    /** The sender's own letter or draft to improve. */
    draft?: string
    /** The letter as it stands — composed, improved or typed. */
    body?: string
    source?: "ai" | "rules" | "own"
    approved?: boolean
  }
  delivery: { email?: string; senderName?: string; when?: "now" | "scheduled"; date?: DateOnly; time?: string }
  /** Set once a letter is sent or scheduled; the conversation is then finished. */
  sent?: { id: string; status: "scheduled" | "sent"; sendAt: string; contactMasked: string }
  /** Answer being changed; shown in place of its summary. */
  editing?: QuestionId
  /** Where the sender is in the send studio (gift-studio.ts). */
  step?: import("./gift-studio").GiftStep
  /** The look of the gift's letter, chosen in the send studio. */
  letterDesign?: import("@domain/index.ts").LetterDesign
}

export type QuestionId =
  | "intent"
  | "recipient"
  | "occasion"
  | "budget"
  | "budget-delivery"
  | "interests"
  | "avoid"
  | "zone"
  | "timing"
  | "add-letter"
  | "letter-name"
  | "letter-method"
  | "letter-message"
  | "letter-tone"
  | "letter-details"
  | "letter-signature"
  | "letter-own"
  | "letter-improve"

/** Stages after the questions. */
export type Stage = { kind: "question"; id: QuestionId } | { kind: "results" } | { kind: "compose" } | { kind: "letter-preview" } | { kind: "letter-delivery" } | { kind: "review" } | { kind: "done" }

export const newSendState = (): SendState => ({
  v: 1,
  clientRef: randomRef(),
  recipient: {},
  gift: { interests: [], excludeIds: [] },
  letter: {},
  delivery: {},
})

function randomRef() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

// ---------------------------------------------------------------- Path rules

export const wantsGift = (s: SendState) => s.intent === "gift" || s.intent === "both"
/** Letter questions apply to letter-only, gift-with-letter (after a gift is chosen) and gift-only senders who opted in. */
export const wantsLetter = (s: SendState) => s.intent === "letter" || ((s.intent === "both" || (s.intent === "gift" && s.letterWanted === true)) && Boolean(s.selected))

const FOODISH: InterestId[] = ["foodie", "sweet-tooth", "coffee-tea", "cooking"]

interface QuestionDef {
  id: QuestionId
  relevant: (s: SendState) => boolean
  answered: (s: SendState) => boolean
}

const QUESTIONS: QuestionDef[] = [
  { id: "intent", relevant: () => true, answered: (s) => Boolean(s.intent) },
  // Shared by both paths: asked once, reused by the other.
  { id: "recipient", relevant: (s) => wantsGift(s) || wantsLetter(s), answered: (s) => Boolean(s.recipient.relationship) || (s.intent === "letter" && Boolean(s.recipient.name)) },
  { id: "occasion", relevant: (s) => wantsGift(s) || wantsLetter(s), answered: (s) => Boolean(s.occasion) || (!wantsGift(s) && Boolean(s.purpose)) },
  // Gift discovery.
  { id: "budget", relevant: wantsGift, answered: (s) => s.gift.budgetMax !== undefined },
  { id: "budget-delivery", relevant: (s) => wantsGift(s) && typeof s.gift.budgetMax === "number", answered: (s) => s.gift.budgetIncludesDelivery !== undefined },
  { id: "interests", relevant: wantsGift, answered: (s) => Boolean(s.gift.interestsDone) || s.gift.interests.length > 0 || Boolean(s.gift.interestNote) },
  // Only when it changes what we'd suggest: consumables and scented things.
  { id: "avoid", relevant: (s) => wantsGift(s) && s.gift.interests.some((i) => FOODISH.includes(i) || i === "wellness"), answered: (s) => s.gift.avoid !== undefined },
  { id: "zone", relevant: wantsGift, answered: (s) => s.gift.zoneId !== undefined },
  { id: "timing", relevant: wantsGift, answered: (s) => s.gift.deliverBy !== undefined },
  // After a gift is chosen.
  { id: "add-letter", relevant: (s) => s.intent === "gift" && Boolean(s.selected), answered: (s) => s.letterWanted !== undefined },
  // Letter. A name makes the greeting personal; asked only if it's still missing, and skippable.
  { id: "letter-name", relevant: (s) => wantsLetter(s) && s.intent !== "letter" && (!s.recipient.name || s.recipient.nameSkipped === true), answered: (s) => Boolean(s.recipient.name) || s.recipient.nameSkipped === true },
  { id: "letter-method", relevant: wantsLetter, answered: (s) => Boolean(s.letter.method) },
  { id: "letter-own", relevant: (s) => wantsLetter(s) && s.letter.method === "own", answered: (s) => Boolean(s.letter.draft?.trim()) },
  { id: "letter-improve", relevant: (s) => wantsLetter(s) && s.letter.method === "improve", answered: (s) => Boolean(s.letter.draft?.trim()) },
  { id: "letter-message", relevant: (s) => wantsLetter(s) && s.letter.method === "assistant", answered: (s) => Boolean(s.letter.message) },
  { id: "letter-tone", relevant: (s) => wantsLetter(s) && s.letter.method === "assistant", answered: (s) => Boolean(s.letter.tone) },
  { id: "letter-details", relevant: (s) => wantsLetter(s) && s.letter.method === "assistant", answered: (s) => s.letter.details !== undefined },
  { id: "letter-signature", relevant: (s) => wantsLetter(s) && s.letter.method === "assistant", answered: (s) => Boolean(s.letter.signature?.trim()) },
]

const GIFT_QUESTIONS: QuestionId[] = ["recipient", "occasion", "budget", "budget-delivery", "interests", "avoid", "zone", "timing"]

export const isAnswered = (s: SendState, id: QuestionId) => QUESTIONS.find((q) => q.id === id)!.answered(s)

/** Questions answered so far on the current path, in conversation order (for the transcript). */
export function answeredQuestions(s: SendState): QuestionId[] {
  const order = transcriptOrder(s)
  return order.filter((id) => {
    const q = QUESTIONS.find((x) => x.id === id)!
    return q.relevant(s) && q.answered(s)
  })
}

/** Gift questions come before the results; letter questions after a gift is chosen. */
function transcriptOrder(s: SendState): QuestionId[] {
  const letterQs = QUESTIONS.map((q) => q.id).filter((id) => id.startsWith("letter-"))
  if (s.intent === "letter") return ["intent", "recipient", "occasion", ...letterQs]
  return ["intent", ...GIFT_QUESTIONS, "add-letter", ...letterQs]
}

/** Where the conversation is now. */
export function currentStage(s: SendState): Stage {
  if (s.sent) return { kind: "done" }
  if (s.editing) return { kind: "question", id: s.editing }
  for (const id of transcriptOrder(s)) {
    const q = QUESTIONS.find((x) => x.id === id)!
    if (!q.relevant(s) || q.answered(s)) continue
    // Gift discovery ends in results; letter questions wait until a gift is chosen.
    return { kind: "question", id }
  }
  if (wantsGift(s) && !s.selected) return { kind: "results" }
  if (wantsLetter(s)) {
    if (!s.letter.body) return { kind: "compose" }
    if (!s.letter.approved) return { kind: "letter-preview" }
    if (s.intent === "letter" && !deliveryReady(s)) return { kind: "letter-delivery" }
  }
  return { kind: "review" }
}

export const deliveryReady = (s: SendState) =>
  Boolean(s.delivery.email && s.delivery.when && (s.delivery.when === "now" || (s.delivery.date && s.delivery.time)) && s.recipient.name)

/** How far along the current path is, for a progress hint (0–1). */
export function progress(s: SendState): number {
  const stage = currentStage(s)
  if (stage.kind === "review" || stage.kind === "done") return 1
  const relevant = transcriptOrder(s).filter((id) => QUESTIONS.find((q) => q.id === id)!.relevant(s))
  const done = relevant.filter((id) => isAnswered(s, id)).length
  const extra = wantsGift(s) ? 1 : 0
  return Math.min(0.95, done / (relevant.length + extra + (wantsLetter(s) ? 2 : 0)))
}

// ---------------------------------------------------------------- Applying answers

/** Answers that change which gifts qualify. Changing one after choosing a gift clears the choice. */
const HARD_CONSTRAINTS: QuestionId[] = ["budget", "budget-delivery", "zone", "timing", "avoid"]

export function answer(s: SendState, id: QuestionId, patch: (draft: SendState) => void): SendState {
  const next = structuredClone(s)
  patch(next)
  return settle(s, next, HARD_CONSTRAINTS.includes(id))
}

const giftKey = (s: SendState) => JSON.stringify([s.gift.budgetMax, s.gift.budgetIncludesDelivery, s.gift.zoneId, s.gift.deliverBy, s.gift.avoid])
const briefKey = (s: SendState) => JSON.stringify([toLetterBrief(s), s.letter.method])

/**
 * Keeps derived state honest after any answer:
 * - a changed budget, area, date or exclusion clears the chosen gift (it may no longer qualify);
 * - a changed letter answer redrafts the letter (a typed letter simply becomes the new text);
 * - the edit, if any, is finished.
 */
function settle(prev: SendState, next: SendState, checkGift = true): SendState {
  next.editing = undefined
  if (next.recipient.relationship !== prev.recipient.relationship && next.recipient.word === prev.recipient.word) next.recipient.word = undefined
  if (checkGift && giftKey(next) !== giftKey(prev)) {
    next.selected = undefined
    next.gift.excludeIds = []
  }
  if (next.letter.method === "own") {
    if (next.letter.draft !== prev.letter.draft || next.letter.method !== prev.letter.method) {
      next.letter.body = next.letter.draft
      next.letter.source = "own"
      next.letter.approved = false
    }
  } else if (briefKey(next) !== briefKey(prev) || (next.letter.method === "improve" && next.letter.draft !== prev.letter.draft)) {
    if (prev.letter.body && next.letter.body === prev.letter.body) {
      next.letter.body = undefined
      next.letter.source = undefined
      next.letter.approved = false
    }
  }
  return next
}

/** Switching path keeps everything already known; the next question adapts. */
export function switchIntent(s: SendState, intent: SendIntent): SendState {
  const next = structuredClone(s)
  next.intent = intent
  next.editing = undefined
  if (intent === "gift" && s.intent === "both") next.letterWanted = s.letter.body ? true : undefined
  return next
}

/** Preferences for the recommender, built only from what's known. */
export function toPreferences(s: SendState): GiftPreferences {
  const g = s.gift
  return {
    occasion: s.occasion && s.occasion !== "unsure" ? s.occasion : undefined,
    relationship: s.recipient.relationship && s.recipient.relationship !== "unsure" ? s.recipient.relationship : undefined,
    budgetMax: typeof g.budgetMax === "number" ? g.budgetMax : undefined,
    budgetExcludesDelivery: g.budgetIncludesDelivery === false ? true : undefined,
    interests: g.interests,
    zoneId: g.zoneId && g.zoneId !== "unsure" ? g.zoneId : undefined,
    deliverBy: g.deliverBy && g.deliverBy !== "any" ? g.deliverBy : undefined,
    avoid: g.avoid?.length ? g.avoid : undefined,
    personalisedOnly: g.personalisedOnly || undefined,
    excludeIds: g.excludeIds.length ? g.excludeIds : undefined,
  }
}

export function toLetterBrief(s: SendState): LetterBrief {
  return {
    recipientName: s.recipient.name,
    relationship: s.recipient.relationship && s.recipient.relationship !== "unsure" ? s.recipient.relationship : undefined,
    occasion: s.occasion && s.occasion !== "unsure" ? s.occasion : undefined,
    purpose: s.purpose,
    message: s.letter.message && s.letter.message !== "unsure" ? s.letter.message : undefined,
    tone: s.letter.tone,
    details: s.letter.details && s.letter.details !== "skip" ? s.letter.details : undefined,
    signature: s.letter.signature,
  }
}

export function selectGift(s: SendState, pick: AssistantPick): SendState {
  const next = structuredClone(s)
  next.selected = {
    productId: pick.product.id,
    slug: pick.product.slug,
    variantId: pick.variantId,
    variantName: pick.variantName,
    title: pick.product.title,
    image: pick.product.images[0] ?? "",
    price: pick.price,
    deliveryFee: pick.deliveryFee,
    vendorId: pick.product.vendor.id,
    vendorName: pick.product.vendor.name,
    explanation: pick.explanation,
    earliest: pick.product.earliest?.date ?? null,
  }
  next.editing = undefined
  return next
}

// ---------------------------------------------------------------- Understanding free text

const UNSURE = /^\s*(i'?m\s+)?(not\s+sure|unsure|no\s+idea|don'?t\s+know|idk|dunno|skip|pass|whatever|any(thing)?)\s*[.!]?\s*$/i
const NONE = /^\s*(no|nope|none|nothing|nah|not really|no thanks|nothing to avoid)\s*[.!]?\s*$/i

const INTENT_WORDS = {
  letter: /\b(letter|note|card|message|write|words)\b/i,
  gift: /\b(gift|present|something|buy|send .* (flowers|cake|hamper)|flowers|cake|hamper)\b/i,
  letterOnly: /\b(just|only)\s+(a\s+)?(letter|note|message)\b|\bwithout\s+(a\s+)?gift\b|\bno\s+gift\b/i,
}

const TONE_WORDS: [RegExp, LetterTone][] = [
  [/\b(romantic|loving|love letter|sweet)\b/i, "romantic"],
  [/\b(playful|funny|fun|light|cheeky|humou?r)/i, "playful"],
  [/\b(formal|professional|polite|respectful)\b/i, "formal"],
  [/\b(appreciat|thank|grateful|gratitude)/i, "appreciative"],
  [/\b(heartfelt|sincere|emotional|deep|warm)\b/i, "heartfelt"],
]

const NAME_PATTERNS = [
  /\b(?:named|called|name is|name's)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/u,
  /\b(?:sister|brother|mum|mom|mother|dad|father|wife|husband|friend|colleague|boss|partner|girlfriend|boyfriend|aunt|uncle|cousin|son|daughter|niece|nephew|grandma|grandmother|grandpa|grandfather),?\s+([A-Z][\p{L}'-]+)\b/u,
  /\b(?:for|to)\s+([A-Z][\p{L}'-]+)\b/u,
]

const RELATION_WORD = /\b(wife|husband|girlfriend|boyfriend|partner|fianc[eé]e?|mum|mom|mother|dad|father|parents|sister|brother|colleague|co-?worker|boss|manager|client|son|daughter|niece|nephew|friend|bestie|best friend)\b/i

/** Capitalised words that follow "for"/"to" but aren't people. */
const NOT_NAMES = new Set([
  ...ZONES.flatMap((z) => [z.name, z.city, ...z.areas]).flatMap((n) => n.split(" ")),
  "Lagos", "Abuja", "Lekki", "Ajah", "Nigeria", "PH",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Christmas", "Easter", "Eid", "Valentine", "Valentine's", "Mother's", "Father's", "Sallah", "New", "God", "Me", "My", "Her", "Him", "Them", "The", "A", "I",
])

/** Parses a budget like "50k", "₦50,000", "about 75000" or "1.5m" into kobo. */
export function parseBudget(text: string): Minor | null {
  const m = text.replace(/naira/gi, "").match(/(?:₦|ngn|n\b)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\b/i)
  if (!m) return null
  let n = parseFloat(m[1].replace(/,/g, ""))
  const unit = m[2]?.toLowerCase()
  if (unit === "k" || unit === "thousand") n *= 1_000
  if (unit === "m" || unit === "million") n *= 1_000_000
  return n >= 1_000 && n <= 50_000_000 ? Math.round(n) * 100 : null
}

export interface Interpretation {
  next: SendState
  /** Short human-readable notes of what was understood, e.g. "your sister", "under ₦50,000". */
  understood: string[]
}

/**
 * Applies a free-text reply to the conversation. Everything recognisable is captured wherever it
 * belongs — not only the question being asked — so a detailed first message can skip several
 * questions. The question being asked also gets a literal fallback (e.g. the text *is* the message).
 */
export function interpret(s: SendState, text: string, active: QuestionId | null, now = new Date()): Interpretation {
  const t = text.trim()
  const next = structuredClone(s)
  const understood: string[] = []
  if (!t) return { next, understood }
  const unsure = UNSURE.test(t)

  // Questions where the reply is the content itself: take it literally, don't mine it for preferences.
  if (active === "letter-message") {
    next.letter.message = unsure ? "unsure" : t.slice(0, 1200)
    const tone = TONE_WORDS.find(([re]) => re.test(t))?.[1]
    if (tone && !next.letter.tone && !unsure) next.letter.tone = tone
    return { next: settle(s, next), understood: [unsure ? "we'll keep it simple" : "your message"] }
  }
  if (active === "letter-name") {
    if (unsure || NONE.test(t)) next.recipient.nameSkipped = true
    else next.recipient.name = t.replace(/^(her|his|their) name is\s+/i, "").slice(0, 80)
    return { next: settle(s, next), understood: [] }
  }
  if (active === "letter-details") {
    next.letter.details = unsure || NONE.test(t) ? "skip" : t.slice(0, 500)
    return { next: settle(s, next), understood: [] }
  }
  if (active === "letter-signature") {
    next.letter.signature = t.slice(0, 60)
    return { next: settle(s, next), understood: [] }
  }
  if (active === "letter-own" || active === "letter-improve") {
    next.letter.draft = t.slice(0, 2000)
    return { next: settle(s, next), understood: [] }
  }

  // Intent.
  if (!next.intent || active === "intent") {
    const letter = INTENT_WORDS.letter.test(t)
    const gift = INTENT_WORDS.gift.test(t)
    if (INTENT_WORDS.letterOnly.test(t) || (letter && !gift)) next.intent = "letter"
    else if (letter && gift) next.intent = "both"
    else if (gift) next.intent = "gift"
    if (next.intent && next.intent !== s.intent) understood.push(next.intent === "letter" ? "a letter" : next.intent === "both" ? "a gift with a letter" : "a gift")
  }

  // Everything the rules can recognise, wherever it was said.
  const p = extractPreferences(t, now, LAUNCH_TIMEZONE)
  if (p.relationship && (!next.recipient.relationship || active === "recipient")) {
    next.recipient.relationship = p.relationship
    next.recipient.word = t.match(RELATION_WORD)?.[1]?.toLowerCase()
    understood.push(`your ${next.recipient.word ?? RELATIONSHIPS.find((r) => r.id === p.relationship)!.name.toLowerCase()}`)
  }
  const name = NAME_PATTERNS.map((re) => t.match(re)?.[1]).find((n) => n && !NOT_NAMES.has(n.split(" ")[0]))
  if (name && name !== next.recipient.name) {
    next.recipient.name = name
    understood.push(name)
  }
  if (p.occasion && (!next.occasion || active === "occasion")) {
    next.occasion = p.occasion
    understood.push(occasionById(p.occasion)!.name.toLowerCase())
  }
  const budget = p.budgetMax ?? (active === "budget" ? parseBudget(t) : null)
  if (budget && (next.gift.budgetMax === undefined || active === "budget")) {
    next.gift.budgetMax = budget
    // "including delivery" / "plus delivery" settles the follow-up there and then.
    if (/\b(incl(uding|udes)?|with)\s+delivery\b|\ball[- ]in\b|\btotal\b/i.test(t)) next.gift.budgetIncludesDelivery = true
    else if (/\b(plus|excl(uding|udes)?|before|without|not including)\s+delivery\b|\bdelivery\s+(extra|separate)/i.test(t)) next.gift.budgetIncludesDelivery = false
    else if (active === "budget") next.gift.budgetIncludesDelivery = undefined
    understood.push(`up to ${formatMoney(budget)}`)
  }
  const newInterests = p.interests.filter((i) => !next.gift.interests.includes(i))
  if (newInterests.length) {
    next.gift.interests = [...next.gift.interests, ...newInterests]
    understood.push(`likes ${newInterests.map((i) => interestName(i).toLowerCase()).join(", ")}`)
  }
  if (p.zoneId && (next.gift.zoneId === undefined || active === "zone")) {
    next.gift.zoneId = p.zoneId
    understood.push(`delivering to ${zoneById(p.zoneId)!.name}`)
  }
  if (p.deliverBy && (next.gift.deliverBy === undefined || active === "timing")) {
    next.gift.deliverBy = p.deliverBy
    understood.push("arrival date")
  }
  const tone = TONE_WORDS.find(([re]) => re.test(t))?.[1]
  if (tone && wantsLetter(next) && !next.letter.tone) next.letter.tone = tone

  // Literal fallbacks for the question being asked.
  switch (active) {
    case "recipient":
      if (unsure) next.recipient.relationship = "unsure"
      else if (!p.relationship && !name) {
        // A bare name ("Ada") or something we can't map ("my godmother").
        if (/^[\p{Lu}][\p{L}'-]+(\s+[\p{Lu}][\p{L}'-]+)?$/u.test(t)) next.recipient.name = t
        next.recipient.relationship ??= "other"
      }
      break
    case "occasion":
      if (!p.occasion) {
        if (/\b(no reason|just because|nothing special)\b/i.test(t)) next.occasion = "just-because"
        else if (unsure) next.occasion = "unsure"
        else {
          // Keep their words: a letter can use them as its reason even without a listed occasion.
          next.purpose = t.slice(0, 200)
          if (s.intent !== "letter") next.occasion = "unsure"
        }
      }
      break
    case "budget":
      if (!budget) {
        if (unsure || /\b(no (fixed )?budget|flexible|open)\b/i.test(t)) next.gift.budgetMax = "unsure"
      }
      break
    case "budget-delivery":
      if (/\b(yes|yeah|yep|include|including|incl|total|all[- ]in|covers?)\b/i.test(t)) next.gift.budgetIncludesDelivery = true
      else if (/\b(no|nope|exclud|gift only|just the gift|separate|on top|extra|plus)\b/i.test(t)) next.gift.budgetIncludesDelivery = false
      break
    case "interests":
      if (!p.interests.length) {
        if (!unsure) next.gift.interestNote = t.slice(0, 300)
        next.gift.interestsDone = true
      }
      break
    case "avoid": {
      if (unsure || NONE.test(t)) next.gift.avoid = []
      else {
        const ids = AVOID_OPTIONS.filter((o) => new RegExp(`\\b(${[o.id, o.name, ...o.words].join("|")})`, "i").test(t)).map((o) => o.id)
        next.gift.avoid = ids.length ? ids : t.split(/,|\band\b|\bor\b/).map((w) => w.replace(/\b(no|avoid|not|any|nothing with)\b/gi, "").trim()).filter((w) => w.length >= 3).slice(0, 6)
      }
      break
    }
    case "zone":
      if (!p.zoneId && (unsure || /\b(later|not yet)\b/i.test(t))) next.gift.zoneId = "unsure"
      break
    case "timing":
      if (!p.deliverBy && (unsure || /\b(no rush|anytime|any time|whenever|flexible)\b/i.test(t))) next.gift.deliverBy = "any"
      break
    case "add-letter":
      if (/\b(yes|yeah|sure|ok|okay|please|add)\b/i.test(t)) next.intent = "both"
      else if (NONE.test(t) || /\b(skip|no)\b/i.test(t)) next.letterWanted = false
      break
    case "letter-method":
      if (/\b(myself|my own|i'?ll write)\b/i.test(t)) next.letter.method = "own"
      else if (/\b(improve|polish|fix|edit|draft)\b/i.test(t)) next.letter.method = "improve"
      else if (/\b(help|you|write it|assistant)\b/i.test(t) || unsure) next.letter.method = "assistant"
      break
    case "letter-tone":
      if (tone) next.letter.tone = tone
      else if (unsure) next.letter.tone = "heartfelt"
      break
  }

  return { next: settle(s, next), understood }
}

// ---------------------------------------------------------------- Wording

export function recipientLabel(s: SendState): string {
  const rel = s.recipient.relationship
  const name = s.recipient.name?.split(" ")[0]
  if (name) return name
  if (s.recipient.word) return `your ${s.recipient.word}`
  if (rel && rel !== "unsure" && rel !== "other") return `your ${RELATIONSHIPS.find((r) => r.id === rel)!.name.toLowerCase()}`
  return "them"
}

export const toneName = (t: LetterTone) => LETTER_TONES.find((x) => x.id === t)!.name

/** A one-line recap of what's known, used when the assistant acknowledges a detailed message. */
export function acknowledgement(understood: string[]): string | null {
  if (!understood.length) return null
  const list = understood.length === 1 ? understood[0] : `${understood.slice(0, -1).join(", ")} and ${understood.at(-1)}`
  return `Got it — ${list}.`
}

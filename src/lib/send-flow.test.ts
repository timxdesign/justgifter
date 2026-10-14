import { describe, expect, it } from "vitest"
import type { AssistantPick } from "@/api"
import { answer, answeredQuestions, currentStage, interpret, newSendState, parseBudget, selectGift, switchIntent, toLetterBrief, toPreferences, type QuestionId, type SendState } from "./send-flow"

const NOW = new Date("2026-10-05T09:00:00Z") // a Monday in Lagos

const GIFT_QS: QuestionId[] = ["budget", "budget-delivery", "interests", "avoid", "zone", "timing"]

const stageId = (s: SendState) => {
  const st = currentStage(s)
  return st.kind === "question" ? st.id : st.kind
}

const say = (s: SendState, text: string) => interpret(s, text, (() => { const st = currentStage(s); return st.kind === "question" ? st.id : null })(), NOW).next

const pick = (over: Partial<AssistantPick> = {}): AssistantPick => ({
  product: { id: "prd_1", slug: "roses", title: "Roses", summary: "", images: ["/r.webp"], category: "flowers", occasions: [], vendor: { id: "ven_1", name: "Bloom", slug: "bloom", verified: true }, priceFrom: 3_000_000, priceTo: 3_000_000, inStock: true, lowStock: null, sponsored: false, perishable: true, personalisable: false, canSendWithoutAddress: true, earliest: null },
  variantId: "var_1",
  variantName: "Dozen",
  price: 3_000_000,
  deliveryFee: 250_000,
  explanation: "Fits",
  reasons: [],
  totalWithDelivery: 3_250_000,
  ...over,
})

describe("send-gift conversation", () => {
  it("asks what they want to send first", () => {
    expect(stageId(newSendState())).toBe("intent")
  })

  it("captures everything in a detailed first message and doesn't ask for it again", () => {
    const s = say(newSendState(), "I need a birthday gift for my sister under ₦50,000")
    expect(s.intent).toBe("gift")
    expect(s.recipient.relationship).toBe("sibling")
    expect(s.occasion).toBe("birthday")
    expect(s.gift.budgetMax).toBe(5_000_000)
    const answered = answeredQuestions(s)
    expect(answered).toEqual(expect.arrayContaining(["intent", "recipient", "occasion", "budget"]))
    // The only budget follow-up is whether it includes delivery.
    expect(stageId(s)).toBe("budget-delivery")
  })

  it("settles the delivery question when the budget already says so", () => {
    const s = say(newSendState(), "a gift for my mum, about 40k including delivery, she loves plants")
    expect(s.gift.budgetIncludesDelivery).toBe(true)
    expect(s.gift.interests).toContain("gardening")
    expect(stageId(s)).toBe("occasion")
  })

  it("never puts letter-only senders through gift discovery or shipping questions", () => {
    let s = say(newSendState(), "just a letter for my wife, no gift")
    expect(s.intent).toBe("letter")
    const seen = new Set<string>()
    for (let i = 0; i < 12 && currentStage(s).kind === "question"; i++) {
      const id = stageId(s)
      seen.add(id)
      s = say(s, id === "occasion" ? "our anniversary" : id === "letter-method" ? "help me write it" : id === "letter-message" ? "how proud I am of her" : id === "letter-tone" ? "romantic" : id === "letter-details" ? "no" : id === "letter-signature" ? "Tunde" : "not sure")
    }
    for (const q of [...GIFT_QS, "add-letter"]) expect(seen.has(q)).toBe(false)
    expect(currentStage(s).kind).toBe("compose")
    expect(toPreferences(s).zoneId).toBeUndefined()
  })

  it("asks about things to avoid only when it matters", () => {
    const base = answer(answer(say(newSendState(), "a gift for a colleague, just because, under 30k"), "budget-delivery", (d) => { d.gift.budgetIncludesDelivery = true }), "interests", (d) => { d.gift.interests = ["reading"] })
    expect(stageId(base)).toBe("zone")
    const foodie = answer(base, "interests", (d) => { d.gift.interests = ["sweet-tooth"] })
    expect(stageId(foodie)).toBe("avoid")
  })

  it("accepts 'not sure' and moves on", () => {
    let s = say(newSendState(), "a gift")
    s = say(s, "not sure")
    expect(s.recipient.relationship).toBe("unsure")
    expect(stageId(s)).toBe("occasion")
    expect(toPreferences(s).relationship).toBeUndefined()
  })

  it("lets an earlier answer be changed without restarting", () => {
    let s = say(newSendState(), "birthday gift for my sister in Lekki, she loves coffee, under 50k incl delivery, by Friday")
    s = say(s, "no, nothing to avoid")
    expect(stageId(s)).toBe("results")
    s = selectGift(s, pick())
    s = { ...s, editing: "occasion" }
    expect(stageId(s)).toBe("occasion")
    s = answer(s, "occasion", (d) => { d.occasion = "graduation" })
    // Occasion doesn't change which gifts qualify, so the choice stands.
    expect(s.selected?.productId).toBe("prd_1")
    expect(s.gift.budgetMax).toBe(5_000_000)
    // Budget does: the chosen gift is cleared and suggestions refresh.
    s = answer(s, "budget", (d) => { d.gift.budgetMax = 2_000_000 })
    expect(s.selected).toBeUndefined()
    expect(stageId(s)).toBe("results")
  })

  it("offers gift-only senders an optional letter after choosing", () => {
    let s = say(newSendState(), "birthday gift for my friend in Ikoyi under 40k with delivery, she reads a lot, anytime")
    s = say(s, "no rush")
    expect(stageId(s)).toBe("results")
    s = selectGift(s, pick())
    expect(stageId(s)).toBe("add-letter")
    const declined = say(s, "no thanks")
    expect(stageId(declined)).toBe("review")
    const accepted = say(s, "yes please")
    expect(accepted.intent).toBe("both")
    // Relationship and occasion are reused; only the missing name is asked, and it can be skipped.
    expect(stageId(accepted)).toBe("letter-name")
    expect(stageId(say(accepted, "Ngozi"))).toBe("letter-method")
    expect(stageId(say(accepted, "skip"))).toBe("letter-method")
  })

  it("keeps what's known when switching between gift and letter", () => {
    let s = say(newSendState(), "a gift for my dad for his graduation")
    s = switchIntent(s, "letter")
    expect(s.recipient.relationship).toBe("parent")
    expect(s.occasion).toBe("graduation")
    expect(stageId(s)).toBe("letter-method")
    s = switchIntent(s, "both")
    expect(stageId(s)).toBe("budget")
  })

  it("redrafts when a letter answer changes, but keeps a typed letter as typed", () => {
    let s = say(newSendState(), "just a letter for Ada")
    s = answer(s, "occasion", (d) => { d.occasion = "birthday" })
    s = answer(s, "letter-method", (d) => { d.letter.method = "assistant" })
    s = answer(s, "letter-message", (d) => { d.letter.message = "you inspire me" })
    s = answer(s, "letter-tone", (d) => { d.letter.tone = "heartfelt" })
    s = answer(s, "letter-details", (d) => { d.letter.details = "skip" })
    s = answer(s, "letter-signature", (d) => { d.letter.signature = "Tolu" })
    s = { ...s, letter: { ...s.letter, body: "Dear Ada…", source: "rules" } }
    expect(stageId(s)).toBe("letter-preview")
    s = answer(s, "letter-tone", (d) => { d.letter.tone = "playful" })
    expect(s.letter.body).toBeUndefined()
    expect(stageId(s)).toBe("compose")
    const own = answer(s, "letter-method", (d) => { d.letter.method = "own" })
    const typed = say(own, "Happy birthday Ada! Love, Tolu")
    expect(typed.letter.body).toBe("Happy birthday Ada! Love, Tolu")
    expect(stageId(typed)).toBe("letter-preview")
  })

  it("letter-only ends with delivery details then review", () => {
    let s = say(newSendState(), "a letter to my colleague Ngozi to say thank you")
    expect(s.recipient.name).toBe("Ngozi")
    expect(s.occasion).toBe("appreciation")
    s = answer(s, "letter-method", (d) => { d.letter.method = "own" })
    s = say(s, "Thank you for all your help this year.")
    s = { ...s, letter: { ...s.letter, approved: true } }
    expect(stageId(s)).toBe("letter-delivery")
    s = { ...s, delivery: { email: "ngozi@example.com", when: "now" } }
    expect(stageId(s)).toBe("review")
  })

  it("builds the letter brief only from what the sender said", () => {
    let s = say(newSendState(), "a letter for my brother")
    s = answer(s, "occasion", (d) => { d.occasion = "unsure" })
    s = answer(s, "letter-method", (d) => { d.letter.method = "assistant" })
    s = answer(s, "letter-message", (d) => { d.letter.message = "unsure" })
    const brief = toLetterBrief(s)
    expect(brief.occasion).toBeUndefined()
    expect(brief.message).toBeUndefined()
    expect(brief.details).toBeUndefined()
  })

  it("parses budgets the way people type them", () => {
    expect(parseBudget("50k")).toBe(5_000_000)
    expect(parseBudget("₦75,000")).toBe(7_500_000)
    expect(parseBudget("about 1.2m naira")).toBe(120_000_000)
    expect(parseBudget("5")).toBeNull()
  })

  it("doesn't mistake ordinary words for interests", () => {
    const s = say(newSendState(), "a heartfelt gift for a great friend")
    expect(s.gift.interests).toEqual([])
  })
})

import { describe, expect, it } from "vitest"
import { currentGiftStep, giftLetterDesign, giftProblems, giftSteps, nextGiftStep, previewGiftView, toCheckoutIntent } from "./gift-studio"
import { newSendState, switchIntent, type SelectedGift, type SendState } from "./send-flow"

const gift: SelectedGift = { productId: "p1", slug: "roses", variantId: "v1", variantName: "Dozen", title: "Velvet red roses", image: "/x.webp", price: 2_500_000, deliveryFee: 250_000, vendorId: "ven1", vendorName: "Bloom", explanation: "Fits", earliest: null }
const base = (patch: Partial<SendState> = {}): SendState => ({ ...newSendState(), intent: "gift", ...patch })

describe("send studio", () => {
  it("only adds the letter step for a gift with a letter", () => {
    expect(giftSteps(base()).map((x) => x.id)).toEqual(["who", "gift", "review"])
    expect(giftSteps(switchIntent(base(), "both")).map((x) => x.id)).toEqual(["who", "gift", "letter", "review"])
  })

  it("needs a chosen gift before moving on, and falls back to it if the choice is cleared", () => {
    expect(giftProblems(base(), "gift").map((p) => p.field)).toEqual(["gift"])
    expect(giftProblems(base({ selected: gift }), "gift")).toEqual([])
    expect(currentGiftStep(base({ step: "review" }))).toBe("gift")
    expect(currentGiftStep(base({ step: "review", selected: gift }))).toBe("review")
  })

  it("drops the letter step when the letter is removed", () => {
    const s = { ...switchIntent(base({ selected: gift }), "both"), step: "letter" as const }
    expect(nextGiftStep(s)).toBe("review")
    expect(currentGiftStep(switchIntent(s, "gift"))).toBe("review")
  })

  it("asks for the letter and signature on the letter step", () => {
    const s = switchIntent(base({ selected: gift }), "both")
    expect(giftProblems(s, "letter").map((p) => p.field)).toEqual(["body", "signature"])
    expect(giftProblems({ ...s, letter: { body: "Dear Ada", signature: "Tolu" } }, "letter")).toEqual([])
  })

  it("previews the letter with its design, and sends both to checkout", () => {
    const s: SendState = { ...switchIntent(base({ selected: gift, occasion: "birthday", recipient: { name: "Ada" } }), "both"), letter: { body: "Dear Ada,\n\nHappy birthday.", signature: "Tolu" } }
    const view = previewGiftView(s)!
    expect(view.message).toContain("Happy birthday")
    expect(view.letterDesign?.theme).toBe("celebration")
    const intent = toCheckoutIntent({ ...s, letterDesign: { ...giftLetterDesign(s), flowers: "hibiscus" } })!
    expect(intent.message).toContain("Happy birthday")
    expect(intent.letterDesign?.flowers).toBe("hibiscus")
    expect(intent.recipientName).toBe("Ada")
    expect(intent.senderDisplayName).toBe("Tolu")
  })

  it("leaves the letter out of a gift on its own, even if one was written earlier", () => {
    const s: SendState = { ...base({ selected: gift }), letter: { body: "Old draft", signature: "Tolu" } }
    expect(previewGiftView(s)!.message).toBe("")
    expect(toCheckoutIntent(s)!.message).toBeUndefined()
    expect(toCheckoutIntent(s)!.letterDesign).toBeUndefined()
  })
})

import type { LetterDesign } from "@domain/index.ts"
import { DEFAULT_LETTER_DESIGN, LETTER_MAX_CHARS, LETTER_SIGNATURE_MAX, occasionById, zoneById } from "@domain/index.ts"
import type { GiftRevealView } from "@/api"
import type { CheckoutIntent } from "./cart"
import { defaultDesignFor } from "./letter-studio"
import type { SendState } from "./send-flow"

/**
 * The send-a-gift studio as plain data: which steps apply, what's missing before each one, what the
 * recipient's preview looks like and what goes to checkout. The answers themselves still live in
 * SendState (send-flow.ts), so free text can fill them in through `interpret()`.
 */

export type GiftStep = "who" | "gift" | "letter" | "review"

const STEP_LABELS: Record<GiftStep, string> = { who: "Who", gift: "Gift", letter: "Letter", review: "Review" }

export const withLetter = (s: SendState) => s.intent === "both"

export function giftSteps(s: SendState): { id: GiftStep; label: string }[] {
  const ids: GiftStep[] = withLetter(s) ? ["who", "gift", "letter", "review"] : ["who", "gift", "review"]
  return ids.map((id) => ({ id, label: STEP_LABELS[id] }))
}

/** The current step, falling back when the path changes under it (e.g. the letter is dropped). */
export function currentGiftStep(s: SendState): GiftStep {
  const step = s.step ?? "who"
  // Letter and review need a chosen gift; changing a budget or area can clear it.
  if ((step === "letter" || step === "review") && !s.selected) return "gift"
  return giftSteps(s).some((x) => x.id === step) ? step : "review"
}

export function nextGiftStep(s: SendState): GiftStep | null {
  const steps = giftSteps(s)
  const i = steps.findIndex((x) => x.id === currentGiftStep(s))
  return steps[i + 1]?.id ?? null
}

export function prevGiftStep(s: SendState): GiftStep | null {
  const steps = giftSteps(s)
  const i = steps.findIndex((x) => x.id === currentGiftStep(s))
  return i > 0 ? steps[i - 1].id : null
}

export interface GiftProblem {
  field: string
  message: string
}

/** What has to be fixed before leaving a step. Everything about the recipient is optional. */
export function giftProblems(s: SendState, step: GiftStep): GiftProblem[] {
  const out: GiftProblem[] = []
  if (step === "who" && (!s.intent || s.intent === "letter")) out.push({ field: "intent", message: "Choose a gift, or a gift with a letter." })
  if (step === "gift" && !s.selected) out.push({ field: "gift", message: "Choose a gift to continue. Change any detail above to see other ideas." })
  if (step === "letter") {
    const body = s.letter.body?.trim() ?? ""
    if (!body) out.push({ field: "body", message: "Write the letter, or go back and choose a gift on its own." })
    if (body.length > LETTER_MAX_CHARS) out.push({ field: "body", message: `Keep the letter under ${LETTER_MAX_CHARS.toLocaleString("en")} characters.` })
    if (!s.letter.signature?.trim()) out.push({ field: "signature", message: "Add how you'll sign it." })
    if ((s.letter.signature?.length ?? 0) > LETTER_SIGNATURE_MAX) out.push({ field: "signature", message: `Keep your signature under ${LETTER_SIGNATURE_MAX} characters.` })
  }
  return out
}

/** The letter's look, defaulting from the occasion until the sender picks one. */
export function giftLetterDesign(s: SendState): LetterDesign {
  if (s.letterDesign) return s.letterDesign
  const occasion = s.occasion && s.occasion !== "unsure" ? s.occasion : undefined
  return occasion ? defaultDesignFor(occasion) : DEFAULT_LETTER_DESIGN
}

/**
 * What the recipient's gift page will show, built from the draft. Null until a gift is chosen;
 * the preview then shows only the closed box.
 */
export function previewGiftView(s: SendState, senderFallback = ""): GiftRevealView | null {
  const g = s.selected
  if (!g) return null
  const zone = s.gift.zoneId && s.gift.zoneId !== "unsure" ? zoneById(s.gift.zoneId) : null
  const letter = withLetter(s) && s.letter.body?.trim() ? s.letter.body.trim() : ""
  const occasion = s.occasion && s.occasion !== "unsure" ? occasionById(s.occasion) : null
  return {
    giftId: "preview",
    preview: true,
    recipientName: s.recipient.name?.trim() || "Your recipient",
    senderDisplayName: s.letter.signature?.trim() || senderFallback || "You",
    anonymous: false,
    message: letter,
    letterDesign: letter ? giftLetterDesign(s) : null,
    revealStyle: "wrapped_box",
    revealStatus: "available",
    openedAt: null,
    item: { title: g.title, variantName: g.variantName, image: g.image, images: [g.image], vendorName: g.vendorName, summary: "", quantity: 1 },
    claim: { status: "not_required", deadline: null, zoneId: zone?.id ?? "lagos-island", zoneName: zone?.name ?? "", areas: zone?.areas ?? [] },
    fulfilment: { status: "awaiting_vendor_acceptance", label: "Being prepared", dispatched: false, delivered: false, window: null },
    occasionTitle: occasion ? occasion.name : null,
  }
}

/** Everything checkout needs, pre-filled from the studio. Nothing here is charged or final. */
export function toCheckoutIntent(s: SendState, senderFallback?: string): CheckoutIntent | null {
  const g = s.selected
  if (!g) return null
  const zone = s.gift.zoneId && s.gift.zoneId !== "unsure" ? s.gift.zoneId : undefined
  const by = s.gift.deliverBy && s.gift.deliverBy !== "any" ? s.gift.deliverBy : undefined
  const letter = withLetter(s) && s.letter.body?.trim() ? s.letter.body.trim() : undefined
  return {
    vendorId: g.vendorId,
    vendorName: g.vendorName,
    lines: [{ productId: g.productId, variantId: g.variantId, quantity: 1, title: g.title, variantName: g.variantName, image: g.image, unitPrice: g.price, vendorId: g.vendorId, vendorName: g.vendorName, addedAt: new Date().toISOString() }],
    source: "marketplace",
    purchaseType: "gift",
    fromBag: false,
    recipientName: s.recipient.name?.trim() || undefined,
    zoneId: zone,
    requestedDate: by,
    message: letter,
    letterDesign: letter ? giftLetterDesign(s) : undefined,
    senderDisplayName: s.letter.signature?.trim() || senderFallback,
  }
}

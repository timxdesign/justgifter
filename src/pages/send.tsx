import "@/components/letter/letter.css"
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { ArrowRightIcon, GiftIcon } from "@/components/icons"
import { StepHeading, StudioActionBar, StudioLayout, Underlined } from "@/components/studio/studio-layout"
import { GiftPreviewPane, GiftRecipientScreen, type GiftPreviewPage } from "@/components/send/studio/gift-preview"
import { GiftStep } from "@/components/send/studio/gift-step"
import { LetterStep } from "@/components/send/studio/letter-step"
import { ReviewStep } from "@/components/send/studio/review-step"
import { WhoStep } from "@/components/send/studio/who-step"
import { FullscreenPreview } from "@/components/studio/device-preview"
import { checkoutIntent, preferredZone } from "@/lib/cart"
import { currentGiftStep, giftProblems, giftSteps, nextGiftStep, prevGiftStep, previewGiftView, toCheckoutIntent, type GiftProblem, type GiftStep as Step } from "@/lib/gift-studio"
import { interpret, newSendState, recipientLabel, switchIntent, type SendIntent, type SendState } from "@/lib/send-flow"
import { useDocumentMeta } from "@/lib/seo"
import { useSession } from "@/lib/session"

const DRAFT_KEY = "jg-send-draft"

function loadDraft(): SendState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    const parsed = raw ? (JSON.parse(raw) as SendState) : null
    return parsed?.v === 1 && parsed.clientRef ? { ...parsed, editing: undefined } : null
  } catch {
    return null
  }
}

function saveDraft(s: SendState) {
  try {
    if (s.intent || s.recipient.name) localStorage.setItem(DRAFT_KEY, JSON.stringify(s))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage unavailable: the studio still works for this visit */
  }
}

/** Where each problem's field lives, so "Next" can take the sender straight to it. */
const FIELD_TARGET: Record<string, string> = { body: "ls-body", signature: "ss-sign", gift: "ss-ideas" }

/** What the preview shows on each step, until the sender steps through it themselves. */
const PREVIEW_FOR: Record<Step, GiftPreviewPage> = { who: "box", gift: "gift", letter: "letter", review: "gift" }

/**
 * The send-a-gift studio: who it's for, the gift, an optional letter, then review and checkout,
 * with the recipient's gift page live beside it. A letter on its own goes to /send/letter.
 */
export default function SendPage() {
  useDocumentMeta({ title: "Send a gift", description: "Choose a thoughtful gift, add a letter on a table of flowers, and see exactly what they'll open." })
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const [s, setS] = useState<SendState>(() => {
    const d = loadDraft()
    return d && d.intent !== "letter" ? d : { ...newSendState(), intent: "gift" }
  })
  const [problems, setProblems] = useState<GiftProblem[]>([])
  const [previewPage, setPreviewPage] = useState<GiftPreviewPage>("box")
  const [fullPreview, setFullPreview] = useState(false)
  const step = currentGiftStep(s)

  const update = (next: SendState) => {
    setS(next)
    if (problems.length) setProblems([])
  }
  useEffect(() => saveDraft(s), [s])

  const letterOnly = (from: SendState = s) => {
    const q = new URLSearchParams()
    if (from.recipient.name) q.set("to", from.recipient.name)
    if (from.occasion && from.occasion !== "unsure") q.set("occasion", from.occasion)
    navigate(`/send/letter${q.size ? `?${q}` : ""}`)
  }

  // Entry points: /send?intent=gift|both|letter, and old /assistant?q=… links (understood as free text).
  useEffect(() => {
    const q = params.get("q")?.trim()
    const intent = params.get("intent") as SendIntent | null
    if (!q && !intent) return
    let next = s
    if (intent === "gift" || intent === "both") next = switchIntent(next, intent)
    if (q) next = interpret(next, q, null).next
    setParams({}, { replace: true })
    if (intent === "letter" || next.intent === "letter") return letterOnly(next)
    setS({ ...next, intent: next.intent ?? "gift", step: "who" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The preview follows the step; picking a gift shows it opened.
  useEffect(() => {
    setPreviewPage(PREVIEW_FOR[step] === "gift" && !s.selected ? "box" : PREVIEW_FOR[step])
  }, [step, s.selected])

  const senderFallback = user?.name.split(" ")[0] ?? ""
  const view = useMemo(() => previewGiftView(s, senderFallback), [s, senderFallback])
  const name = s.recipient.name?.trim() ?? ""
  const from = s.letter.signature?.trim() || senderFallback || "you"

  const toTop = () => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
  const goStep = (to: Step) => {
    setProblems([])
    setS((cur) => ({ ...cur, step: to }))
    toTop()
  }

  const toCheckout = () => {
    const intent = toCheckoutIntent(s, senderFallback)
    if (!intent) return goStep("gift")
    if (intent.zoneId) preferredZone.set(intent.zoneId)
    checkoutIntent.set(intent)
    navigate("/checkout")
  }

  const next = () => {
    const found = giftProblems(s, step)
    if (found.length) {
      setProblems(found)
      window.setTimeout(() => {
        const el = document.getElementById(FIELD_TARGET[found[0].field] ?? "")
        el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true })
      }, 60)
      return
    }
    const to = nextGiftStep(s)
    if (to) goStep(to)
    else toCheckout()
  }
  const back = () => {
    const to = prevGiftStep(s)
    if (to) goStep(to)
  }

  const startOver = () => {
    setProblems([])
    setS({ ...newSendState(), intent: "gift", step: "who" })
    toTop()
  }

  const who = recipientLabel(s)
  return (
    <>
      <StudioLayout
        steps={giftSteps(s)}
        current={step}
        onStep={(id) => goStep(id as Step)}
        startOver={{ title: "Start over?", description: "Your answers and letter will be cleared from this device.", onConfirm: startOver }}
        preview={<GiftPreviewPane name={name} from={from} view={view} page={previewPage} onPage={setPreviewPage} />}
        actionBar={
          <StudioActionBar onBack={back} backDisabled={step === "who"} onPreview={() => setFullPreview(true)}>
            <Button size="lg" className="min-w-28 rounded-full" onClick={next}>
              {step === "review" ? (
                <>
                  <GiftIcon data-icon="inline-start" />
                  <span className="max-sm:hidden">Continue to checkout</span>
                  <span className="sm:hidden">Checkout</span>
                </>
              ) : (
                <>
                  Next
                  <ArrowRightIcon data-icon="inline-end" />
                </>
              )}
            </Button>
          </StudioActionBar>
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: reduce ? 0 : 0.28 }} className="flex flex-col gap-10">
            {step === "who" ? (
              <>
                <StepHeading title={<>Send something they'll <span className="text-brand-text italic">remember</span></>}>
                  Choose a gift from trusted local vendors, add a letter if you like, and see exactly what they'll open before you pay.
                </StepHeading>
                <WhoStep s={s} update={update} problems={problems} onLetterOnly={() => letterOnly()} />
              </>
            ) : step === "gift" ? (
              <>
                <StepHeading title={<>Find the <Underlined>gift</Underlined></>}>Tell us a little about {who}. Ideas only include gifts that can reach them in time.</StepHeading>
                <GiftStep s={s} update={update} problems={problems} />
              </>
            ) : step === "letter" ? (
              <>
                <StepHeading title={<>Write the <Underlined>letter</Underlined></>}>It opens after the gift, in a sealed envelope on a table of flowers.</StepHeading>
                <LetterStep s={s} update={update} problems={problems} />
              </>
            ) : (
              <>
                <StepHeading title={<>Ready to <Underlined>send</Underlined></>}>Check it over. You'll confirm the delivery date, their contact and payment at checkout.</StepHeading>
                {s.selected ? <ReviewStep s={s} update={update} goTo={goStep} /> : null}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </StudioLayout>
      <FullscreenPreview open={fullPreview} onOpenChange={setFullPreview}>
        <GiftRecipientScreen name={name} from={from} view={view} page={previewPage} />
      </FullscreenPreview>
    </>
  )
}

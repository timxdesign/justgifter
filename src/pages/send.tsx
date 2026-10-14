import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useReducedMotion } from "motion/react"
import { cn } from "cn"
import type { LetterRevision } from "@domain/index.ts"
import { Container, Img } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { ArrowUpIcon, RestartIcon, StarsIcon } from "@/components/icons"
import { formatMoney } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"
import {
  acknowledgement,
  answeredQuestions,
  currentStage,
  interpret,
  newSendState,
  progress,
  switchIntent,
  wantsGift,
  type QuestionId,
  type SendIntent,
  type SendState,
  type Stage,
} from "@/lib/send-flow"
import { Appear, AssistantSays, Panel, SenderSaid } from "@/components/send/parts"
import { answerSummary, INTENT_OPTIONS, QuestionControls, questionCopy } from "@/components/send/questions"
import { GiftResults, refineCommand, type RefineRequest } from "@/components/send/gift-results"
import { ComposeStep, LetterDelivery, LetterPreview, revisionCommand } from "@/components/send/letter-steps"
import { GiftReview, LetterDone, LetterReview } from "@/components/send/review"

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
    /* storage unavailable: the conversation still works for this visit */
  }
}

/** Questions whose own control is a text box; the composer would only duplicate it. */
const TEXT_QUESTIONS: QuestionId[] = ["letter-name", "letter-message", "letter-details", "letter-signature", "letter-own", "letter-improve"]
const GIFT_PHASE: QuestionId[] = ["intent", "recipient", "occasion", "budget", "budget-delivery", "interests", "avoid", "zone", "timing"]

const stageKey = (st: Stage) => (st.kind === "question" ? `q:${st.id}` : st.kind)

export default function SendPage() {
  useDocumentMeta({ title: "Send a gift", description: "Choose a thoughtful gift, write a personal letter, or both — with a little help, in a few short questions." })
  const [params, setParams] = useSearchParams()
  const reduce = useReducedMotion()
  const [s, setS] = useState<SendState>(() => loadDraft() ?? newSendState())
  const [note, setNote] = useState<string | null>(null)
  const [refineRequest, setRefineRequest] = useState<RefineRequest | null>(null)
  const [revisionRequest, setRevisionRequest] = useState<LetterRevision | null>(null)
  const stage = currentStage(s)
  const stageRef = useRef<HTMLDivElement>(null)
  const interacted = useRef(false)

  // Entry points can start the conversation: /send?intent=gift, or old /assistant?q=… links. Letters go to /send/letter.
  useEffect(() => {
    const q = params.get("q")?.trim()
    const intent = params.get("intent") as SendIntent | null
    if (!q && !intent) return
    let next = loadDraft()?.intent && !q ? s : newSendState()
    if (intent && INTENT_OPTIONS.some((o) => o.id === intent)) next = switchIntent(next, intent)
    if (q) {
      const r = interpret(next, q, next.intent ? null : "intent")
      next = r.next
      setNote(acknowledgement(r.understood))
    }
    setS(next)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => saveDraft(s), [s])

  // A letter on its own is written in the letter studio; what's known so far goes with it.
  const navigate = useNavigate()
  useEffect(() => {
    if (s.intent !== "letter" || s.sent) return
    const q = new URLSearchParams()
    if (s.recipient.name) q.set("to", s.recipient.name)
    if (s.occasion && s.occasion !== "unsure") q.set("occasion", s.occasion)
    saveDraft({ ...s, intent: undefined })
    navigate(`/send/letter${q.size ? `?${q}` : ""}`, { replace: true })
  }, [s, navigate])

  // Each new step is announced (the log is aria-live) and brought into view; focus follows for keyboard users.
  const key = stageKey(stage)
  useEffect(() => {
    if (!interacted.current) return
    const el = stageRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }, [key, reduce])

  const update = (next: SendState) => {
    interacted.current = true
    setNote(null)
    setS(next)
  }

  const onComposer = (text: string) => {
    interacted.current = true
    if (stage.kind === "results") {
      const cmd = refineCommand(text)
      if (cmd) return setRefineRequest(cmd)
    }
    if (stage.kind === "letter-preview") {
      const r = revisionCommand(text)
      if (r) return setRevisionRequest(r)
    }
    const { next, understood } = interpret(s, text, stage.kind === "question" ? stage.id : null)
    const changed = JSON.stringify(next) !== JSON.stringify(s)
    setS(next)
    setNote(changed ? acknowledgement(understood) : "Sorry, I didn't quite catch that. You can pick an option below, or put it another way.")
  }

  const startOver = () => {
    interacted.current = false
    setNote(null)
    setS(newSendState())
    window.scrollTo({ top: 0 })
  }

  const giftToo = () => {
    const fresh = newSendState()
    update({ ...fresh, intent: "gift", recipient: s.recipient, occasion: s.occasion, purpose: s.purpose, letterWanted: false })
  }

  const answered = answeredQuestions(s)
  const giftPhase = answered.filter((id) => GIFT_PHASE.includes(id))
  const later = answered.filter((id) => !GIFT_PHASE.includes(id))
  const editingInline = stage.kind === "question" && s.editing === stage.id
  const showComposer = (stage.kind === "question" && !TEXT_QUESTIONS.includes(stage.id)) || stage.kind === "results" || stage.kind === "letter-preview"

  const row = (id: QuestionId) =>
    s.editing === id ? (
      <div key={id} ref={stageRef} tabIndex={-1} className="flex scroll-mt-28 flex-col gap-4 outline-none">
        <AssistantSays hint={questionCopy(s, id).hint}>{questionCopy(s, id).title}</AssistantSays>
        <Panel>
          <QuestionControls s={s} id={id} update={update} />
          <Button variant="ghost" className="w-fit" onClick={() => update({ ...s, editing: undefined })}>Keep my answer</Button>
        </Panel>
      </div>
    ) : (
      <div key={id} className="flex flex-col gap-2.5">
        <AssistantSays muted>{questionCopy(s, id).title}</AssistantSays>
        <SenderSaid editLabel={`Change answer: ${questionCopy(s, id).title}`} onEdit={stage.kind === "done" ? undefined : () => update({ ...s, editing: id })}>
          {answerSummary(s, id)}
        </SenderSaid>
      </div>
    )

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-60" style={{ background: "radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--brand) 20%, transparent), transparent)" }} />
      <Container className="relative flex max-w-3xl flex-col gap-8 pt-8 pb-10 sm:pt-12">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="bg-brand-soft text-brand-text flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-medium">
              <StarsIcon className="size-4" />
              Gift assistant
            </span>
            {s.intent && stage.kind !== "done" && (
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground hidden text-xs sm:inline">Draft saved on this device</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm"><RestartIcon data-icon="inline-start" />Start over</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Start over?</AlertDialogTitle>
                      <AlertDialogDescription>Your answers{s.letter.body ? " and letter" : ""} will be cleared from this device.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep going</AlertDialogCancel>
                      <AlertDialogAction onClick={startOver}>Start over</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
          {!s.intent ? (
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-4xl leading-[1.05] font-medium text-balance sm:text-5xl">Let's make them feel thought of.</h1>
              <p className="text-muted-foreground text-lg text-pretty">A gift, a letter, or both. A few quick questions — you can type freely or tap an option.</p>
            </div>
          ) : (
            stage.kind !== "done" && (
              <div className="flex flex-col gap-3">
                <h1 className="sr-only">Send a gift</h1>
                <div role="group" aria-label="What you're sending" className="bg-muted flex w-fit max-w-full gap-1 overflow-x-auto rounded-full p-1">
                  {INTENT_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={s.intent === o.id}
                      onClick={() => s.intent !== o.id && update(switchIntent(s, o.id))}
                      className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors", s.intent === o.id ? "bg-card shadow-border font-medium" : "text-muted-foreground hover:text-foreground")}
                    >
                      {o.title}
                    </button>
                  ))}
                </div>
                <Progress value={progress(s) * 100} aria-label="Progress" className="h-1" />
              </div>
            )
          )}
        </header>

        <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-7">
          {giftPhase.map(row)}
          {s.selected && wantsGift(s) && stage.kind !== "results" && (
            <div className="flex flex-col gap-2.5">
              <AssistantSays muted>Which gift would you like?</AssistantSays>
              <div className="flex items-center justify-end gap-2">
                <div className="bg-primary text-primary-foreground flex max-w-[85%] items-center gap-3 rounded-2xl rounded-br-md p-2 pr-4">
                  <div className="size-12 shrink-0 overflow-hidden rounded-xl"><Img src={s.selected.image} alt="" className="size-full" sizes="48px" /></div>
                  <div className="min-w-0 text-[0.9375rem]">
                    <p className="truncate font-medium">{s.selected.title}</p>
                    <p className="opacity-80">{formatMoney(s.selected.price)}</p>
                  </div>
                </div>
                {stage.kind !== "done" && <Button variant="ghost" size="sm" onClick={() => update({ ...s, selected: undefined })}>Change</Button>}
              </div>
            </div>
          )}
          {later.map(row)}

          {note && (
            <Appear>
              <AssistantSays muted>{note}</AssistantSays>
            </Appear>
          )}

          {!editingInline && (
            <div key={key} ref={stageRef} tabIndex={-1} className="flex scroll-mt-28 flex-col gap-4 outline-none">
              <Appear className="flex flex-col gap-4">
                {stage.kind === "question" ? (
                  <>
                    <AssistantSays hint={questionCopy(s, stage.id).hint}>{questionCopy(s, stage.id).title}</AssistantSays>
                    <Panel><QuestionControls s={s} id={stage.id} update={update} /></Panel>
                  </>
                ) : stage.kind === "results" ? (
                  <GiftResults s={s} update={update} onNote={setNote} request={refineRequest} onRequestHandled={() => setRefineRequest(null)} />
                ) : stage.kind === "compose" ? (
                  <ComposeStep s={s} update={update} />
                ) : stage.kind === "letter-preview" ? (
                  <LetterPreview s={s} update={update} request={revisionRequest} onRequestHandled={() => setRevisionRequest(null)} />
                ) : stage.kind === "letter-delivery" ? (
                  <LetterDelivery s={s} update={update} />
                ) : stage.kind === "review" ? (
                  s.intent === "letter" ? <LetterReview s={s} update={update} /> : <GiftReview s={s} update={update} />
                ) : (
                  <LetterDone s={s} onGiftToo={giftToo} onStartOver={startOver} />
                )}
              </Appear>
            </div>
          )}
        </div>
      </Container>

      {showComposer && <Composer stage={stage} onSend={onComposer} />}
    </div>
  )
}

function Composer({ stage, onSend }: { stage: Stage; onSend: (text: string) => void }) {
  const [text, setText] = useState("")
  const placeholder =
    stage.kind === "results"
      ? "Ask for changes — e.g. “something cheaper” or “she also loves music”"
      : stage.kind === "letter-preview"
        ? "Ask for a change — e.g. “make it shorter”"
        : stage.kind === "question" && stage.id === "intent"
          ? "Or describe it — e.g. “a birthday gift for my sister under ₦50k”"
          : "Type your answer, or tell me more…"
  const submit = () => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText("")
  }
  return (
    <div className="sticky bottom-0 z-20 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ background: "linear-gradient(to top, var(--background) 65%, transparent)" }}>
      <Container className="max-w-3xl">
        <form className="bg-card flex items-end gap-2 rounded-2xl p-2 pl-4 shadow-[var(--shadow-float)]" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label htmlFor="send-composer" className="sr-only">Reply to the assistant</label>
          <textarea
            id="send-composer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
            rows={1}
            maxLength={1000}
            placeholder={placeholder}
            className="placeholder:text-muted-foreground max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none [field-sizing:content]"
          />
          <Button type="submit" size="icon-lg" disabled={!text.trim()} aria-label="Send reply">
            <ArrowUpIcon />
          </Button>
        </form>
      </Container>
    </div>
  )
}

import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import type { LetterRevision } from "@domain/index.ts"
import { addDays, LAUNCH_TIMEZONE, LETTER_MAX_CHARS, zonedTimeToUtc } from "@domain/index.ts"
import { errorMessage } from "@/api/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ArrowRightIcon, CheckIcon, UndoLeftIcon, RefreshIcon, PenIcon } from "@/components/icons"
import { useApiMutation } from "@/lib/api-hooks"
import { useSession } from "@/lib/session"
import { todayLagos } from "@/lib/format"
import { toLetterBrief, type SendState } from "@/lib/send-flow"
import { AssistantSays, Chip, ChipRow, Panel } from "./parts"

type Update = (next: SendState) => void

export const REVISIONS: { id: LetterRevision; label: string }[] = [
  { id: "shorter", label: "Make it shorter" },
  { id: "warmer", label: "Make it warmer" },
  { id: "like-me", label: "Make it sound more like me" },
]

/** Revision requests typed into the composer while the preview is showing. */
export function revisionCommand(text: string): LetterRevision | null {
  if (/\b(shorter|shorten|too long|trim|cut)\b/i.test(text)) return "shorter"
  if (/\b(warmer|warm|more loving|more affectionate|kinder|softer)\b/i.test(text)) return "warmer"
  if (/\b(like me|my (own )?words|my voice|less formal|more natural|sound like me)\b/i.test(text)) return "like-me"
  return null
}

/** The sender's own words, used for "sound more like me". */
const ownWords = (s: SendState) => (s.letter.method === "assistant" ? (s.letter.message !== "unsure" ? s.letter.message : undefined) : s.letter.draft)

/** Drafts or polishes the letter as soon as the answers are in. */
export function ComposeStep({ s, update }: { s: SendState; update: Update }) {
  const compose = useApiMutation(
    (api) => api.composeLetter(s.letter.method === "improve" ? { brief: toLetterBrief(s), mode: "improve", draft: s.letter.draft } : { brief: toLetterBrief(s), mode: "draft" }),
    { toastError: false, onSuccess: (r) => update({ ...s, letter: { ...s.letter, body: r.body, source: r.source, approved: false } }) },
  )
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    compose.mutate()
  }, [compose])

  if (compose.isError) {
    return (
      <>
        <AssistantSays muted>{errorMessage(compose.error)}</AssistantSays>
        <Panel className="flex-row flex-wrap gap-2">
          <Button variant="outline" onClick={() => compose.mutate()}><RefreshIcon data-icon="inline-start" />Try again</Button>
          <Button variant="ghost" onClick={() => update({ ...s, letter: { ...s.letter, method: "own", draft: s.letter.draft ?? "", body: undefined } })}><PenIcon data-icon="inline-start" />I'll write it myself</Button>
        </Panel>
      </>
    )
  }
  return (
    <AssistantSays muted>
      <span className="inline-flex items-center gap-2">
        <Spinner className="size-4" />
        {s.letter.method === "improve" ? "Polishing your draft…" : "Writing your letter from your answers…"}
      </span>
    </AssistantSays>
  )
}

/** Editable preview with one-tap revisions. Nothing is sent from here. */
export function LetterPreview({ s, update, request, onRequestHandled }: { s: SendState; update: Update; request: LetterRevision | null; onRequestHandled: () => void }) {
  const [history, setHistory] = useState<string[]>([])
  const body = s.letter.body ?? ""
  const revise = useApiMutation((api, revision: LetterRevision) => api.composeLetter({ brief: { ...toLetterBrief(s), message: ownWords(s) }, mode: "revise", draft: body, revision }), {
    onSuccess: (r) => {
      setHistory((h) => [...h.slice(-9), body])
      update({ ...s, letter: { ...s.letter, body: r.body, source: s.letter.source === "own" ? "own" : r.source, approved: false } })
    },
  })
  const rewrite = useApiMutation((api) => api.composeLetter({ brief: toLetterBrief(s), mode: "draft" }), {
    onSuccess: (r) => {
      setHistory((h) => [...h.slice(-9), body])
      update({ ...s, letter: { ...s.letter, body: r.body, source: r.source, approved: false } })
    },
  })
  useEffect(() => {
    if (!request) return
    revise.mutate(request)
    onRequestHandled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const busy = revise.isPending || rewrite.isPending
  const canSoundLikeMe = Boolean(ownWords(s)?.trim())
  const tooLong = body.length > LETTER_MAX_CHARS
  return (
    <>
      <AssistantSays hint={s.letter.source === "own" ? "Edit anything you like, or try a quick change below." : "Read it through and make it yours — edit anything directly, or try a quick change below."}>
        {s.letter.source === "own" ? "Here's your letter." : "Here's a draft."}
      </AssistantSays>
      <Panel>
        <div className={cn("paper-grain bg-card shadow-border relative rounded-3xl p-5 transition-opacity sm:p-7", busy && "opacity-60")}>
          <Label htmlFor="send-letter-body" className="sr-only">Your letter</Label>
          <Textarea
            id="send-letter-body"
            value={body}
            onChange={(e) => update({ ...s, letter: { ...s.letter, body: e.target.value, approved: false } })}
            disabled={busy}
            aria-invalid={tooLong || undefined}
            className="font-display min-h-64 resize-none border-0 bg-transparent p-0 text-lg leading-relaxed shadow-none [field-sizing:content] focus-visible:ring-0 dark:bg-transparent"
          />
          <p className={cn("tabular mt-3 text-right text-xs", tooLong ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {body.length.toLocaleString()}/{LETTER_MAX_CHARS.toLocaleString()}
          </p>
        </div>
        <ChipRow label="Quick changes">
          {REVISIONS.map((r) => (
            <Chip key={r.id} disabled={busy || (r.id === "like-me" && !canSoundLikeMe) || !body.trim()} onClick={() => revise.mutate(r.id)}>
              {revise.isPending && revise.variables === r.id ? <Spinner className="size-3.5" /> : null}
              {r.label}
            </Chip>
          ))}
          {s.letter.method === "assistant" && <Chip disabled={busy} icon={<RefreshIcon className="size-4" />} onClick={() => rewrite.mutate()}>Start a fresh draft</Chip>}
          {history.length > 0 && (
            <Chip disabled={busy} icon={<UndoLeftIcon className="size-4" />} onClick={() => { update({ ...s, letter: { ...s.letter, body: history.at(-1)!, approved: false } }); setHistory((h) => h.slice(0, -1)) }}>
              Undo
            </Chip>
          )}
        </ChipRow>
        <Button size="lg" className="w-fit" disabled={busy || !body.trim() || tooLong} onClick={() => update({ ...s, letter: { ...s.letter, body: body.trim(), approved: true } })}>
          <CheckIcon data-icon="inline-start" />
          Use this letter
        </Button>
      </Panel>
    </>
  )
}

/** Letter-only: the details the email delivery needs, and when to send. */
export function LetterDelivery({ s, update }: { s: SendState; update: Update }) {
  const { user } = useSession()
  const today = todayLagos()
  const [name, setName] = useState(s.recipient.name ?? "")
  const [email, setEmail] = useState(s.delivery.email ?? "")
  const [from, setFrom] = useState(s.delivery.senderName ?? s.letter.signature ?? user?.name.split(" ")[0] ?? "")
  const [when, setWhen] = useState<"now" | "scheduled">(s.delivery.when ?? "now")
  const [date, setDate] = useState(s.delivery.date ?? addDays(today, 1))
  const [time, setTime] = useState(s.delivery.time ?? "09:00")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = "Add their name"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = "Enter a valid email address"
    if (!from.trim()) e.from = "Add your name as they'll see it"
    if (when === "scheduled") {
      const at = date && time ? zonedTimeToUtc(date, Number(time.split(":")[0]), Number(time.split(":")[1]), LAUNCH_TIMEZONE) : null
      if (!at || at.getTime() < Date.now() + 5 * 60_000) e.when = "Choose a time at least 5 minutes from now"
    }
    setErrors(e)
    if (Object.keys(e).length) return
    update({ ...s, recipient: { ...s.recipient, name: name.trim() }, delivery: { email: email.trim().toLowerCase(), senderName: from.trim(), when, date: when === "scheduled" ? date : undefined, time: when === "scheduled" ? time : undefined } })
  }

  return (
    <>
      <AssistantSays hint="Letters are delivered by email with a private link. No address or phone number needed.">Where should I send it?</AssistantSays>
      <Panel>
        <form className="bg-card shadow-border flex flex-col gap-4 rounded-2xl p-5" noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ld-name" label="Their name" error={errors.name}>
              <Input id="ld-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" aria-invalid={Boolean(errors.name) || undefined} className="h-11" />
            </Field>
            <Field id="ld-email" label="Their email" error={errors.email}>
              <Input id="ld-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="name@example.com" aria-invalid={Boolean(errors.email) || undefined} className="h-11" />
            </Field>
          </div>
          <Field id="ld-from" label="From" hint="Shown in the email: “… wrote you a letter”." error={errors.from}>
            <Input id="ld-from" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={60} aria-invalid={Boolean(errors.from) || undefined} className="h-11 sm:max-w-xs" />
          </Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">When</legend>
            <RadioGroup value={when} onValueChange={(v) => setWhen(v as "now" | "scheduled")} className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2"><RadioGroupItem value="now" id="ld-now" /><Label htmlFor="ld-now" className="font-normal">Send now</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="scheduled" id="ld-later" /><Label htmlFor="ld-later" className="font-normal">Schedule for later</Label></div>
            </RadioGroup>
            {when === "scheduled" && (
              <div className="flex flex-wrap gap-3">
                <Field id="ld-date" label="Date" className="w-44">
                  <Input id="ld-date" type="date" min={today} max={addDays(today, 90)} value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
                </Field>
                <Field id="ld-time" label="Time (Lagos)" className="w-36">
                  <Input id="ld-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" />
                </Field>
              </div>
            )}
            {errors.when && <p className="text-destructive text-sm" role="alert">{errors.when}</p>}
          </fieldset>
          <Button type="submit" size="lg" className="w-fit">
            Review
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </form>
      </Panel>
    </>
  )
}

function Field({ id, label, hint, error, className, children }: { id: string; label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-destructive text-xs" role="alert">{error}</p>}
    </div>
  )
}

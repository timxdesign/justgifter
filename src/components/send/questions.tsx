import { useState, type ReactNode } from "react"
import type { InterestId, Relationship } from "@domain/index.ts"
import { addDays, AVOID_OPTIONS, interestName, INTERESTS, LETTER_TONES, occasionById, OCCASIONS, RELATIONSHIPS, zoneById, ZONES } from "@domain/index.ts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { GiftIcon, LetterIcon, HeartsIcon, ArrowRightIcon, MagicWandIcon, PenIcon, DocumentTextIcon } from "@/components/icons"
import { formatMoney, formatDate, todayLagos } from "@/lib/format"
import { useSession } from "@/lib/session"
import { answer, recipientLabel, toneName, type QuestionId, type SendIntent, type SendState } from "@/lib/send-flow"
import { Chip, ChipRow, OptionCard } from "./parts"

type Update = (next: SendState) => void

export const INTENT_OPTIONS: { id: SendIntent; title: string; description: string; icon: ReactNode }[] = [
  { id: "gift", title: "A gift", description: "Get help choosing something they'll love.", icon: <GiftIcon /> },
  { id: "letter", title: "A digital letter", description: "A letter with photos, places and your song. Free.", icon: <LetterIcon /> },
  { id: "both", title: "A gift with a letter", description: "Make your gift more personal.", icon: <HeartsIcon /> },
]

const BUDGETS = [1_500_000, 2_500_000, 5_000_000, 10_000_000, 20_000_000]

/** What the assistant asks, worded for what it already knows. */
export function questionCopy(s: SendState, id: QuestionId): { title: string; hint?: string } {
  const who = recipientLabel(s)
  const letterOnly = s.intent === "letter"
  switch (id) {
    case "intent":
      return { title: "What would you like to send?", hint: "Pick one, or just tell me what you have in mind." }
    case "recipient":
      return letterOnly ? { title: "Who's the letter for?", hint: "Their name and how you know them." } : { title: "Who's the gift for?", hint: "Their name is optional for now." }
    case "occasion":
      return letterOnly ? { title: "What's the letter for?", hint: "An occasion, or simply why you're writing." } : { title: "What's the occasion?" }
    case "budget":
      return { title: "What would you like to spend?" }
    case "budget-delivery":
      return { title: `Should ${typeof s.gift.budgetMax === "number" ? formatMoney(s.gift.budgetMax) : "that"} cover delivery too?`, hint: "Delivery is priced by area and always shown before you pay." }
    case "interests":
      return { title: `What does ${who} enjoy?`, hint: "Pick any that fit, or describe them in your own words." }
    case "avoid":
      return { title: "Anything to leave out?", hint: "We filter using each vendor's description. For allergies, please check ingredients with the vendor too." }
    case "zone":
      return { title: "Where should it be delivered?", hint: "Just the area for now, so we only suggest what can reach them. The full address comes at checkout — or they can add it themselves." }
    case "timing":
      return { title: "When should it arrive?" }
    case "add-letter":
      return { title: `Would you like to add a letter for ${who}?`, hint: "It's revealed with the gift. Completely optional." }
    case "letter-name":
      return { title: `What should the letter call ${who}?`, hint: "Their name or what you call them — it's used in the greeting." }
    case "letter-method":
      return { title: "How would you like to write it?" }
    case "letter-message":
      return { title: `What do you want ${who} to know or feel?`, hint: "A sentence or two in your own words is perfect. I'll only use what you tell me." }
    case "letter-tone":
      return { title: "What tone feels right?" }
    case "letter-details":
      return { title: "Anything personal to include?", hint: "A shared memory, a nickname, something only you'd say. Nothing personal is added unless you write it here." }
    case "letter-signature":
      return { title: "How would you like to sign it?" }
    case "letter-own":
      return { title: "Write your letter", hint: "You'll see a preview before anything is sent." }
    case "letter-improve":
      return { title: "Paste your draft", hint: "I'll tidy the wording and keep your meaning and voice." }
  }
}

/** The sender's answer as it appears in the conversation. */
export function answerSummary(s: SendState, id: QuestionId): string {
  const g = s.gift
  switch (id) {
    case "intent":
      return INTENT_OPTIONS.find((o) => o.id === s.intent)?.title ?? ""
    case "recipient": {
      const rel = s.recipient.relationship
      const relName = rel === "unsure" ? null : rel ? RELATIONSHIPS.find((r) => r.id === rel)?.name : null
      const parts = [s.recipient.word ? `My ${s.recipient.word}` : relName && rel !== "other" ? `My ${relName.toLowerCase()}` : relName, s.recipient.name].filter(Boolean)
      return parts.join(" · ") || "I'd rather not say"
    }
    case "occasion":
      return s.occasion && s.occasion !== "unsure" ? occasionById(s.occasion)!.name : s.purpose ? s.purpose : "I'm not sure"
    case "budget":
      return typeof g.budgetMax === "number" ? `Up to ${formatMoney(g.budgetMax)}` : "No fixed budget"
    case "budget-delivery":
      return g.budgetIncludesDelivery ? "Yes, including delivery" : "Just the gift — delivery on top"
    case "interests": {
      const list = [...g.interests.map(interestName), ...(g.interestNote ? [`“${g.interestNote}”`] : [])]
      return list.length ? list.join(", ") : "I'm not sure"
    }
    case "avoid":
      return g.avoid?.length ? `No ${g.avoid.map((a) => AVOID_OPTIONS.find((o) => o.id === a)?.name.toLowerCase() ?? a).join(", ")}` : "Nothing to leave out"
    case "zone":
      return g.zoneId && g.zoneId !== "unsure" ? zoneById(g.zoneId)!.name : "Not sure yet"
    case "timing":
      return g.deliverBy && g.deliverBy !== "any" ? (g.deliverBy === todayLagos() ? "Today" : `By ${formatDate(g.deliverBy)}`) : "No rush"
    case "add-letter":
      return s.letterWanted === false ? "No thanks" : "Yes, add a letter"
    case "letter-name":
      return s.recipient.name ?? "Skip the name"
    case "letter-method":
      return s.letter.method === "own" ? "I'll write it myself" : s.letter.method === "improve" ? "Improve my draft" : "Help me write it"
    case "letter-message":
      return s.letter.message === "unsure" ? "I'm not sure — keep it simple" : clip(s.letter.message ?? "", 160)
    case "letter-tone":
      return s.letter.tone ? toneName(s.letter.tone) : ""
    case "letter-details":
      return s.letter.details === "skip" ? "Nothing to add" : clip(s.letter.details ?? "", 160)
    case "letter-signature":
      return s.letter.signature ?? ""
    case "letter-own":
    case "letter-improve":
      return clip(s.letter.draft ?? "", 160)
  }
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/** Controls for one question. Every question also accepts free text from the composer. */
export function QuestionControls({ s, id, update }: { s: SendState; id: QuestionId; update: Update }) {
  const set = (patch: (d: SendState) => void) => update(answer(s, id, patch))
  switch (id) {
    case "intent":
      return (
        <div className="grid gap-2.5">
          {INTENT_OPTIONS.map((o) => (
            <OptionCard key={o.id} title={o.title} description={o.description} icon={o.icon} selected={s.intent === o.id} onClick={() => set((d) => void (d.intent = o.id))} />
          ))}
        </div>
      )
    case "recipient":
      return <RecipientControl s={s} set={set} />
    case "occasion":
      return (
        <ChipRow label="Occasion">
          {OCCASIONS.map((o) => (
            <Chip key={o.id} selected={s.occasion === o.id} onClick={() => set((d) => void (d.occasion = o.id))}>
              {o.name}
            </Chip>
          ))}
          <Chip selected={s.occasion === "unsure"} onClick={() => set((d) => void (d.occasion = "unsure"))}>
            I'm not sure
          </Chip>
        </ChipRow>
      )
    case "budget":
      return <BudgetControl s={s} set={set} />
    case "budget-delivery":
      return (
        <ChipRow label="Does the budget include delivery?">
          <Chip selected={s.gift.budgetIncludesDelivery === true} onClick={() => set((d) => void (d.gift.budgetIncludesDelivery = true))}>Yes, including delivery</Chip>
          <Chip selected={s.gift.budgetIncludesDelivery === false} onClick={() => set((d) => void (d.gift.budgetIncludesDelivery = false))}>No, just the gift</Chip>
        </ChipRow>
      )
    case "interests":
      return <InterestsControl s={s} set={set} />
    case "avoid":
      return <AvoidControl s={s} set={set} />
    case "zone":
      return (
        <ChipRow label="Delivery area">
          {ZONES.map((z) => (
            <Chip key={z.id} selected={s.gift.zoneId === z.id} onClick={() => set((d) => void (d.gift.zoneId = z.id))}>
              {z.name}
            </Chip>
          ))}
          <Chip selected={s.gift.zoneId === "unsure"} onClick={() => set((d) => void (d.gift.zoneId = "unsure"))}>Not sure yet</Chip>
        </ChipRow>
      )
    case "timing":
      return <TimingControl s={s} set={set} />
    case "add-letter":
      return (
        <ChipRow label="Add a letter?">
          <Chip icon={<LetterIcon className="size-4" />} onClick={() => set((d) => void (d.intent = "both"))}>Yes, add a letter</Chip>
          <Chip selected={s.letterWanted === false} onClick={() => set((d) => void (d.letterWanted = false))}>No thanks</Chip>
        </ChipRow>
      )
    case "letter-method":
      return (
        <div className="grid gap-2.5">
          <OptionCard title="Help me write it" description="Answer a few short questions and I'll draft it." icon={<MagicWandIcon />} selected={s.letter.method === "assistant"} onClick={() => set((d) => void (d.letter.method = "assistant"))} />
          <OptionCard title="I'll write it myself" description="Type or paste it, then preview." icon={<PenIcon />} selected={s.letter.method === "own"} onClick={() => set((d) => void (d.letter.method = "own"))} />
          <OptionCard title="Improve my draft" description="I'll polish the wording and keep your voice." icon={<DocumentTextIcon />} selected={s.letter.method === "improve"} onClick={() => set((d) => void (d.letter.method = "improve"))} />
        </div>
      )
    case "letter-name":
      return <NameControl s={s} set={set} />
    case "letter-message":
      return (
        <TextAnswer
          key={id}
          label="What you want them to know or feel"
          initial={s.letter.message === "unsure" ? "" : (s.letter.message ?? "")}
          placeholder={`e.g. How proud I am of ${s.recipient.name?.split(" ")[0] ?? "them"} and that I'm always in their corner`}
          rows={3}
          max={1200}
          onSubmit={(v) => set((d) => void (d.letter.message = v))}
          secondary={{ label: "I'm not sure", onClick: () => set((d) => void (d.letter.message = "unsure")) }}
        />
      )
    case "letter-tone":
      return (
        <ChipRow label="Tone">
          {LETTER_TONES.map((t) => (
            <Chip key={t.id} selected={s.letter.tone === t.id} onClick={() => set((d) => void (d.letter.tone = t.id))}>
              {t.name}
            </Chip>
          ))}
        </ChipRow>
      )
    case "letter-details":
      return (
        <TextAnswer
          key={id}
          label="Personal details (optional)"
          initial={s.letter.details === "skip" ? "" : (s.letter.details ?? "")}
          placeholder="e.g. I still laugh about our road trip to Calabar"
          rows={2}
          max={500}
          onSubmit={(v) => set((d) => void (d.letter.details = v))}
          secondary={{ label: "Skip", onClick: () => set((d) => void (d.letter.details = "skip")) }}
        />
      )
    case "letter-signature":
      return <SignatureControl s={s} set={set} />
    case "letter-own":
    case "letter-improve":
      return (
        <TextAnswer
          key={id}
          label={id === "letter-own" ? "Your letter" : "Your draft"}
          initial={s.letter.draft ?? ""}
          placeholder={id === "letter-own" ? `Dear ${s.recipient.name?.split(" ")[0] ?? "…"},` : "Paste or type your draft here"}
          rows={8}
          max={2000}
          submitLabel={id === "letter-own" ? "Preview letter" : "Improve it"}
          onSubmit={(v) => set((d) => void (d.letter.draft = v))}
        />
      )
  }
}

type Setter = (patch: (d: SendState) => void) => void

function RecipientControl({ s, set }: { s: SendState; set: Setter }) {
  const [name, setName] = useState(s.recipient.name ?? "")
  const [rel, setRel] = useState<Relationship | "unsure" | undefined>(s.recipient.relationship)
  const letterOnly = s.intent === "letter"
  const canContinue = Boolean(rel) || (letterOnly && name.trim().length > 0)
  const submit = () =>
    set((d) => {
      d.recipient.name = name.trim() || undefined
      d.recipient.relationship = rel ?? (letterOnly ? "other" : "unsure")
    })
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (canContinue) submit() }}>
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor="send-recipient-name">Their name{letterOnly ? "" : " (optional)"}</Label>
        <Input id="send-recipient-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" placeholder="e.g. Ada" className="h-11 bg-card" />
      </div>
      <ChipRow label="They're my…">
        {RELATIONSHIPS.map((r) => (
          <Chip key={r.id} selected={rel === r.id} onClick={() => setRel(rel === r.id ? undefined : r.id)}>
            {r.name}
          </Chip>
        ))}
        <Chip selected={rel === "unsure"} onClick={() => setRel(rel === "unsure" ? undefined : "unsure")}>I'd rather not say</Chip>
      </ChipRow>
      <Button type="submit" size="lg" className="w-fit" disabled={!canContinue}>
        Continue
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </form>
  )
}

function BudgetControl({ s, set }: { s: SendState; set: Setter }) {
  const [includes, setIncludes] = useState(s.gift.budgetIncludesDelivery ?? true)
  const [custom, setCustom] = useState("")
  const choose = (amount: number | "unsure") =>
    set((d) => {
      d.gift.budgetMax = amount
      d.gift.budgetIncludesDelivery = amount === "unsure" ? undefined : includes
    })
  const customKobo = Math.round(Number(custom.replace(/[^\d.]/g, "")) * 100)
  return (
    <div className="flex flex-col gap-4">
      <ChipRow label="Budget">
        {BUDGETS.map((b) => (
          <Chip key={b} selected={s.gift.budgetMax === b} onClick={() => choose(b)}>
            Up to {formatMoney(b)}
          </Chip>
        ))}
        <Chip selected={s.gift.budgetMax === "unsure"} onClick={() => choose("unsure")}>No fixed budget</Chip>
      </ChipRow>
      <form className="flex max-w-sm items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (customKobo >= 100_000) choose(customKobo) }}>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="send-budget">Or enter an amount (₦)</Label>
          <Input id="send-budget" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 35,000" className="h-11 bg-card" />
        </div>
        <Button type="submit" size="lg" variant="outline" disabled={customKobo < 100_000}>Use</Button>
      </form>
      <div className="flex items-center gap-2.5">
        <Checkbox id="send-budget-delivery" checked={includes} onCheckedChange={(v) => setIncludes(v === true)} />
        <Label htmlFor="send-budget-delivery" className="font-normal">This includes delivery</Label>
      </div>
    </div>
  )
}

function InterestsControl({ s, set }: { s: SendState; set: Setter }) {
  const [picked, setPicked] = useState<InterestId[]>(s.gift.interests)
  const toggle = (id: InterestId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  return (
    <div className="flex flex-col gap-4">
      <ChipRow label="Interests">
        {INTERESTS.map((i) => (
          <Chip key={i.id} multi selected={picked.includes(i.id)} onClick={() => toggle(i.id)}>
            {i.name}
          </Chip>
        ))}
      </ChipRow>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={!picked.length} onClick={() => set((d) => { d.gift.interests = picked; d.gift.interestsDone = true })}>
          Continue
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        <Button size="lg" variant="ghost" onClick={() => set((d) => { d.gift.interests = []; d.gift.interestNote = undefined; d.gift.interestsDone = true })}>
          I'm not sure
        </Button>
      </div>
    </div>
  )
}

function AvoidControl({ s, set }: { s: SendState; set: Setter }) {
  const [picked, setPicked] = useState<string[]>(s.gift.avoid ?? [])
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  return (
    <div className="flex flex-col gap-4">
      <ChipRow label="Leave out">
        {AVOID_OPTIONS.map((o) => (
          <Chip key={o.id} multi selected={picked.includes(o.id)} onClick={() => toggle(o.id)}>
            {o.name}
          </Chip>
        ))}
      </ChipRow>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={!picked.length} onClick={() => set((d) => void (d.gift.avoid = picked))}>
          Continue
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        <Button size="lg" variant="ghost" onClick={() => set((d) => void (d.gift.avoid = []))}>Nothing to leave out</Button>
      </div>
    </div>
  )
}

function TimingControl({ s, set }: { s: SendState; set: Setter }) {
  const today = todayLagos()
  const [date, setDate] = useState(s.gift.deliverBy && s.gift.deliverBy !== "any" ? s.gift.deliverBy : "")
  const options = [
    { label: "Today", value: today },
    { label: "By tomorrow", value: addDays(today, 1) },
    { label: "Within 3 days", value: addDays(today, 3) },
    { label: "Within a week", value: addDays(today, 7) },
  ]
  return (
    <div className="flex flex-col gap-4">
      <ChipRow label="Arrival">
        {options.map((o) => (
          <Chip key={o.label} selected={s.gift.deliverBy === o.value} onClick={() => set((d) => void (d.gift.deliverBy = o.value))}>
            {o.label}
          </Chip>
        ))}
        <Chip selected={s.gift.deliverBy === "any"} onClick={() => set((d) => void (d.gift.deliverBy = "any"))}>No rush</Chip>
      </ChipRow>
      <form className="flex max-w-sm items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (date >= today) set((d) => void (d.gift.deliverBy = date)) }}>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="send-by">Or arrive by a specific date</Label>
          <Input id="send-by" type="date" min={today} max={addDays(today, 90)} value={date} onChange={(e) => setDate(e.target.value)} className="h-11 bg-card" />
        </div>
        <Button type="submit" size="lg" variant="outline" disabled={!date || date < today}>Use</Button>
      </form>
    </div>
  )
}

function NameControl({ s, set }: { s: SendState; set: Setter }) {
  const [value, setValue] = useState(s.recipient.name ?? "")
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) set((d) => { d.recipient.name = value.trim(); d.recipient.nameSkipped = undefined }) }}>
      <div className="flex w-full max-w-xs flex-col gap-1.5">
        <Label htmlFor="send-letter-name">Name in the greeting</Label>
        <Input id="send-letter-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} autoComplete="off" placeholder="e.g. Ada, or Sis" className="h-11 bg-card" />
      </div>
      <Button type="submit" size="lg" disabled={!value.trim()}>Continue</Button>
      <Button type="button" size="lg" variant="ghost" onClick={() => set((d) => void (d.recipient.nameSkipped = true))}>Skip</Button>
    </form>
  )
}

function SignatureControl({ s, set }: { s: SendState; set: Setter }) {
  const { user } = useSession()
  const first = user?.name.split(" ")[0]
  const [value, setValue] = useState(s.letter.signature ?? first ?? "")
  const suggestions = [...new Set([first, user?.name].filter((x): x is string => Boolean(x)))]
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (value.trim()) set((d) => void (d.letter.signature = value.trim())) }}>
      {suggestions.length > 0 && (
        <ChipRow label="Suggestions">
          {suggestions.map((n) => (
            <Chip key={n} selected={value === n} onClick={() => setValue(n)}>{n}</Chip>
          ))}
        </ChipRow>
      )}
      <div className="flex max-w-sm items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="send-signature">Sign as</Label>
          <Input id="send-signature" value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} placeholder="e.g. Tolu, or your nickname" className="h-11 bg-card" />
        </div>
        <Button type="submit" size="lg" disabled={!value.trim()}>Continue</Button>
      </div>
    </form>
  )
}

function TextAnswer({ label, initial, placeholder, rows, max, onSubmit, submitLabel = "Continue", secondary }: { label: string; initial: string; placeholder: string; rows: number; max: number; onSubmit: (v: string) => void; submitLabel?: string; secondary?: { label: string; onClick: () => void } }) {
  const [value, setValue] = useState(initial)
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}>
      <Textarea aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} rows={rows} maxLength={max} placeholder={placeholder} className="bg-card min-h-0 text-base" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && value.trim()) { e.preventDefault(); onSubmit(value.trim()) } }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={!value.trim()}>
          {submitLabel}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        {secondary && <Button type="button" size="lg" variant="ghost" onClick={secondary.onClick}>{secondary.label}</Button>}
        {value.length > max * 0.8 && <span className="text-muted-foreground tabular ml-auto text-xs">{value.length.toLocaleString()}/{max.toLocaleString()}</span>}
      </div>
    </form>
  )
}

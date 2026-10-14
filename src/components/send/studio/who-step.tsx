import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "cn"
import { OCCASIONS, RELATIONSHIPS } from "@domain/index.ts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CheckIcon, GiftIcon, HeartsIcon, LetterIcon, StarsIcon } from "@/components/icons"
import { FieldError, SectionTitle, type FieldProblem } from "@/components/studio/studio-layout"
import { acknowledgement, answer, interpret, switchIntent, type SendIntent, type SendState } from "@/lib/send-flow"
import { Chip, ChipRow } from "../parts"

type Update = (next: SendState) => void

const INTENTS: { id: SendIntent; title: string; description: string; icon: typeof GiftIcon }[] = [
  { id: "gift", title: "A gift", description: "We'll help you choose something they'll love.", icon: GiftIcon },
  { id: "both", title: "A gift with a letter", description: "Your letter opens on a table of flowers, with the gift.", icon: HeartsIcon },
  { id: "letter", title: "Just a letter", description: "Photos, places, your song. Free.", icon: LetterIcon },
]

/** Step 1: what they're sending, and who it's for. Free text fills in as much as it can. */
export function WhoStep({ s, update, problems, onLetterOnly }: { s: SendState; update: Update; problems: FieldProblem[]; onLetterOnly: () => void }) {
  const [text, setText] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const fill = () => {
    const t = text.trim()
    if (!t) return
    const r = interpret(s, t, null)
    if (r.next.intent === "letter") return onLetterOnly()
    update(r.next)
    setNote(acknowledgement(r.understood) ?? "We couldn't pick out any details there. Choose below instead.")
    setText("")
  }
  return (
    <div className="flex flex-col gap-10">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3">
          <SectionTitle>What are you sending?</SectionTitle>
        </legend>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="What you're sending">
          {INTENTS.map((o) => {
            const on = s.intent === o.id
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => (o.id === "letter" ? onLetterOnly() : update({ ...switchIntent(s, o.id), letterWanted: o.id === "both" ? true : s.letterWanted }))}
                className={cn("relative flex flex-col gap-2 rounded-2xl p-4 text-left ring-1 transition-[box-shadow,background-color,transform] active:scale-[0.98]", on ? "ring-brand bg-brand-soft/60 ring-2" : "bg-card ring-border hover:ring-foreground/25")}
              >
                <span className={cn("grid size-10 place-items-center rounded-full", on ? "bg-brand text-brand-foreground" : "bg-muted")}>
                  <o.icon className="size-5" />
                </span>
                <span className="font-medium">{o.title}</span>
                <span className="text-muted-foreground text-sm leading-snug">{o.description}</span>
                {on && (
                  <span className="bg-brand text-brand-foreground absolute top-3 right-3 grid size-6 place-items-center rounded-full">
                    <CheckIcon className="size-3.5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <FieldError problems={problems} field="intent" />
      </fieldset>

      <section className="from-brand-soft border-brand/20 flex flex-col gap-3 rounded-3xl border bg-gradient-to-br to-transparent p-4 sm:p-5" aria-labelledby="ss-describe">
        <div className="flex items-start gap-3">
          <span className="bg-brand text-brand-foreground grid size-10 shrink-0 place-items-center rounded-full">
            <StarsIcon className="size-5" />
          </span>
          <div>
            <h2 id="ss-describe" className="font-semibold">Tell us in your own words</h2>
            <p className="text-muted-foreground text-sm">We'll fill in what we can: who, the occasion, budget, area and date. You can change anything.</p>
          </div>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); fill() }}>
          <Label htmlFor="ss-describe-text" className="sr-only">Describe the gift</Label>
          <Textarea id="ss-describe-text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fill() } }} rows={2} maxLength={1000} placeholder="e.g. a birthday gift for my sister Ada in Lekki, under ₦50k, by Friday" className="bg-card min-h-12 flex-1 resize-none text-base [field-sizing:content]" />
          <Button type="submit" size="lg" className="h-12" disabled={!text.trim()}>
            Fill it in
          </Button>
        </form>
        <AnimatePresence>
          {note && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-brand-text text-sm font-medium" role="status">
              {note}
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="ss-who">
        <div id="ss-who">
          <SectionTitle hint="All optional. Their name goes on the gift box they open.">Who's it for?</SectionTitle>
        </div>
        <div className="flex max-w-sm flex-col gap-2">
          <Label htmlFor="ss-name" className="eyebrow text-foreground">Their name</Label>
          <Input id="ss-name" value={s.recipient.name ?? ""} onChange={(e) => update(answer(s, "recipient", (d) => void (d.recipient.name = e.target.value.slice(0, 80) || undefined)))} autoComplete="off" placeholder="e.g. Ada" className="h-12 text-base" />
        </div>
        <ChipRow label="They're my…">
          {RELATIONSHIPS.map((r) => (
            <Chip key={r.id} selected={s.recipient.relationship === r.id} onClick={() => update(answer(s, "recipient", (d) => void (d.recipient.relationship = d.recipient.relationship === r.id ? undefined : r.id)))}>
              {r.name}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex flex-col gap-2">
          <span className="eyebrow" id="ss-occasion">Occasion</span>
          <ChipRow label="Occasion">
            {OCCASIONS.map((o) => (
              <Chip key={o.id} selected={s.occasion === o.id} onClick={() => update(answer(s, "occasion", (d) => void (d.occasion = d.occasion === o.id ? undefined : o.id)))}>
                {o.name}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </section>
    </div>
  )
}

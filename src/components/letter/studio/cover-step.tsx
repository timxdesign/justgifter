import type { ReactNode } from "react"
import { FieldError, SectionTitle } from "@/components/studio/studio-layout"
import { motion } from "motion/react"
import { cn } from "cn"
import { LETTER_FLOWERS, LETTER_SIGNATURE_MAX, LETTER_THEMES, OCCASIONS, type LetterDesign, type OccasionId } from "@domain/index.ts"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CheckIcon, MoonIcon, SunIcon } from "@/components/icons"
import { celebrationAllowed, defaultDesignFor, type StudioDraft, type StudioProblem } from "@/lib/letter-studio"
import { Flower } from "../art"
import { ThemeSwatch } from "./preview"

type Update = (patch: Partial<StudioDraft>) => void

export { FieldError, SectionTitle, StepHeading } from "@/components/studio/studio-layout"

const Eyebrow = ({ children, required, htmlFor }: { children: ReactNode; required?: boolean; htmlFor?: string }) => (
  <Label htmlFor={htmlFor} className="eyebrow text-foreground">
    {children}
    {required && <span className="text-brand-text" aria-hidden="true">*</span>}
  </Label>
)

/** Step 1: who it's for, who it's from, and how the table looks. */
export function CoverStep({ d, update, problems }: { d: StudioDraft; update: Update; problems: StudioProblem[] }) {
  const err = (f: string) => problems.some((p) => p.field === f)
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Eyebrow htmlFor="ls-name" required>Their name</Eyebrow>
          <Input id="ls-name" value={d.recipientName} onChange={(e) => update({ recipientName: e.target.value })} maxLength={80} autoComplete="off" placeholder="e.g. Ada" aria-invalid={err("recipientName") || undefined} aria-describedby={err("recipientName") ? "err-recipientName" : undefined} className="h-12 text-base" />
          <FieldError problems={problems} field="recipientName" />
        </div>
        <div className="flex flex-col gap-2">
          <Eyebrow htmlFor="ls-sign" required>Sign it as</Eyebrow>
          <Input id="ls-sign" value={d.signature} onChange={(e) => update({ signature: e.target.value })} maxLength={LETTER_SIGNATURE_MAX} autoComplete="off" placeholder="e.g. Tolu, or Your Tolu" aria-invalid={err("signature") || undefined} aria-describedby={err("signature") ? "err-signature" : undefined} className="h-12 text-base" />
          <FieldError problems={problems} field="signature" />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="eyebrow mb-3">
          Occasion <span className="text-muted-foreground font-normal tracking-normal normal-case">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((o) => {
            const on = d.occasion === o.id
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const occasion: OccasionId | undefined = on ? undefined : o.id
                  // Picking an occasion before touching the design suggests a fitting look.
                  const untouched = JSON.stringify(d.design) === JSON.stringify(defaultDesignFor(d.occasion))
                  const theme = !celebrationAllowed(occasion) && d.design.theme === "celebration" ? "table" : d.design.theme
                  update({ occasion, design: untouched ? defaultDesignFor(occasion) : { ...d.design, theme } })
                }}
                className={cn("min-h-10 rounded-full border px-4 py-2 text-sm transition-colors", on ? "border-brand bg-brand-soft text-brand-text font-medium" : "hover:border-foreground/30")}
              >
                {o.name}
              </button>
            )
          })}
        </div>
      </fieldset>

      <section className="flex flex-col gap-6" aria-labelledby="ls-table">
        <div id="ls-table">
          <SectionTitle hint="The cover and every moment follow the look you choose. You can change it any time; your words stay put.">Your table</SectionTitle>
        </div>
        <DesignPicker design={d.design} onChange={(design) => update({ design })} occasion={d.occasion} />
      </section>
    </div>
  )
}

/** Theme, flowers, light and details: the look of a letter, on its own or with a gift. */
export function DesignPicker({ design, onChange, occasion }: { design: LetterDesign; onChange: (d: LetterDesign) => void; occasion?: OccasionId }) {
  const set = (patch: Partial<LetterDesign>) => onChange({ ...design, ...patch })
  return (
    <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="eyebrow mb-3">How it opens</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {LETTER_THEMES.map((t) => {
              const on = design.theme === t.id
              const blocked = t.id === "celebration" && !celebrationAllowed(occasion)
              return (
                <button key={t.id} type="button" aria-pressed={on} disabled={blocked} onClick={() => set({ theme: t.id })} className={cn("group relative flex flex-col gap-2 rounded-2xl p-2 pb-3 text-left transition-[box-shadow,transform] active:scale-[0.98] disabled:opacity-45", on ? "ring-brand bg-brand-soft/60 ring-2" : "ring-border hover:ring-foreground/25 bg-card ring-1")}>
                  <ThemeSwatch theme={t.id} design={design} className="aspect-[16/10] w-full" />
                  <span className="px-1 font-medium">{t.name}</span>
                  <span className="text-muted-foreground px-1 text-xs leading-snug">{blocked ? "Not for this occasion" : t.description}</span>
                  {on && <Tick />}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="eyebrow mb-3">Flowers</legend>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {LETTER_FLOWERS.map((f) => {
              const on = design.flowers === f.id
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => set({ flowers: f.id })} className={cn("relative flex flex-col items-center gap-1.5 rounded-2xl px-2 pt-3 pb-2.5 transition-[box-shadow,transform] active:scale-95", on ? "ring-brand bg-brand-soft/60 ring-2" : "bg-card ring-border hover:ring-foreground/25 ring-1")}>
                  <motion.span animate={on ? { rotate: [0, -8, 6, 0], scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }} transition={{ duration: 0.5 }} className="block">
                    <Flower kind={f.id} className="size-14 drop-shadow-[0_4px_6px_rgb(60_20_20/0.2)] sm:size-16" />
                  </motion.span>
                  <span className="text-sm font-medium">{f.name}</span>
                  {on && <Tick />}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="eyebrow mb-3">Light</legend>
          <div className="bg-muted/60 grid grid-cols-2 gap-1.5 rounded-2xl p-1.5" role="radiogroup" aria-label="Light">
            {([
              ["day", "Day", "Soft daylight", SunIcon],
              ["night", "Night", "By candlelight", MoonIcon],
            ] as const).map(([id, name, hint, Icon]) => {
              const on = design.light === id
              return (
                <button key={id} type="button" role="radio" aria-checked={on} onClick={() => set({ light: id })} className={cn("flex items-center gap-3 rounded-xl p-2 text-left transition-colors", on ? "bg-card ring-brand shadow-sm ring-1" : "hover:bg-card/60")}>
                  <ThemeSwatch theme={design.theme} design={{ ...design, light: id }} className="size-12 shrink-0 rounded-lg" />
                  <span className="flex flex-col">
                    <span className={cn("flex items-center gap-1.5 font-medium", on && "text-brand-text")}>
                      <Icon className="size-4" />
                      {name}
                    </span>
                    <span className="text-muted-foreground text-sm">{hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow mb-3">Details</legend>
          {([
            ["petals", design.theme === "celebration" ? "Confetti in the air" : "Petals in the breeze", design.theme === "celebration" ? "Confetti drifts down while they read." : "Petals drift across the table while they read."],
            ["butterflies", "Butterflies", "A pair of butterflies flutter across the scene."],
            ["gold", "Gold details", "Gold filigree on the corners of the letter."],
          ] as const).map(([key, title, hint]) => (
            <label key={key} className="bg-card ring-border flex cursor-pointer items-center gap-4 rounded-2xl px-4 py-3.5 ring-1">
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-muted-foreground text-sm">{hint}</span>
              </span>
              <Switch checked={design[key]} onCheckedChange={(v) => set({ [key]: v })} aria-label={title} />
            </label>
          ))}
        </fieldset>
    </div>
  )
}

function Tick() {
  return (
    <span className="bg-brand text-brand-foreground absolute top-2 right-2 grid size-6 place-items-center rounded-full shadow">
      <CheckIcon className="size-3.5" />
    </span>
  )
}

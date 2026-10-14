import { LETTER_SIGNATURE_MAX } from "@domain/index.ts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DesignPicker } from "@/components/letter/studio/cover-step"
import { LetterWriter } from "@/components/letter/studio/moments-step"
import { FieldError, SectionTitle, type FieldProblem } from "@/components/studio/studio-layout"
import { giftLetterDesign } from "@/lib/gift-studio"
import { switchIntent, type SendState } from "@/lib/send-flow"

type Update = (next: SendState) => void

/**
 * Step 3 (gift with a letter): the letter that opens with the gift, written with the same help as
 * a letter on its own, and laid on the same flower table.
 */
export function LetterStep({ s, update, problems }: { s: SendState; update: Update; problems: FieldProblem[] }) {
  // Kept as the sender's own text, so changing an earlier answer never redrafts it.
  const setBody = (body: string) => update({ ...s, letter: { ...s.letter, method: "own", draft: body, body, source: s.letter.source ?? "own", approved: true } })
  const occasion = s.occasion && s.occasion !== "unsure" ? s.occasion : undefined
  const err = problems.some((p) => p.field === "signature")
  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="ss-sign" className="eyebrow text-foreground">
          Sign it as <span className="text-brand-text" aria-hidden="true">*</span>
        </Label>
        <Input id="ss-sign" value={s.letter.signature ?? ""} onChange={(e) => update({ ...s, letter: { ...s.letter, signature: e.target.value } })} maxLength={LETTER_SIGNATURE_MAX} placeholder="e.g. Tolu, or Your Tolu" aria-invalid={err || undefined} className="h-12 text-base" />
        <FieldError problems={problems} field="signature" />
      </div>

      <LetterWriter
        body={s.letter.body ?? ""}
        onBody={setBody}
        tone={s.letter.tone}
        onTone={(tone) => update({ ...s, letter: { ...s.letter, tone } })}
        recipientName={s.recipient.name ?? ""}
        occasion={occasion}
        signature={s.letter.signature ?? ""}
        problems={problems}
      />

      <section className="flex flex-col gap-6" aria-labelledby="ss-look">
        <div id="ss-look">
          <SectionTitle hint="After the gift box opens, your letter waits on this table in a sealed envelope.">How your letter looks</SectionTitle>
        </div>
        <DesignPicker design={giftLetterDesign(s)} onChange={(letterDesign) => update({ ...s, letterDesign })} occasion={occasion} />
      </section>

      <Button variant="ghost" className="w-fit" onClick={() => update({ ...switchIntent(s, "gift"), letterWanted: false, step: "review" })}>
        Send the gift without a letter
      </Button>
    </div>
  )
}

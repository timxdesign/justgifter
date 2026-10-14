import type { ReactNode } from "react"
import { LETTER_THEMES, zoneById } from "@domain/index.ts"
import { Img } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InfoCircleIcon, LetterIcon, PenIcon } from "@/components/icons"
import { formatDate, formatMoney, todayLagos } from "@/lib/format"
import { giftLetterDesign, withLetter, type GiftStep } from "@/lib/gift-studio"
import { answer, recipientLabel, switchIntent, type SendState } from "@/lib/send-flow"

type Update = (next: SendState) => void

function Card({ title, onEdit, editLabel, children }: { title: string; onEdit?: () => void; editLabel?: string; children: ReactNode }) {
  return (
    <section className="bg-card ring-border flex flex-col gap-3 rounded-3xl p-5 ring-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="eyebrow text-muted-foreground">{title}</h2>
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={editLabel}>
            <PenIcon data-icon="inline-start" />
            Edit
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

/** Last step: everything in one place before checkout. Nothing is charged here. */
export function ReviewStep({ s, update, goTo }: { s: SendState; update: Update; goTo: (step: GiftStep) => void }) {
  const g = s.selected!
  const zone = s.gift.zoneId && s.gift.zoneId !== "unsure" ? zoneById(s.gift.zoneId) : null
  const by = s.gift.deliverBy && s.gift.deliverBy !== "any" ? s.gift.deliverBy : null
  const letter = withLetter(s) ? (s.letter.body ?? "") : ""
  return (
    <div className="flex flex-col gap-4">
      <Card title="The gift" onEdit={() => goTo("gift")} editLabel="Choose a different gift">
        <div className="flex gap-4">
          <div className="w-20 shrink-0 overflow-hidden rounded-xl"><div className="aspect-[4/5]"><Img src={g.image} alt="" className="size-full" sizes="80px" /></div></div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium">{g.title}</p>
            <p className="text-muted-foreground text-sm">{g.variantName} · {g.vendorName}</p>
            <p className="text-muted-foreground text-sm">{g.explanation}</p>
          </div>
        </div>
      </Card>

      {letter ? (
        <Card title="The letter" onEdit={() => goTo("letter")} editLabel="Edit the letter">
          <blockquote className="lt-serif border-brand/40 text-muted-foreground line-clamp-4 border-l-2 pl-4 text-lg whitespace-pre-line italic">{letter}</blockquote>
          <p className="text-muted-foreground text-sm">
            {LETTER_THEMES.find((t) => t.id === giftLetterDesign(s).theme)?.name} · signed {s.letter.signature}. Only {recipientLabel(s)} sees it, never the vendor.
          </p>
        </Card>
      ) : (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-dashed p-5">
          <div className="flex items-center gap-3">
            <LetterIcon className="text-brand-text size-5" />
            <p className="text-sm">Add a letter that opens with the gift, on a table of flowers. Free.</p>
          </div>
          <Button variant="outline" onClick={() => update({ ...switchIntent(s, "both"), letterWanted: true, step: "letter" })}>Add a letter</Button>
        </section>
      )}

      <Card title="Delivery" onEdit={() => goTo("gift")} editLabel="Change delivery details">
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">Area</dt>
          <dd>{zone ? zone.name : <span className="text-muted-foreground">Chosen at checkout</span>}</dd>
          <dt className="text-muted-foreground">Arrives</dt>
          <dd>{by ? (by === todayLagos() ? "Today" : `By ${formatDate(by)}`) : g.earliest ? `From ${formatDate(g.earliest)}. You'll pick the day at checkout.` : <span className="text-muted-foreground">Chosen at checkout</span>}</dd>
          <dt className="text-muted-foreground">Address</dt>
          <dd className="text-muted-foreground">Added at checkout, or {recipientLabel(s)} can add it privately</dd>
        </dl>
      </Card>

      <Card title="Cost">
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
          <dt>Gift</dt>
          <dd className="tabular text-right">{formatMoney(g.price)}</dd>
          <dt>Delivery</dt>
          <dd className="tabular text-right">{g.deliveryFee !== null ? formatMoney(g.deliveryFee) : <span className="text-muted-foreground">Confirmed at checkout</span>}</dd>
          {letter && (<><dt>Letter</dt><dd className="text-right">Free</dd></>)}
          <dt className="border-t pt-2 font-medium">{g.deliveryFee !== null ? "Estimated total" : "Gift subtotal"}</dt>
          <dd className="tabular border-t pt-2 text-right font-semibold">{formatMoney(g.price + (g.deliveryFee ?? 0))}</dd>
        </dl>
        <p className="text-muted-foreground flex gap-1.5 text-xs"><InfoCircleIcon className="mt-0.5 size-3.5 shrink-0" />Any service fee, wrapping or personalisation is shown at checkout. Price and stock are checked again before you pay.</p>
      </Card>

      <Card title="Recipient">
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="ss-review-name">Their name</Label>
          <Input id="ss-review-name" value={s.recipient.name ?? ""} onChange={(e) => update(answer(s, "recipient", (d) => void (d.recipient.name = e.target.value.slice(0, 80) || undefined)))} placeholder="Shown on the gift box" className="h-11" />
        </div>
      </Card>
    </div>
  )
}

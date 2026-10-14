import { useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import { cn } from "cn"
import { LAUNCH_TIMEZONE, maskContact, zoneById, zonedTimeToUtc } from "@domain/index.ts"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { Img } from "@/components/common"
import { OtpVerify } from "@/components/otp-verify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircleIcon, ClockCircleIcon, LockKeyholeIcon, PenIcon, ArrowRightIcon, GiftIcon, LetterIcon, InfoCircleIcon } from "@/components/icons"
import { checkoutIntent, preferredZone } from "@/lib/cart"
import { useApiMutation, qk } from "@/lib/api-hooks"
import { useSession } from "@/lib/session"
import { formatDate, formatDateTime, formatMoney, todayLagos } from "@/lib/format"
import { recipientLabel, type SendState } from "@/lib/send-flow"
import { AssistantSays, Panel } from "./parts"

type Update = (next: SendState) => void

function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 border-b pb-5 last:border-0 last:pb-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground eyebrow">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={label}>
      <PenIcon data-icon="inline-start" />
      Edit
    </Button>
  )
}

function LetterBlock({ body }: { body: string }) {
  return <div className="paper-grain bg-muted/50 font-display rounded-2xl p-5 text-[1.0625rem] leading-relaxed whitespace-pre-line">{body}</div>
}

/** Gift and gift-with-letter: everything in one place before checkout. Nothing is charged here. */
export function GiftReview({ s, update }: { s: SendState; update: Update }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const g = s.selected!
  const [name, setName] = useState(s.recipient.name ?? "")
  const zone = s.gift.zoneId && s.gift.zoneId !== "unsure" ? zoneById(s.gift.zoneId) : null
  const by = s.gift.deliverBy && s.gift.deliverBy !== "any" ? s.gift.deliverBy : null
  const letter = s.letter.approved && s.letter.body && (s.intent === "both" || s.letterWanted) ? s.letter.body : null

  const toCheckout = () => {
    if (zone) preferredZone.set(zone.id)
    checkoutIntent.set({
      vendorId: g.vendorId,
      vendorName: g.vendorName,
      lines: [{ productId: g.productId, variantId: g.variantId, quantity: 1, title: g.title, variantName: g.variantName, image: g.image, unitPrice: g.price, vendorId: g.vendorId, vendorName: g.vendorName, addedAt: new Date().toISOString() }],
      source: "marketplace",
      purchaseType: "gift",
      fromBag: false,
      recipientName: name.trim() || undefined,
      zoneId: zone?.id,
      requestedDate: by ?? undefined,
      message: letter ?? undefined,
      senderDisplayName: s.letter.signature ?? user?.name.split(" ")[0],
    })
    navigate("/checkout")
  }

  return (
    <>
      <AssistantSays hint="Check everything over. You'll confirm the delivery date, their contact details and payment on the next step.">Here's your gift{letter ? " and letter" : ""}.</AssistantSays>
      <Panel>
        <div className="bg-card shadow-border flex flex-col gap-5 rounded-3xl p-5 sm:p-6">
          <Section title="Gift" action={<EditButton label="Choose a different gift" onClick={() => update({ ...s, selected: undefined })} />}>
            <div className="flex gap-4">
              <div className="w-20 shrink-0 overflow-hidden rounded-xl"><div className="aspect-[4/5]"><Img src={g.image} alt="" className="size-full" sizes="80px" /></div></div>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium">{g.title}</p>
                <p className="text-muted-foreground text-sm">{g.variantName} · {g.vendorName}</p>
                <p className="text-muted-foreground text-sm">{g.explanation}</p>
              </div>
            </div>
          </Section>

          {letter && (
            <Section title="Letter" action={<EditButton label="Edit letter" onClick={() => update({ ...s, letter: { ...s.letter, approved: false } })} />}>
              <LetterBlock body={letter} />
              <p className="text-muted-foreground text-xs">Revealed with the gift. Only {recipientLabel(s)} sees it — never the vendor.</p>
            </Section>
          )}

          <Section title="Delivery">
            <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Area</dt>
              <dd>{zone ? zone.name : <span className="text-muted-foreground">Chosen at checkout</span>}</dd>
              <dt className="text-muted-foreground">Arrives</dt>
              <dd>{by ? (by === todayLagos() ? "Today" : `By ${formatDate(by)}`) : g.earliest ? `From ${formatDate(g.earliest)} — you'll pick the day at checkout` : <span className="text-muted-foreground">Chosen at checkout</span>}</dd>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="text-muted-foreground">Added at checkout, or {recipientLabel(s)} can add it privately</dd>
            </dl>
          </Section>

          <Section title="Cost">
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
          </Section>

          <Section title="Recipient">
            <div className="flex max-w-sm flex-col gap-1.5">
              <Label htmlFor="review-recipient">Their name</Label>
              <Input id="review-recipient" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-11" placeholder="Used on the reveal" />
            </div>
          </Section>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="xl" className="w-full sm:w-fit" onClick={toCheckout}>
            <GiftIcon data-icon="inline-start" />
            Continue to checkout
          </Button>
          <p className="text-muted-foreground text-sm">Nothing is charged until you confirm payment.</p>
        </div>
      </Panel>
    </>
  )
}

/** Letter-only: summary, sign-in if needed, then an explicit send. */
export function LetterReview({ s, update }: { s: SendState; update: Update }) {
  const { user, refresh } = useSession()
  const [email, setEmail] = useState("")
  const [verifying, setVerifying] = useState(false)
  const d = s.delivery
  const sendAt = d.when === "scheduled" && d.date && d.time ? zonedTimeToUtc(d.date, Number(d.time.split(":")[0]), Number(d.time.split(":")[1]), LAUNCH_TIMEZONE).toISOString() : null
  const send = useApiMutation(
    (api) =>
      api.sendLetter({
        clientRef: s.clientRef,
        recipientName: s.recipient.name!,
        recipientEmail: d.email!,
        body: s.letter.body!,
        senderDisplayName: d.senderName ?? s.letter.signature ?? user?.name ?? "",
        occasion: s.occasion && s.occasion !== "unsure" ? s.occasion : null,
        tone: s.letter.tone ?? null,
        sendAt,
      }),
    {
      toastError: false,
      invalidate: [qk.myLetters],
      onSuccess: (r) => update({ ...s, sent: { id: r.id, status: r.status === "scheduled" ? "scheduled" : "sent", sendAt: r.sendAt, contactMasked: r.contactMasked } }),
    },
  )

  return (
    <>
      <AssistantSays hint="Read it once more. Nothing is sent until you press the button below.">Ready when you are.</AssistantSays>
      <Panel>
        <div className="bg-card shadow-border flex flex-col gap-5 rounded-3xl p-5 sm:p-6">
          <Section title="Letter" action={<EditButton label="Edit letter" onClick={() => update({ ...s, letter: { ...s.letter, approved: false } })} />}>
            <LetterBlock body={s.letter.body ?? ""} />
          </Section>
          <Section title="Delivery" action={<EditButton label="Edit delivery details" onClick={() => update({ ...s, delivery: { ...s.delivery, when: undefined } })} />}>
            <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">To</dt>
              <dd>{s.recipient.name} · {d.email}</dd>
              <dt className="text-muted-foreground">From</dt>
              <dd>{d.senderName}</dd>
              <dt className="text-muted-foreground">How</dt>
              <dd>Email with a private link to read it</dd>
              <dt className="text-muted-foreground">When</dt>
              <dd>{sendAt ? `${formatDateTime(sendAt)} (Lagos time)` : "Right away"}</dd>
              <dt className="text-muted-foreground">Cost</dt>
              <dd>Free</dd>
            </dl>
          </Section>
        </div>

        {!user ? (
          <div className="bg-card shadow-border flex flex-col gap-4 rounded-3xl p-5 sm:p-6">
            <div className="flex gap-3">
              <LockKeyholeIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">Confirm your email to send</p>
                <p className="text-muted-foreground text-sm">We confirm every sender's email so letters can't be used for spam. Your letter is saved while you do this.</p>
              </div>
            </div>
            {!verifying ? (
              <form className="flex max-w-sm items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setVerifying(true) }}>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="review-email">Your email</Label>
                  <Input id="review-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
                </div>
                <Button type="submit" size="lg" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}>Continue</Button>
              </form>
            ) : (
              <OtpVerify
                destination={maskContact(email)}
                send={async () => (await getApi()).signInWithEmail(email, "/send")}
                verify={async (code) => {
                  await (await getApi()).verifyEmailCode(email, code)
                  await refresh()
                }}
                submitLabel="Confirm"
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {send.isError && (
              <Alert variant="destructive"><AlertDescription>{errorMessage(send.error)}</AlertDescription></Alert>
            )}
            <Button size="xl" className="w-full sm:w-fit" disabled={send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Spinner data-icon="inline-start" /> : <LetterIcon data-icon="inline-start" />}
              {sendAt ? "Schedule letter" : "Send letter now"}
            </Button>
            <p className="text-muted-foreground text-sm">Sending as {user.email}.</p>
          </div>
        )}
      </Panel>
    </>
  )
}

/** The end of a letter-only flow: sent and scheduled read differently on purpose. */
export function LetterDone({ s, onGiftToo, onStartOver }: { s: SendState; onGiftToo: () => void; onStartOver: () => void }) {
  const sent = s.sent!
  const scheduled = sent.status === "scheduled"
  return (
    <div className="bg-card shadow-border flex flex-col items-start gap-4 rounded-3xl p-6 sm:p-8">
      <span className={cn("grid size-12 place-items-center rounded-full", scheduled ? "bg-info-soft text-info" : "bg-success-soft text-success")}>
        {scheduled ? <ClockCircleIcon className="size-6" /> : <CheckCircleIcon className="size-6" />}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-3xl font-medium">{scheduled ? "Letter scheduled" : "Letter sent"}</h2>
        <p className="text-muted-foreground text-pretty">
          {scheduled
            ? `We'll email it to ${sent.contactMasked} on ${formatDateTime(sent.sendAt)} (Lagos time). You can cancel it any time before then.`
            : `We've emailed ${s.recipient.name?.split(" ")[0] ?? "them"} at ${sent.contactMasked} with a private link to read it.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/account/letters">{scheduled ? "Manage scheduled letters" : "See your letters"}</Link></Button>
        <Button variant="outline" onClick={onGiftToo}><GiftIcon data-icon="inline-start" />Send {s.recipient.name?.split(" ")[0] ?? "them"} a gift too</Button>
        <Button variant="ghost" onClick={onStartOver}>Start something new<ArrowRightIcon data-icon="inline-end" /></Button>
      </div>
    </div>
  )
}

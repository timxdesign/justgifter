import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useForm, Controller, useWatch, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { cn } from "cn"
import type { DateOnly, ZoneId } from "@domain/index.ts"
import { canSendWithoutAddress, zoneById, zonedTimeToUtc, LAUNCH_TIMEZONE, ZONES } from "@domain/index.ts"
import type { CheckoutDraft, CheckoutPreview } from "@/api"
import { errorMessage } from "@/api/errors"
import { Container, Img, Countdown, EmptyState } from "@/components/common"
import { DateStrip, PriceBreakdownList, ZoneSelect } from "@/components/commerce"
import { GiftReveal } from "@/components/reveal/gift-reveal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GiftIcon, UserIcon, DangerTriangleIcon, ShieldCheckIcon, EyeIcon, LockKeyholeIcon, InfoCircleIcon, ClockCircleIcon, BagHeartIcon } from "@/components/icons"
import { checkoutIntent, preferredZone, type CheckoutIntent } from "@/lib/cart"
import { getApi } from "@/api"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"
import { formatMoney, todayLagos, formatDate } from "@/lib/format"

const phone = z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter a phone number, e.g. +234 803 555 0192")

const schema = z
  .object({
    purchaseType: z.enum(["gift", "self"]),
    recipientName: z.string().trim(),
    recipientEmail: z.string().trim(),
    recipientPhone: z.string().trim(),
    addressMode: z.enum(["known", "recipient"]),
    zoneId: z.string().min(1, "Choose a delivery area"),
    requestedDate: z.string().nullable(),
    addrName: z.string().trim(),
    addrPhone: z.string().trim(),
    addrLine1: z.string().trim(),
    addrLine2: z.string().trim(),
    addrLandmark: z.string().trim(),
    addrArea: z.string().trim(),
    addrInstructions: z.string().trim().max(200, "Keep instructions under 200 characters"),
    senderDisplayName: z.string().trim().max(40),
    anonymous: z.boolean(),
    message: z.string().max(300, "Keep the message under 300 characters"),
    revealStyle: z.enum(["envelope", "wrapped_box"]),
    revealTiming: z.enum(["now", "scheduled"]),
    revealDate: z.string(),
    revealTime: z.string(),
    buyerName: z.string().trim().min(2, "Add your name"),
    buyerEmail: z.email("Enter an email address for your receipt"),
    buyerPhone: z.string().trim(),
    marketingOptIn: z.boolean(),
    personalisationConfirmed: z.boolean(),
    hasPersonalisation: z.boolean(),
    wishlist: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const req = (path: string, ok: boolean, message: string) => !ok && ctx.addIssue({ code: "custom", path: [path], message })
    req("requestedDate", Boolean(v.requestedDate), "Choose a delivery date")
    if (v.purchaseType === "gift" && !v.wishlist) {
      req("recipientName", v.recipientName.length > 0, "Add the recipient's name")
      req("recipientEmail", Boolean(v.recipientEmail || v.recipientPhone), "Add an email or phone number so we can send the reveal")
      if (v.recipientEmail) req("recipientEmail", z.email().safeParse(v.recipientEmail).success, "Enter a valid email address")
      if (v.recipientPhone) req("recipientPhone", phone.safeParse(v.recipientPhone).success, "Enter a valid phone number")
      if (!v.anonymous) req("senderDisplayName", v.senderDisplayName.length > 0, "Add the name they'll see, or send anonymously")
      if (v.revealTiming === "scheduled") {
        req("revealDate", Boolean(v.revealDate), "Choose a date for the reveal")
        if (v.revealDate && v.revealTime) {
          const at = zonedTimeToUtc(v.revealDate, Number(v.revealTime.split(":")[0]), Number(v.revealTime.split(":")[1]), LAUNCH_TIMEZONE)
          req("revealDate", at.getTime() > Date.now() + 5 * 60_000, "Choose a time in the future")
        }
      }
    }
    const needsAddress = !v.wishlist && (v.purchaseType === "self" || v.addressMode === "known")
    if (needsAddress) {
      req("addrName", v.addrName.length > 1, "Add the name of the person receiving it")
      req("addrPhone", phone.safeParse(v.addrPhone).success, "Add a phone number for the rider")
      req("addrLine1", v.addrLine1.length > 3, "Add the street address")
      req("addrArea", v.addrArea.length > 1, "Choose the area")
    }
    if (v.buyerPhone) req("buyerPhone", phone.safeParse(v.buyerPhone).success, "Enter a valid phone number")
    if (v.hasPersonalisation) req("personalisationConfirmed", v.personalisationConfirmed, "Confirm the personalisation is spelled correctly")
  })

type Values = z.infer<typeof schema>

export default function CheckoutPage() {
  useDocumentMeta({ title: "Checkout", noindex: true })
  const [intent] = useState(() => checkoutIntent.get())
  if (!intent || intent.lines.length === 0) {
    return (
      <Container className="py-20">
        <EmptyState icon={<BagHeartIcon />} title="Nothing to check out" description="Choose a gift first — you can send it straight away or add it to your bag." action={<Button asChild><Link to="/shop">Browse gifts</Link></Button>} />
      </Container>
    )
  }
  return <CheckoutForm intent={intent} />
}

function CheckoutForm({ intent }: { intent: CheckoutIntent }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const wishlist = intent.source === "wishlist"
  const product = useApiQuery(qk.product(intent.lines[0].productId), (api) => api.getProduct(intent.lines[0].productId))
  const vendor = product.data?.vendor
  const publicEvent = useApiQuery(qk.publicEvent(intent.eventSlug ?? ""), (api) => api.getPublicEvent(intent.eventSlug!), { enabled: wishlist })
  const eventZone = publicEvent.data?.kind === "found" ? publicEvent.data.view.event.deliveryZoneId : null
  const hasPersonalisation = intent.lines.some((l) => l.personalisationText)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      purchaseType: wishlist ? "gift" : intent.purchaseType,
      recipientName: intent.recipientName ?? "",
      recipientEmail: "",
      recipientPhone: "",
      addressMode: "known",
      zoneId: intent.zoneId ?? preferredZone.get() ?? "",
      requestedDate: intent.requestedDate ?? null,
      addrName: "",
      addrPhone: "",
      addrLine1: "",
      addrLine2: "",
      addrLandmark: "",
      addrArea: "",
      addrInstructions: "",
      senderDisplayName: user?.name.split(" ")[0] ?? "",
      anonymous: false,
      message: "",
      revealStyle: "wrapped_box",
      revealTiming: "now",
      revealDate: "",
      revealTime: "09:00",
      buyerName: user?.name ?? "",
      buyerEmail: user?.email ?? "",
      buyerPhone: "",
      marketingOptIn: false,
      personalisationConfirmed: false,
      hasPersonalisation,
      wishlist,
    },
  })
  const { control, register, handleSubmit, setValue, formState } = form
  const v = useWatch({ control }) as Values

  useEffect(() => {
    if (wishlist && eventZone) setValue("zoneId", eventZone)
  }, [wishlist, eventZone, setValue])
  useEffect(() => {
    if (vendor && v.zoneId && !vendor.zones.some((z) => z.zoneId === v.zoneId)) setValue("zoneId", vendor.zones[0].zoneId)
    if (vendor && !v.zoneId) setValue("zoneId", vendor.zones[0].zoneId)
  }, [vendor, v.zoneId, setValue])

  const isGift = v.purchaseType === "gift"
  const addressKnown = wishlist || !isGift || v.addressMode === "known"
  const unknownAllowed = product.data ? canSendWithoutAddress(product.data.product) && intent.lines.length === 1 : false
  useEffect(() => {
    if (!unknownAllowed && v.addressMode === "recipient") setValue("addressMode", "known")
  }, [unknownAllowed, v.addressMode, setValue])

  const quote = useApiQuery(
    qk.delivery({ p: intent.lines[0].productId, zone: v.zoneId, personalised: hasPersonalisation }),
    (api) => api.getDeliveryQuote({ productId: intent.lines[0].productId, zoneId: v.zoneId as ZoneId, personalised: hasPersonalisation }),
    { enabled: Boolean(v.zoneId) },
  )
  useEffect(() => {
    if (quote.data?.dates.length && (!v.requestedDate || !quote.data.dates.includes(v.requestedDate))) setValue("requestedDate", quote.data.earliest ?? quote.data.dates[0])
  }, [quote.data, v.requestedDate, setValue])

  const draft = useMemo(() => toDraft(v, intent), [v, intent])
  const [debounced, setDebounced] = useState(draft)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 350)
    return () => clearTimeout(t)
  }, [draft])
  const preview = useApiQuery(["checkout-preview", debounced], (api) => api.previewCheckout(debounced), { enabled: Boolean(debounced.zoneId), placeholderData: (p) => p })

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const onSubmit = handleSubmit(
    async (values) => {
      setSubmitError(null)
      setSubmitting(true)
      try {
        const api = await getApi()
        const session = await api.createCheckout(toDraft(values, intent))
        sessionStorage.setItem(`jg-checkout:${session.reference}`, JSON.stringify({ fromBag: intent.fromBag, vendorId: intent.vendorId }))
        if (/^https?:/.test(session.paymentUrl)) window.location.href = session.paymentUrl
        else navigate(session.paymentUrl)
      } catch (e) {
        setSubmitError(errorMessage(e))
        setSubmitting(false)
      }
    },
    (errors) => {
      const first = Object.keys(errors)[0]
      const el = document.querySelector<HTMLElement>(`[name="${first}"], #${first}`)
      el?.focus()
      el?.scrollIntoView({ block: "center", behavior: "smooth" })
    },
  )

  const holdExpired = intent.holdExpiresAt ? new Date(intent.holdExpiresAt) < new Date() : false
  const total = preview.data?.pricing?.total

  return (
    <Container className="py-8 lg:py-12">
      <div className="mb-8 flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          {wishlist ? <>Gift from the wishlist for <span className="text-foreground font-medium">{intent.eventTitle}</span></> : <>Checking out with <span className="text-foreground font-medium">{intent.vendorName}</span></>}
        </p>
        <h1 className="font-display text-4xl font-medium">Checkout</h1>
      </div>

      {intent.holdExpiresAt && !holdExpired && (
        <Alert className="bg-brand-soft mb-6 border-0">
          <ClockCircleIcon />
          <AlertTitle>We're holding this for you</AlertTitle>
          <AlertDescription>
            Complete payment within <Countdown until={intent.holdExpiresAt} className="text-foreground font-semibold" /> so other guests don't buy the same thing.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-12">
          {!wishlist && (
            <Step n={1} title="Who's it for?">
              <Controller
                control={control}
                name="purchaseType"
                render={({ field }) => (
                  <div role="radiogroup" aria-label="Who's it for?" className="grid gap-3 sm:grid-cols-2">
                    <ChoiceCard checked={field.value === "gift"} onSelect={() => field.onChange("gift")} icon={<GiftIcon />} title="Send as a gift" body="With your message and a digital reveal they open on their phone." />
                    <ChoiceCard checked={field.value === "self"} onSelect={() => field.onChange("self")} icon={<UserIcon />} title="Order for myself" body="Regular delivery. No message or reveal needed." />
                  </div>
                )}
              />
            </Step>
          )}

          {isGift && !wishlist && (
            <Step n={2} title="Recipient">
              <FieldGroup>
                <TextField label="Their name" name="recipientName" register={register} errors={formState.errors} autoComplete="off" placeholder="Tolu" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField label="Email" name="recipientEmail" type="email" register={register} errors={formState.errors} autoComplete="off" placeholder="tolu@example.com" />
                  <TextField label="Phone (optional)" name="recipientPhone" type="tel" register={register} errors={formState.errors} autoComplete="off" placeholder="+234 803 555 0192" />
                </div>
                <FieldDescription>We only use this to send their gift link and delivery updates.</FieldDescription>
              </FieldGroup>
              <Controller
                control={control}
                name="addressMode"
                render={({ field }) => (
                  <FieldSet className="mt-6">
                    <FieldLegend variant="label">Delivery address</FieldLegend>
                    <div role="radiogroup" aria-label="Delivery address" className="grid gap-3 sm:grid-cols-2">
                      <ChoiceCard checked={field.value === "known"} onSelect={() => field.onChange("known")} title="I know their address" body="Best for a complete surprise." />
                      <ChoiceCard
                        checked={field.value === "recipient"}
                        onSelect={() => unknownAllowed && field.onChange("recipient")}
                        disabled={!unknownAllowed}
                        title="Let them add it"
                        badge="72-hour window"
                        body={unknownAllowed ? "They'll get a private link to add their address. They'll know a gift is coming." : "Not available for fresh, personalised or non-returnable items."}
                      />
                    </div>
                    {field.value === "recipient" && (
                      <p className="text-muted-foreground mt-2 flex gap-2 text-sm">
                        <InfoCircleIcon className="mt-0.5 size-4 shrink-0" />
                        Choose their approximate area below so we can quote delivery. If they don't add an address within 72 hours, or decline, you're refunded in full. They're never charged anything.
                      </p>
                    )}
                  </FieldSet>
                )}
              />
            </Step>
          )}

          <Step n={wishlist ? 1 : isGift ? 3 : 2} title="Delivery">
            {wishlist ? (
              <div className="bg-card shadow-border flex items-start gap-3 rounded-2xl p-4">
                <LockKeyholeIcon className="text-success mt-0.5 size-5 shrink-0" />
                <p className="text-sm">
                  Delivered to the hosts in <span className="font-medium">{zoneById(eventZone)?.name ?? "their area"}</span>. Their address is private — it's only shared with the vendor once your order is accepted.
                </p>
              </div>
            ) : (
              <Field data-invalid={formState.errors.zoneId ? true : undefined}>
                <FieldLabel htmlFor="zoneId">{isGift && v.addressMode === "recipient" ? "Their approximate area" : "Delivery area"}</FieldLabel>
                <Controller control={control} name="zoneId" render={({ field }) => <ZoneSelect id="zoneId" value={(field.value as ZoneId) || null} onChange={(z) => { field.onChange(z); preferredZone.set(z); setValue("addrArea", "") }} allowed={vendor?.zones.map((z) => z.zoneId)} invalid={Boolean(formState.errors.zoneId)} />} />
                <FieldError errors={[formState.errors.zoneId]} />
              </Field>
            )}
            <Field className="mt-6" data-invalid={formState.errors.requestedDate ? true : undefined}>
              <FieldLabel id="requestedDate">Delivery date</FieldLabel>
              {quote.isLoading ? <Skeleton className="h-20" /> : <Controller control={control} name="requestedDate" render={({ field }) => <DateStrip dates={quote.data?.dates ?? []} value={field.value as DateOnly | null} onChange={field.onChange} earliest={quote.data?.earliest} />} />}
              <FieldDescription>
                {quote.data?.fee !== undefined && quote.data?.fee !== null && <>Delivery {formatMoney(quote.data.fee)} by {vendor?.fulfilment === "courier" ? "courier partner" : `${vendor?.name}'s riders`}. </>}
                Arrival times are estimates until the vendor accepts.
              </FieldDescription>
              <FieldError errors={[formState.errors.requestedDate]} />
            </Field>

            {addressKnown && !wishlist && <AddressFields register={register} errors={formState.errors} control={control} zoneId={v.zoneId as ZoneId} isGift={isGift} />}
          </Step>

          {isGift && (
            <Step n={wishlist ? 2 : 4} title="Message & reveal">
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField label="From" name="senderDisplayName" register={register} errors={formState.errors} disabled={v.anonymous} placeholder="Ada" description="The name they'll see." />
                  <Controller
                    control={control}
                    name="anonymous"
                    render={({ field }) => (
                      <Field orientation="horizontal" className="bg-card shadow-border h-fit self-end rounded-xl p-3.5">
                        <Switch id="anonymous" checked={field.value} onCheckedChange={field.onChange} />
                        <FieldContent>
                          <FieldLabel htmlFor="anonymous">Send anonymously</FieldLabel>
                          <FieldDescription className="text-xs">We keep your details privately for support and safety.</FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />
                </div>
                <Field data-invalid={formState.errors.message ? true : undefined}>
                  <FieldLabel htmlFor="message">Your message</FieldLabel>
                  <Textarea id="message" {...register("message")} rows={4} maxLength={300} placeholder="Happy birthday! I hope this makes you smile." className="text-base" />
                  <FieldDescription className="flex justify-between">
                    <span>Text only for now. You can edit it until the reveal is sent.</span>
                    <span className="tabular">{v.message?.length ?? 0}/300</span>
                  </FieldDescription>
                  <FieldError errors={[formState.errors.message]} />
                </Field>
                <Controller
                  control={control}
                  name="revealStyle"
                  render={({ field }) => (
                    <FieldSet>
                      <FieldLegend variant="label">Reveal style</FieldLegend>
                      <div role="radiogroup" aria-label="Reveal style" className="grid grid-cols-2 gap-3">
                        <StyleCard checked={field.value === "wrapped_box"} onSelect={() => field.onChange("wrapped_box")} title="Wrapped box" art={<BoxArt />} />
                        <StyleCard checked={field.value === "envelope"} onSelect={() => field.onChange("envelope")} title="Envelope" art={<EnvelopeArt />} />
                      </div>
                    </FieldSet>
                  )}
                />
                {!wishlist && (
                  <Controller
                    control={control}
                    name="revealTiming"
                    render={({ field }) => (
                      <FieldSet>
                        <FieldLegend variant="label">When should they get it?</FieldLegend>
                        <div role="radiogroup" aria-label="When should they get it?" className="grid gap-3 sm:grid-cols-2">
                          <ChoiceCard checked={field.value === "now"} onSelect={() => field.onChange("now")} title="As soon as payment is confirmed" />
                          <ChoiceCard checked={field.value === "scheduled"} onSelect={() => field.onChange("scheduled")} title="On a date and time I choose" />
                        </div>
                        {field.value === "scheduled" && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem]">
                            <Field data-invalid={formState.errors.revealDate ? true : undefined}>
                              <FieldLabel htmlFor="revealDate">Date</FieldLabel>
                              <Input id="revealDate" type="date" min={todayLagos()} {...register("revealDate")} />
                              <FieldError errors={[formState.errors.revealDate]} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="revealTime">Time (WAT, Lagos)</FieldLabel>
                              <Controller control={control} name="revealTime" render={({ field: f }) => (
                                <Select value={f.value} onValueChange={f.onChange}>
                                  <SelectTrigger id="revealTime"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectGroup>{Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`).map((t) => <SelectItem key={t} value={t}>{formatHour(t)}</SelectItem>)}</SelectGroup></SelectContent>
                                </Select>
                              )} />
                            </Field>
                          </div>
                        )}
                        <FieldDescription>The reveal is separate from delivery — it can arrive before or after the gift itself.</FieldDescription>
                      </FieldSet>
                    )}
                  />
                )}
                <PreviewButton values={v} intent={intent} recipientFallback={wishlist ? intent.eventTitle ?? "the hosts" : ""} />
              </FieldGroup>
            </Step>
          )}

          <Step n={wishlist ? 3 : isGift ? 5 : 3} title="Your details">
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Your name" name="buyerName" register={register} errors={formState.errors} autoComplete="name" />
                <TextField label="Email for your receipt" name="buyerEmail" type="email" register={register} errors={formState.errors} autoComplete="email" />
              </div>
              <TextField label="Phone (optional)" name="buyerPhone" type="tel" register={register} errors={formState.errors} autoComplete="tel" description="Only used if there's a delivery problem." />
              <Controller control={control} name="marketingOptIn" render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox id="marketingOptIn" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                  <FieldLabel htmlFor="marketingOptIn" className="font-normal">Send me occasional gift ideas and reminders. You can unsubscribe any time.</FieldLabel>
                </Field>
              )} />
              {!user && <FieldDescription>No account needed. We'll email you a secure link to view and manage this order.</FieldDescription>}
            </FieldGroup>
          </Step>

          <Step n={wishlist ? 4 : isGift ? 6 : 4} title="Review & pay">
            {hasPersonalisation && (
              <div className="bg-card shadow-border mb-4 flex flex-col gap-3 rounded-2xl p-4">
                <p className="text-sm font-medium">Personalisation</p>
                {intent.lines.filter((l) => l.personalisationText).map((l) => (
                  <p key={l.variantId} className="font-display bg-muted rounded-lg px-3 py-2 text-lg italic">“{l.personalisationText}”</p>
                ))}
                <Controller control={control} name="personalisationConfirmed" render={({ field }) => (
                  <Field orientation="horizontal" data-invalid={formState.errors.personalisationConfirmed ? true : undefined}>
                    <Checkbox id="personalisationConfirmed" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} aria-invalid={Boolean(formState.errors.personalisationConfirmed)} />
                    <FieldContent>
                      <FieldLabel htmlFor="personalisationConfirmed" className="font-normal">I've checked the spelling. Personalised items are made exactly as written.</FieldLabel>
                      <FieldError errors={[formState.errors.personalisationConfirmed]} />
                    </FieldContent>
                  </Field>
                )} />
              </div>
            )}
            <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
              <li className="flex gap-2"><ShieldCheckIcon className="text-success mt-0.5 size-4 shrink-0" />Free cancellation until {vendor?.name ?? "the vendor"} accepts. If they can't fulfil it, you're refunded in full — we never substitute without asking.</li>
              {isGift && v.addressMode === "recipient" && !wishlist && <li className="flex gap-2"><ShieldCheckIcon className="text-success mt-0.5 size-4 shrink-0" />If {v.recipientName || "they"} decline or don't add an address within 72 hours, the order is cancelled and refunded in full.</li>}
              <li className="flex gap-2"><ShieldCheckIcon className="text-success mt-0.5 size-4 shrink-0" /><span>Returns follow {vendor?.name ?? "the vendor"}'s policy. See <Link to="/policies/returns" className="underline underline-offset-4">returns & refunds</Link>.</span></li>
            </ul>

            {preview.data && !preview.data.ok && <IssueList preview={preview.data} />}
            {submitError && (
              <Alert variant="destructive" className="mt-4">
                <DangerTriangleIcon />
                <AlertTitle>Payment wasn't started</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" size="xl" className="mt-6 w-full" disabled={submitting || holdExpired}>
              {submitting ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
              {submitting ? "Starting secure payment…" : total !== undefined ? `Pay ${formatMoney(total)}` : "Continue to payment"}
            </Button>
            <p className="text-muted-foreground mt-3 text-center text-xs">You'll pay on Paystack's secure page. We confirm the payment with Paystack directly before anything is sent.</p>
          </Step>
        </div>

        <OrderSummary intent={intent} preview={preview.data ?? null} loading={preview.isLoading} />
      </form>
    </Container>
  )
}

// ---------------------------------------------------------------- Pieces

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="flex flex-col gap-5">
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-xl font-semibold">
        <span className="bg-primary text-primary-foreground tabular grid size-7 place-items-center rounded-full text-sm">{n}</span>
        {title}
      </h2>
      <div>{children}</div>
    </section>
  )
}

function ChoiceCard({ checked, onSelect, title, body, icon, badge, disabled }: { checked: boolean; onSelect: () => void; title: string; body?: string; icon?: React.ReactNode; badge?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={onSelect}
      className={cn("press flex items-start gap-3 rounded-2xl p-4 text-left transition-[box-shadow,background-color]", checked ? "bg-card shadow-[0_0_0_2px_var(--foreground)]" : "bg-card shadow-border hover:shadow-border-hover", disabled && "cursor-not-allowed opacity-55 active:scale-100")}
    >
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors", checked ? "border-foreground" : "border-input")}>
        {checked && <span className="bg-foreground size-2.5 rounded-full" />}
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 font-medium">
          {icon && <span className="[&_svg]:size-[1.125rem]">{icon}</span>}
          {title}
          {badge && <span className="bg-brand-soft text-brand-text rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">{badge}</span>}
        </span>
        {body && <span className="text-muted-foreground text-sm">{body}</span>}
      </span>
    </button>
  )
}

function StyleCard({ checked, onSelect, title, art }: { checked: boolean; onSelect: () => void; title: string; art: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className={cn("press bg-plum flex flex-col items-center gap-3 overflow-hidden rounded-2xl pt-6 pb-3 transition-shadow", checked ? "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]" : "opacity-85 hover:opacity-100")}>
      <span className="grid h-20 place-items-center">{art}</span>
      <span className="text-plum-foreground text-sm font-medium">{title}</span>
    </button>
  )
}

function BoxArt() {
  return (
    <svg viewBox="0 0 80 80" className="size-20" aria-hidden="true">
      <rect x="12" y="34" width="56" height="38" rx="4" fill="oklch(0.66 0.18 42)" />
      <rect x="8" y="26" width="64" height="12" rx="3" fill="oklch(0.72 0.17 48)" />
      <rect x="35" y="26" width="10" height="46" fill="oklch(0.86 0.1 88)" />
      <path d="M40 26c-6-12-20-14-18-4 1 5 10 6 18 4Zm0 0c6-12 20-14 18-4-1 5-10 6-18 4Z" fill="oklch(0.86 0.1 88)" />
    </svg>
  )
}

function EnvelopeArt() {
  return (
    <svg viewBox="0 0 96 64" className="h-16 w-24" aria-hidden="true">
      <rect x="4" y="8" width="88" height="52" rx="5" fill="oklch(0.9 0.03 75)" />
      <path d="M4 12 48 40 92 12" fill="oklch(0.86 0.04 72)" />
      <circle cx="48" cy="38" r="7" fill="oklch(0.64 0.17 42)" />
    </svg>
  )
}

type Reg = UseFormRegister<Values>

function TextField({ label, name, register, errors, type = "text", description, ...rest }: { label: string; name: keyof Values; register: Reg; errors: FieldErrors<Values>; type?: string; description?: string } & Omit<React.ComponentProps<"input">, "name">) {
  const err = errors[name]
  return (
    <Field data-invalid={err ? true : undefined}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} type={type} inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined} aria-invalid={Boolean(err)} aria-describedby={err ? `${name}-error` : undefined} {...register(name)} {...rest} />
      {description && !err && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${name}-error`} errors={[err as { message?: string } | undefined]} />
    </Field>
  )
}

function AddressFields({ register, errors, control, zoneId, isGift }: { register: Reg; errors: FieldErrors<Values>; control: Control<Values>; zoneId: ZoneId; isGift: boolean }) {
  const zone = ZONES.find((z) => z.id === zoneId)
  return (
    <FieldSet className="mt-6">
      <FieldLegend variant="label">{isGift ? "Their address" : "Your address"}</FieldLegend>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={isGift ? "Recipient's full name" : "Full name"} name="addrName" register={register} errors={errors} autoComplete={isGift ? "off" : "name"} />
          <TextField label="Phone for the rider" name="addrPhone" type="tel" register={register} errors={errors} autoComplete={isGift ? "off" : "tel"} />
        </div>
        <TextField label="Street address" name="addrLine1" register={register} errors={errors} autoComplete={isGift ? "off" : "address-line1"} placeholder="14 Admiralty Way" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Flat, floor or estate (optional)" name="addrLine2" register={register} errors={errors} autoComplete={isGift ? "off" : "address-line2"} />
          <TextField label="Nearest landmark (optional)" name="addrLandmark" register={register} errors={errors} placeholder="Opposite the filling station" />
        </div>
        <Field data-invalid={errors.addrArea ? true : undefined}>
          <FieldLabel htmlFor="addrArea">Area in {zone?.name ?? "the delivery area"}</FieldLabel>
          <Controller control={control} name="addrArea" render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!zone}>
              <SelectTrigger id="addrArea" aria-invalid={Boolean(errors.addrArea)}><SelectValue placeholder="Choose the area" /></SelectTrigger>
              <SelectContent><SelectGroup>{zone?.areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          )} />
          <FieldDescription>Not listed? Choose the closest area and add details in the instructions — the vendor confirms the address before delivery.</FieldDescription>
          <FieldError errors={[errors.addrArea]} />
        </Field>
        <TextField label="Delivery instructions (optional)" name="addrInstructions" register={register} errors={errors} placeholder="Call on arrival, gate code…" />
      </FieldGroup>
    </FieldSet>
  )
}

function IssueList({ preview }: { preview: CheckoutPreview }) {
  return (
    <Alert variant="destructive" className="mt-4">
      <DangerTriangleIcon />
      <AlertTitle>Fix this before paying</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {preview.issues.map((i) => <li key={i.code + (i.lineIndex ?? "")}>{i.message}</li>)}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function OrderSummary({ intent, preview, loading }: { intent: CheckoutIntent; preview: CheckoutPreview | null; loading: boolean }) {
  return (
    <aside aria-label="Order summary" className="lg:sticky lg:top-28 lg:self-start">
      <div className="bg-card shadow-border flex flex-col gap-5 rounded-3xl p-6">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="flex flex-col gap-4">
          {intent.lines.map((l) => (
            <li key={l.variantId + (l.personalisationText ?? "")} className="flex gap-3">
              <div className="relative">
                <Img src={l.image} alt="" className="size-16 rounded-xl" sizes="64px" />
                <span className="bg-primary text-primary-foreground tabular absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full text-[0.6875rem] font-semibold">{l.quantity}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.title}</p>
                <p className="text-muted-foreground text-xs">{l.variantName}</p>
                {l.personalisationText && <p className="text-muted-foreground mt-0.5 truncate text-xs italic">“{l.personalisationText}”</p>}
              </div>
              <p className="tabular text-sm">{formatMoney(l.unitPrice * l.quantity)}</p>
            </li>
          ))}
        </ul>
        <div className="border-t pt-4">
          {preview?.pricing ? <PriceBreakdownList pricing={preview.pricing} /> : loading ? <Skeleton className="h-28" /> : <p className="text-muted-foreground text-sm">Choose a delivery area to see the total.</p>}
        </div>
        {preview?.delivery?.feasible && preview.delivery.date && <p className="text-muted-foreground text-xs">Requested for {formatDate(preview.delivery.date)}. You'll get a confirmed window once the vendor accepts.</p>}
      </div>
      <p className="text-muted-foreground mt-4 flex items-center justify-center gap-2 text-xs">
        <ShieldCheckIcon className="size-4" /> Card details go to Paystack, never to JustGifter
      </p>
    </aside>
  )
}

function PreviewButton({ values, intent, recipientFallback }: { values: Values; intent: CheckoutIntent; recipientFallback: string }) {
  const [open, setOpen] = useState(false)
  const line = intent.lines[0]
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-fit">
        <EyeIcon data-icon="inline-start" />
        Preview what they'll see
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-plum max-h-[92dvh] overflow-y-auto border-0 p-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Reveal preview</DialogTitle>
            <DialogDescription>A preview with your current message. This doesn't send anything.</DialogDescription>
          </DialogHeader>
          {open && (
            <GiftReveal id="checkout-preview" preview revealStyle={values.revealStyle} recipientName={values.recipientName || recipientFallback} fromLabel={values.anonymous ? "Someone sent you something" : `From ${values.senderDisplayName || "you"}`}>
              <div className="bg-background m-3 flex flex-col overflow-hidden rounded-2xl">
                <Img src={line.image} alt="" className="aspect-[4/3] w-full" sizes="480px" />
                <div className="flex flex-col gap-3 p-6">
                  <p className="eyebrow text-brand-text">{line.title}</p>
                  {values.message ? <p className="font-display text-xl leading-snug italic">“{values.message}”</p> : <p className="text-muted-foreground text-sm">Your message will appear here.</p>}
                  <p className="text-muted-foreground text-sm">— {values.anonymous ? "Sent anonymously" : values.senderDisplayName || "you"}</p>
                  <p className="text-muted-foreground border-t pt-3 text-xs">The price is never shown to them.</p>
                </div>
              </div>
            </GiftReveal>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

const formatHour = (t: string) => {
  const h = Number(t.slice(0, 2))
  return h === 0 ? "Midnight" : h === 12 ? "Noon" : h < 12 ? `${h}am` : `${h - 12}pm`
}

function toDraft(v: Values, intent: CheckoutIntent): CheckoutDraft {
  const isGift = v.purchaseType === "gift"
  const wishlist = intent.source === "wishlist"
  const addressKnown = wishlist || !isGift || v.addressMode === "known"
  const zone = ZONES.find((z) => z.id === v.zoneId)
  let revealAt: string | null = null
  if (isGift && v.revealTiming === "scheduled" && v.revealDate) {
    const [h, m] = (v.revealTime || "09:00").split(":").map(Number)
    revealAt = zonedTimeToUtc(v.revealDate, h, m, LAUNCH_TIMEZONE).toISOString()
  }
  return {
    vendorId: intent.vendorId,
    source: intent.source,
    storefrontId: intent.storefrontId ?? null,
    campaign: intent.campaign,
    eventSlug: intent.eventSlug,
    wishlistItemId: intent.wishlistItemId,
    holdId: intent.holdId,
    purchaseType: wishlist ? "gift" : v.purchaseType,
    lines: intent.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, personalisationText: l.personalisationText, wrappingId: l.wrappingId, expectedUnitPrice: l.unitPrice })),
    buyer: { name: v.buyerName, email: v.buyerEmail, phone: v.buyerPhone || undefined },
    zoneId: v.zoneId as ZoneId,
    requestedDate: v.requestedDate,
    addressKnown,
    address: addressKnown && !wishlist && zone ? { recipientName: v.addrName, phone: v.addrPhone, line1: v.addrLine1, line2: v.addrLine2 || undefined, landmark: v.addrLandmark || undefined, area: v.addrArea, city: zone.city, state: zone.state, zoneId: zone.id, instructions: v.addrInstructions || undefined } : undefined,
    recipient: isGift && !wishlist ? { name: v.recipientName, email: v.recipientEmail || undefined, phone: v.recipientPhone || undefined } : undefined,
    gift: isGift ? { senderDisplayName: v.senderDisplayName, anonymous: v.anonymous, message: v.message, revealStyle: v.revealStyle, revealAt, timezone: LAUNCH_TIMEZONE } : undefined,
    personalisationConfirmed: v.personalisationConfirmed,
    marketingOptIn: v.marketingOptIn,
  }
}

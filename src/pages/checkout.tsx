import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useForm, Controller, useWatch, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { cn } from "cn"
import type { DateOnly, ZoneId } from "@domain/index.ts"
import { canSendWithoutAddress, zoneById, zonedTimeToUtc, LAUNCH_TIMEZONE, ZONES } from "@domain/index.ts"
import type { CheckoutDraft, CheckoutPreview } from "@/api"
import { errorMessage } from "@/api/errors"
import { Logo } from "@/components/brand/logo"
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
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DangerTriangleIcon, ShieldCheckIcon, EyeIcon, LockKeyholeIcon, ClockCircleIcon, BagHeartIcon, CheckIcon, AltArrowDownIcon, AltArrowLeftIcon, AddCircleIcon } from "@/components/icons"
import { checkoutIntent, preferredZone, type CheckoutIntent } from "@/lib/cart"
import { getApi } from "@/api"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"
import { formatMoney, todayLagos, formatDate } from "@/lib/format"

const phone = z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter a phone number, e.g. +234 803 555 0192")
const isPhone = (s: string) => !s.includes("@") && phone.safeParse(s).success

const MESSAGE_IDEAS = ["Happy birthday!", "Congratulations!", "Thinking of you.", "Thank you for everything.", "With all my love."]

/**
 * Every rule lives in superRefine so a step can be validated on its own: with no base-schema
 * failures, refinements always run and `trigger(stepFields)` reports exactly that step's errors.
 */
const schema = z
  .object({
    purchaseType: z.enum(["gift", "self"]),
    recipientName: z.string().trim(),
    recipientContact: z.string().trim(),
    addressMode: z.enum(["known", "recipient"]),
    zoneId: z.string(),
    requestedDate: z.string().nullable(),
    addrName: z.string().trim(),
    addrPhone: z.string().trim(),
    addrLine1: z.string().trim(),
    addrLine2: z.string().trim(),
    addrLandmark: z.string().trim(),
    addrArea: z.string().trim(),
    addrInstructions: z.string().trim(),
    senderDisplayName: z.string().trim(),
    anonymous: z.boolean(),
    message: z.string(),
    revealStyle: z.enum(["envelope", "wrapped_box"]),
    revealScheduled: z.boolean(),
    revealDate: z.string(),
    revealTime: z.string(),
    buyerName: z.string().trim(),
    buyerEmail: z.string().trim(),
    buyerPhone: z.string().trim(),
    marketingOptIn: z.boolean(),
    personalisationConfirmed: z.boolean(),
    hasPersonalisation: z.boolean(),
    wishlist: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const req = (path: string, ok: boolean, message: string) => !ok && ctx.addIssue({ code: "custom", path: [path], message })
    const isGift = v.purchaseType === "gift"
    req("zoneId", v.zoneId.length > 0, "Choose a delivery area")
    req("requestedDate", Boolean(v.requestedDate), "Choose a delivery date")
    if (isGift && !v.wishlist) {
      req("recipientName", v.recipientName.length > 0, "Add their name")
      if (!v.recipientContact) req("recipientContact", false, "Add an email or phone number so we can send the reveal")
      else req("recipientContact", z.email().safeParse(v.recipientContact).success || isPhone(v.recipientContact), "Enter a valid email address or phone number")
    }
    if (isGift) {
      req("message", v.message.length <= 300, "Keep the message under 300 characters")
      req("senderDisplayName", v.senderDisplayName.length <= 40, "Keep the name under 40 characters")
      if (!v.wishlist && v.revealScheduled) {
        req("revealDate", Boolean(v.revealDate), "Choose a date for the reveal")
        if (v.revealDate && v.revealTime) {
          const at = zonedTimeToUtc(v.revealDate, Number(v.revealTime.split(":")[0]), Number(v.revealTime.split(":")[1]), LAUNCH_TIMEZONE)
          req("revealDate", at.getTime() > Date.now() + 5 * 60_000, "Choose a time in the future")
        }
      }
    }
    const needsAddress = !v.wishlist && (!isGift || v.addressMode === "known")
    if (needsAddress) {
      if (!isGift) req("addrName", v.addrName.length > 1, "Add your full name")
      if (!(isGift && isPhone(v.recipientContact))) req("addrPhone", phone.safeParse(v.addrPhone).success, "Add a phone number for the rider")
      req("addrLine1", v.addrLine1.length > 3, "Add the street address")
      req("addrArea", v.addrArea.length > 1, "Choose the area")
      req("addrInstructions", v.addrInstructions.length <= 200, "Keep instructions under 200 characters")
    }
    req("buyerEmail", z.email().safeParse(v.buyerEmail).success, "Enter an email address for your receipt")
    if (isGift) req("buyerName", v.buyerName.length > 1, "Add your name")
    if (v.buyerPhone) req("buyerPhone", phone.safeParse(v.buyerPhone).success, "Enter a valid phone number")
    if (v.hasPersonalisation) req("personalisationConfirmed", v.personalisationConfirmed, "Confirm the personalisation is spelled correctly")
  })

type Values = z.infer<typeof schema>
type StepId = "recipient" | "delivery" | "message" | "details"

const STEP_FIELDS: Record<StepId, (keyof Values)[]> = {
  recipient: ["recipientName", "recipientContact"],
  delivery: ["zoneId", "requestedDate", "addrName", "addrPhone", "addrLine1", "addrArea", "addrInstructions"],
  message: ["message", "senderDisplayName", "revealDate"],
  details: ["buyerName", "buyerEmail", "buyerPhone", "personalisationConfirmed"],
}

export default function CheckoutPage() {
  useDocumentMeta({ title: "Checkout", noindex: true })
  const [intent] = useState(() => checkoutIntent.get())
  return (
    <div className="flex min-h-dvh flex-col">
      <CheckoutHeader backTo={intent?.fromBag ? "/cart" : null} />
      <main id="main" className="flex-1">
        {!intent || intent.lines.length === 0 ? (
          <Container className="py-20">
            <EmptyState icon={<BagHeartIcon />} title="Nothing to check out" description="Choose a gift first — you can send it straight away or add it to your bag." action={<Button asChild><Link to="/shop">Browse gifts</Link></Button>} />
          </Container>
        ) : (
          <CheckoutForm intent={intent} />
        )}
      </main>
    </div>
  )
}

/** Checkout is enclosed: no site navigation competing with the task, just a way back. */
function CheckoutHeader({ backTo }: { backTo: string | null }) {
  const navigate = useNavigate()
  return (
    <header className="border-b">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex flex-1 items-center">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => (backTo ? navigate(backTo) : window.history.length > 1 ? navigate(-1) : navigate("/shop"))}>
            <AltArrowLeftIcon data-icon="inline-start" />
            <span className="max-sm:sr-only">Back</span>
          </Button>
        </div>
        <Link to="/" aria-label="JustGifter home"><Logo /></Link>
        <p className="text-muted-foreground flex flex-1 items-center justify-end gap-1.5 text-sm">
          <LockKeyholeIcon className="size-4" />
          <span className="max-sm:sr-only">Secure checkout</span>
        </p>
      </Container>
    </header>
  )
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
      recipientContact: "",
      addressMode: "known",
      zoneId: intent.zoneId ?? preferredZone.get() ?? "",
      requestedDate: intent.requestedDate ?? null,
      addrName: user?.name ?? "",
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
      revealScheduled: false,
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
  const { control, register, handleSubmit, setValue, formState, trigger } = form
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

  // ---------------------------------------------------------------- Steps
  const steps = useMemo<{ id: StepId; title: string }[]>(
    () =>
      wishlist
        ? [{ id: "delivery", title: "Delivery" }, { id: "message", title: "Gift message" }, { id: "details", title: "Your details" }]
        : isGift
          ? [{ id: "recipient", title: "Recipient" }, { id: "delivery", title: "Delivery" }, { id: "message", title: "Gift message" }, { id: "details", title: "Your details" }]
          : [{ id: "delivery", title: "Delivery" }, { id: "details", title: "Contact" }],
    [wishlist, isGift],
  )
  const [active, setActive] = useState(0)
  const [reached, setReached] = useState(0)
  const focusStep = useRef<StepId | null>(null)
  useEffect(() => {
    setActive(0)
    setReached(0)
  }, [isGift])
  useEffect(() => {
    const id = focusStep.current
    if (!id) return
    focusStep.current = null
    const el = document.getElementById(`step-${id}`)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }, [active])

  const goTo = (i: number) => {
    focusStep.current = steps[i].id
    setActive(i)
  }
  const focusFirstError = (errors: FieldErrors<Values>) => {
    const first = Object.keys(errors)[0]
    if (!first) return
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[name="${first}"], #${first}`)
      el?.focus()
      el?.scrollIntoView({ block: "center", behavior: "smooth" })
    })
  }
  const continueFrom = async (i: number) => {
    const ok = await trigger(STEP_FIELDS[steps[i].id])
    if (!ok) return focusFirstError(form.formState.errors)
    const next = Math.max(i + 1, reached)
    setReached(next)
    goTo(Math.min(next, steps.length - 1))
  }

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
      const first = Object.keys(errors)[0] as keyof Values
      const i = steps.findIndex((s) => STEP_FIELDS[s.id].includes(first))
      if (i >= 0 && i !== active) setActive(i)
      focusFirstError(errors)
    },
  )

  const holdExpired = intent.holdExpiresAt ? new Date(intent.holdExpiresAt) < new Date() : false
  const total = preview.data?.pricing?.total
  const zone = zoneById(v.zoneId as ZoneId)
  const contactIsPhone = isPhone(v.recipientContact ?? "")

  const summaries: Record<StepId, React.ReactNode> = {
    recipient: (
      <>
        <p className="text-foreground font-medium">{v.recipientName}</p>
        <p>{v.recipientContact}</p>
        {v.addressMode === "recipient" && <p>They'll add their own address</p>}
      </>
    ),
    delivery: (
      <>
        <p className="text-foreground font-medium">{v.requestedDate ? formatDate(v.requestedDate) : "No date chosen"}{zone && ` · ${zone.name}`}</p>
        {wishlist ? <p>To the hosts' private address</p> : addressKnown ? <p>{[v.addrLine1, v.addrLine2, v.addrArea].filter(Boolean).join(", ")}</p> : <p>Address to be added by {v.recipientName || "them"}</p>}
      </>
    ),
    message: (
      <>
        <p className="text-foreground">{v.message ? `“${v.message}”` : "No message"}</p>
        <p>
          {v.anonymous ? "Sent anonymously" : `From ${senderName(v) || "you"}`} · {v.revealStyle === "envelope" ? "Envelope" : "Wrapped box"}
          {v.revealScheduled && v.revealDate ? ` · Reveal ${formatDate(v.revealDate)}, ${formatHour(v.revealTime)}` : ""}
        </p>
      </>
    ),
    details: null,
  }

  const content: Record<StepId, React.ReactNode> = {
    recipient: (
      <FieldGroup>
        <TextField label="Their name" name="recipientName" register={register} errors={formState.errors} autoComplete="off" placeholder="Tolu Adebayo" />
        <TextField label="Their email or phone" name="recipientContact" register={register} errors={formState.errors} autoComplete="off" placeholder="tolu@example.com" description="We'll send their gift reveal here." />
        {unknownAllowed && (
          <Controller
            control={control}
            name="addressMode"
            render={({ field }) => (
              <Field>
                <FieldLabel id="addressMode-label">Do you know their address?</FieldLabel>
                <Segmented
                  labelledBy="addressMode-label"
                  value={field.value}
                  onChange={field.onChange}
                  options={[{ value: "known", label: "Yes, I'll enter it" }, { value: "recipient", label: "No, let them add it" }]}
                />
                <FieldDescription>
                  {field.value === "known"
                    ? "Best for a complete surprise."
                    : "They'll get a private link to add it within 72 hours, so they'll know a gift is coming. If they don't, you're refunded in full."}
                </FieldDescription>
              </Field>
            )}
          />
        )}
      </FieldGroup>
    ),
    delivery: (
      <FieldGroup>
        {wishlist ? (
          <div className="bg-muted/60 flex items-start gap-3 rounded-xl p-4">
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
        <Field data-invalid={formState.errors.requestedDate ? true : undefined}>
          <FieldLabel id="requestedDate">Delivery date</FieldLabel>
          {quote.isLoading ? <Skeleton className="h-20" /> : <Controller control={control} name="requestedDate" render={({ field }) => <DateStrip dates={quote.data?.dates ?? []} value={field.value as DateOnly | null} onChange={field.onChange} earliest={quote.data?.earliest} />} />}
          {quote.data?.fee !== undefined && quote.data?.fee !== null && (
            <FieldDescription>
              {formatMoney(quote.data.fee)} delivery by {vendor?.fulfilment === "courier" ? "courier partner" : `${vendor?.name}'s riders`}. You'll get a confirmed time window once they accept.
            </FieldDescription>
          )}
          <FieldError errors={[formState.errors.requestedDate]} />
        </Field>
        {addressKnown && !wishlist && <AddressFields register={register} errors={formState.errors} control={control} zoneId={v.zoneId as ZoneId} isGift={isGift} riderPhoneKnown={isGift && contactIsPhone} values={v} />}
      </FieldGroup>
    ),
    message: (
      <FieldGroup>
        <Field data-invalid={formState.errors.message ? true : undefined}>
          <FieldLabel htmlFor="message">Your message</FieldLabel>
          {!v.message && (
            <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Message ideas">
              {MESSAGE_IDEAS.map((idea) => (
                <button key={idea} type="button" onClick={() => setValue("message", idea, { shouldDirty: true })} className="press bg-muted hover:bg-accent shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors">
                  {idea}
                </button>
              ))}
            </div>
          )}
          <Textarea id="message" {...register("message")} rows={4} maxLength={300} placeholder="Write something from the heart, or pick an idea above." className="text-base" />
          <FieldDescription className="flex justify-between gap-4">
            <span>You can edit it until the reveal is sent.</span>
            <span className="tabular">{v.message?.length ?? 0}/300</span>
          </FieldDescription>
          <FieldError errors={[formState.errors.message]} />
        </Field>

        <div className="grid items-end gap-4 sm:grid-cols-2">
          <TextField label="Signed as" name="senderDisplayName" register={register} errors={formState.errors} disabled={v.anonymous} maxLength={40} placeholder={v.buyerName?.split(" ")[0] || "Your first name"} />
          <Controller
            control={control}
            name="anonymous"
            render={({ field }) => (
              <Field orientation="horizontal" className="h-9 items-center">
                <Switch id="anonymous" checked={field.value} onCheckedChange={field.onChange} />
                <FieldLabel htmlFor="anonymous" className="font-normal">Send anonymously</FieldLabel>
              </Field>
            )}
          />
        </div>

        <Controller
          control={control}
          name="revealStyle"
          render={({ field }) => (
            <Field>
              <div className="flex items-center justify-between gap-4">
                <FieldLabel id="revealStyle-label">How they'll open it</FieldLabel>
                <PreviewButton values={v} intent={intent} recipientFallback={wishlist ? intent.eventTitle ?? "the hosts" : ""} />
              </div>
              <div role="radiogroup" aria-labelledby="revealStyle-label" className="grid grid-cols-2 gap-3">
                <StyleCard checked={field.value === "wrapped_box"} onSelect={() => field.onChange("wrapped_box")} title="Wrapped box" art={<BoxArt />} />
                <StyleCard checked={field.value === "envelope"} onSelect={() => field.onChange("envelope")} title="Envelope" art={<EnvelopeArt />} />
              </div>
            </Field>
          )}
        />

        {!wishlist && (
          <Controller
            control={control}
            name="revealScheduled"
            render={({ field }) => (
              <div className="flex flex-col gap-3">
                <Field orientation="horizontal">
                  <Switch id="revealScheduled" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldContent>
                    <FieldLabel htmlFor="revealScheduled" className="font-normal">Schedule the reveal for later</FieldLabel>
                    <FieldDescription className="text-xs">{field.value ? "Pick when their phone lights up — it can be before or after delivery." : "Otherwise they get it as soon as payment is confirmed."}</FieldDescription>
                  </FieldContent>
                </Field>
                {field.value && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                    <Field data-invalid={formState.errors.revealDate ? true : undefined}>
                      <FieldLabel htmlFor="revealDate">Date</FieldLabel>
                      <Input id="revealDate" type="date" min={todayLagos()} {...register("revealDate")} />
                      <FieldError errors={[formState.errors.revealDate]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="revealTime">Time (Lagos)</FieldLabel>
                      <Controller control={control} name="revealTime" render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger id="revealTime"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectGroup>{Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`).map((t) => <SelectItem key={t} value={t}>{formatHour(t)}</SelectItem>)}</SelectGroup></SelectContent>
                        </Select>
                      )} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          />
        )}
      </FieldGroup>
    ),
    details: (
      <FieldGroup>
        <TextField label="Email for your receipt" name="buyerEmail" type="email" register={register} errors={formState.errors} autoComplete="email" placeholder="you@example.com" description={user ? undefined : "No account needed — we'll email you a link to track this order."} />
        {isGift && <TextField label="Your name" name="buyerName" register={register} errors={formState.errors} autoComplete="name" />}
        {isGift && (
          <Reveal label="Add a phone number" defaultOpen={Boolean(v.buyerPhone)}>
            <TextField label="Your phone (optional)" name="buyerPhone" type="tel" register={register} errors={formState.errors} autoComplete="tel" description="Only used if there's a delivery problem." />
          </Reveal>
        )}
        <Controller control={control} name="marketingOptIn" render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox id="marketingOptIn" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
            <FieldLabel htmlFor="marketingOptIn" className="font-normal">Send me occasional gift ideas and reminders</FieldLabel>
          </Field>
        )} />

        {hasPersonalisation && (
          <div className="bg-muted/60 flex flex-col gap-3 rounded-xl p-4">
            {intent.lines.filter((l) => l.personalisationText).map((l) => (
              <p key={l.variantId} className="font-display text-lg italic">“{l.personalisationText}”</p>
            ))}
            <Controller control={control} name="personalisationConfirmed" render={({ field }) => (
              <Field orientation="horizontal" data-invalid={formState.errors.personalisationConfirmed ? true : undefined}>
                <Checkbox id="personalisationConfirmed" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} aria-invalid={Boolean(formState.errors.personalisationConfirmed)} />
                <FieldContent>
                  <FieldLabel htmlFor="personalisationConfirmed" className="font-normal">The spelling is correct. Personalised items are made exactly as written.</FieldLabel>
                  <FieldError errors={[formState.errors.personalisationConfirmed]} />
                </FieldContent>
              </Field>
            )} />
          </div>
        )}

        {isGift && !wishlist && v.addressMode === "recipient" && (
          <p className="text-muted-foreground flex gap-2 text-sm">
            <ShieldCheckIcon className="text-success mt-0.5 size-4 shrink-0" />
            If {v.recipientName || "they"} decline or don't add an address within 72 hours, you're refunded in full.
          </p>
        )}
        {preview.data && !preview.data.ok && <IssueList preview={preview.data} />}
        {submitError && (
          <Alert variant="destructive">
            <DangerTriangleIcon />
            <AlertTitle>Payment wasn't started</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3">
          <Button type="submit" size="xl" className="w-full" disabled={submitting || holdExpired}>
            {submitting ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
            {submitting ? "Starting secure payment…" : total !== undefined ? `Pay ${formatMoney(total)}` : "Continue to payment"}
          </Button>
          <p className="text-muted-foreground text-center text-xs text-pretty">You'll pay on Paystack's secure page. Card details never reach JustGifter.</p>
        </div>
      </FieldGroup>
    ),
  }

  return (
    <>
      <MobileSummary intent={intent} preview={preview.data ?? null} loading={preview.isLoading} vendorName={vendor?.name} />
      <Container className="py-8 lg:py-12">
        <form onSubmit={onSubmit} noValidate className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="font-display text-3xl font-medium sm:text-4xl">Checkout</h1>
                <p className="text-muted-foreground text-sm">
                  {wishlist ? <>A gift from the wishlist for <span className="text-foreground font-medium">{intent.eventTitle}</span></> : <>From <span className="text-foreground font-medium">{intent.vendorName}</span></>}
                </p>
              </div>
              {!wishlist && (
                <Controller
                  control={control}
                  name="purchaseType"
                  render={({ field }) => (
                    <Segmented
                      label="Who's it for?"
                      value={field.value}
                      onChange={field.onChange}
                      options={[{ value: "gift", label: "It's a gift" }, { value: "self", label: "It's for me" }]}
                    />
                  )}
                />
              )}
            </div>

            {intent.holdExpiresAt && !holdExpired && (
              <Alert className="bg-brand-soft border-0">
                <ClockCircleIcon />
                <AlertTitle>We're holding this for you</AlertTitle>
                <AlertDescription>
                  Pay within <Countdown until={intent.holdExpiresAt} className="text-foreground font-semibold" /> so other guests don't buy the same thing.
                </AlertDescription>
              </Alert>
            )}

            <ol className="flex flex-col gap-3">
              {steps.map((step, i) => {
                const state = i === active ? "active" : i < active || i <= reached ? "done" : "upcoming"
                const last = i === steps.length - 1
                return (
                  <StepCard key={step.id} id={step.id} n={i + 1} title={step.title} state={state} summary={summaries[step.id]} onEdit={() => goTo(i)}>
                    {content[step.id]}
                    {!last && (
                      <Button type="button" size="lg" className="mt-6 w-full sm:w-auto" onClick={() => continueFrom(i)}>
                        Continue to {steps[i + 1].title.toLowerCase()}
                      </Button>
                    )}
                  </StepCard>
                )
              })}
            </ol>
          </div>

          <OrderSummary intent={intent} preview={preview.data ?? null} loading={preview.isLoading} vendorName={vendor?.name} className="max-lg:hidden" />
        </form>
      </Container>
    </>
  )
}

// ---------------------------------------------------------------- Pieces

function StepCard({ id, n, title, state, summary, onEdit, children }: { id: StepId; n: number; title: string; state: "active" | "done" | "upcoming"; summary: React.ReactNode; onEdit: () => void; children: React.ReactNode }) {
  return (
    <li aria-current={state === "active" ? "step" : undefined} className={cn("rounded-2xl transition-[background-color,box-shadow]", state === "active" ? "bg-card shadow-border p-5 sm:p-6" : "px-5 py-4 sm:px-6", state === "done" && "bg-card/60 shadow-border")}>
      <section aria-labelledby={`step-${id}`}>
        <div className="flex items-start justify-between gap-4">
          <h2 id={`step-${id}`} tabIndex={-1} className={cn("flex items-center gap-3 font-semibold outline-none", state === "active" ? "text-lg" : "text-base", state === "upcoming" && "text-muted-foreground")}>
            <span
              className={cn(
                "tabular grid size-6 shrink-0 place-items-center rounded-full text-xs",
                state === "active" && "bg-primary text-primary-foreground",
                state === "done" && "bg-success text-white",
                state === "upcoming" && "shadow-border",
              )}
            >
              {state === "done" ? <CheckIcon className="size-3.5" aria-hidden="true" /> : n}
            </span>
            {title}
            {state === "done" && <span className="sr-only"> (complete)</span>}
          </h2>
          {state === "done" && (
            <Button type="button" variant="link" size="sm" className="-mr-2 h-auto py-0" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
              Edit
            </Button>
          )}
        </div>
        {state === "done" && summary && <div className="text-muted-foreground mt-2 flex min-w-0 flex-col gap-0.5 pl-9 text-sm [&>p]:truncate">{summary}</div>}
        {state === "active" && <div className="mt-5">{children}</div>}
      </section>
    </li>
  )
}

/** A compact segmented control: two options read faster as one row than as two large cards. */
function Segmented<T extends string>({ label, labelledBy, value, onChange, options }: { label?: string; labelledBy?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className="bg-muted grid w-full grid-flow-col gap-1 rounded-xl p-1 sm:w-fit sm:auto-cols-fr">
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return
              e.preventDefault()
              const i = options.findIndex((x) => x.value === value)
              const next = options[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + options.length) % options.length]
              onChange(next.value)
              ;(e.currentTarget.parentElement?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
            }}
            data-value={o.value}
            tabIndex={checked ? 0 : -1}
            className={cn("rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-[background-color,box-shadow,color]", checked ? "bg-card text-foreground shadow-border" : "text-muted-foreground hover:text-foreground")}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Progressive disclosure for optional fields: hidden until asked for, open if already filled. */
function Reveal({ label, defaultOpen, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {!open && (
        <CollapsibleTrigger asChild>
          <button type="button" className="text-brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline hover:underline-offset-4">
            <AddCircleIcon className="size-4" />
            {label}
          </button>
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

function StyleCard({ checked, onSelect, title, art }: { checked: boolean; onSelect: () => void; title: string; art: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className={cn("press bg-plum flex items-center gap-2 overflow-hidden rounded-xl sm:gap-3 px-2.5 py-2.5 text-left sm:px-3 transition-shadow", checked ? "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]" : "opacity-80 hover:opacity-100")}>
      <span className="grid size-10 shrink-0 place-items-center">{art}</span>
      <span className="text-plum-foreground text-sm font-medium whitespace-nowrap">{title}</span>
    </button>
  )
}

function BoxArt() {
  return (
    <svg viewBox="0 0 80 80" className="size-10" aria-hidden="true">
      <rect x="12" y="34" width="56" height="38" rx="4" fill="oklch(0.66 0.18 42)" />
      <rect x="8" y="26" width="64" height="12" rx="3" fill="oklch(0.72 0.17 48)" />
      <rect x="35" y="26" width="10" height="46" fill="oklch(0.86 0.1 88)" />
      <path d="M40 26c-6-12-20-14-18-4 1 5 10 6 18 4Zm0 0c6-12 20-14 18-4-1 5-10 6-18 4Z" fill="oklch(0.86 0.1 88)" />
    </svg>
  )
}

function EnvelopeArt() {
  return (
    <svg viewBox="0 0 96 64" className="h-7 w-10" aria-hidden="true">
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

function AddressFields({ register, errors, control, zoneId, isGift, riderPhoneKnown, values }: { register: Reg; errors: FieldErrors<Values>; control: Control<Values>; zoneId: ZoneId; isGift: boolean; riderPhoneKnown: boolean; values: Values }) {
  const zone = ZONES.find((z) => z.id === zoneId)
  const off = isGift ? "off" : undefined
  return (
    <>
      {(!isGift || !riderPhoneKnown) && (
        <div className={cn("grid gap-4", !isGift && "sm:grid-cols-2")}>
          {!isGift && <TextField label="Full name" name="addrName" register={register} errors={errors} autoComplete="name" />}
          <TextField label={isGift ? "Their phone, for the rider" : "Phone for the rider"} name="addrPhone" type="tel" register={register} errors={errors} autoComplete={off ?? "tel"} placeholder="+234 803 555 0192" />
        </div>
      )}
      <TextField label="Street address" name="addrLine1" register={register} errors={errors} autoComplete={off ?? "address-line1"} placeholder="14 Admiralty Way" />
      <Field data-invalid={errors.addrArea ? true : undefined}>
        <FieldLabel htmlFor="addrArea">Area in {zone?.name ?? "the delivery area"}</FieldLabel>
        <Controller control={control} name="addrArea" render={({ field }) => (
          <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!zone}>
            <SelectTrigger id="addrArea" aria-invalid={Boolean(errors.addrArea)}><SelectValue placeholder="Choose the area" /></SelectTrigger>
            <SelectContent><SelectGroup>{zone?.areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        )} />
        {!errors.addrArea && <FieldDescription>Not listed? Pick the closest and add a landmark below.</FieldDescription>}
        <FieldError errors={[errors.addrArea]} />
      </Field>
      <Reveal label="Add flat, landmark or delivery notes" defaultOpen={Boolean(values.addrLine2 || values.addrLandmark || values.addrInstructions || errors.addrInstructions)}>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Flat, floor or estate" name="addrLine2" register={register} errors={errors} autoComplete={off ?? "address-line2"} />
            <TextField label="Nearest landmark" name="addrLandmark" register={register} errors={errors} placeholder="Opposite the filling station" />
          </div>
          <TextField label="Delivery notes" name="addrInstructions" register={register} errors={errors} maxLength={200} placeholder="Call on arrival, gate code…" />
        </FieldGroup>
      </Reveal>
    </>
  )
}

function IssueList({ preview }: { preview: CheckoutPreview }) {
  return (
    <Alert variant="destructive">
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

type SummaryProps = { intent: CheckoutIntent; preview: CheckoutPreview | null; loading: boolean; vendorName?: string }

function SummaryBody({ intent, preview, loading, vendorName }: SummaryProps) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-4">
        {intent.lines.map((l) => (
          <li key={l.variantId + (l.personalisationText ?? "")} className="flex items-center gap-3">
            <div className="relative shrink-0">
              <Img src={l.image} alt="" className="size-14 rounded-xl" sizes="56px" />
              {l.quantity > 1 && <span className="bg-primary text-primary-foreground tabular absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full text-[0.6875rem] font-semibold">{l.quantity}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.title}</p>
              <p className="text-muted-foreground truncate text-xs">{l.variantName}{l.quantity > 1 && ` · ×${l.quantity}`}</p>
              {l.personalisationText && <p className="text-muted-foreground mt-0.5 truncate text-xs italic">“{l.personalisationText}”</p>}
            </div>
            <p className="tabular text-sm">{formatMoney(l.unitPrice * l.quantity)}</p>
          </li>
        ))}
      </ul>
      <div className="border-t pt-4">
        {preview?.pricing ? <PriceBreakdownList pricing={preview.pricing} compact /> : loading ? <Skeleton className="h-28" /> : <p className="text-muted-foreground text-sm">Choose a delivery area to see the total.</p>}
      </div>
      <ul className="text-muted-foreground flex flex-col gap-2 border-t pt-4 text-xs">
        <li className="flex gap-2"><ShieldCheckIcon className="text-success size-4 shrink-0" />Free cancellation until {vendorName ?? "the vendor"} accepts</li>
        <li className="flex gap-2"><ShieldCheckIcon className="text-success size-4 shrink-0" />Full refund if they can't fulfil it — no surprise swaps</li>
        <li className="flex gap-2"><ShieldCheckIcon className="text-success size-4 shrink-0" /><span>The price is never shown to the recipient. <Link to="/policies/returns" className="underline underline-offset-4">Returns</Link></span></li>
      </ul>
    </div>
  )
}

function OrderSummary({ className, ...props }: SummaryProps & { className?: string }) {
  return (
    <aside aria-label="Order summary" className={cn("lg:sticky lg:top-8 lg:self-start", className)}>
      <div className="bg-card shadow-border flex flex-col gap-5 rounded-3xl p-6">
        <h2 className="font-semibold">Order summary</h2>
        <SummaryBody {...props} />
      </div>
    </aside>
  )
}

/** On small screens the summary collapses into a bar above the form, total always visible. */
function MobileSummary(props: SummaryProps) {
  const [open, setOpen] = useState(false)
  const total = props.preview?.pricing?.total
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="bg-muted/50 border-b lg:hidden">
      <Container>
        <CollapsibleTrigger className="flex h-14 w-full items-center justify-between gap-4 text-sm">
          <span className="text-brand-text flex items-center gap-1.5 font-medium">
            {open ? "Hide" : "Show"} order summary
            <AltArrowDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </span>
          <span className="tabular text-base font-semibold">{total !== undefined ? formatMoney(total) : <Skeleton className="h-5 w-20" />}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <aside aria-label="Order summary" className="pb-6">
            <SummaryBody {...props} />
          </aside>
        </CollapsibleContent>
      </Container>
    </Collapsible>
  )
}

function PreviewButton({ values, intent, recipientFallback }: { values: Values; intent: CheckoutIntent; recipientFallback: string }) {
  const [open, setOpen] = useState(false)
  const line = intent.lines[0]
  const from = senderName(values)
  return (
    <>
      <Button type="button" variant="link" size="sm" onClick={() => setOpen(true)} className="-mr-2 h-auto py-0">
        <EyeIcon data-icon="inline-start" />
        Preview
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-plum max-h-[92dvh] overflow-y-auto border-0 p-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Reveal preview</DialogTitle>
            <DialogDescription>A preview with your current message. This doesn't send anything.</DialogDescription>
          </DialogHeader>
          {open && (
            <GiftReveal id="checkout-preview" preview revealStyle={values.revealStyle} recipientName={values.recipientName || recipientFallback} fromLabel={values.anonymous ? "Someone sent you something" : `From ${from || "you"}`}>
              <div className="bg-background m-3 flex flex-col overflow-hidden rounded-2xl">
                <Img src={line.image} alt="" className="aspect-[4/3] w-full" sizes="480px" />
                <div className="flex flex-col gap-3 p-6">
                  <p className="eyebrow text-brand-text">{line.title}</p>
                  {values.message ? <p className="font-display text-xl leading-snug italic">“{values.message}”</p> : <p className="text-muted-foreground text-sm">Your message will appear here.</p>}
                  <p className="text-muted-foreground text-sm">— {values.anonymous ? "Sent anonymously" : from || "you"}</p>
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

/** "Signed as" is optional: it falls back to the buyer's first name. */
const senderName = (v: Values) => v.senderDisplayName?.trim() || v.buyerName?.trim().split(" ")[0] || ""

function toDraft(v: Values, intent: CheckoutIntent): CheckoutDraft {
  const isGift = v.purchaseType === "gift"
  const wishlist = intent.source === "wishlist"
  const addressKnown = wishlist || !isGift || v.addressMode === "known"
  const zone = ZONES.find((z) => z.id === v.zoneId)
  const contact = v.recipientContact ?? ""
  const contactIsPhone = isPhone(contact)
  let revealAt: string | null = null
  if (isGift && !wishlist && v.revealScheduled && v.revealDate) {
    const [h, m] = (v.revealTime || "09:00").split(":").map(Number)
    revealAt = zonedTimeToUtc(v.revealDate, h, m, LAUNCH_TIMEZONE).toISOString()
  }
  // A self purchase takes the buyer's name and phone from the delivery address; a gift takes
  // the address name (and, when given as their contact, the rider phone) from the recipient.
  const addrName = isGift ? v.recipientName : v.addrName
  const addrPhone = isGift && contactIsPhone ? contact : v.addrPhone
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
    buyer: isGift ? { name: v.buyerName, email: v.buyerEmail, phone: v.buyerPhone || undefined } : { name: v.addrName, email: v.buyerEmail, phone: v.addrPhone || undefined },
    zoneId: v.zoneId as ZoneId,
    requestedDate: v.requestedDate,
    addressKnown,
    address: addressKnown && !wishlist && zone ? { recipientName: addrName, phone: addrPhone, line1: v.addrLine1, line2: v.addrLine2 || undefined, landmark: v.addrLandmark || undefined, area: v.addrArea, city: zone.city, state: zone.state, zoneId: zone.id, instructions: v.addrInstructions || undefined } : undefined,
    recipient: isGift && !wishlist ? { name: v.recipientName, email: contact && !contactIsPhone ? contact : undefined, phone: contactIsPhone ? contact : undefined } : undefined,
    gift: isGift ? { senderDisplayName: senderName(v), anonymous: v.anonymous, message: v.message, revealStyle: v.revealStyle, revealAt, timezone: LAUNCH_TIMEZONE } : undefined,
    personalisationConfirmed: v.personalisationConfirmed,
    marketingOptIn: v.marketingOptIn,
  }
}

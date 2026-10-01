import { useState } from "react"
import { Link, useParams } from "react-router"
import type { CaseKind, RefundReason } from "@domain/index.ts"
import { CLAIM_STATUS_LABEL, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, REFUND_STATUS_LABEL, REVEAL_STATUS_LABEL, zoneById, LAUNCH_TIMEZONE, zonedTimeToUtc, toDateOnly } from "@domain/index.ts"
import type { OrderDetail } from "@/api"
import { Container, ErrorState, Img, KeyValue, PageSkeleton, StatusBadge } from "@/components/common"
import { OrderProgress, PriceBreakdownList } from "@/components/commerce"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { GiftIcon, EyeIcon, PenIcon, ChatRoundDotsIcon, DangerTriangleIcon, HeartIcon, ArrowLeftIcon, MapPointIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatDate, formatDateTime, formatMoney, formatWindow, relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function OrderDetailPage() {
  const { id = "" } = useParams()
  useDocumentMeta({ title: "Order", noindex: true })
  const q = useApiQuery(qk.order(id), (api) => api.getOrder(id), { refetchInterval: 20_000 })
  if (q.error) return <Container className="py-16"><ErrorState error={q.error} title="We couldn't open this order" /></Container>
  if (!q.data) return <PageSkeleton />
  return <Detail d={q.data} />
}

function Detail({ d }: { d: OrderDetail }) {
  const o = d.order
  const g = d.gift
  return (
    <Container className="flex flex-col gap-8 py-10">
      <Link to="/account" className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm"><ArrowLeftIcon className="size-4" />All orders</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground tabular text-sm">{o.reference} · placed {formatDateTime(o.createdAt)}</p>
          <h1 className="font-display mt-1 text-4xl font-medium">{g ? `Gift for ${g.recipientName}` : "Your order"}</h1>
          {d.eventTitle && <p className="text-muted-foreground mt-1">From the wishlist for {d.eventTitle}</p>}
        </div>
        <StatusBadge tone={ORDER_STATUS_TONE[o.status]} className="w-fit text-sm">{ORDER_STATUS_LABEL[o.status]}</StatusBadge>
      </div>

      <RevisedQuote d={d} />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="bg-card shadow-border flex flex-col gap-5 rounded-3xl p-6">
            <h2 className="font-semibold">Delivery</h2>
            <OrderProgress status={o.status} purchaseType={o.purchaseType} />
            <dl className="flex flex-col gap-2">
              <KeyValue label="Requested for">{formatDate(o.delivery.requestedDate)}</KeyValue>
              <KeyValue label={o.delivery.windowKind === "confirmed" ? "Confirmed window" : "Estimated window"}>{formatWindow(o.delivery.windowStart, o.delivery.windowEnd)}</KeyValue>
              <KeyValue label="Delivered by">{o.delivery.responsibleParty === "courier" ? "Courier partner" : `${d.vendor.name}'s riders`}</KeyValue>
              {d.addressSummary && <KeyValue label="To"><span className="flex items-center gap-1"><MapPointIcon className="size-4" />{d.addressSummary}</span></KeyValue>}
            </dl>
            {o.status === "delivery_issue" && (
              <Alert className="bg-warning-soft border-0">
                <DangerTriangleIcon />
                <AlertTitle>Delivery needs attention</AlertTitle>
                <AlertDescription>{o.timeline.at(-1)?.note ?? "The vendor will contact you with a revised time."}</AlertDescription>
              </Alert>
            )}
          </section>

          {g && <GiftCard d={d} />}

          <section className="bg-card shadow-border flex flex-col gap-4 rounded-3xl p-6">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="relative flex flex-col gap-5 border-l pl-6">
              {[...o.timeline].reverse().map((t, i) => (
                <li key={i} className="relative">
                  <span className={`absolute top-1.5 -left-[1.82rem] size-2.5 rounded-full ${i === 0 ? "bg-brand" : "bg-muted-foreground/40"}`} />
                  <p className="text-sm font-medium">{t.label}</p>
                  {t.note && <p className="text-muted-foreground text-sm">{t.note}</p>}
                  <p className="text-muted-foreground text-xs">{formatDateTime(t.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="bg-card shadow-border flex flex-col gap-4 rounded-3xl p-6">
            <h2 className="font-semibold">{d.vendor.name}</h2>
            <ul className="flex flex-col gap-3">
              {o.lines.map((l) => (
                <li key={l.variantId} className="flex gap-3">
                  <Img src={l.image} alt="" className="size-14 rounded-xl" sizes="56px" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{l.title}</p>
                    <p className="text-muted-foreground">{l.variantName} · {l.quantity}</p>
                    {l.personalisationText && <p className="text-muted-foreground truncate italic">“{l.personalisationText}”</p>}
                  </div>
                </li>
              ))}
            </ul>
            <PriceBreakdownList pricing={o.pricing} compact />
          </section>

          {d.refunds.length > 0 && (
            <section className="bg-card shadow-border flex flex-col gap-3 rounded-3xl p-6">
              <h2 className="font-semibold">Refunds</h2>
              {d.refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{REFUND_STATUS_LABEL[r.status]}</span>
                  <span className="tabular font-medium">{formatMoney(r.amount)}</span>
                </div>
              ))}
              <p className="text-muted-foreground text-xs">Banks usually show completed refunds within 3–10 working days.</p>
            </section>
          )}

          <Actions d={d} />
        </aside>
      </div>
    </Container>
  )
}

function GiftCard({ d }: { d: OrderDetail }) {
  const g = d.gift!
  return (
    <section className="bg-card shadow-border flex flex-col gap-4 rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><GiftIcon className="text-brand-text size-5" />The reveal</h2>
        <StatusBadge tone={g.revealStatus === "opened" ? "success" : "neutral"}>{REVEAL_STATUS_LABEL[g.revealStatus]}</StatusBadge>
      </div>
      <dl className="flex flex-col gap-2">
        <KeyValue label="To">{g.recipientName} · {g.contactMasked}</KeyValue>
        <KeyValue label="From">{g.anonymous ? "Anonymous" : g.senderDisplayName}</KeyValue>
        <KeyValue label={g.revealStatus === "scheduled" ? "Sends" : "Sent"}>{formatDateTime(g.revealAt)} WAT</KeyValue>
        {g.claimStatus !== "not_required" && <KeyValue label="Address">{CLAIM_STATUS_LABEL[g.claimStatus]}</KeyValue>}
        {g.claimDeadline && g.claimStatus === "pending" && <KeyValue label="Claim window ends">{relativeTime(g.claimDeadline)}</KeyValue>}
        {g.openedAt && <KeyValue label="Opened">{formatDateTime(g.openedAt)}</KeyValue>}
      </dl>
      {g.message && <p className="font-display bg-muted/60 rounded-2xl p-4 text-lg italic">“{g.message}”</p>}
      {g.thankYouNote && (
        <div className="bg-brand-soft flex gap-3 rounded-2xl p-4">
          <HeartIcon className="text-brand-text mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-medium">{g.recipientName} said thank you</p>
            <p className="text-sm">{g.thankYouNote}</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {g.previewToken && <Button variant="outline" asChild><Link to={`/preview/gift/${g.previewToken}`}><EyeIcon data-icon="inline-start" />Preview reveal</Link></Button>}
        {g.editable && <EditGiftDialog d={d} />}
      </div>
      {!g.editable && g.revealStatus !== "opened" && <p className="text-muted-foreground text-xs">The reveal has been sent, so the message can no longer change.</p>}
    </section>
  )
}

function EditGiftDialog({ d }: { d: OrderDetail }) {
  const g = d.gift!
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState(g.message)
  const [sender, setSender] = useState(g.senderDisplayName)
  const lagos = new Date(g.revealAt)
  const [date, setDate] = useState(toDateOnly(lagos, LAUNCH_TIMEZONE))
  const [time, setTime] = useState(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LAUNCH_TIMEZONE, hourCycle: "h23" }).format(lagos))
  const save = useApiMutation((api) => {
    const [h, m] = time.split(":").map(Number)
    return api.updateGift(d.order.id, { message, senderDisplayName: g.anonymous ? undefined : sender, revealAt: zonedTimeToUtc(date, h, m, LAUNCH_TIMEZONE).toISOString() })
  }, { invalidate: [qk.order(d.order.id)], success: "Gift updated", onSuccess: () => setOpen(false) })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><PenIcon data-icon="inline-start" />Edit message or time</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit the reveal</DialogTitle>
          <DialogDescription>You can change this until the reveal is sent. The item and recipient can't change here.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!g.anonymous && <Field><FieldLabel htmlFor="e-from">From</FieldLabel><Input id="e-from" value={sender} onChange={(e) => setSender(e.target.value)} /></Field>}
          <Field><FieldLabel htmlFor="e-msg">Message</FieldLabel><Textarea id="e-msg" rows={4} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="e-date">Date</FieldLabel><Input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="e-time">Time (WAT)</FieldLabel><Input id="e-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevisedQuote({ d }: { d: OrderDetail }) {
  const respond = useApiMutation((api, approve: boolean) => api.respondToRevisedQuote(d.order.id, approve), { invalidate: [qk.order(d.order.id), qk.myOrders], success: (_, a) => (a ? "Approved — the vendor will be notified" : "Order cancelled and refunded") })
  if (d.gift?.claimStatus !== "needs_sender_approval") return null
  return (
    <Alert className="bg-warning-soft border-0">
      <DangerTriangleIcon />
      <AlertTitle>{d.gift.recipientName}'s address is outside {zoneById(d.order.delivery.zoneId)?.name}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>Approve any extra delivery charge to continue, or cancel for a full refund. {d.gift.recipientName} is never charged.</span>
        <span className="flex gap-2">
          <Button size="sm" onClick={() => respond.mutate(true)} disabled={respond.isPending}>Approve revised delivery</Button>
          <Button size="sm" variant="outline" onClick={() => respond.mutate(false)} disabled={respond.isPending}>Cancel and refund</Button>
        </span>
      </AlertDescription>
    </Alert>
  )
}

function Actions({ d }: { d: OrderDetail }) {
  const id = d.order.id
  const inv = [qk.order(id), qk.myOrders]
  const cancel = useApiMutation((api) => api.cancelOrder(id, "Cancelled by the buyer before the vendor accepted."), { invalidate: inv, success: "Order cancelled. A full refund is on its way." })
  const [kind, setKind] = useState<CaseKind>("damaged")
  const [desc, setDesc] = useState("")
  const [open, setOpen] = useState(false)
  const openCase = useApiMutation((api) => api.openCase({ orderId: id, kind, description: desc }), { invalidate: inv, success: "Case opened — we'll reply within one working day", onSuccess: () => { setOpen(false); setDesc("") } })
  const refund = useApiMutation((api, reason: RefundReason) => api.requestRefund(id, reason, desc), { invalidate: inv, success: "Refund requested" })
  return (
    <section className="bg-card shadow-border flex flex-col gap-3 rounded-3xl p-6">
      <h2 className="font-semibold">Need help?</h2>
      {d.cases.map((c) => (
        <p key={c.id} className="bg-muted rounded-xl p-3 text-sm"><span className="font-medium">Case {c.id.slice(-6).toUpperCase()}</span> · {c.status.replace("_", " ")}</p>
      ))}
      {d.canCancel && (
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive">Cancel order</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
              <AlertDialogDescription>The vendor hasn't started yet, so you'll get a full refund.{d.gift ? " If the reveal hasn't been sent, it won't be." : ""}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep order</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => cancel.mutate()}>Cancel order</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline"><ChatRoundDotsIcon data-icon="inline-start" />Report a problem</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What went wrong?</DialogTitle>
            <DialogDescription>Our support team links this to your order and the vendor, and tracks it to a resolution.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="case-kind">Problem</FieldLabel>
              <Select value={kind} onValueChange={(v) => setKind(v as CaseKind)}>
                <SelectTrigger id="case-kind"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="damaged">Arrived damaged</SelectItem>
                  <SelectItem value="missing">Didn't arrive / missing items</SelectItem>
                  <SelectItem value="late">Arrived late</SelectItem>
                  <SelectItem value="wrong_item">Wrong item</SelectItem>
                  <SelectItem value="personalisation_error">Personalisation mistake</SelectItem>
                  <SelectItem value="general">Something else</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field><FieldLabel htmlFor="case-desc">Tell us what happened</FieldLabel><Textarea id="case-desc" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          </FieldGroup>
          <DialogFooter>
            {d.canRequestRefund && <Button variant="outline" disabled={!desc.trim() || refund.isPending} onClick={() => refund.mutate(kind === "damaged" ? "damaged" : kind === "missing" ? "missing" : kind === "personalisation_error" ? "personalisation_error" : "other")}>Request a refund</Button>}
            <Button disabled={desc.trim().length < 5 || openCase.isPending} onClick={() => openCase.mutate()}>Open support case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-muted-foreground text-xs">{d.vendor.returnPolicy}</p>
    </section>
  )
}

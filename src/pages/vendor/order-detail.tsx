import { useState } from "react"
import { Link, useParams } from "react-router"
import type { VendorOrderAction } from "@/api"
import { ErrorState, Img, KeyValue, PageSkeleton } from "@/components/common"
import { OrderProgress } from "@/components/commerce"
import { WsHeader, Panel, OrderStatusBadge, SourceBadge } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeftIcon, ClockCircleIcon, LockKeyholeIcon, PenIcon, MapPointIcon, GiftIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatDate, formatDateTime, formatMoney, formatWindow, relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const NEXT: Partial<Record<string, { action: VendorOrderAction; label: string }>> = {
  awaiting_vendor_acceptance: { action: "accept", label: "Accept order" },
  accepted: { action: "start_preparing", label: "Start preparing" },
  preparing: { action: "mark_ready", label: "Mark ready for dispatch" },
  ready_for_dispatch: { action: "dispatch", label: "Mark dispatched" },
  dispatched: { action: "deliver", label: "Mark delivered" },
  delivery_issue: { action: "dispatch", label: "Re-attempt delivery" },
}

export default function VendorOrderDetail() {
  const { id = "" } = useParams()
  useDocumentMeta({ title: "Order", noindex: true })
  const q = useApiQuery(qk.vendorOrder(id), (api) => api.getVendorOrder(id))
  const inv = [qk.vendorOrder(id), ["vendor-orders"], qk.vendorDashboard]
  const [dialog, setDialog] = useState<null | "decline" | "report_issue" | "dispatch">(null)
  const [note, setNote] = useState("")
  const act = useApiMutation((api, v: { action: VendorOrderAction; note?: string }) => api.vendorOrderAction(id, v.action, v.note), { invalidate: inv, success: (_, v) => ({ accept: "Order accepted — delivery confirmed to the customer", decline: "Order declined. The customer is refunded in full.", start_preparing: "Marked as preparing", mark_ready: "Ready for dispatch", dispatch: "Marked dispatched — the customer has been told", deliver: "Marked delivered", report_issue: "Issue reported — support and the customer are notified" })[v.action], onSuccess: () => { setDialog(null); setNote("") } })
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  const o = q.data.order
  const next = NEXT[o.status]
  const canDecline = o.status === "awaiting_vendor_acceptance"
  const canIssue = ["accepted", "preparing", "ready_for_dispatch", "dispatched"].includes(o.status)
  return (
    <>
      <Link to="/vendor/orders" className="text-muted-foreground hover:text-foreground mb-4 flex w-fit items-center gap-1.5 text-sm"><ArrowLeftIcon className="size-4" />Orders</Link>
      <WsHeader title={o.reference} description={<>Placed {formatDateTime(o.createdAt)} · {q.data.customerLabel}</>} actions={<OrderStatusBadge status={o.status} />} />
      {o.status === "awaiting_vendor_acceptance" && o.acceptBy && (
        <Alert className="bg-brand-soft mb-6 border-0">
          <ClockCircleIcon />
          <AlertTitle>Accept {relativeTime(o.acceptBy)}</AlertTitle>
          <AlertDescription>If you can't fulfil it, decline now so the customer is refunded straight away. Substitutions aren't allowed without the customer's agreement.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Items to prepare" action={<SourceBadge source={o.source} purchaseType={o.purchaseType} />}>
            <ul className="flex flex-col gap-4">
              {o.lines.map((l) => (
                <li key={l.variantId} className="flex gap-4">
                  <Img src={l.image} alt="" className="size-20 rounded-xl" sizes="80px" />
                  <div className="flex-1 text-sm">
                    <p className="text-base font-medium">{l.quantity} × {l.title}</p>
                    <p className="text-muted-foreground">{l.variantName}</p>
                    {l.wrappingName && <p className="mt-1">Wrapping: {l.wrappingName}</p>}
                    {l.personalisationText && <p className="bg-muted mt-2 flex items-start gap-2 rounded-lg p-2"><PenIcon className="mt-0.5 size-4 shrink-0" /><span className="font-display text-base italic">“{l.personalisationText}”</span></p>}
                  </div>
                </li>
              ))}
            </ul>
            {q.data.isGift && <p className="text-muted-foreground flex items-center gap-2 text-sm"><GiftIcon className="text-brand-text size-4" />This is a gift — don't include receipts or prices in the package.{q.data.revealHidden ? " The recipient hasn't seen the reveal yet, so keep it discreet." : ""}</p>}
          </Panel>
          <Panel title="Delivery">
            <OrderProgress status={o.status} purchaseType={o.purchaseType} />
            <dl className="flex flex-col gap-2">
              <KeyValue label="Date">{formatDate(o.delivery.requestedDate)}</KeyValue>
              <KeyValue label="Window">{formatWindow(o.delivery.windowStart, o.delivery.windowEnd)} ({o.delivery.windowKind})</KeyValue>
              <KeyValue label="Delivered by">{o.delivery.responsibleParty === "courier" ? "Courier partner" : "Your riders"}</KeyValue>
              {o.delivery.attempts > 0 && <KeyValue label="Attempts">{o.delivery.attempts}</KeyValue>}
            </dl>
            {q.data.deliveryAddress ? (
              <div className="bg-muted flex gap-3 rounded-xl p-4 text-sm">
                <MapPointIcon className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">{q.data.deliveryAddress.recipientName} · {q.data.deliveryAddress.phone}</p>
                  <p>{q.data.deliveryAddress.line1}{q.data.deliveryAddress.line2 ? `, ${q.data.deliveryAddress.line2}` : ""}, {q.data.deliveryAddress.area}, {q.data.deliveryAddress.city}</p>
                  {q.data.deliveryAddress.landmark && <p className="text-muted-foreground">Landmark: {q.data.deliveryAddress.landmark}</p>}
                  {q.data.deliveryAddress.instructions && <p className="text-muted-foreground">Note: {q.data.deliveryAddress.instructions}</p>}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 text-sm"><LockKeyholeIcon className="size-4" />The full address is shown once you accept the order.</p>
            )}
          </Panel>
          <Panel title="History">
            <ol className="flex flex-col gap-3 text-sm">{[...o.timeline].reverse().map((t, i) => <li key={i}><p className="font-medium">{t.label}</p>{t.note && <p className="text-muted-foreground">{t.note}</p>}<p className="text-muted-foreground text-xs">{formatDateTime(t.at)}</p></li>)}</ol>
          </Panel>
        </div>
        <aside className="flex flex-col gap-6">
          <Panel title="Next step">
            {next ? <Button size="lg" onClick={() => (next.action === "dispatch" ? setDialog("dispatch") : act.mutate({ action: next.action }))} disabled={act.isPending}>{next.label}</Button> : <p className="text-muted-foreground text-sm">Nothing to do on this order.</p>}
            {canDecline && <Button variant="destructive" onClick={() => setDialog("decline")}>I can't fulfil this</Button>}
            {canIssue && <Button variant="outline" onClick={() => setDialog("report_issue")}>Report a delivery problem</Button>}
          </Panel>
          <Panel title="Money">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Customer paid"><span className="tabular">{formatMoney(q.data.settlement.gross)}</span></KeyValue>
              <KeyValue label="Commission"><span className="tabular">−{formatMoney(q.data.settlement.commission)}</span></KeyValue>
              <KeyValue label="You receive" className="border-t pt-2"><span className="tabular text-base">{formatMoney(q.data.settlement.vendorPayable)}</span></KeyValue>
            </dl>
            <p className="text-muted-foreground text-xs">Eligible for payout after delivery and a 7-day dispute window.</p>
          </Panel>
        </aside>
      </div>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "decline" ? "Decline this order?" : dialog === "dispatch" ? "Mark as dispatched" : "Report a delivery problem"}</DialogTitle>
            <DialogDescription>{dialog === "decline" ? "The customer is refunded in full and told kindly. Frequent declines affect your visibility." : dialog === "dispatch" ? "The customer is told it's on its way. Add rider details if you have them." : "Tell us what happened — failed attempt, unreachable recipient, wrong address or damage."}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="v-note">{dialog === "decline" ? "Reason (shared with the customer)" : dialog === "dispatch" ? "Rider note (optional)" : "What happened?"}</FieldLabel>
            <Textarea id="v-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant={dialog === "decline" ? "destructive-solid" : "default"} disabled={act.isPending || (dialog !== "dispatch" && !note.trim())} onClick={() => act.mutate({ action: dialog === "decline" ? "decline" : dialog === "dispatch" ? "dispatch" : "report_issue", note })}>
              {dialog === "decline" ? "Decline and refund" : dialog === "dispatch" ? "Mark dispatched" : "Report problem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

import { Link, useParams } from "react-router"
import { CLAIM_STATUS_LABEL, REFUND_STATUS_LABEL, REVEAL_STATUS_LABEL } from "@domain/index.ts"
import { ErrorState, KeyValue, PageSkeleton } from "@/components/common"
import { OrderProgress, PriceBreakdownList } from "@/components/commerce"
import { WsHeader, Panel, OrderStatusBadge, SourceBadge, ReasonDialog } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatDate, formatDateTime, formatMoney } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

type Action = "cancel_and_refund" | "mark_delivery_issue" | "resolve_delivered" | "extend_claim"

export default function AdminOrderDetail() {
  const { id = "" } = useParams()
  useDocumentMeta({ title: "Order", noindex: true })
  const q = useApiQuery(qk.admin("order", id), (api) => api.getAdminOrder(id))
  const act = useApiMutation((api, v: { action: Action; note: string }) => api.adminOrderAction(id, v.action, v.note), { invalidate: [qk.admin("order", id), ["admin"], qk.ops], success: "Action recorded" })
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  const d = q.data
  const o = d.order
  const actions: { action: Action; label: string; show: boolean; destructive?: boolean; description: string }[] = [
    { action: "extend_claim", label: "Extend claim by 48h", show: d.gift?.claimStatus === "pending", description: "Gives the recipient more time to add an address." },
    { action: "mark_delivery_issue", label: "Mark delivery issue", show: ["accepted", "preparing", "ready_for_dispatch", "dispatched"].includes(o.status), description: "Flags the order and notifies the buyer with next steps." },
    { action: "resolve_delivered", label: "Resolve as delivered", show: ["delivery_issue", "dispatched", "disputed"].includes(o.status), description: "Use only with courier confirmation or a recipient code." },
    { action: "cancel_and_refund", label: "Cancel and refund", show: !["dispatched", "delivered", "cancelled", "declined"].includes(o.status), destructive: true, description: "Cancels the order, restocks, and refunds the buyer in full." },
  ]
  return (
    <>
      <Link to="/admin/orders" className="text-muted-foreground hover:text-foreground mb-4 flex w-fit items-center gap-1.5 text-sm"><ArrowLeftIcon className="size-4" />Orders</Link>
      <WsHeader title={o.reference} description={<>{d.vendor.name} · buyer {d.buyerEmailMasked} · {formatDateTime(o.createdAt)}</>} actions={<OrderStatusBadge status={o.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Fulfilment" action={<SourceBadge source={o.source} purchaseType={o.purchaseType} />}>
            <OrderProgress status={o.status} purchaseType={o.purchaseType} />
            <dl className="flex flex-col gap-2">
              <KeyValue label="Requested">{formatDate(o.delivery.requestedDate)}</KeyValue>
              <KeyValue label="Delivery area">{d.addressSummary ?? "—"}</KeyValue>
              <KeyValue label="Accept by">{o.acceptBy ? formatDateTime(o.acceptBy) : "—"}</KeyValue>
              {d.eventTitle && <KeyValue label="Occasion">{d.eventTitle}</KeyValue>}
            </dl>
          </Panel>
          {d.gift && (
            <Panel title="Gift">
              <dl className="flex flex-col gap-2">
                <KeyValue label="Recipient">{d.gift.recipientName} · {d.gift.contactMasked}</KeyValue>
                <KeyValue label="Sender shown as">{d.gift.anonymous ? "Anonymous (identity held privately)" : d.gift.senderDisplayName}</KeyValue>
                <KeyValue label="Reveal">{REVEAL_STATUS_LABEL[d.gift.revealStatus]} · {formatDateTime(d.gift.revealAt)}</KeyValue>
                <KeyValue label="Claim">{CLAIM_STATUS_LABEL[d.gift.claimStatus]}{d.gift.claimDeadline ? ` · until ${formatDateTime(d.gift.claimDeadline)}` : ""}</KeyValue>
                <KeyValue label="Link issued">{d.gift.tokenIssued ? "Yes (hash stored only)" : "Not yet"}</KeyValue>
              </dl>
            </Panel>
          )}
          <Panel title="Ledger">
            {d.ledger.length === 0 ? <p className="text-muted-foreground text-sm">No financial entries (payment not verified).</p> : (
              <ul className="flex flex-col gap-1.5 text-sm">{d.ledger.map((l) => <li key={l.id} className="flex justify-between gap-3"><span><span className="font-mono text-xs">{l.type}</span> <span className="text-muted-foreground">· {l.memo}</span></span><span className="tabular">{formatMoney(l.amount)}</span></li>)}</ul>
            )}
            <p className="text-muted-foreground text-xs">Append-only. Corrections are compensating entries.</p>
          </Panel>
          <Panel title="Timeline">
            <ol className="flex flex-col gap-3 text-sm">{[...o.timeline].reverse().map((t, i) => <li key={i}><p className="font-medium">{t.label} <span className="text-muted-foreground font-normal">· {t.actor}</span></p>{t.note && <p className="text-muted-foreground">{t.note}</p>}<p className="text-muted-foreground text-xs">{formatDateTime(t.at)}</p></li>)}</ol>
          </Panel>
        </div>
        <aside className="flex flex-col gap-6">
          <Panel title="Support actions">
            {actions.filter((a) => a.show).map((a) => <ReasonDialog key={a.action} trigger={<Button variant={a.destructive ? "destructive" : "outline"}>{a.label}</Button>} title={a.label} description={`${a.description} Your note is saved to the audit log.`} confirmLabel={a.label} destructive={a.destructive} onConfirm={(note) => act.mutate({ action: a.action, note })} />)}
            {!actions.some((a) => a.show) && <p className="text-muted-foreground text-sm">No actions available for this status.</p>}
          </Panel>
          <Panel title="Payment"><PriceBreakdownList pricing={o.pricing} compact /></Panel>
          {d.refunds.length > 0 && <Panel title="Refunds">{d.refunds.map((r) => <p key={r.id} className="flex justify-between text-sm"><span>{REFUND_STATUS_LABEL[r.status]}</span><span className="tabular">{formatMoney(r.amount)}</span></p>)}</Panel>}
          {d.cases.length > 0 && <Panel title="Cases">{d.cases.map((c) => <Link key={c.id} to="/admin/cases" className="text-sm underline underline-offset-4">{c.subject}</Link>)}</Panel>}
        </aside>
      </div>
    </>
  )
}

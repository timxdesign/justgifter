import { Link } from "react-router"
import { REFUND_STATUS_LABEL } from "@domain/index.ts"
import type { RefundAction } from "@/api"
import { ErrorState, PageSkeleton, StatusBadge, EmptyState } from "@/components/common"
import { WsHeader, ReasonDialog } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RestartIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatMoney, relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const NEXT: Record<string, { action: RefundAction; label: string; destructive?: boolean }[]> = {
  requested: [{ action: "approve", label: "Approve" }, { action: "reject", label: "Decline", destructive: true }],
  approved: [{ action: "submit", label: "Send to Paystack" }],
  submitted: [{ action: "mark_completed", label: "Mark completed" }, { action: "mark_failed", label: "Mark failed", destructive: true }],
  failed: [{ action: "submit", label: "Retry" }],
}

export default function AdminRefunds() {
  useDocumentMeta({ title: "Refunds", noindex: true })
  const q = useApiQuery(qk.admin("refunds"), (api) => api.listRefunds())
  const act = useApiMutation((api, v: { id: string; action: RefundAction; note: string }) => api.refundAction(v.id, v.action, v.note), { invalidate: [qk.admin("refunds"), qk.ops], success: "Refund updated" })
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Refunds" description="Requested, approved, sent and completed are separate states. Completion is confirmed by the provider, not assumed." />
      {q.data.length === 0 ? <EmptyState icon={<RestartIcon />} title="No refunds" description="Refunds appear here when requested by buyers, support or the system." /> : (
        <div className="surface overflow-x-auto rounded-2xl">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{q.data.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Link to={`/admin/orders/${r.orderId}`} className="tabular font-medium underline-offset-4 hover:underline">{r.orderReference}</Link><p className="text-muted-foreground text-xs">{relativeTime(r.createdAt)} · by {r.requestedBy}</p></TableCell>
                <TableCell className="text-sm">{r.reason.replace(/_/g, " ")}{r.note && <p className="text-muted-foreground max-w-56 truncate text-xs">{r.note}</p>}</TableCell>
                <TableCell><StatusBadge tone={r.status === "completed" ? "success" : r.status === "failed" || r.status === "rejected" ? "danger" : "progress"}>{REFUND_STATUS_LABEL[r.status]}</StatusBadge></TableCell>
                <TableCell className="tabular text-right">{formatMoney(r.amount)}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-1.5">{NEXT[r.status]?.map((a) => <ReasonDialog key={a.action} required={a.action === "reject"} trigger={<Button size="sm" variant={a.destructive ? "destructive" : "outline"}>{a.label}</Button>} title={`${a.label} — ${formatMoney(r.amount)}`} description="Recorded in the audit log." confirmLabel={a.label} destructive={a.destructive} onConfirm={(note) => act.mutate({ id: r.id, action: a.action, note })} />)}</div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

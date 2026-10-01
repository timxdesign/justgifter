import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { WsHeader, StatCard } from "@/components/workspace"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatDateTime, formatMoney } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminReconciliation() {
  useDocumentMeta({ title: "Reconciliation", noindex: true })
  const q = useApiQuery(qk.admin("recon"), (api) => api.listReconciliation())
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  const unmatched = q.data.filter((r) => r.status !== "matched")
  return (
    <>
      <WsHeader title="Payment reconciliation" description="Provider transactions matched daily against verified payments. Unmatched items are investigated before payouts." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Matched" value={q.data.length - unmatched.length} />
        <StatCard label="Needs investigation" value={unmatched.length} tone={unmatched.length ? "attention" : "default"} />
        <StatCard label="Unmatched value" value={formatMoney(unmatched.reduce((n, r) => n + r.amount, 0))} />
      </div>
      <div className="surface overflow-x-auto rounded-2xl">
        <Table>
          <TableHeader><TableRow><TableHead>Provider reference</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
          <TableBody>{q.data.map((r) => (
            <TableRow key={r.id}>
              <TableCell><span className="font-mono text-xs">{r.providerReference}</span><p className="text-muted-foreground text-xs">{formatDateTime(r.occurredAt)}</p></TableCell>
              <TableCell className="tabular">{r.orderReference ?? "—"}</TableCell>
              <TableCell><StatusBadge tone={r.status === "matched" ? "success" : "danger"}>{r.status.replace("_", " ")}</StatusBadge></TableCell>
              <TableCell className="tabular text-right">{formatMoney(r.amount)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{r.note}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </>
  )
}

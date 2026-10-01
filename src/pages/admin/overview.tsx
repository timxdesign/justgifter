import { ErrorState, PageSkeleton } from "@/components/common"
import { WsHeader, StatCard, Panel } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { ServerSquareIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatMoney, percent } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminOverview() {
  useDocumentMeta({ title: "Operations", noindex: true })
  const o = useApiQuery(qk.ops, (api) => api.getOpsOverview(), { refetchInterval: 30_000 })
  const run = useApiMutation((api) => api.runDueJobs(), { invalidate: [qk.ops, ["admin"]], success: (r) => `Processed ${r.processed} due ${r.processed === 1 ? "job" : "jobs"}` })
  if (o.error) return <ErrorState error={o.error} />
  if (!o.data) return <PageSkeleton />
  const d = o.data
  return (
    <>
      <WsHeader title="Operations" description="Live exceptions first. Every number links to the queue that resolves it." actions={<Button variant="outline" onClick={() => run.mutate()}><ServerSquareIcon data-icon="inline-start" />Run due jobs</Button>} />
      <h2 className="mb-3 text-sm font-semibold">Needs action</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overdue acceptance" value={d.overdueAcceptance} tone={d.overdueAcceptance ? "attention" : "default"} hint={`${d.paidAwaitingAcceptance} paid, awaiting vendor`} to="/admin/orders?status=exceptions" />
        <StatCard label="Unresolved claims" value={d.unresolvedClaims} hint="Address-unknown gifts" to="/admin/orders?status=exceptions" />
        <StatCard label="Refunds in progress" value={d.stuckRefunds} tone={d.stuckRefunds ? "attention" : "default"} to="/admin/refunds" />
        <StatCard label="Open support cases" value={d.openCases} to="/admin/cases" />
        <StatCard label="Unmatched payments" value={d.unmatchedPayments} tone={d.unmatchedPayments ? "attention" : "default"} to="/admin/reconciliation" />
        <StatCard label="Hold conflicts" value={d.holdConflicts} hint="Late payments, no oversell" to="/admin/cases" />
        <StatCard label="Content reports" value={d.openReports} to="/admin/reports" />
        <StatCard label="Failed jobs" value={d.failedJobs} tone={d.failedJobs ? "attention" : "default"} to="/admin/jobs" />
      </div>
      <h2 className="mt-8 mb-3 text-sm font-semibold">Review queues</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Vendor applications" value={d.pendingVendors} to="/admin/vendors" />
        <StatCard label="Listings to moderate" value={d.pendingListings} to="/admin/listings" />
      </div>
      <h2 className="mt-8 mb-3 text-sm font-semibold">Last 7 days</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Verified paid orders" value={d.orders7d} />
        <StatCard label="Gross order value" value={formatMoney(d.gmv7d)} />
        <StatCard label="Successful gift rate" value={percent(d.successfulGiftRate)} hint="Delivered & not refunded ÷ completed gift orders" />
      </div>
      <Panel className="mt-8"><p className="text-muted-foreground text-sm">Support views mask addresses and contacts by default; opening full records is audited. Financial adjustments above the approval threshold need an administrator.</p></Panel>
    </>
  )
}

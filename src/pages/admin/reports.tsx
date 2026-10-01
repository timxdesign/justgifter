import { ErrorState, PageSkeleton, StatusBadge, EmptyState } from "@/components/common"
import { WsHeader, Panel, ReasonDialog } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { FlagIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminReports() {
  useDocumentMeta({ title: "Content reports", noindex: true })
  const q = useApiQuery(qk.admin("reports"), (api) => api.listReports())
  const act = useApiMutation((api, v: { id: string; decision: "actioned" | "dismissed"; note: string }) => api.actionReport(v.id, v.decision, v.note), { invalidate: [qk.admin("reports"), qk.ops], success: "Decision recorded" })
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Content reports" description="Abuse, harassment, impersonation and prohibited items. Reporters stay anonymous; decisions are recorded for appeals." />
      {q.data.length === 0 ? <EmptyState icon={<FlagIcon />} title="No reports" description="Reports from recipients, guests and customers appear here." /> : (
        <div className="flex flex-col gap-3">
          {q.data.map((r) => (
            <Panel key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium capitalize">{r.kind.replace(/_/g, " ")}</p><p className="text-muted-foreground text-sm">{r.targetType} {r.targetId.slice(-8)} · {relativeTime(r.createdAt)}</p></div>
                <StatusBadge tone={r.status === "open" ? "warning" : r.status === "actioned" ? "success" : "neutral"}>{r.status}</StatusBadge>
              </div>
              <p className="text-sm">{r.details || "No details given."}</p>
              {r.decision && <p className="text-muted-foreground text-sm">Decision: {r.decision}</p>}
              {r.status === "open" && (
                <div className="flex gap-2">
                  <ReasonDialog trigger={<Button size="sm">Take action</Button>} title="Take action" description={r.targetType === "gift" ? "Stops further messages from this gift to the recipient." : r.targetType === "product" ? "Removes the listing from sale." : "Records the action taken."} confirmLabel="Take action" onConfirm={(note) => act.mutate({ id: r.id, decision: "actioned", note })} />
                  <ReasonDialog trigger={<Button size="sm" variant="outline">Dismiss</Button>} title="Dismiss report" description="Explain why no action is needed." confirmLabel="Dismiss" onConfirm={(note) => act.mutate({ id: r.id, decision: "dismissed", note })} />
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  )
}

import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { WsHeader } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatDateTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminJobs() {
  useDocumentMeta({ title: "Scheduled jobs", noindex: true })
  const q = useApiQuery(qk.admin("jobs"), (api) => api.listJobs(), { refetchInterval: 15_000 })
  const retry = useApiMutation((api, id: string) => api.retryJob(id), { invalidate: [qk.admin("jobs"), qk.ops], success: "Job re-queued" })
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Scheduled jobs" description="Reveals, claim reminders and expiry, acceptance timeouts and retries. Every job has an idempotency key, so retries never duplicate messages or refunds." />
      <div className="surface overflow-x-auto rounded-2xl">
        <Table>
          <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Runs</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
          <TableBody>{q.data.map((j) => (
            <TableRow key={j.id}>
              <TableCell><p className="font-medium">{j.kind.replace(/_/g, " ")}</p><p className="text-muted-foreground font-mono text-xs">{j.idempotencyKey}</p>{j.lastError && <p className="text-destructive text-xs">{j.lastError}</p>}</TableCell>
              <TableCell className="text-sm">{formatDateTime(j.runAt)}</TableCell>
              <TableCell><StatusBadge tone={j.status === "failed" ? "danger" : j.status === "done" ? "success" : "progress"}>{j.status}</StatusBadge></TableCell>
              <TableCell className="tabular">{j.attempts}</TableCell>
              <TableCell className="text-right">{j.status === "failed" && <Button size="sm" variant="outline" onClick={() => retry.mutate(j.id)}>Retry</Button>}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </>
  )
}

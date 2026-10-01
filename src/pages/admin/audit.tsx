import { ErrorState, PageSkeleton } from "@/components/common"
import { WsHeader } from "@/components/workspace"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatDateTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminAudit() {
  useDocumentMeta({ title: "Audit log", noindex: true })
  const q = useApiQuery(qk.admin("audit"), (api) => api.listAuditLog())
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Audit log" description="Privileged actions, access denials, payout changes, moderation and order amendments. Append-only." />
      <div className="surface overflow-x-auto rounded-2xl">
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
          <TableBody>{q.data.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="text-sm whitespace-nowrap">{formatDateTime(a.at)}</TableCell>
              <TableCell className="text-sm">{a.actor}</TableCell>
              <TableCell><span className={`font-mono text-xs ${a.action === "access_denied" ? "text-destructive" : ""}`}>{a.action}</span></TableCell>
              <TableCell className="text-muted-foreground text-xs">{a.targetType} · {a.targetId.slice(-10)}</TableCell>
              <TableCell className="text-muted-foreground max-w-72 truncate text-sm" title={a.detail}>{a.detail}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </>
  )
}

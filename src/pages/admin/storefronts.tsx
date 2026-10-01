import { Link } from "react-router"
import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { WsHeader, ReasonDialog } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminStorefronts() {
  useDocumentMeta({ title: "Storefronts", noindex: true })
  const q = useApiQuery(qk.admin("storefronts"), (api) => api.listStorefrontsForModeration())
  const act = useApiMutation((api, v: { id: string; action: "unpublish" | "restore"; reason: string }) => api.setStorefrontModeration(v.id, v.action, v.reason), { invalidate: [qk.admin("storefronts")], success: "Storefront updated" })
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Storefronts" description="Unpublishing stops new orders through the link. Existing orders keep full tracking and support." />
      <div className="surface overflow-hidden rounded-2xl">
        <Table>
          <TableHeader><TableRow><TableHead>Store</TableHead><TableHead>Link</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>{q.data.map((s) => (
            <TableRow key={s.id}>
              <TableCell><p className="font-medium">{s.vendorName}</p><p className="text-muted-foreground text-xs">{s.headline}</p></TableCell>
              <TableCell><Link to={`/stores/${s.slug}`} className="text-sm underline underline-offset-4">/stores/{s.slug}</Link>{s.slugHistory.length > 0 && <p className="text-muted-foreground text-xs">redirects from {s.slugHistory.join(", ")}</p>}</TableCell>
              <TableCell><StatusBadge tone={s.status === "published" ? "success" : s.status === "paused" ? "warning" : "neutral"}>{s.status}</StatusBadge>{s.vendorStatus === "suspended" && <StatusBadge tone="danger" className="ml-1">vendor suspended</StatusBadge>}</TableCell>
              <TableCell className="text-right">{s.status === "published"
                ? <ReasonDialog trigger={<Button size="sm" variant="destructive">Unpublish</Button>} title={`Unpublish ${s.vendorName}?`} description="New orders through the store link stop. Recorded in the audit log and sent to the vendor." confirmLabel="Unpublish" destructive onConfirm={(reason) => act.mutate({ id: s.id, action: "unpublish", reason })} />
                : <ReasonDialog trigger={<Button size="sm" variant="outline">Restore</Button>} title={`Restore ${s.vendorName}?`} description="The store link starts taking orders again." confirmLabel="Restore" onConfirm={(reason) => act.mutate({ id: s.id, action: "restore", reason })} />}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </>
  )
}

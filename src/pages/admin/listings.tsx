import { useState } from "react"
import { categoryName } from "@domain/index.ts"
import { ErrorState, PageSkeleton, EmptyState, Img } from "@/components/common"
import { WsHeader, Panel } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircleIcon, DangerTriangleIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatMoney } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminListings() {
  useDocumentMeta({ title: "Listing moderation", noindex: true })
  const q = useApiQuery(qk.admin("listings"), (api) => api.listModerationQueue())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const mod = useApiMutation((api, v: { id: string; decision: "approve" | "reject" }) => api.moderateListing(v.id, v.decision, notes[v.id] ?? ""), { invalidate: [qk.admin("listings"), qk.ops], success: (_, v) => (v.decision === "approve" ? "Listing approved and live" : "Sent back to the vendor") })
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Listing moderation" description="New listings and material changes. Check for prohibited items, medical claims, counterfeits and misleading descriptions." />
      {q.data.length === 0 ? <EmptyState icon={<CheckCircleIcon />} title="Queue is clear" description="New and changed listings will appear here." /> : (
        <div className="flex flex-col gap-4">
          {q.data.map((p) => (
            <Panel key={p.id}>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex gap-2">{p.images.slice(0, 3).map((src) => <Img key={src.slice(0, 60)} src={src} alt="" className="size-24 rounded-xl" sizes="96px" />)}</div>
                <div className="flex-1 text-sm">
                  <p className="text-base font-medium">{p.title}</p>
                  <p className="text-muted-foreground">{p.vendorName} · {categoryName(p.category)} · {p.variants.map((v) => `${v.name} ${formatMoney(v.price)}`).join(", ")}</p>
                  <p className="mt-2">{p.description}</p>
                </div>
              </div>
              {p.moderationNote && <Alert className="bg-warning-soft border-0"><DangerTriangleIcon /><AlertDescription>{p.moderationNote}</AlertDescription></Alert>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input aria-label={`Note for ${p.title}`} placeholder="Note to vendor (required to reject)" value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
                <Button variant="destructive" onClick={() => mod.mutate({ id: p.id, decision: "reject" })}>Request changes</Button>
                <Button onClick={() => mod.mutate({ id: p.id, decision: "approve" })}>Approve</Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  )
}

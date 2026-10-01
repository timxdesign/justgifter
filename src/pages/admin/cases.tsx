import { useState } from "react"
import { Link } from "react-router"
import type { SupportCase } from "@domain/index.ts"
import { ErrorState, PageSkeleton, StatusBadge, EmptyState } from "@/components/common"
import { WsHeader } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ChatRoundDotsIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const TONE = { open: "warning", investigating: "progress", awaiting_customer: "neutral", resolved: "success" } as const

export default function AdminCases() {
  useDocumentMeta({ title: "Support cases", noindex: true })
  const q = useApiQuery(qk.admin("cases"), (api) => api.listCases())
  const [open, setOpen] = useState<(SupportCase & { orderReference: string | null }) | null>(null)
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Support cases" description="Each case links the order, vendor and evidence, and tracks to a recorded resolution." />
      {q.data.length === 0 ? <EmptyState icon={<ChatRoundDotsIcon />} title="No cases" description="Cases opened by buyers, recipients, vendors or the system appear here." /> : (
        <ul className="flex flex-col gap-2">
          {q.data.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpen(c)} className="surface-interactive flex w-full items-center gap-4 rounded-2xl p-4 text-left">
                <div className="min-w-0 flex-1"><p className="font-medium">{c.subject}</p><p className="text-muted-foreground text-sm">{c.kind.replace(/_/g, " ")} · {c.orderReference ?? "no order"} · opened by {c.openedBy} {relativeTime(c.createdAt)}{c.owner ? ` · ${c.owner}` : ""}</p></div>
                <StatusBadge tone={TONE[c.status]}>{c.status.replace("_", " ")}</StatusBadge>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <CaseSheet c={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function CaseSheet({ c, onClose }: { c: SupportCase & { orderReference: string | null }; onClose: () => void }) {
  const [status, setStatus] = useState(c.status)
  const [owner, setOwner] = useState(c.owner ?? "")
  const [resolution, setResolution] = useState(c.resolution ?? "")
  const save = useApiMutation((api) => api.updateCase(c.id, { status, owner: owner || undefined, resolution: resolution || undefined }), { invalidate: [qk.admin("cases"), qk.ops], success: "Case updated", onSuccess: onClose })
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{c.subject}</SheetTitle><SheetDescription>{c.kind.replace(/_/g, " ")} · {c.orderReference && <Link to={`/admin/orders/${c.orderId}`} className="underline">{c.orderReference}</Link>}</SheetDescription></SheetHeader>
        <div className="flex flex-col gap-5 px-4">
          <p className="bg-muted rounded-xl p-4 text-sm">{c.description}</p>
          {c.evidence.length > 0 && <p className="text-muted-foreground text-sm">Evidence: {c.evidence.join(", ")} (private storage, signed access)</p>}
          <FieldGroup>
            <Field><FieldLabel htmlFor="c-status">Status</FieldLabel>
              <Select value={status} onValueChange={(v) => setStatus(v as SupportCase["status"])}><SelectTrigger id="c-status"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="open">Open</SelectItem><SelectItem value="investigating">Investigating</SelectItem><SelectItem value="awaiting_customer">Awaiting customer</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectGroup></SelectContent></Select>
            </Field>
            <Field><FieldLabel htmlFor="c-owner">Owner</FieldLabel><Input id="c-owner" value={owner} onChange={(e) => setOwner(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="c-res">Resolution</FieldLabel><Textarea id="c-res" rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What was agreed — remake, refund amount, or explanation" /></Field>
          </FieldGroup>
        </div>
        <SheetFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save case</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

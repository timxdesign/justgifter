import { useState } from "react"
import { VENDOR_STATUS_LABEL, zoneById, categoryName } from "@domain/index.ts"
import type { AdminVendorRow, ApplicationDocument, VendorDecision } from "@/api"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { EyeIcon, FileTextIcon } from "@/components/icons"
import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { VendorAvatar } from "@/components/commerce"
import { WsHeader } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatShortDate } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const TONE = { submitted: "progress", under_review: "progress", needs_information: "warning", approved: "success", rejected: "danger", suspended: "danger", draft: "neutral" } as const

const ACTIONS: Record<string, { decision: VendorDecision; label: string; destructive?: boolean }[]> = {
  submitted: [{ decision: "start_review", label: "Start review" }],
  under_review: [{ decision: "approve", label: "Approve" }, { decision: "needs_information", label: "Ask for information" }, { decision: "reject", label: "Reject", destructive: true }],
  // Waiting on the applicant. Resume if they replied off-platform (e.g. by email).
  needs_information: [{ decision: "resume_review", label: "Resume review" }, { decision: "reject", label: "Reject", destructive: true }],
  approved: [{ decision: "suspend", label: "Suspend", destructive: true }],
  suspended: [{ decision: "reinstate", label: "Reinstate" }],
}

export default function AdminVendors() {
  useDocumentMeta({ title: "Vendor review", noindex: true })
  const rows = useApiQuery(qk.admin("vendors"), (api) => api.listVendorsForReview())
  const [open, setOpen] = useState<AdminVendorRow | null>(null)
  if (rows.error) return <ErrorState error={rows.error} />
  if (!rows.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Vendor review" description="Registration creates an application, not permission to sell. Decisions are recorded and sent to the applicant." />
      <ul className="flex flex-col gap-2">
        {rows.data.map((r) => (
          <li key={r.vendor.id}>
            <button type="button" onClick={() => setOpen(r)} className="surface-interactive flex w-full items-center gap-4 rounded-2xl p-4 text-left">
              <VendorAvatar name={r.vendor.name} initials={r.vendor.logoInitials} color={r.vendor.logoColor} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.vendor.name}</p>
                <p className="text-muted-foreground text-sm">{r.vendor.city} · {r.productCount} live products · {r.openOrders} open orders</p>
              </div>
              <StatusBadge tone={TONE[r.vendor.status]}>{VENDOR_STATUS_LABEL[r.vendor.status]}</StatusBadge>
            </button>
          </li>
        ))}
      </ul>
      {open && <Review row={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function Review({ row, onClose }: { row: AdminVendorRow; onClose: () => void }) {
  const [reason, setReason] = useState("")
  const decide = useApiMutation((api, d: VendorDecision) => api.reviewVendor(row.vendor.id, d, reason), { invalidate: [qk.admin("vendors"), qk.ops], success: "Decision recorded and sent", onSuccess: onClose })
  const v = row.vendor
  const app = row.application
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{v.name}</SheetTitle>
          <SheetDescription>{VENDOR_STATUS_LABEL[v.status]} · applied {formatShortDate(v.joinedAt.slice(0, 10))}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-2">
            <dt className="text-muted-foreground">Owner</dt><dd>{app?.ownerName} · {app?.ownerEmail}</dd>
            <dt className="text-muted-foreground">Business type</dt><dd className="capitalize">{v.businessType.replace("_", " ")}</dd>
            <dt className="text-muted-foreground">Address</dt><dd>{app?.address}</dd>
            <dt className="text-muted-foreground">Zones</dt><dd>{v.zones.map((z) => zoneById(z.zoneId)?.name).join(", ")}</dd>
            <dt className="text-muted-foreground">Categories</dt><dd>{v.categories.map(categoryName).join(", ")}</dd>
            <dt className="text-muted-foreground">Fulfilment</dt><dd>{v.fulfilment === "courier" ? "Courier" : "Own riders"}</dd>
            <dt className="text-muted-foreground">Payout account</dt><dd>{app?.payoutBank} {app?.payoutAccountMasked}</dd>
            <dt className="text-muted-foreground">Terms accepted</dt><dd>{app?.termsAcceptedAt ? formatShortDate(app.termsAcceptedAt.slice(0, 10)) : "No"}</dd>
          </dl>
          {app && app.responses.length > 0 && (
            <div>
              <p className="mb-2 font-medium">Replies from the applicant</p>
              <ul className="flex flex-col gap-2">
                {[...app.responses].reverse().map((r, i) => (
                  <li key={i} className="bg-muted/50 flex flex-col gap-2 rounded-xl p-3">
                    <p className="text-muted-foreground text-xs">{formatShortDate(r.at.slice(0, 10))} · {r.by}</p>
                    {r.message && <p className="whitespace-pre-line">{r.message}</p>}
                    {r.documents.map((d) => <DocumentLink key={d.id} vendorId={v.id} doc={d} />)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-2 font-medium">History</p>
            <ol className="text-muted-foreground flex flex-col gap-1">{app?.history.map((h, i) => <li key={i}>{formatShortDate(h.at.slice(0, 10))} · {VENDOR_STATUS_LABEL[h.status]} by {h.by}{h.reason ? ` — ${h.reason}` : ""}</li>)}</ol>
          </div>
          {v.status === "needs_information" && (
            <p className="bg-warning-soft rounded-xl p-3">Waiting for the applicant to reply from their workspace. If they sent what you asked for another way, resume the review.</p>
          )}
          {(ACTIONS[v.status]?.length ?? 0) > 0 && (
            <Field><FieldLabel htmlFor="rv-reason">{v.status === "under_review" ? "Reason or request (recorded and sent to the vendor)" : "Note (recorded and sent to the vendor)"}</FieldLabel><Textarea id="rv-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          )}
        </div>
        <SheetFooter className="flex-row flex-wrap">
          {ACTIONS[v.status]?.map((a) => <Button key={a.decision} variant={a.destructive ? "destructive" : "default"} onClick={() => decide.mutate(a.decision)} disabled={decide.isPending}>{a.label}</Button>)}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function DocumentLink({ vendorId, doc }: { vendorId: string; doc: ApplicationDocument }) {
  const [busy, setBusy] = useState(false)
  async function open() {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open("", "_blank")
    setBusy(true)
    try {
      const url = await (await getApi()).getApplicationDocumentUrl(vendorId, doc.path)
      if (tab) { tab.opener = null; tab.location.href = url } else window.location.assign(url)
    } catch (e) {
      tab?.close()
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bg-card shadow-border flex items-center gap-3 rounded-lg px-3 py-2">
      <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{doc.name}</span>
      <span className="text-muted-foreground shrink-0 text-xs">{doc.size >= 1048576 ? `${(doc.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.size / 1024))} KB`}</span>
      <Button size="sm" variant="outline" onClick={open} disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}View</Button>
    </div>
  )
}

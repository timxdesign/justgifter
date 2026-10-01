import { useState } from "react"
import { VENDOR_STATUS_LABEL, zoneById, categoryName } from "@domain/index.ts"
import type { AdminVendorRow, VendorDecision } from "@/api"
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
  needs_information: [],
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
          <div>
            <p className="mb-2 font-medium">History</p>
            <ol className="text-muted-foreground flex flex-col gap-1">{app?.history.map((h, i) => <li key={i}>{formatShortDate(h.at.slice(0, 10))} · {VENDOR_STATUS_LABEL[h.status]} by {h.by}{h.reason ? ` — ${h.reason}` : ""}</li>)}</ol>
          </div>
          {(ACTIONS[v.status]?.length ?? 0) > 0 && (
            <Field><FieldLabel htmlFor="rv-reason">Reason (recorded and sent to the vendor)</FieldLabel><Textarea id="rv-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          )}
        </div>
        <SheetFooter className="flex-row flex-wrap">
          {ACTIONS[v.status]?.map((a) => <Button key={a.decision} variant={a.destructive ? "destructive" : "default"} onClick={() => decide.mutate(a.decision)} disabled={decide.isPending}>{a.label}</Button>)}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

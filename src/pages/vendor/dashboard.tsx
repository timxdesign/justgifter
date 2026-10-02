import { useRef, useState } from "react"
import { Link } from "react-router"
import { cn } from "cn"
import { VENDOR_STATUS_LABEL } from "@domain/index.ts"
import type { ApplicationDocument, VendorWorkspace } from "@/api"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { ErrorState, PageSkeleton, Img, StatusBadge } from "@/components/common"
import { ColumnChart } from "@/components/charts"
import { WsHeader, StatCard, Panel, OrderStatusBadge, SourceBadge } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ShopIcon, ClockCircleIcon, ArrowRightIcon, CheckCircleIcon, InfoCircleIcon, CloudUploadIcon, FileTextIcon, DangerCircleIcon, CloseIcon } from "@/components/icons"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldLabel } from "@/components/ui/field"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatMoney, formatMoneyCompactSafe, formatShortDate, relativeTime, formatDate } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function VendorDashboard() {
  useDocumentMeta({ title: "Vendor dashboard", noindex: true })
  const ws = useApiQuery(qk.vendorWorkspace, (api) => api.getVendorWorkspace())
  if (ws.isLoading) return <PageSkeleton />
  if (!ws.data) return <ErrorState error={new Error("Your account isn't linked to a vendor yet.")} />
  if (ws.data.vendor.status !== "approved") return <ApplicationStatus ws={ws.data} />
  return <Approved />
}

function ApplicationStatus({ ws }: { ws: VendorWorkspace }) {
  const app = ws.application
  const status = ws.vendor.status
  const steps = ["submitted", "under_review", "approved"] as const
  const waiting = status === "needs_information"
  const idx = waiting ? 1 : steps.indexOf(status as (typeof steps)[number])
  const replies = app?.responses ?? []
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <WsHeader title={ws.vendor.name} description="Your application" />
      <Panel>
        <div className="flex items-center justify-between">
          <p className="font-medium">Application status</p>
          <StatusBadge tone={status === "rejected" || status === "suspended" ? "danger" : waiting ? "warning" : "progress"}>{VENDOR_STATUS_LABEL[status]}</StatusBadge>
        </div>
        <ol className="grid grid-cols-3 gap-2">
          {steps.map((s, i) => {
            const current = i === idx
            const tone = i < idx || status === "approved" ? "bg-success" : current && waiting ? "bg-warning" : current ? "bg-success" : "bg-muted"
            return (
              <li key={s} className="flex flex-col gap-2" aria-current={current ? "step" : undefined}>
                <span className={cn("h-1.5 rounded-full", tone)} />
                <span className={cn("text-xs", current ? "font-medium" : "text-muted-foreground")}>{current && waiting ? "Waiting on you" : VENDOR_STATUS_LABEL[s]}</span>
              </li>
            )
          })}
        </ol>
        {waiting ? (
          ws.role === "owner" ? <ReplyToReview request={app?.decisionReason ?? ""} reviewer={app?.reviewer ?? null} /> : (
            <Alert><InfoCircleIcon /><AlertTitle>Our team needs more information</AlertTitle><AlertDescription>{app?.decisionReason} Only the store owner can reply.</AlertDescription></Alert>
          )
        ) : (
          <>
            {app?.decisionReason && status !== "under_review" && <Alert><InfoCircleIcon /><AlertTitle>Note from our team</AlertTitle><AlertDescription>{app.decisionReason}</AlertDescription></Alert>}
            {status === "under_review" && replies.length > 0 && (
              <Alert><CheckCircleIcon /><AlertTitle>Thanks — we've got your reply</AlertTitle><AlertDescription>Your application is back with our team. We'll be in touch within 3 working days.</AlertDescription></Alert>
            )}
            <p className="text-muted-foreground text-sm">{status === "suspended" ? "New orders are paused across the marketplace and your store. Existing orders still need fulfilling — our team will contact you." : "We review applications within 3 working days. You can prepare your products now; they'll go live once you're approved."}</p>
          </>
        )}
        {replies.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Your replies</p>
            <ul className="flex flex-col gap-2">
              {replies.map((r, i) => (
                <li key={i} className="bg-muted/50 rounded-xl p-3 text-sm">
                  <p className="text-muted-foreground text-xs">{formatShortDate(r.at.slice(0, 10))}</p>
                  {r.message && <p className="mt-1 whitespace-pre-line">{r.message}</p>}
                  {r.documents.length > 0 && <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">{r.documents.map((d) => <span key={d.id} className="inline-flex items-center gap-1"><FileTextIcon className="size-3.5" />{d.name}</span>)}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <details className="text-sm">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">History</summary>
          <ul className="text-muted-foreground mt-2 flex flex-col gap-1">{app?.history.map((h, i) => <li key={i}>{formatShortDate(h.at.slice(0, 10))} — {VENDOR_STATUS_LABEL[h.status]}{h.reason ? `: ${h.reason}` : ""}</li>)}</ul>
        </details>
        <Button asChild variant={waiting ? "outline" : "default"} className="w-fit"><Link to="/vendor/products/new">Prepare your first product</Link></Button>
      </Panel>
    </div>
  )
}

type Upload = { key: string; name: string; size: number; state: "uploading" | "done" | "error"; doc?: ApplicationDocument; error?: string }

const ACCEPT = ["application/pdf", "image/jpeg", "image/png"]
const MAX_FILES = 5
const MAX_BYTES = 10 * 1024 * 1024
const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** The applicant answers a "needs information" request in place, with documents, and goes straight back to review. */
function ReplyToReview({ request, reviewer }: { request: string; reviewer: string | null }) {
  const [message, setMessage] = useState("")
  const [files, setFiles] = useState<Upload[]>([])
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const send = useApiMutation(
    (api) => api.respondToApplication({ message, documents: files.flatMap((f) => (f.doc ? [f.doc] : [])) }),
    { invalidate: [qk.vendorWorkspace], success: "Reply sent — your application is back in review" },
  )
  const uploading = files.some((f) => f.state === "uploading")
  const ready = files.filter((f) => f.state === "done").length
  const canSend = !uploading && !send.isPending && (message.trim().length > 0 || ready > 0)

  async function add(list: FileList | null) {
    if (!list) return
    const room = MAX_FILES - files.filter((f) => f.state !== "error").length
    const picked = Array.from(list).slice(0, Math.max(0, room))
    const api = await getApi()
    for (const file of picked) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`
      const problem = !ACCEPT.includes(file.type) ? "Use a PDF, JPG or PNG" : file.size > MAX_BYTES ? "Larger than 10 MB" : null
      setFiles((fs) => [...fs, { key, name: file.name, size: file.size, state: problem ? "error" : "uploading", error: problem ?? undefined }])
      if (problem) continue
      api.uploadApplicationDocument(file).then(
        (doc) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, state: "done", doc } : f))),
        (e) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, state: "error", error: errorMessage(e) } : f))),
      )
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="border-warning/40 bg-warning/10 rounded-xl border p-4">
        <p className="flex items-center gap-2 text-sm font-medium"><InfoCircleIcon className="size-4" />What our team needs</p>
        <p className="mt-1.5 text-sm leading-relaxed">{request || "Our team needs a little more information to finish reviewing your application."}</p>
        {reviewer && <p className="text-muted-foreground mt-2 text-xs">Requested by {reviewer}</p>}
      </div>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (canSend) send.mutate() }}>
        <Field>
          <FieldLabel htmlFor="reply-message">Your reply</FieldLabel>
          <Textarea id="reply-message" rows={3} maxLength={2000} placeholder="e.g. Here's our CAC certificate. We registered as a business name in 2023." value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Documents</p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void add(e.dataTransfer.files) }}
            disabled={files.filter((f) => f.state !== "error").length >= MAX_FILES}
            className={cn("press flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center text-sm transition-colors disabled:opacity-50", dragging ? "border-foreground bg-muted" : "hover:bg-muted/60")}
          >
            <CloudUploadIcon className="text-muted-foreground size-6" />
            <span className="font-medium">Add documents</span>
            <span className="text-muted-foreground text-xs">PDF, JPG or PNG · up to 10 MB each · {MAX_FILES} files</span>
          </button>
          <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void add(e.target.files); e.target.value = "" }} />
          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-live="polite">
              {files.map((f) => (
                <li key={f.key} className="bg-muted/50 flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                  {f.state === "uploading" ? <Spinner className="size-4" /> : f.state === "error" ? <DangerCircleIcon className="text-destructive size-4 shrink-0" /> : <FileTextIcon className="text-muted-foreground size-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className={cn("shrink-0 text-xs", f.state === "error" ? "text-destructive" : "text-muted-foreground")}>{f.state === "error" ? f.error : f.state === "uploading" ? "Uploading…" : fileSize(f.size)}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}><CloseIcon /></Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">Files are stored privately. Only the JustGifter review team can open them.</p>
        </div>
        <Button type="submit" size="lg" className="w-fit" disabled={!canSend}>
          {send.isPending && <Spinner data-icon="inline-start" />}
          Send to JustGifter
          {!send.isPending && <ArrowRightIcon data-icon="inline-end" />}
        </Button>
      </form>
    </div>
  )
}

function Approved() {
  const d = useApiQuery(qk.vendorDashboard, (api) => api.getVendorDashboard(), { refetchInterval: 30_000 })
  if (d.error) return <ErrorState error={d.error} retry={() => d.refetch()} />
  if (!d.data) return <PageSkeleton />
  const m = d.data.metrics
  return (
    <>
      <WsHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}`}
        description={d.data.vendorName}
        actions={d.data.storefrontSlug && <Button variant="outline" asChild><Link to={`/stores/${d.data.storefrontSlug}`} target="_blank"><ShopIcon data-icon="inline-start" />View your store</Link></Button>}
      />
      {d.data.storefrontStatus === "paused" && <Alert className="bg-warning-soft mb-6 border-0"><InfoCircleIcon /><AlertTitle>Your store is paused</AlertTitle><AlertDescription>Customers can't order from your store link. <Link to="/vendor/storefront" className="underline">Resume ordering</Link></AlertDescription></Alert>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Need accepting" value={m.needsAcceptance} tone={m.needsAcceptance ? "attention" : "default"} hint="Accept within 4 operating hours" to="/vendor/orders" />
        <StatCard label="In progress" value={m.inProgress} to="/vendor/orders" />
        <StatCard label="Delivered this week" value={m.deliveredThisWeek} />
        <StatCard label="Net sales, 30 days" value={formatMoney(m.netSales30d)} hint="After commission" to="/vendor/payouts" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Needs your attention" action={<Button variant="ghost" size="sm" asChild><Link to="/vendor/orders">All orders<ArrowRightIcon data-icon="inline-end" /></Link></Button>}>
          {d.data.actionable.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm"><CheckCircleIcon className="text-success size-5" />You're all caught up.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {d.data.actionable.map((o) => (
                <li key={o.order.id}>
                  <Link to={`/vendor/orders/${o.order.id}`} className="hover:bg-muted flex items-center gap-3 rounded-xl p-2">
                    <Img src={o.order.lines[0].image} alt="" className="size-12 rounded-lg" sizes="48px" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.order.lines[0].title}{o.order.lines.length > 1 ? ` +${o.order.lines.length - 1}` : ""}</p>
                      <p className="text-muted-foreground text-xs">{o.order.reference} · for {formatDate(o.order.delivery.requestedDate)}</p>
                      <div className="mt-1"><SourceBadge source={o.order.source} purchaseType={o.order.purchaseType} /></div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <OrderStatusBadge status={o.order.status} />
                      {o.order.status === "awaiting_vendor_acceptance" && o.order.acceptBy && <span className="text-brand-text flex items-center gap-1 text-xs"><ClockCircleIcon className="size-3.5" />Accept {relativeTime(o.order.acceptBy)}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="Net sales, last 30 days">
            <ColumnChart title="Net sales" data={d.data.salesByDay.map((s) => ({ key: s.date, label: formatShortDate(s.date), value: s.net, display: `${formatMoney(s.net)} · ${s.orders} ${s.orders === 1 ? "order" : "orders"}` }))} formatTick={formatMoneyCompactSafe} height={170} />
          </Panel>
          <Panel title="Low stock" action={<Button variant="ghost" size="sm" asChild><Link to="/vendor/products">Manage</Link></Button>}>
            {d.data.lowStockVariants.length === 0 ? <p className="text-muted-foreground text-sm">Stock levels look healthy.</p> : (
              <ul className="flex flex-col gap-2 text-sm">{d.data.lowStockVariants.slice(0, 6).map((v) => <li key={v.variantId} className="flex justify-between gap-3"><span className="truncate">{v.productTitle} · {v.variantName}</span><span className={`tabular font-medium ${v.stock === 0 ? "text-destructive" : "text-warning"}`}>{v.stock === 0 ? "Sold out" : `${v.stock} left`}</span></li>)}</ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}

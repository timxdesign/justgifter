import { Link } from "react-router"
import { VENDOR_STATUS_LABEL } from "@domain/index.ts"
import type { VendorWorkspace } from "@/api"
import { ErrorState, PageSkeleton, Img, StatusBadge } from "@/components/common"
import { ColumnChart } from "@/components/charts"
import { WsHeader, StatCard, Panel, OrderStatusBadge, SourceBadge } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ShopIcon, ClockCircleIcon, ArrowRightIcon, CheckCircleIcon, InfoCircleIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
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
  const steps = ["submitted", "under_review", "approved"] as const
  const idx = steps.indexOf(ws.vendor.status as (typeof steps)[number])
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <WsHeader title={ws.vendor.name} description="Your application" />
      <Panel>
        <div className="flex items-center justify-between">
          <p className="font-medium">Application status</p>
          <StatusBadge tone={ws.vendor.status === "rejected" || ws.vendor.status === "suspended" ? "danger" : ws.vendor.status === "needs_information" ? "warning" : "progress"}>{VENDOR_STATUS_LABEL[ws.vendor.status]}</StatusBadge>
        </div>
        <ol className="grid grid-cols-3 gap-2">
          {steps.map((s, i) => <li key={s} className="flex flex-col gap-2"><span className={`h-1.5 rounded-full ${i <= idx ? "bg-success" : "bg-muted"}`} /><span className="text-xs">{VENDOR_STATUS_LABEL[s]}</span></li>)}
        </ol>
        {app?.decisionReason && <Alert><InfoCircleIcon /><AlertTitle>Note from our team</AlertTitle><AlertDescription>{app.decisionReason}</AlertDescription></Alert>}
        <p className="text-muted-foreground text-sm">{ws.vendor.status === "suspended" ? "New orders are paused across the marketplace and your store. Existing orders still need fulfilling — our team will contact you." : "We review applications within 3 working days. You can prepare your products now; they'll go live once you're approved."}</p>
        <ul className="text-muted-foreground flex flex-col gap-1 text-sm">{app?.history.map((h, i) => <li key={i}>{formatShortDate(h.at.slice(0, 10))} — {VENDOR_STATUS_LABEL[h.status]}{h.reason ? `: ${h.reason}` : ""}</li>)}</ul>
        <Button asChild className="w-fit"><Link to="/vendor/products/new">Prepare your first product</Link></Button>
      </Panel>
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

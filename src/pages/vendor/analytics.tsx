import { useState } from "react"
import { ErrorState, PageSkeleton } from "@/components/common"
import { ColumnChart, ShareBars } from "@/components/charts"
import { WsHeader, StatCard, Panel, SOURCE_LABEL } from "@/components/workspace"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatMoney, formatShortDate, percent } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function VendorAnalytics() {
  useDocumentMeta({ title: "Store analytics", noindex: true })
  const [days, setDays] = useState(30)
  const a = useApiQuery(qk.vendorAnalytics(days), (api) => api.getStorefrontAnalytics(days), { placeholderData: (p) => p })
  if (a.error) return <ErrorState error={a.error} />
  if (!a.data) return <PageSkeleton />
  const t = a.data.totals
  return (
    <>
      <WsHeader
        title="Store analytics"
        description="Your own visits, previews and staff tests are excluded. Orders count only once payment is verified."
        actions={<Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}><TabsList><TabsTrigger value="7">7 days</TabsTrigger><TabsTrigger value="30">30 days</TabsTrigger></TabsList></Tabs>}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Store visits" value={t.visits.toLocaleString()} />
        <StatCard label="Product views" value={t.productViews.toLocaleString()} />
        <StatCard label="Checkout starts" value={t.checkoutStarts.toLocaleString()} />
        <StatCard label="Paid orders" value={t.paidOrders} hint={`${percent(t.conversion, 1)} of visits`} />
        <StatCard label="Net sales" value={formatMoney(t.netSales)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Store visits per day"><ColumnChart title="Visits" data={a.data.byDay.map((d) => ({ key: d.date, label: formatShortDate(d.date), value: d.visits, display: `${d.visits} visits` }))} formatTick={(n) => Math.round(n).toLocaleString()} /></Panel>
        <Panel title="Paid store orders per day"><ColumnChart title="Paid orders" data={a.data.byDay.map((d) => ({ key: d.date, label: formatShortDate(d.date), value: d.paidOrders, display: `${d.paidOrders} orders · ${formatMoney(d.netSales)}` }))} formatTick={(n) => String(Math.round(n))} /></Panel>
        <Panel title="Where orders come from">
          <ShareBars rows={a.data.bySource.map((s) => ({ label: SOURCE_LABEL[s.source], value: s.orders, display: `${s.orders} · ${formatMoney(s.netSales)}` }))} />
        </Panel>
        <Panel title="Most viewed products">
          <ol className="flex flex-col gap-2 text-sm">{a.data.topProducts.map((p, i) => <li key={p.productId} className="flex justify-between gap-3"><span className="truncate"><span className="text-muted-foreground tabular mr-2">{i + 1}</span>{p.title}</span><span className="tabular text-muted-foreground">{p.views} views · {p.orders} orders</span></li>)}</ol>
        </Panel>
      </div>
    </>
  )
}

import { useState } from "react"
import { Link } from "react-router"
import type { OrderSource, PurchaseType } from "@domain/index.ts"
import { ErrorState, Img, EmptyState } from "@/components/common"
import { WsHeader, OrderStatusBadge, SourceBadge } from "@/components/workspace"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BillListIcon, ClockCircleIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatDate, formatMoney, relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function VendorOrders() {
  useDocumentMeta({ title: "Orders", noindex: true })
  const [status, setStatus] = useState<"actionable" | "completed" | "all">("actionable")
  const [source, setSource] = useState<OrderSource | "all">("all")
  const [type, setType] = useState<PurchaseType | "all">("all")
  const filter = { status, source: source === "all" ? undefined : source, purchaseType: type === "all" ? undefined : type }
  const orders = useApiQuery(qk.vendorOrders(filter), (api) => api.listVendorOrders(filter), { refetchInterval: 30_000 })
  return (
    <>
      <WsHeader title="Orders" description="Marketplace, wishlist and store orders in one place." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList><TabsTrigger value="actionable">To do</TabsTrigger><TabsTrigger value="completed">Completed</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>
        </Tabs>
        <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
          <SelectTrigger className="w-44" aria-label="Source"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">All sources</SelectItem><SelectItem value="storefront">Your store</SelectItem><SelectItem value="marketplace">Marketplace</SelectItem><SelectItem value="wishlist">Wishlists</SelectItem></SelectGroup></SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger className="w-40" aria-label="Order type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">Gifts & self</SelectItem><SelectItem value="gift">Gifts</SelectItem><SelectItem value="self">Self purchases</SelectItem></SelectGroup></SelectContent>
        </Select>
      </div>
      {orders.error ? <ErrorState error={orders.error} /> : !orders.data ? <Skeleton className="h-64 rounded-2xl" /> : orders.data.length === 0 ? (
        <EmptyState icon={<BillListIcon />} title={status === "actionable" ? "Nothing to do right now" : "No orders match"} description="New orders appear here as soon as payment is confirmed." />
      ) : (
        <div className="surface overflow-hidden rounded-2xl">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead className="max-md:hidden">Source</TableHead><TableHead>Deliver</TableHead><TableHead>Status</TableHead><TableHead className="text-right">You receive</TableHead></TableRow></TableHeader>
            <TableBody>
              {orders.data.map((o) => (
                <TableRow key={o.order.id} className="relative">
                  <TableCell>
                    <Link to={`/vendor/orders/${o.order.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                      <Img src={o.order.lines[0].image} alt="" className="size-10 rounded-lg" sizes="40px" />
                      <span><span className="block font-medium">{o.order.lines[0].title}{o.order.lines.length > 1 ? ` +${o.order.lines.length - 1}` : ""}</span><span className="text-muted-foreground tabular text-xs">{o.order.reference}</span></span>
                    </Link>
                  </TableCell>
                  <TableCell className="max-md:hidden"><SourceBadge source={o.order.source} purchaseType={o.order.purchaseType} /></TableCell>
                  <TableCell>{formatDate(o.order.delivery.requestedDate)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1"><OrderStatusBadge status={o.order.status} />{o.order.status === "awaiting_vendor_acceptance" && o.order.acceptBy && <span className="text-brand-text flex items-center gap-1 text-xs"><ClockCircleIcon className="size-3.5" />{relativeTime(o.order.acceptBy)}</span>}</div>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatMoney(o.settlement.vendorPayable)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

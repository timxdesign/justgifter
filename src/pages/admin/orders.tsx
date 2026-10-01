import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { ErrorState, Img } from "@/components/common"
import { WsHeader, OrderStatusBadge, SourceBadge } from "@/components/workspace"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MagnifierIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatMoney, formatShortDate } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminOrders() {
  useDocumentMeta({ title: "Orders", noindex: true })
  const [params, setParams] = useSearchParams()
  const status: "exceptions" | undefined = params.get("status") === "exceptions" ? "exceptions" : undefined
  const [q, setQ] = useState("")
  const filter = { q: q || undefined, status }
  const rows = useApiQuery(qk.admin("orders", filter), (api) => api.listAllOrders(filter), { placeholderData: (p) => p })
  return (
    <>
      <WsHeader title="Orders" description="Buyer contacts are masked. Opening an order is recorded in the audit log." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={status ?? "all"} onValueChange={(v) => setParams(v === "all" ? {} : { status: v })}>
          <TabsList><TabsTrigger value="all">All orders</TabsTrigger><TabsTrigger value="exceptions">Exceptions</TabsTrigger></TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <MagnifierIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input aria-label="Search orders" placeholder="Reference, item or email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      {rows.error ? <ErrorState error={rows.error} /> : !rows.data ? <Skeleton className="h-80 rounded-2xl" /> : (
        <div className="surface overflow-x-auto rounded-2xl">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Buyer</TableHead><TableHead className="max-lg:hidden">Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>{rows.data.map((r) => (
              <TableRow key={r.order.id} className="relative">
                <TableCell><Link to={`/admin/orders/${r.order.id}`} className="flex items-center gap-3 after:absolute after:inset-0"><Img src={r.order.image} alt="" className="size-10 rounded-lg" sizes="40px" /><span><span className="tabular block font-medium">{r.order.reference}</span><span className="text-muted-foreground text-xs">{r.order.vendorName} · {formatShortDate(r.order.createdAt.slice(0, 10))}</span></span></Link></TableCell>
                <TableCell className="text-sm">{r.buyerEmailMasked}</TableCell>
                <TableCell className="max-lg:hidden"><SourceBadge source={r.order.source} purchaseType={r.order.purchaseType} /></TableCell>
                <TableCell><div className="flex flex-col gap-1"><OrderStatusBadge status={r.order.status} />{r.flags.map((f) => <Badge key={f} variant="warning">{f}</Badge>)}</div></TableCell>
                <TableCell className="tabular text-right">{formatMoney(r.order.total)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

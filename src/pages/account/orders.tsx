import { Link } from "react-router"
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, REVEAL_STATUS_LABEL } from "@domain/index.ts"
import { Container, EmptyState, ErrorState, Img, PageHeader, StatusBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BillListIcon, GiftIcon, AltArrowRightIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatDate, formatMoney, formatShortDate } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"
import { useSession } from "@/lib/session"
import { AccountTabs } from "./tabs"

export default function OrdersPage() {
  useDocumentMeta({ title: "Orders & gifts", noindex: true })
  const { user } = useSession()
  const orders = useApiQuery(qk.myOrders, (api) => api.listMyOrders())
  return (
    <Container className="flex flex-col gap-8 py-10">
      <PageHeader title="Orders & gifts" description={user ? `Signed in as ${user.email}` : "Orders you've placed in this browser or verified by email."} actions={!user && <Button variant="outline" asChild><Link to="/orders/access">Find another order</Link></Button>} />
      <AccountTabs />
      {orders.error ? (
        <ErrorState error={orders.error} retry={() => orders.refetch()} />
      ) : !orders.data ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : orders.data.length === 0 ? (
        <EmptyState icon={<BillListIcon />} title="No orders yet" description={user ? "Gifts you send and orders you place will appear here." : "Sign in, or verify the email you used at checkout to see your orders."} action={<div className="flex gap-2"><Button asChild><Link to="/shop">Find a gift</Link></Button>{!user && <Button variant="outline" asChild><Link to="/orders/access">Find my order</Link></Button>}</div>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.data.map((o) => (
            <li key={o.id}>
              <Link to={`/account/orders/${o.id}`} className="surface-interactive group/o flex items-center gap-4 rounded-2xl p-4">
                <Img src={o.image} alt="" className="size-16 shrink-0 rounded-xl" sizes="64px" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {o.purchaseType === "gift" && <GiftIcon className="text-brand-text size-4 shrink-0" />}
                    {o.recipientName ? `For ${o.recipientName}` : o.title}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {o.recipientName ? `${o.title} · ` : ""}{o.vendorName} · {formatShortDate(o.createdAt.slice(0, 10))}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</StatusBadge>
                    {o.revealStatus && o.revealStatus !== "draft" && <StatusBadge tone={o.revealStatus === "opened" ? "success" : "neutral"}>{REVEAL_STATUS_LABEL[o.revealStatus]}</StatusBadge>}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="tabular font-semibold">{formatMoney(o.total)}</p>
                  <p className="text-muted-foreground text-xs">for {formatDate(o.requestedDate)}</p>
                </div>
                <AltArrowRightIcon className="text-muted-foreground size-5 transition-transform group-hover/o:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}

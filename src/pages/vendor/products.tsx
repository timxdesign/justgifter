import { Link } from "react-router"
import { Input } from "@/components/ui/input"
import { categoryName } from "@domain/index.ts"
import { ErrorState, Img, EmptyState, StatusBadge } from "@/components/common"
import { WsHeader } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AddCircleIcon, BoxIcon, PenIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatMoney } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const STATUS = { active: ["Live", "success"], pending_review: ["In review", "warning"], rejected: ["Changes needed", "danger"], draft: ["Draft", "neutral"], archived: ["Archived", "neutral"] } as const

export default function VendorProducts() {
  useDocumentMeta({ title: "Products & stock", noindex: true })
  const rows = useApiQuery(qk.vendorProducts, (api) => api.listVendorProducts())
  const stock = useApiMutation((api, v: { productId: string; variantId: string; stock: number }) => api.updateStock(v.productId, v.variantId, v.stock), { invalidate: [qk.vendorProducts, qk.vendorDashboard], success: "Stock updated" })
  return (
    <>
      <WsHeader title="Products & stock" description="Stock here is shared by the marketplace, wishlists and your store — a sale anywhere updates it everywhere." actions={<Button asChild><Link to="/vendor/products/new"><AddCircleIcon data-icon="inline-start" />Add product</Link></Button>} />
      {rows.error ? <ErrorState error={rows.error} /> : !rows.data ? <Skeleton className="h-80 rounded-2xl" /> : rows.data.length === 0 ? (
        <EmptyState icon={<BoxIcon />} title="No products yet" description="Add your first product. New listings are reviewed before they go live — usually within a day." action={<Button asChild><Link to="/vendor/products/new">Add product</Link></Button>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.data.map(({ product: p, sellable, reserved, committed }) => {
            const [label, tone] = STATUS[p.status]
            return (
              <li key={p.id} className="surface flex flex-col gap-4 rounded-2xl p-4 lg:flex-row lg:items-center">
                <div className="flex flex-1 items-center gap-4">
                  <Img src={p.images[0]} alt="" className="size-16 rounded-xl" sizes="64px" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">{p.title}<StatusBadge tone={tone}>{label}</StatusBadge></p>
                    <p className="text-muted-foreground text-sm">{categoryName(p.category)} · {committed} to fulfil · {reserved} in checkouts</p>
                    {p.moderationNote && <p className="text-warning text-xs">{p.moderationNote}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.variants.map((v) => (
                    <label key={v.id} className="bg-muted/60 flex items-center gap-2 rounded-xl py-1 pr-1 pl-3 text-sm">
                      <span className="max-w-28 truncate">{v.name}</span>
                      <span className="text-muted-foreground tabular text-xs">{formatMoney(v.price)}</span>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={v.stock}
                        aria-label={`Stock for ${p.title}, ${v.name}`}
                        className="h-8 w-20 bg-card text-right tabular"
                        onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (n !== v.stock) stock.mutate({ productId: p.id, variantId: v.id, stock: n })
                        }}
                      />
                      {sellable[v.id] === 0 && <span className="text-destructive pr-2 text-xs">Sold out</span>}
                    </label>
                  ))}
                </div>
                <Button variant="outline" size="sm" asChild><Link to={`/vendor/products/${p.id}`}><PenIcon data-icon="inline-start" />Edit</Link></Button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

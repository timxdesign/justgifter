import { Link, useNavigate } from "react-router"
import { Container, EmptyState, Img, PageHeader, QuantityStepper } from "@/components/common"
import { Button } from "@/components/ui/button"
import { BagHeartIcon, TrashBinMinimalisticIcon, GiftIcon, InfoCircleIcon } from "@/components/icons"
import { cart, checkoutIntent, useCart, type Bag } from "@/lib/cart"
import { formatMoney } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function CartPage() {
  useDocumentMeta({ title: "Your bag", noindex: true })
  const state = useCart()
  const bags = Object.values(state.bags).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <Container className="flex flex-col gap-8 py-10">
      <PageHeader title="Your bag" description={bags.length > 1 ? "Each vendor delivers separately, so each bag is its own checkout with its own delivery charge." : undefined} />
      {bags.length === 0 ? (
        <EmptyState icon={<BagHeartIcon />} title="Your bag is empty" description="Find something thoughtful — or ask the assistant for ideas." action={<Button asChild><Link to="/shop">Browse gifts</Link></Button>} />
      ) : (
        <div className="flex flex-col gap-6">
          {bags.length > 1 && (
            <p className="bg-info-soft text-info flex items-start gap-2 rounded-xl p-4 text-sm">
              <InfoCircleIcon className="mt-0.5 size-4 shrink-0" />
              You have {bags.length} bags from different vendors. Check each one out separately.
            </p>
          )}
          {bags.map((b) => <BagCard key={b.vendorId} bag={b} />)}
        </div>
      )}
    </Container>
  )
}

function BagCard({ bag }: { bag: Bag }) {
  const navigate = useNavigate()
  const subtotal = bag.lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0)
  const go = (purchaseType: "gift" | "self") => {
    checkoutIntent.set({
      vendorId: bag.vendorId,
      vendorName: bag.vendorName,
      lines: bag.lines,
      source: bag.context.source,
      storefrontId: bag.context.storefrontId,
      storefrontSlug: bag.context.storefrontSlug,
      campaign: bag.context.campaign,
      purchaseType,
      fromBag: true,
    })
    navigate("/checkout")
  }
  return (
    <section aria-label={`Bag from ${bag.vendorName}`} className="bg-card shadow-border overflow-hidden rounded-3xl">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="font-semibold">{bag.vendorName}</h2>
        {bag.context.source === "storefront" && <span className="text-muted-foreground text-xs">From their store</span>}
      </header>
      <ul className="divide-y">
        {bag.lines.map((l, i) => (
          <li key={l.variantId + i} className="flex flex-wrap items-center gap-4 px-6 py-4">
            <Img src={l.image} alt="" className="size-20 rounded-xl" sizes="80px" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{l.title}</p>
              <p className="text-muted-foreground text-sm">{l.variantName}</p>
              {l.personalisationText && <p className="text-muted-foreground truncate text-sm italic">“{l.personalisationText}”</p>}
            </div>
            <QuantityStepper size="sm" value={l.quantity} onChange={(q) => cart.setQuantity(bag.vendorId, i, q)} />
            <p className="tabular w-24 text-right font-medium">{formatMoney(l.unitPrice * l.quantity)}</p>
            <Button variant="ghost" size="icon" aria-label={`Remove ${l.title}`} onClick={() => cart.remove(bag.vendorId, i)}>
              <TrashBinMinimalisticIcon />
            </Button>
          </li>
        ))}
      </ul>
      <footer className="bg-muted/40 flex flex-col gap-4 border-t px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          Items <span className="tabular font-semibold">{formatMoney(subtotal)}</span>
          <span className="text-muted-foreground"> · delivery calculated at checkout</span>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => go("self")}>Order for myself</Button>
          <Button onClick={() => go("gift")}>
            <GiftIcon data-icon="inline-start" />
            Send as a gift
          </Button>
        </div>
      </footer>
    </section>
  )
}

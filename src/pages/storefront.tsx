import { useEffect, useMemo, useState } from "react"
import { Link, Navigate, useParams, useSearchParams } from "react-router"
import { cn } from "cn"
import { zoneById } from "@domain/index.ts"
import type { StorefrontView } from "@/api"
import { getApi } from "@/api"
import { Container, Img, PageSkeleton, EmptyState } from "@/components/common"
import { ProductCard, VendorAvatar } from "@/components/commerce"
import { StoreChrome, ACCENT } from "@/components/store-chrome"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { MagnifierIcon, VerifiedCheckIcon, DeliveryIcon, ClockCircleIcon, MapPointIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"

export function useStoreAttribution(slug: string, storefrontId: string | undefined) {
  const [params] = useSearchParams()
  const campaign = params.get("ref") ?? params.get("utm_campaign") ?? undefined
  useEffect(() => {
    if (!storefrontId) return
    const key = `jg-store:${slug}`
    if (campaign) sessionStorage.setItem(`${key}:campaign`, campaign)
    if (sessionStorage.getItem(`${key}:visit`)) return
    sessionStorage.setItem(`${key}:visit`, "1")
    getApi().then((api) => api.recordStoreVisit(storefrontId, "visit"))
  }, [slug, storefrontId, campaign])
  return campaign ?? sessionStorage.getItem(`jg-store:${slug}:campaign`) ?? undefined
}

export default function StorefrontPage() {
  const { slug = "" } = useParams()
  const q = useApiQuery(qk.storefront(slug), (api) => api.getStorefront(slug))
  const d = q.data
  const view = d?.kind === "found" ? d.view : null
  useDocumentMeta({ title: view?.vendor.name ?? "Store", description: view?.storefront.headline, image: view?.storefront.coverImage, canonical: view ? `/stores/${view.storefront.slug}` : undefined })
  useStoreAttribution(slug, view?.storefront.id)
  if (q.isLoading) return <PageSkeleton />
  if (!d || d.kind === "not_found") return <StoreUnavailable title="We couldn't find this store" body="Check the link with the business that shared it." />
  if (d.kind === "redirect") return <Navigate to={`/stores/${d.slug}`} replace />
  if (d.kind === "unavailable") return <StoreUnavailable title={`${d.vendorName} isn't taking orders right now`} body={d.reason === "paused" ? "The store has paused ordering for a little while. If you already placed an order, it's unaffected — you can track it any time." : "If you placed an order, you can still track it and contact support."} />
  return <Store view={d.view} slug={d.view.storefront.slug} />
}

function StoreUnavailable({ title, body }: { title: string; body: string }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-4">
        <Logo />
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        <div className="flex gap-2"><Button asChild><Link to="/orders/access">Track an order</Link></Button><Button variant="outline" asChild><Link to="/shop">Browse other gifts</Link></Button></div>
      </div>
    </main>
  )
}

function Store({ view, slug }: { view: StorefrontView; slug: string }) {
  const { storefront: sf, vendor, products } = view
  const [collection, setCollection] = useState<string>("all")
  const [q, setQ] = useState("")
  const shown = useMemo(() => {
    let list = collection === "all" ? products : products.filter((p) => sf.collections.find((c) => c.id === collection)?.productIds.includes(p.id))
    if (q.trim()) list = list.filter((p) => `${p.title} ${p.summary}`.toLowerCase().includes(q.toLowerCase()))
    return list
  }, [collection, q, products, sf.collections])
  const featured = sf.featuredProductIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as typeof products
  const href = (p: { slug: string }) => `/stores/${slug}/products/${p.slug}`
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const hours = `${vendor.operating.days.length === 7 ? "Every day" : vendor.operating.days.map((d) => days[d]).join(", ")} · ${hr(vendor.operating.openHour)}–${hr(vendor.operating.closeHour)}`

  return (
    <StoreChrome vendor={vendor} slug={slug} accent={sf.accent}>
      {sf.status !== "published" && <p className="bg-warning-soft text-warning py-2 text-center text-sm">Preview — this store isn't published. Customers can't see it yet.</p>}
      <section className="relative isolate overflow-hidden">
        <Img src={sf.coverImage.replace(".webp", "@2x.webp")} alt="" eager className="absolute inset-0 -z-10 size-full" sizes="100vw" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
        <Container className={cn("flex min-h-[26rem] flex-col justify-end gap-4 py-12 text-white", sf.layout === "editorial" && "min-h-[32rem] items-center text-center")}>
          <VendorAvatar name={vendor.name} initials={vendor.logoInitials} color={vendor.logoColor} className="size-16 text-xl ring-4 ring-white/20" />
          <h1 className="font-display text-5xl font-medium sm:text-6xl">{vendor.name}</h1>
          <p className="max-w-xl text-lg opacity-90">{sf.headline}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {vendor.verified && <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur"><VerifiedCheckIcon className="size-4" />Verified by JustGifter</span>}
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur"><DeliveryIcon className="size-4" />{vendor.zones.map((z) => zoneById(z.zoneId)?.name).join(" · ")}</span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur"><ClockCircleIcon className="size-4" />{hours}</span>
          </div>
        </Container>
      </section>

      {featured.length > 0 && (
        <Container className="flex flex-col gap-6 pt-14">
          <h2 className="font-display text-3xl">Favourites</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
            {featured.map((p, i) => <ProductCard key={p.id} product={p} href={href(p)} priority={i < 3} />)}
          </div>
        </Container>
      )}

      <Container className="flex flex-col gap-6 pt-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-3xl">Shop {vendor.name}</h2>
          <div className="relative sm:w-72">
            <MagnifierIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input aria-label={`Search ${vendor.name}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this store" className="pl-9" />
          </div>
        </div>
        <div role="tablist" aria-label="Collections" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          {[{ id: "all", name: "Everything" }, ...sf.collections].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={collection === c.id} onClick={() => setCollection(c.id)} className={cn("press shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors", collection === c.id ? "text-white" : "bg-muted hover:bg-accent")} style={collection === c.id ? { background: `color-mix(in oklch, ${ACCENT[sf.accent]} 70%, black)` } : undefined}>{c.name}</button>
          ))}
        </div>
        {shown.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4">{shown.map((p) => <ProductCard key={p.id} product={p} href={href(p)} />)}</div>
        ) : (
          <EmptyState icon={<MagnifierIcon />} title={q ? `Nothing matches “${q}”` : "Nothing here yet"} description="Try another collection or search term." action={q ? <Button variant="outline" onClick={() => setQ("")}>Clear search</Button> : undefined} />
        )}
      </Container>

      <Container className="grid gap-10 pt-20 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl">About us</h2>
          <p className="text-muted-foreground leading-relaxed">{sf.intro}</p>
          <p className="text-muted-foreground flex items-center gap-2 text-sm"><MapPointIcon className="size-4" />{vendor.city}, Nigeria · usually confirms orders within {vendor.responseHours}h</p>
        </div>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="d"><AccordionTrigger>Delivery</AccordionTrigger><AccordionContent className="text-muted-foreground flex flex-col gap-2">
            <p>{vendor.deliveryPolicy}</p>
            <ul>{vendor.zones.map((z) => <li key={z.zoneId}>{zoneById(z.zoneId)?.name}: ₦{(z.fee / 100).toLocaleString()}{z.leadDays ? ` · +${z.leadDays} day` : ""}</li>)}</ul>
          </AccordionContent></AccordionItem>
          <AccordionItem value="r"><AccordionTrigger>Returns</AccordionTrigger><AccordionContent className="text-muted-foreground">{vendor.returnPolicy}</AccordionContent></AccordionItem>
          <AccordionItem value="s"><AccordionTrigger>Support & payment</AccordionTrigger><AccordionContent className="text-muted-foreground">Checkout, payment and support are provided by JustGifter. If anything goes wrong, open a case from your order and we'll resolve it with {vendor.name}.</AccordionContent></AccordionItem>
        </Accordion>
      </Container>
    </StoreChrome>
  )
}

const hr = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`

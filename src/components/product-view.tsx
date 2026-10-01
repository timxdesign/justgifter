import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { cn } from "cn"
import { toast } from "sonner"
import { AnimatePresence, motion } from "motion/react"
import type { DateOnly, ZoneId } from "@domain/index.ts"
import { categoryName, canSendWithoutAddress, zoneById } from "@domain/index.ts"
import type { CartLine, ProductDetail } from "@/api"
import { Img, Container, QuantityStepper, ErrorState } from "@/components/common"
import { DateStrip, PriceTag, ProductGrid, SaveButton, VendorAvatar, ZoneSelect } from "@/components/commerce"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { GiftIcon, BagHeartIcon, DeliveryIcon, VerifiedCheckIcon, InfoCircleIcon, ClockCircleIcon, ShieldCheckIcon, PenIcon, CheckIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { cart, checkoutIntent, preferredZone } from "@/lib/cart"
import { formatMoney, formatWindow, friendlyDate } from "@/lib/format"

export interface StoreContext {
  storefrontId: string
  storefrontSlug: string
  campaign?: string
}

export function ProductView({ slug, store }: { slug: string; store?: StoreContext }) {
  const detail = useApiQuery(qk.product(slug), (api) => api.getProduct(slug))
  if (detail.error) return <Container className="py-16"><ErrorState error={detail.error} retry={() => detail.refetch()} /></Container>
  if (detail.isLoading) return <ProductSkeleton />
  if (!detail.data) return <Container className="py-24 text-center"><h1 className="font-display text-3xl">This gift is no longer available</h1><p className="text-muted-foreground mt-2">It may have sold out or been removed by the vendor.</p><Button className="mt-6" asChild><Link to="/shop">Browse other gifts</Link></Button></Container>
  return <ProductBody data={detail.data} store={store} />
}

function ProductBody({ data, store }: { data: ProductDetail; store?: StoreContext }) {
  const { product, vendor, availability, related } = data
  const navigate = useNavigate()
  const firstAvailable = product.variants.find((v) => (availability[v.id] ?? 0) > 0) ?? product.variants[0]
  const [variantId, setVariantId] = useState(firstAvailable.id)
  const [qty, setQty] = useState(1)
  const [personalisation, setPersonalisation] = useState("")
  const [wrappingId, setWrappingId] = useState<string>("none")
  const [image, setImage] = useState(0)
  const vendorZones = vendor.zones.map((z) => z.zoneId)
  const [zone, setZone] = useState<ZoneId>(() => {
    const pref = preferredZone.get()
    return pref && vendorZones.includes(pref) ? pref : vendorZones[0]
  })
  const [date, setDate] = useState<DateOnly | null>(null)
  const [confirmSeparate, setConfirmSeparate] = useState<null | (() => void)>(null)

  const variant = product.variants.find((v) => v.id === variantId)!
  const available = availability[variantId] ?? 0
  const spec = product.personalisation
  const personalised = Boolean(spec && personalisation.trim())
  const purchasable = vendor.status === "approved" && product.status === "active" && (!store || vendor.storefrontStatus === "published")

  const quote = useApiQuery(qk.delivery({ p: product.id, zone, personalised }), (api) => api.getDeliveryQuote({ productId: product.id, zoneId: zone, personalised }), { staleTime: 60_000 })
  useEffect(() => {
    if (quote.data?.dates.length && (!date || !quote.data.dates.includes(date))) setDate(quote.data.earliest ?? quote.data.dates[0])
  }, [quote.data, date])

  const unit = variant.price + (personalised ? spec?.fee ?? 0 : 0) + (product.wrapping.find((w) => w.id === wrappingId)?.fee ?? 0)
  const personalisationError = spec?.required && !personalisation.trim() ? `Add the ${spec.label.toLowerCase()} first.` : null

  const line = (): CartLine => ({
    productId: product.id,
    variantId,
    quantity: qty,
    personalisationText: personalisation.trim() || undefined,
    wrappingId: wrappingId === "none" ? undefined : wrappingId,
    title: product.title,
    variantName: variant.name,
    image: product.images[0],
    unitPrice: variant.price,
    vendorId: vendor.id,
    vendorName: vendor.name,
    addedAt: new Date().toISOString(),
  })

  const guard = () => {
    if (!purchasable) return false
    if (available < qty) {
      toast.error(available === 0 ? "That option is sold out. Choose another." : `Only ${available} available.`)
      return false
    }
    if (personalisationError) {
      toast.error(personalisationError)
      document.getElementById("personalisation")?.focus()
      return false
    }
    return true
  }

  const buyNow = (purchaseType: "gift" | "self") => {
    if (!guard()) return
    preferredZone.set(zone)
    checkoutIntent.set({
      vendorId: vendor.id,
      vendorName: vendor.name,
      lines: [line()],
      source: store ? "storefront" : "marketplace",
      storefrontId: store?.storefrontId ?? null,
      storefrontSlug: store?.storefrontSlug ?? null,
      campaign: store?.campaign,
      purchaseType,
      fromBag: false,
      zoneId: zone,
      requestedDate: date ?? undefined,
    })
    navigate("/checkout")
  }

  const addToBag = () => {
    if (!guard()) return
    const run = () => {
      cart.add(line(), { source: store ? "storefront" : "marketplace", storefrontId: store?.storefrontId ?? null, storefrontSlug: store?.storefrontSlug ?? null, campaign: store?.campaign })
      toast.success(`Added to your ${vendor.name} bag`, { action: { label: "View bag", onClick: () => navigate("/cart") } })
    }
    const bags = cart.get().bags
    const otherVendors = Object.values(bags).filter((b) => b.vendorId !== vendor.id && b.lines.length)
    // STF 07: explain the separate checkout before creating a second bag; never clear the first.
    if (!bags[vendor.id] && otherVendors.length) setConfirmSeparate(() => run)
    else run()
  }

  const crumbsBase = store ? `/stores/${store.storefrontSlug}` : "/shop"

  return (
    <>
      <Container className="pt-6 pb-16">
        <nav aria-label="Breadcrumb" className="text-muted-foreground mb-6 flex flex-wrap items-center gap-1.5 text-sm">
          <Link to={crumbsBase} className="hover:text-foreground">
            {store ? vendor.name : "Gifts"}
          </Link>
          <span aria-hidden="true">/</span>
          {!store && (
            <>
              <Link to={`/shop?category=${product.category}`} className="hover:text-foreground">
                {categoryName(product.category)}
              </Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span className="text-foreground truncate">{product.title}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          {/* Gallery */}
          <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-28 lg:self-start">
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl sm:aspect-square lg:aspect-[4/5]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={image} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                  <Img src={product.images[image]} alt={image === 0 ? product.title : `${product.title}, photo ${image + 1}`} eager className="size-full" sizes="(min-width: 1024px) 55vw, 100vw" />
                </motion.div>
              </AnimatePresence>
              <SaveButton productId={product.id} title={product.title} className="absolute top-4 right-4" />
              {product.sponsored && <Badge className="bg-card/90 text-foreground shadow-border absolute top-4 left-4 backdrop-blur">Sponsored</Badge>}
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-3" role="tablist" aria-label="Photos">
                {product.images.map((src, i) => (
                  <button key={src} type="button" role="tab" aria-selected={i === image} aria-label={`Photo ${i + 1}`} onClick={() => setImage(i)} className={cn("press size-20 overflow-hidden rounded-xl transition-[box-shadow,opacity]", i === image ? "shadow-[0_0_0_2px_var(--foreground)]" : "opacity-70 hover:opacity-100")}>
                    <Img src={src} alt="" className="size-full" sizes="80px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Purchase panel */}
          <div className="flex min-w-0 flex-col gap-7">
            <div className="flex flex-col gap-3">
              <Link to={vendor.storefrontSlug ? `/stores/${vendor.storefrontSlug}` : "/vendors"} className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-2 text-sm">
                <VendorAvatar name={vendor.name} initials={vendor.logoInitials} color={vendor.logoColor} className="size-6 text-[0.625rem]" />
                {vendor.name}
                {vendor.verified && <VerifiedCheckIcon className="text-info size-4" aria-label="Verified by JustGifter" />}
              </Link>
              <h1 className="font-display text-4xl leading-[1.05] font-medium sm:text-5xl">{product.title}</h1>
              <p className="text-muted-foreground text-lg">{product.summary}</p>
              <p className="flex items-baseline gap-3 text-2xl font-semibold">
                <span className="tabular">{formatMoney(variant.price)}</span>
                {variant.price > Math.min(...product.variants.map((v) => v.price)) && <span className="text-muted-foreground text-sm font-normal">Other options from <PriceTag from={Math.min(...product.variants.map((v) => v.price))} /></span>}
              </p>
            </div>

            {!purchasable && (
              <Alert>
                <InfoCircleIcon />
                <AlertDescription>{vendor.status === "suspended" ? "This vendor isn't taking new orders right now." : product.status !== "active" ? "This listing is waiting for review and can't be bought yet." : "This store has paused ordering. You can still save this item."}</AlertDescription>
              </Alert>
            )}

            {product.variants.length > 1 && (
              <FieldSet>
                <FieldLegend variant="label">Option</FieldLegend>
                <div role="radiogroup" aria-label="Option" className="flex flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const left = availability[v.id] ?? 0
                    const selected = v.id === variantId
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={left === 0}
                        onClick={() => {
                          setVariantId(v.id)
                          setQty(1)
                        }}
                        className={cn("press flex flex-col items-start rounded-xl px-4 py-2.5 text-left transition-[box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-50", selected ? "bg-card shadow-[0_0_0_2px_var(--foreground)]" : "bg-card shadow-border hover:shadow-border-hover")}
                      >
                        <span className="text-sm font-medium">{v.name}</span>
                        <span className="text-muted-foreground tabular text-xs">
                          {formatMoney(v.price)}
                          {left === 0 ? " · Sold out" : left <= 3 ? ` · ${left} left` : ""}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </FieldSet>
            )}

            {spec && (
              <Field data-invalid={personalisationError && personalisation.length > 0 ? true : undefined}>
                <FieldLabel htmlFor="personalisation" className="flex items-center gap-2">
                  <PenIcon className="size-4" />
                  {spec.label}
                  {!spec.required && <span className="text-muted-foreground font-normal">(optional)</span>}
                  {spec.fee > 0 && <span className="text-muted-foreground font-normal">+{formatMoney(spec.fee)}</span>}
                </FieldLabel>
                {spec.maxLength > 40 ? (
                  <Textarea id="personalisation" value={personalisation} maxLength={spec.maxLength} onChange={(e) => setPersonalisation(e.target.value)} rows={3} placeholder="Happy birthday! With love, Ada" />
                ) : (
                  <Input id="personalisation" value={personalisation} maxLength={spec.maxLength} onChange={(e) => setPersonalisation(e.target.value)} placeholder="e.g. A & T 2026" />
                )}
                <FieldDescription className="flex justify-between gap-4">
                  <span>
                    {spec.helpText}
                    {spec.extraPrepHours > 0 && personalised && ` Adds about ${Math.round(spec.extraPrepHours / 24)} day to preparation.`}
                  </span>
                  <span className="tabular shrink-0">
                    {personalisation.length}/{spec.maxLength}
                  </span>
                </FieldDescription>
              </Field>
            )}

            {product.wrapping.length > 0 && (
              <FieldSet>
                <FieldLegend variant="label">Gift wrapping</FieldLegend>
                <RadioGroup value={wrappingId} onValueChange={setWrappingId} className="grid gap-2 sm:grid-cols-3">
                  {[{ id: "none", name: "No wrapping", fee: 0 }, ...product.wrapping].map((w) => (
                    <label key={w.id} className={cn("bg-card flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-shadow", wrappingId === w.id ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border hover:shadow-border-hover")}>
                      <RadioGroupItem value={w.id} className="mt-0.5" />
                      <span className="text-sm">
                        <span className="block font-medium">{w.name}</span>
                        <span className="text-muted-foreground tabular">{w.fee ? `+${formatMoney(w.fee)}` : "Free"}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}

            {/* Delivery check */}
            <section aria-labelledby="delivery-check" className="bg-card shadow-border flex flex-col gap-4 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="delivery-check" className="flex items-center gap-2 font-medium">
                  <DeliveryIcon className="size-5" />
                  Delivery
                </h2>
                <div className="w-52">
                  <ZoneSelect value={zone} onChange={(z) => { setZone(z); setDate(null); preferredZone.set(z) }} allowed={vendorZones} />
                </div>
              </div>
              {quote.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : quote.data && quote.data.dates.length ? (
                <>
                  <DateStrip dates={quote.data.dates} value={date} onChange={setDate} earliest={quote.data.earliest} />
                  <p className="text-muted-foreground text-sm">
                    {date && (
                      <>
                        <span className="text-foreground font-medium">{friendlyDate(date)}</span>
                        {quote.data.windowStart && quote.data.windowEnd && date === quote.data.earliest ? `, ${formatWindow(quote.data.windowStart, quote.data.windowEnd)}` : ""} to {zoneById(zone)?.name} ·{" "}
                      </>
                    )}
                    {quote.data.fee !== null && <span className="tabular">{formatMoney(quote.data.fee)} delivery</span>} · {vendor.fulfilment === "courier" ? "Courier partner" : `${vendor.name}'s own riders`}
                  </p>
                  {quote.data.sameDay && date === quote.data.earliest && (
                    <p className="text-success flex items-center gap-1.5 text-sm font-medium">
                      <ClockCircleIcon className="size-4" />
                      Order before {vendor.operating.cutoffHour > 12 ? vendor.operating.cutoffHour - 12 : vendor.operating.cutoffHour}pm for same-day delivery
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">{quote.data?.message ?? "No delivery dates available for this area right now."}</p>
              )}
              {!canSendWithoutAddress(product) && <p className="text-muted-foreground border-t pt-3 text-xs">{product.perishable ? "Fresh item" : "Personalised item"}: you'll need the recipient's address at checkout.</p>}
            </section>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <QuantityStepper value={qty} onChange={setQty} max={Math.max(1, Math.min(20, available))} />
                <p className="text-muted-foreground text-sm">
                  {available === 0 ? "Sold out" : available <= 3 ? <span className="text-warning font-medium">Only {available} left</span> : "In stock"}
                  {qty > 1 || personalised || wrappingId !== "none" ? <span className="tabular"> · {formatMoney(unit * qty)}</span> : null}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button size="xl" onClick={() => buyNow("gift")} disabled={!purchasable || available === 0}>
                  <GiftIcon data-icon="inline-start" />
                  Send as a gift
                </Button>
                <Button size="xl" variant="outline" onClick={() => buyNow("self")} disabled={!purchasable || available === 0}>
                  Order for myself
                </Button>
              </div>
              <Button variant="ghost" onClick={addToBag} disabled={!purchasable || available === 0} className="w-fit self-center">
                <BagHeartIcon data-icon="inline-start" />
                Add to bag
              </Button>
            </div>

            <ul className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
              <li className="flex items-center gap-2"><ShieldCheckIcon className="text-success size-4" /> Payment confirmed by Paystack</li>
              <li className="flex items-center gap-2"><CheckIcon className="text-success size-4" /> Price never shown to the recipient</li>
            </ul>

            <Accordion type="multiple" defaultValue={["about"]} className="border-t">
              <AccordionItem value="about">
                <AccordionTrigger className="text-base">About this gift</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4 text-[0.9375rem] leading-relaxed">
                  <p>{product.description}</p>
                  {product.included.length > 0 && (
                    <div>
                      <p className="mb-2 font-medium">What's included</p>
                      <ul className="flex flex-col gap-1.5">
                        {product.included.map((i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckIcon className="text-success mt-1 size-4 shrink-0" />
                            {i}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {product.dimensions && <p className="text-muted-foreground">Size: {product.dimensions}</p>}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="delivery">
                <AccordionTrigger className="text-base">Delivery & returns</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed">
                  <p>{vendor.deliveryPolicy}</p>
                  <p>{vendor.returnPolicy}</p>
                  <p className="text-muted-foreground text-sm">Preparation time: about {product.prepHours < 24 ? `${product.prepHours} hours` : `${Math.round(product.prepHours / 24)} day${product.prepHours >= 48 ? "s" : ""}`}. {product.returnEligible ? "Eligible for return under the vendor's policy." : "Not returnable once prepared."}</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="vendor">
                <AccordionTrigger className="text-base">About {vendor.name}</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed">
                  <p>{vendor.about}</p>
                  <p className="text-muted-foreground text-sm">
                    Based in {vendor.city} · usually confirms orders within {vendor.responseHours} {vendor.responseHours === 1 ? "hour" : "hours"}
                    {vendor.verified ? " · Verified by JustGifter's review process" : ""}
                  </p>
                  {vendor.storefrontSlug && vendor.storefrontStatus === "published" && !store && (
                    <Button variant="outline" className="w-fit" asChild>
                      <Link to={`/stores/${vendor.storefrontSlug}`}>Visit the store</Link>
                    </Button>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </Container>

      {related.length > 0 && !store && (
        <section aria-labelledby="related" className="bg-card border-t py-16">
          <Container className="flex flex-col gap-8">
            <h2 id="related" className="font-display text-3xl">You might also like</h2>
            <ProductGrid products={related.slice(0, 4)} />
          </Container>
        </section>
      )}

      <AlertDialog open={confirmSeparate !== null} onOpenChange={(o) => !o && setConfirmSeparate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This goes in a separate bag</AlertDialogTitle>
            <AlertDialogDescription>
              Each vendor delivers separately, so items from {vendor.name} are checked out on their own with their own delivery charge. Your other bag stays exactly as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmSeparate?.()
                setConfirmSeparate(null)
              }}
            >
              Add to a new bag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ProductSkeleton() {
  return (
    <Container className="grid gap-10 py-12 lg:grid-cols-[1.15fr_1fr]" aria-busy="true" aria-label="Loading">
      <Skeleton className="aspect-[4/5] rounded-3xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-6 h-40 rounded-2xl" />
        <Skeleton className="h-13 rounded-full" />
      </div>
    </Container>
  )
}

export const useProductHref = (store?: StoreContext) => useMemo(() => (slug: string) => (store ? `/stores/${store.storefrontSlug}/products/${slug}` : `/products/${slug}`), [store])

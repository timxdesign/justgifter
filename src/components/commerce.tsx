import { useMemo, type ReactNode } from "react"
import { Link } from "react-router"
import { cn } from "cn"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import type { ProductCard as ProductCardData } from "@/api"
import type { DateOnly, OrderStatus, PriceBreakdown, ZoneId } from "@domain/index.ts"
import { FULFILMENT_MILESTONES, milestoneIndex, ORDER_STATUS_LABEL, ZONES, zoneById } from "@domain/index.ts"
import { formatMoney, friendlyDate, formatShortDate } from "@/lib/format"
import { useSaved } from "@/lib/cart"
import { Img } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HeartIcon, HeartBoldIcon, VerifiedCheckIcon, DeliveryIcon, CheckIcon } from "@/components/icons"

// ---------------------------------------------------------------- Price

/** CAT 04: a "from" price states that options can cost more. */
export function PriceTag({ from, to, className }: { from: number; to?: number; className?: string }) {
  const range = to !== undefined && to !== from
  return (
    <span className={cn("tabular", className)}>
      {range && <span className="text-muted-foreground font-normal">From </span>}
      {formatMoney(from)}
    </span>
  )
}

// ---------------------------------------------------------------- Save

export function SaveButton({ productId, title, className }: { productId: string; title: string; className?: string }) {
  const saved = useSaved()
  const on = saved.has(productId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${title} from saved` : `Save ${title}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const nowSaved = saved.toggle(productId)
        toast(nowSaved ? "Saved for later" : "Removed from saved", { duration: 1600 })
      }}
      className={cn(
        "press relative grid size-10 place-items-center rounded-full bg-card/85 text-foreground shadow-border backdrop-blur-md transition-colors hover:bg-card",
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={on ? "on" : "off"}
          initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
          className="grid place-items-center"
        >
          {on ? <HeartBoldIcon className="text-brand size-[1.125rem]" /> : <HeartIcon className="size-[1.125rem]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

// ---------------------------------------------------------------- Product card

export function ProductCard({ product, href, priority, className, footer }: { product: ProductCardData; href?: string; priority?: boolean; className?: string; footer?: ReactNode }) {
  const to = href ?? `/products/${product.slug}`
  return (
    <article className={cn("group/card relative flex flex-col gap-3", className)}>
      <div className="relative overflow-hidden rounded-2xl">
        <Link to={to} className="block" aria-label={product.title} tabIndex={-1}>
          <div className="aspect-[4/5] overflow-hidden">
            <Img
              src={product.images[0]}
              alt=""
              eager={priority}
              sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 46vw"
              className={cn("size-full transition-[scale,opacity] duration-700 ease-out group-hover/card:scale-[1.04]", !product.inStock && "grayscale-[0.6]")}
            />
          </div>
          {product.images[1] && (
            <Img
              src={product.images[1]}
              alt=""
              sizes="(min-width: 1024px) 22vw, 46vw"
              className="pointer-events-none absolute inset-0 size-full opacity-0! transition-opacity! duration-500 group-hover/card:opacity-100! max-md:hidden"
            />
          )}
        </Link>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-1.5">
          {product.sponsored && <Badge className="pointer-events-auto bg-card/90 text-foreground shadow-border backdrop-blur-md">Sponsored</Badge>}
          {!product.inStock ? (
            <Badge className="bg-card/90 text-foreground shadow-border backdrop-blur-md">Sold out</Badge>
          ) : product.lowStock ? (
            <Badge className="bg-card/90 text-foreground shadow-border backdrop-blur-md">Only {product.lowStock} left</Badge>
          ) : null}
        </div>
        <SaveButton productId={product.id} title={product.title} className="absolute top-3 right-3 opacity-100 md:opacity-0 md:group-hover/card:opacity-100 md:focus-visible:opacity-100 aria-pressed:opacity-100" />
        {product.earliest?.sameDay && product.inStock && (
          <span className="bg-plum/85 text-plum-foreground pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-md">
            <DeliveryIcon className="size-3.5" />
            Today in {zoneById(product.earliest.zoneId)?.city}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-0.5">
        <p className="text-muted-foreground flex items-center gap-1 text-[0.8125rem]">
          <span className="truncate">{product.vendor.name}</span>
          {product.vendor.verified && <VerifiedCheckIcon className="text-info size-3.5 shrink-0" aria-label="Verified vendor" />}
        </p>
        <h3 className="line-clamp-2 leading-snug font-medium">
          <Link to={to} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {product.title}
          </Link>
        </h3>
        <p className="text-[0.9375rem] font-semibold">
          <PriceTag from={product.priceFrom} to={product.priceTo} />
        </p>
        {footer}
      </div>
    </article>
  )
}

export function ProductGrid({ products, hrefFor, className }: { products: ProductCardData[]; hrefFor?: (p: ProductCardData) => string; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4", className)}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} href={hrefFor?.(p)} priority={i < 4} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Zone & date

export function ZoneSelect({ value, onChange, allowed, id, placeholder = "Choose a delivery area", className, invalid, label = "Delivery area" }: { value: ZoneId | null | undefined; onChange: (z: ZoneId) => void; allowed?: ZoneId[]; id?: string; placeholder?: string; className?: string; invalid?: boolean; label?: string }) {
  const cities = useMemo(() => [...new Set(ZONES.map((z) => z.city))], [])
  return (
    <Select value={value ?? undefined} onValueChange={(v) => onChange(v as ZoneId)}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-invalid={invalid || undefined} aria-label={id ? undefined : label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {cities.map((city) => (
          <SelectGroup key={city}>
            <SelectLabel>{city}</SelectLabel>
            {ZONES.filter((z) => z.city === city).map((z) => {
              const disabled = allowed && !allowed.includes(z.id)
              return (
                <SelectItem key={z.id} value={z.id} disabled={disabled}>
                  {z.name}
                  {disabled && <span className="text-muted-foreground ml-1 text-xs">— not delivered by this vendor</span>}
                </SelectItem>
              )
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A strip of the next deliverable dates; anything not in `dates` can't be chosen (AC 01). */
export function DateStrip({ dates, value, onChange, earliest, label = "Delivery date" }: { dates: DateOnly[]; value: DateOnly | null; onChange: (d: DateOnly) => void; earliest?: DateOnly | null; label?: string }) {
  if (!dates.length) return <p className="text-muted-foreground text-sm">No delivery dates available for this area right now.</p>
  return (
    <div role="radiogroup" aria-label={label} className="scrollbar-none -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {dates.slice(0, 14).map((d) => {
        const selected = d === value
        const [, , day] = d.split("-")
        const weekday = new Intl.DateTimeFormat("en-NG", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))
        const month = new Intl.DateTimeFormat("en-NG", { month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))
        const rel = friendlyDate(d)
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${rel === "Today" || rel === "Tomorrow" ? `${rel}, ` : ""}${weekday} ${Number(day)} ${month}`}
            onClick={() => onChange(d)}
            className={cn(
              "press flex w-[4.25rem] shrink-0 snap-start flex-col items-center gap-0.5 rounded-xl py-2.5 text-center transition-[background-color,box-shadow,color] duration-150",
              selected ? "bg-primary text-primary-foreground" : "bg-card shadow-border hover:shadow-border-hover",
            )}
          >
            <span className={cn("text-[0.6875rem] font-medium uppercase", selected ? "opacity-80" : "text-muted-foreground")}>{rel === "Today" || rel === "Tomorrow" ? rel : weekday}</span>
            <span className="tabular text-lg leading-tight font-semibold">{Number(day)}</span>
            <span className={cn("text-[0.6875rem]", selected ? "opacity-80" : "text-muted-foreground")}>{month}</span>
            {earliest === d && !selected && <span className="sr-only">Earliest available</span>}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Breakdown

export function PriceBreakdownList({ pricing, className, compact }: { pricing: PriceBreakdown; className?: string; compact?: boolean }) {
  const rows: [string, number, string?][] = [
    ["Items", pricing.items],
    ...(pricing.wrapping ? [["Gift wrapping", pricing.wrapping] as [string, number]] : []),
    ...(pricing.personalisation ? [["Personalisation", pricing.personalisation] as [string, number]] : []),
    ["Delivery", pricing.delivery, pricing.deliveryProvisional ? "Based on the delivery area you chose" : undefined],
    ...(pricing.discount ? [["Discount", -pricing.discount] as [string, number]] : []),
    ...(pricing.platformFee ? [["Service fee", pricing.platformFee] as [string, number]] : []),
  ]
  return (
    <dl className={cn("flex flex-col gap-2 text-sm", className)}>
      {rows.map(([label, amount, hint]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">
            {label}
            {hint && !compact && <span className="block text-xs">{hint}</span>}
          </dt>
          <dd className="tabular">{amount < 0 ? `−${formatMoney(-amount)}` : formatMoney(amount)}</dd>
        </div>
      ))}
      <div className="border-border mt-1 flex items-baseline justify-between gap-4 border-t pt-3">
        <dt className="font-medium">Total</dt>
        <dd className="tabular text-lg font-semibold">{formatMoney(pricing.total)}</dd>
      </div>
      {pricing.taxIncludedInPrices && !compact && <p className="text-muted-foreground text-xs">Prices include VAT where it applies. No charges are ever passed to the recipient.</p>}
    </dl>
  )
}

// ---------------------------------------------------------------- Order progress

const MILESTONE_LABEL: Record<string, { gift: string; self: string }> = {
  paid: { gift: "Payment confirmed", self: "Payment confirmed" },
  awaiting_vendor_acceptance: { gift: "Vendor confirming", self: "Vendor confirming" },
  preparing: { gift: "Preparing your gift", self: "Preparing your order" },
  dispatched: { gift: "On its way", self: "On its way" },
  delivered: { gift: "Delivered", self: "Delivered" },
}

export function OrderProgress({ status, purchaseType, className }: { status: OrderStatus; purchaseType: "gift" | "self"; className?: string }) {
  const index = milestoneIndex(status)
  const halted = ["cancelled", "declined", "payment_expired"].includes(status)
  const issue = status === "delivery_issue"
  return (
    <ol className={cn("grid grid-cols-5 gap-1.5", className)} aria-label="Order progress">
      {FULFILMENT_MILESTONES.map((m, i) => {
        const done = !halted && i <= index
        const current = !halted && i === index
        return (
          <li key={m} className="flex flex-col gap-2" aria-current={current ? "step" : undefined}>
            <span className={cn("h-1.5 rounded-full transition-colors duration-500", done ? (issue && current ? "bg-warning" : "bg-success") : "bg-muted")} />
            <span className={cn("text-[0.6875rem] leading-tight sm:text-xs", done ? "text-foreground font-medium" : "text-muted-foreground")}>
              {done && !current && <CheckIcon className="text-success mr-0.5 inline size-3 align-[-2px]" aria-hidden="true" />}
              {MILESTONE_LABEL[m][purchaseType]}
              <span className="sr-only">{done ? (current ? " (current)" : " (done)") : " (not yet)"}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export const statusText = (s: OrderStatus) => ORDER_STATUS_LABEL[s]
export const shortDate = formatShortDate

export function VendorAvatar({ name, initials, color, className }: { name: string; initials: string; color: string; className?: string }) {
  return (
    <span aria-hidden="true" title={name} className={cn("grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-semibold text-white", className)} style={{ background: `color-mix(in oklch, ${color} 72%, black)` }}>
      {initials}
    </span>
  )
}

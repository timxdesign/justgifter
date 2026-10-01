import { useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { cn } from "cn"
import type { CategoryId, OccasionId, ZoneId } from "@domain/index.ts"
import { BUDGET_BANDS, CATEGORIES, OCCASIONS, occasionById, zoneById, addDays } from "@domain/index.ts"
import type { ProductQuery, ProductSort } from "@/api"
import { Container, Img, CardGridSkeleton, EmptyState, ErrorState } from "@/components/common"
import { ProductGrid, ZoneSelect } from "@/components/commerce"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tuning2Icon, CloseIcon, MagnifierIcon, StarsIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"
import { todayLagos, formatDate } from "@/lib/format"

const SORTS: { id: ProductSort; label: string }[] = [
  { id: "relevance", label: "Most relevant" },
  { id: "earliest", label: "Earliest arrival" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
]

export default function ShopPage() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const occasion = (params.occasion ?? search.get("occasion") ?? undefined) as OccasionId | undefined
  const occasionMeta = occasionById(occasion)
  const q = search.get("q") ?? undefined
  const guideId = search.get("guide")
  const band = BUDGET_BANDS.find((b) => b.id === search.get("budget"))
  const [pageSize, setPageSize] = useState(24)

  const feed = useApiQuery(qk.home, (api) => api.getHomeFeed(), { enabled: Boolean(guideId) })
  const guide = feed.data?.guides.find((g) => g.id === guideId)

  const query: ProductQuery = useMemo(
    () => ({
      q,
      occasion,
      category: (search.get("category") as CategoryId) ?? undefined,
      budgetMin: band?.min || undefined,
      budgetMax: band?.max ?? undefined,
      zoneId: (search.get("zone") as ZoneId) ?? undefined,
      deliverBy: search.get("by") ?? undefined,
      personalisable: search.get("personalised") === "1" || undefined,
      inStockOnly: search.get("instock") === "1" || undefined,
      sort: (search.get("sort") as ProductSort) ?? "relevance",
      ids: guide?.productIds,
      pageSize,
    }),
    [q, occasion, search, band, guide, pageSize],
  )
  const products = useApiQuery(qk.products(query), (api) => api.listProducts(query), { enabled: !guideId || Boolean(guide), placeholderData: (prev) => prev })

  const title = guide?.title ?? occasionMeta?.name ?? (q ? `Results for “${q}”` : "All gifts")
  useDocumentMeta({
    title: occasionMeta ? `${occasionMeta.name} gifts` : guide?.title ?? (q ? `Search: ${q}` : "Shop gifts"),
    description: occasionMeta ? `${occasionMeta.name} gifts from trusted vendors, delivered across Lagos, Abuja and Port Harcourt.` : "Browse gifts from approved vendors with truthful availability and delivery dates.",
    canonical: occasionMeta ? `/occasions/${occasionMeta.id}` : "/shop",
    noindex: Boolean(q),
  })

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(search)
    if (value === null || value === "") next.delete(key)
    else next.set(key, value)
    setSearch(next, { replace: true, preventScrollReset: true })
  }

  const active: { key: string; label: string }[] = [
    ...(search.get("category") ? [{ key: "category", label: CATEGORIES.find((c) => c.id === search.get("category"))?.name ?? "" }] : []),
    ...(band ? [{ key: "budget", label: band.label }] : []),
    ...(search.get("zone") ? [{ key: "zone", label: `Delivers to ${zoneById(search.get("zone"))?.name}` }] : []),
    ...(search.get("by") ? [{ key: "by", label: `Arrives by ${formatDate(search.get("by")!)}` }] : []),
    ...(search.get("personalised") ? [{ key: "personalised", label: "Personalised" }] : []),
    ...(search.get("instock") ? [{ key: "instock", label: "In stock" }] : []),
    ...(search.get("occasion") && !params.occasion ? [{ key: "occasion", label: occasionMeta?.name ?? "" }] : []),
  ]

  const filters = <Filters search={search} set={set} hideOccasion={Boolean(params.occasion)} />

  return (
    <>
      {occasionMeta ? (
        <section className="relative isolate overflow-hidden">
          <Img src={occasionMeta.image.replace(".webp", "@2x.webp")} alt="" eager className="absolute inset-0 -z-10 size-full" sizes="100vw" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
          <Container className="flex min-h-72 flex-col justify-end gap-3 py-12 text-white">
            <nav aria-label="Breadcrumb" className="text-sm opacity-80">
              <Link to="/shop" className="hover:underline">
                Gifts
              </Link>{" "}
              / {occasionMeta.name}
            </nav>
            <h1 className="font-display text-5xl font-medium sm:text-6xl">{occasionMeta.name} gifts</h1>
            <p className="max-w-lg text-lg opacity-90">{occasionMeta.blurb}</p>
          </Container>
        </section>
      ) : (
        <Container className="flex flex-col gap-3 pt-10 pb-2">
          <h1 className="font-display text-4xl font-medium sm:text-5xl">{title}</h1>
          <p className="text-muted-foreground max-w-xl">{guide?.description ?? "Every item comes from an approved vendor. Set a delivery area and date to see only what can arrive in time."}</p>
        </Container>
      )}

      <div className="bg-background/90 sticky top-16 z-30 border-b backdrop-blur-xl lg:top-[4.5rem]">
        <Container className="flex items-center gap-2 py-3">
          <div className="hidden flex-1 flex-wrap items-center gap-2 lg:flex">{filters}</div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden">
                <Tuning2Icon data-icon="inline-start" />
                Filters
                {active.length > 0 && <Badge variant="brand">{active.length}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <FieldGroup className="overflow-y-auto px-4">{filters}</FieldGroup>
              <SheetFooter>
                <Button size="lg" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}>
                  Show {products.data?.total ?? ""} gifts
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <div className="ml-auto">
            <Select value={query.sort} onValueChange={(v) => set("sort", v === "relevance" ? null : v)}>
              <SelectTrigger className="w-48" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {SORTS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </Container>
      </div>

      <Container className="flex flex-col gap-6 py-8">
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <p className="text-muted-foreground mr-2 text-sm">{products.data ? `${products.data.total} ${products.data.total === 1 ? "gift" : "gifts"}` : "Loading…"}</p>
          {active.map((f) => (
            <button key={f.key} type="button" onClick={() => set(f.key, null)} className="press bg-muted hover:bg-accent flex items-center gap-1.5 rounded-full py-1 pr-2 pl-3 text-sm" aria-label={`Remove filter: ${f.label}`}>
              {f.label}
              <CloseIcon className="size-3.5" />
            </button>
          ))}
          {active.length > 1 && (
            <button type="button" className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4" onClick={() => setSearch(params.occasion ? {} : q ? { q } : {}, { replace: true })}>
              Clear all
            </button>
          )}
        </div>

        {products.error ? (
          <ErrorState error={products.error} retry={() => products.refetch()} />
        ) : !products.data ? (
          <CardGridSkeleton />
        ) : products.data.items.length === 0 ? (
          <EmptyState
            icon={<MagnifierIcon />}
            title={q ? `No gifts match “${q}”` : "Nothing matches those filters"}
            description={search.get("by") ? "Nothing can arrive by that date with these filters. A later date opens up more options." : "Try removing a filter, or describe who it's for and let the assistant suggest something."}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {active.length > 0 && (
                  <Button variant="outline" onClick={() => setSearch(q ? { q } : {}, { replace: true })}>
                    Clear filters
                  </Button>
                )}
                <Button asChild>
                  <Link to={`/assistant${q ? `?q=${encodeURIComponent(q)}` : ""}`}>
                    <StarsIcon data-icon="inline-start" />
                    Ask the gift assistant
                  </Link>
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <ProductGrid products={products.data.items} className={cn(products.isFetching && "opacity-70 transition-opacity")} />
            {products.data.total > products.data.items.length && (
              <div className="flex justify-center pt-6">
                <Button variant="outline" size="lg" onClick={() => setPageSize((n) => n + 24)}>
                  Show more gifts
                </Button>
              </div>
            )}
          </>
        )}
      </Container>
    </>
  )
}

function Filters({ search, set, hideOccasion }: { search: URLSearchParams; set: (k: string, v: string | null) => void; hideOccasion: boolean }) {
  const today = todayLagos()
  const byOptions = [
    { value: today, label: "Today" },
    { value: addDays(today, 1), label: "Tomorrow" },
    { value: addDays(today, 3), label: `By ${formatDate(addDays(today, 3))}` },
    { value: addDays(today, 7), label: "Within a week" },
  ]
  return (
    <>
      {!hideOccasion && (
        <FilterSelect label="Occasion" value={search.get("occasion")} onChange={(v) => set("occasion", v)} options={OCCASIONS.map((o) => ({ value: o.id, label: o.name }))} />
      )}
      <FilterSelect label="Category" value={search.get("category")} onChange={(v) => set("category", v)} options={CATEGORIES.map((c) => ({ value: c.id, label: c.name }))} />
      <FilterSelect label="Budget" value={search.get("budget")} onChange={(v) => set("budget", v)} options={BUDGET_BANDS.map((b) => ({ value: b.id, label: b.label }))} />
      <Field className="lg:w-auto">
        <FieldLabel htmlFor="zone-filter" className="lg:sr-only">
          Deliver to
        </FieldLabel>
        <ZoneSelect id="zone-filter" value={(search.get("zone") as ZoneId) ?? null} onChange={(z) => set("zone", z)} placeholder="Deliver to" className="lg:w-44" />
      </Field>
      <FilterSelect label="Arrives" value={search.get("by")} onChange={(v) => set("by", v)} options={byOptions} disabledHint={!search.get("zone") ? "Choose a delivery area for accurate dates" : undefined} />
      <div className="flex items-center gap-2 py-2 lg:px-2">
        <Switch id="personalised" checked={search.get("personalised") === "1"} onCheckedChange={(c) => set("personalised", c ? "1" : null)} />
        <Label htmlFor="personalised" className="font-normal">
          Personalised
        </Label>
      </div>
      <div className="flex items-center gap-2 py-2 lg:px-2">
        <Switch id="instock" checked={search.get("instock") === "1"} onCheckedChange={(c) => set("instock", c ? "1" : null)} />
        <Label htmlFor="instock" className="font-normal">
          In stock
        </Label>
      </div>
    </>
  )
}

function FilterSelect({ label, value, onChange, options, disabledHint }: { label: string; value: string | null; onChange: (v: string | null) => void; options: { value: string; label: string }[]; disabledHint?: string }) {
  const id = `f-${label.toLowerCase()}`
  return (
    <Field className="lg:w-auto">
      <FieldLabel htmlFor={id} className="lg:sr-only">
        {label}
      </FieldLabel>
      <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
        <SelectTrigger id={id} className={cn("lg:w-auto lg:min-w-32", value && "bg-muted")} title={disabledHint}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="__all">{label}: any</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

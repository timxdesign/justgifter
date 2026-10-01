import { useEffect, useState } from "react"
import { Link } from "react-router"
import { cn } from "cn"
import type { StoreAccent, StoreCollection } from "@domain/index.ts"
import type { StorefrontDraftInput } from "@/api"
import { ErrorState, PageSkeleton, Img, StatusBadge } from "@/components/common"
import { WsHeader, Panel } from "@/components/workspace"
import { ShareCard } from "@/components/share"
import { ACCENT } from "@/components/store-chrome"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Checkbox } from "@/components/ui/checkbox"
import { EyeIcon, AddCircleIcon, TrashBinMinimalisticIcon, InfoCircleIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"

const COVERS = ["/media/v/flower-shop.webp", "/media/v/gifts-dark.webp", "/media/v/baking.webp", "/media/v/living-room.webp", "/media/v/kitchen.webp", "/media/v/garden.webp", "/media/v/library.webp", "/media/v/serum.webp", "/media/v/jewellery.webp", "/media/v/backpack.webp", "/media/v/baby.webp"]

export default function StorefrontEditor() {
  useDocumentMeta({ title: "Storefront", noindex: true })
  const ws = useApiQuery(qk.vendorWorkspace, (api) => api.getVendorWorkspace())
  const products = useApiQuery(qk.vendorProducts, (api) => api.listVendorProducts())
  if (ws.error) return <ErrorState error={ws.error} />
  if (!ws.data || !products.data) return <PageSkeleton />
  const sf = ws.data.storefront
  if (!sf) return <Alert><InfoCircleIcon /><AlertTitle>Your storefront unlocks after approval</AlertTitle><AlertDescription>Once our team approves your application, you can design and publish your store here.</AlertDescription></Alert>
  return <Editor initial={{ slug: sf.slug, headline: sf.headline, intro: sf.intro, accent: sf.accent, layout: sf.layout, coverImage: sf.coverImage, featuredProductIds: sf.featuredProductIds, collections: sf.collections }} status={sf.status} history={sf.slugHistory} products={products.data.filter((r) => r.product.status === "active").map((r) => r.product)} />
}

function Editor({ initial, status, history, products }: { initial: StorefrontDraftInput; status: "draft" | "published" | "paused"; history: string[]; products: { id: string; title: string; images: string[] }[] }) {
  const [d, setD] = useState(initial)
  useEffect(() => setD(initial), [initial.slug]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof StorefrontDraftInput>(k: K, v: StorefrontDraftInput[K]) => setD((x) => ({ ...x, [k]: v }))
  const inv = [qk.vendorWorkspace, qk.vendorDashboard, qk.storefront(initial.slug), qk.storefront(d.slug)]
  const save = useApiMutation((api) => api.saveStorefront(d), { invalidate: inv, success: (r) => (r.slugChanged ? "Saved. Your old link will keep redirecting here." : "Storefront saved") })
  const toggle = useApiMutation((api, s: "published" | "paused") => api.setStorefrontStatus(s), { invalidate: inv, success: (_, s) => (s === "published" ? "Your store is live" : "Ordering paused — your link shows a friendly notice") })
  const url = `${location.origin}/stores/${initial.slug}`
  const setCollection = (i: number, patch: Partial<StoreCollection>) => set("collections", d.collections.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <>
      <WsHeader
        title="Storefront"
        description={<span className="flex items-center gap-2">Status: <StatusBadge tone={status === "published" ? "success" : status === "paused" ? "warning" : "neutral"}>{status === "published" ? "Live" : status === "paused" ? "Ordering paused" : "Not published"}</StatusBadge></span>}
        actions={
          <>
            <Button variant="outline" asChild><Link to={`/stores/${initial.slug}`} target="_blank"><EyeIcon data-icon="inline-start" />Preview</Link></Button>
            {status === "published" ? <Button variant="outline" onClick={() => toggle.mutate("paused")}>Pause ordering</Button> : <Button onClick={() => toggle.mutate("published")} disabled={toggle.isPending}>{status === "paused" ? "Resume ordering" : "Publish store"}</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <form className="flex min-w-0 flex-col gap-6" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <Panel title="Your link">
            <Field>
              <FieldLabel htmlFor="s-slug">Store address</FieldLabel>
              <InputGroup>
                <InputGroupAddon><InputGroupText>justgifter.com/stores/</InputGroupText></InputGroupAddon>
                <InputGroupInput id="s-slug" value={d.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
              </InputGroup>
              <FieldDescription>If you change it, old links keep redirecting and are never given to anyone else.{history.length ? ` Previous: ${history.join(", ")}` : ""}</FieldDescription>
            </Field>
          </Panel>
          <Panel title="Branding">
            <FieldGroup>
              <Field><FieldLabel htmlFor="s-head">Headline</FieldLabel><Input id="s-head" value={d.headline} onChange={(e) => set("headline", e.target.value)} maxLength={90} /></Field>
              <Field><FieldLabel htmlFor="s-intro">Introduction</FieldLabel><Textarea id="s-intro" rows={4} value={d.intro} onChange={(e) => set("intro", e.target.value)} /></Field>
              <FieldSet>
                <FieldLegend variant="label">Accent colour</FieldLegend>
                <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
                  {(Object.keys(ACCENT) as StoreAccent[]).map((a) => <button key={a} type="button" role="radio" aria-checked={d.accent === a} aria-label={a} onClick={() => set("accent", a)} className={cn("press size-10 rounded-full ring-offset-2 transition-shadow", d.accent === a && "ring-foreground ring-2")} style={{ background: ACCENT[a] }} />)}
                </div>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Layout</FieldLegend>
                <div className="grid grid-cols-2 gap-2">
                  {(["grid", "editorial"] as const).map((l) => <button key={l} type="button" aria-pressed={d.layout === l} onClick={() => set("layout", l)} className={cn("press bg-card rounded-xl p-3 text-left text-sm capitalize transition-shadow", d.layout === l ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border")}>{l}<span className="text-muted-foreground block text-xs normal-case">{l === "grid" ? "Products first, left-aligned header" : "Centred, magazine-style header"}</span></button>)}
                </div>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Cover photo</FieldLegend>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{COVERS.map((c) => <button key={c} type="button" aria-pressed={d.coverImage === c} onClick={() => set("coverImage", c)} className={cn("press aspect-square overflow-hidden rounded-lg", d.coverImage === c && "ring-foreground ring-2 ring-offset-2")}><Img src={c} alt="" className="size-full" sizes="100px" /></button>)}</div>
              </FieldSet>
            </FieldGroup>
          </Panel>
          <Panel title="Featured products">
            <ProductPicker products={products} selected={d.featuredProductIds} onChange={(ids) => set("featuredProductIds", ids.slice(0, 6))} />
          </Panel>
          <Panel title="Collections" action={<Button type="button" variant="outline" size="sm" onClick={() => set("collections", [...d.collections, { id: `col_${Date.now()}`, name: "New collection", description: "", productIds: [] }])}><AddCircleIcon data-icon="inline-start" />Add</Button>}>
            {d.collections.map((c, i) => (
              <div key={c.id} className="bg-muted/50 flex flex-col gap-3 rounded-xl p-4">
                <div className="flex gap-2"><Input aria-label="Collection name" value={c.name} onChange={(e) => setCollection(i, { name: e.target.value })} /><Button type="button" variant="ghost" size="icon" aria-label="Delete collection" onClick={() => set("collections", d.collections.filter((_, j) => j !== i))}><TrashBinMinimalisticIcon /></Button></div>
                <ProductPicker products={products} selected={c.productIds} onChange={(ids) => setCollection(i, { productIds: ids })} />
              </div>
            ))}
          </Panel>
          <Button type="submit" size="lg" className="w-fit" disabled={save.isPending}>{save.isPending && <Spinner data-icon="inline-start" />}Save storefront</Button>
        </form>
        <aside className="flex flex-col gap-6">
          <Panel title="Share your store">
            <ShareCard url={url} title={`Shop ${d.headline}`} filename={initial.slug} />
            <p className="text-muted-foreground text-xs">Add <code>?ref=instagram</code> to the link to see which channel orders come from.</p>
          </Panel>
          <Alert><InfoCircleIcon /><AlertDescription className="text-xs">Store orders use JustGifter checkout, fees and support, and appear in your orders list labelled “Your store”.</AlertDescription></Alert>
        </aside>
      </div>
    </>
  )
}

function ProductPicker({ products, selected, onChange }: { products: { id: string; title: string; images: string[] }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {products.map((p) => (
        <li key={p.id}>
          <label className="bg-card shadow-border flex cursor-pointer items-center gap-3 rounded-xl p-2 text-sm">
            <Checkbox checked={selected.includes(p.id)} onCheckedChange={(c) => onChange(c ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
            <Img src={p.images[0]} alt="" className="size-9 rounded-md" sizes="36px" />
            <span className="truncate">{p.title}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}

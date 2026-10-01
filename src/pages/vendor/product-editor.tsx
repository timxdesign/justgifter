import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import { cn } from "cn"
import type { CategoryId, InterestId, OccasionId } from "@domain/index.ts"
import { CATEGORIES, INTERESTS, OCCASIONS, toMinor } from "@domain/index.ts"
import type { ProductDraftInput } from "@/api"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { Img, PageSkeleton } from "@/components/common"
import { WsHeader, Panel } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { ArrowLeftIcon, TrashBinMinimalisticIcon, AddCircleIcon, UploadIcon, InfoCircleIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { prepareImage } from "@/lib/images"
import { useDocumentMeta } from "@/lib/seo"

const empty: ProductDraftInput = { title: "", summary: "", description: "", category: "hampers", occasions: [], interests: [], included: [""], images: [], prepHours: 4, perishable: false, highlyCustomised: false, returnEligible: true, wrapping: [], variants: [{ name: "Standard", sku: "", price: 0, stock: 10 }] }

export default function ProductEditor() {
  const { id } = useParams()
  useDocumentMeta({ title: id ? "Edit product" : "Add product", noindex: true })
  const rows = useApiQuery(qk.vendorProducts, (api) => api.listVendorProducts(), { enabled: Boolean(id) })
  if (id && !rows.data) return <PageSkeleton />
  const p = id ? rows.data?.find((r) => r.product.id === id)?.product : undefined
  const initial: ProductDraftInput = p ? { id: p.id, title: p.title, summary: p.summary, description: p.description, category: p.category, occasions: p.occasions, interests: p.interests, included: p.included.length ? p.included : [""], dimensions: p.dimensions, images: p.images, prepHours: p.prepHours, perishable: p.perishable, highlyCustomised: p.highlyCustomised, returnEligible: p.returnEligible, personalisation: p.personalisation, wrapping: p.wrapping, variants: p.variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, price: v.price, stock: v.stock })) } : empty
  return <Editor initial={initial} />
}

function Editor({ initial }: { initial: ProductDraftInput }) {
  const navigate = useNavigate()
  const [d, setD] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof ProductDraftInput>(k: K, v: ProductDraftInput[K]) => setD((x) => ({ ...x, [k]: v }))
  useEffect(() => setD(initial), [initial.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useApiMutation((api) => api.saveVendorProduct({ ...d, included: d.included.filter((i) => i.trim()) }), { invalidate: [qk.vendorProducts, qk.vendorDashboard], onSuccess: (r) => { toast.success(r.needsReview ? "Saved and sent for review — usually within a day" : "Saved"); navigate("/vendor/products") } })
  const archive = useApiMutation((api) => api.archiveProduct(d.id!), { invalidate: [qk.vendorProducts], success: "Product archived", onSuccess: () => navigate("/vendor/products") })

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const api = await getApi()
      const urls: string[] = []
      for (const f of Array.from(files).slice(0, 6 - d.images.length)) urls.push(await api.uploadMedia(await prepareImage(f), "product"))
      set("images", [...d.images, ...urls])
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <>
      <Link to="/vendor/products" className="text-muted-foreground hover:text-foreground mb-4 flex w-fit items-center gap-1.5 text-sm"><ArrowLeftIcon className="size-4" />Products</Link>
      <WsHeader title={initial.id ? d.title || "Edit product" : "Add a product"} description="Changes to the title, photos, description or category go back to review. Price and stock changes go live straight away and never affect existing orders." />
      <form className="grid gap-6 lg:grid-cols-[1fr_20rem]" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Details">
            <FieldGroup>
              <Field><FieldLabel htmlFor="p-title">Title</FieldLabel><Input id="p-title" value={d.title} onChange={(e) => set("title", e.target.value)} required /></Field>
              <Field><FieldLabel htmlFor="p-summary">One-line summary</FieldLabel><Input id="p-summary" value={d.summary} onChange={(e) => set("summary", e.target.value)} maxLength={120} /></Field>
              <Field><FieldLabel htmlFor="p-desc">Description</FieldLabel><Textarea id="p-desc" rows={5} value={d.description} onChange={(e) => set("description", e.target.value)} /><FieldDescription>Describe what it is honestly. Medical or guaranteed-results claims aren't allowed.</FieldDescription></Field>
              <FieldSet>
                <FieldLegend variant="label">What's included</FieldLegend>
                {d.included.map((inc, i) => (
                  <div key={i} className="flex gap-2"><Input aria-label={`Included item ${i + 1}`} value={inc} onChange={(e) => set("included", d.included.map((x, j) => (j === i ? e.target.value : x)))} /><Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => set("included", d.included.filter((_, j) => j !== i))}><TrashBinMinimalisticIcon /></Button></div>
                ))}
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("included", [...d.included, ""])}><AddCircleIcon data-icon="inline-start" />Add item</Button>
              </FieldSet>
              <Field><FieldLabel htmlFor="p-dim">Size or dimensions (optional)</FieldLabel><Input id="p-dim" value={d.dimensions ?? ""} onChange={(e) => set("dimensions", e.target.value)} /></Field>
            </FieldGroup>
          </Panel>
          <Panel title="Photos">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {d.images.map((src, i) => (
                <div key={src.slice(0, 80) + i} className="group/i relative aspect-square overflow-hidden rounded-xl">
                  <Img src={src} alt={`Photo ${i + 1}`} className="size-full" sizes="160px" />
                  <button type="button" onClick={() => set("images", d.images.filter((_, j) => j !== i))} className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-black/60 text-white" aria-label={`Remove photo ${i + 1}`}><TrashBinMinimalisticIcon className="size-4" /></button>
                  {i === 0 && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">Cover</span>}
                </div>
              ))}
              {d.images.length < 6 && (
                <button type="button" onClick={() => fileRef.current?.click()} className="border-input hover:bg-muted flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm">
                  {uploading ? <Spinner /> : <UploadIcon className="size-6" />}
                  {uploading ? "Uploading…" : "Add photos"}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = "" }} />
            <p className="text-muted-foreground text-xs">JPEG, PNG or WebP up to 8 MB. We remove location and camera data automatically.</p>
          </Panel>
          <Panel title="Options, prices & stock">
            {d.variants.map((v, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_6rem_auto]">
                <Input aria-label="Option name" value={v.name} onChange={(e) => set("variants", d.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="e.g. 12 stems" />
                <Input aria-label="SKU" value={v.sku} onChange={(e) => set("variants", d.variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} placeholder="SKU" />
                <Input aria-label="Price in naira" type="number" min={0} value={v.price / 100 || ""} onChange={(e) => set("variants", d.variants.map((x, j) => (j === i ? { ...x, price: toMinor(Number(e.target.value)) } : x)))} placeholder="Price ₦" />
                <Input aria-label="Stock" type="number" min={0} value={v.stock} onChange={(e) => set("variants", d.variants.map((x, j) => (j === i ? { ...x, stock: Number(e.target.value) } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove option" disabled={d.variants.length === 1} onClick={() => set("variants", d.variants.filter((_, j) => j !== i))}><TrashBinMinimalisticIcon /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("variants", [...d.variants, { name: "", sku: "", price: 0, stock: 0 }])}><AddCircleIcon data-icon="inline-start" />Add option</Button>
          </Panel>
          <Panel title="Personalisation">
            <Field orientation="horizontal">
              <FieldContent><FieldLabel htmlFor="p-pers">Customers can personalise this</FieldLabel><FieldDescription>e.g. a card message, engraving or name.</FieldDescription></FieldContent>
              <Switch id="p-pers" checked={Boolean(d.personalisation)} onCheckedChange={(on) => set("personalisation", on ? { label: "Card message", maxLength: 120, required: false, fee: 0, extraPrepHours: 0, helpText: "" } : undefined)} />
            </Field>
            {d.personalisation && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="pp-label">Label</FieldLabel><Input id="pp-label" value={d.personalisation.label} onChange={(e) => set("personalisation", { ...d.personalisation!, label: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="pp-max">Max characters</FieldLabel><Input id="pp-max" type="number" value={d.personalisation.maxLength} onChange={(e) => set("personalisation", { ...d.personalisation!, maxLength: Number(e.target.value) })} /></Field>
                <Field><FieldLabel htmlFor="pp-fee">Extra charge (₦)</FieldLabel><Input id="pp-fee" type="number" value={d.personalisation.fee / 100} onChange={(e) => set("personalisation", { ...d.personalisation!, fee: toMinor(Number(e.target.value)) })} /></Field>
                <Field><FieldLabel htmlFor="pp-hours">Extra preparation (hours)</FieldLabel><Input id="pp-hours" type="number" value={d.personalisation.extraPrepHours} onChange={(e) => set("personalisation", { ...d.personalisation!, extraPrepHours: Number(e.target.value) })} /></Field>
                <Field orientation="horizontal"><Switch id="pp-req" checked={d.personalisation.required} onCheckedChange={(v) => set("personalisation", { ...d.personalisation!, required: v })} /><FieldLabel htmlFor="pp-req">Required</FieldLabel></Field>
              </div>
            )}
          </Panel>
        </div>
        <aside className="flex flex-col gap-6">
          <Panel title="Organise">
            <Field>
              <FieldLabel htmlFor="p-cat">Category</FieldLabel>
              <Select value={d.category} onValueChange={(v) => set("category", v as CategoryId)}><SelectTrigger id="p-cat"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Occasions</FieldLegend>
              <div className="flex flex-wrap gap-1.5">{OCCASIONS.map((o) => <Chip key={o.id} on={d.occasions.includes(o.id)} onClick={() => set("occasions", toggle<OccasionId>(d.occasions, o.id))}>{o.name}</Chip>)}</div>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">Good for people who like</FieldLegend>
              <div className="flex flex-wrap gap-1.5">{INTERESTS.map((o) => <Chip key={o.id} on={d.interests.includes(o.id)} onClick={() => set("interests", toggle<InterestId>(d.interests, o.id))}>{o.name}</Chip>)}</div>
            </FieldSet>
          </Panel>
          <Panel title="Fulfilment">
            <Field><FieldLabel htmlFor="p-prep">Preparation time (hours)</FieldLabel><Input id="p-prep" type="number" min={1} value={d.prepHours} onChange={(e) => set("prepHours", Number(e.target.value))} /></Field>
            <ToggleRow id="p-per" label="Perishable" checked={d.perishable} onChange={(v) => set("perishable", v)} />
            <ToggleRow id="p-ret" label="Returnable" checked={d.returnEligible} onChange={(v) => set("returnEligible", v)} />
            <ToggleRow id="p-cust" label="Highly customised" checked={d.highlyCustomised} onChange={(v) => set("highlyCustomised", v)} />
            <Alert><InfoCircleIcon /><AlertDescription className="text-xs">Perishable, customised or non-returnable items can't be sent without a delivery address.</AlertDescription></Alert>
          </Panel>
          <Button type="submit" size="lg" disabled={save.isPending}>{save.isPending && <Spinner data-icon="inline-start" />}{initial.id ? "Save changes" : "Submit for review"}</Button>
          {initial.id && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button type="button" variant="destructive">Archive product</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Archive this product?</AlertDialogTitle><AlertDialogDescription>It disappears from the marketplace, your store and new wishlists. Existing orders are unaffected; open wishes become unavailable.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={() => archive.mutate()}>Archive</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </aside>
      </form>
    </>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn("press rounded-full px-3 py-1.5 text-xs", on ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent")}>{children}</button>
}

function ToggleRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <Field orientation="horizontal"><FieldLabel htmlFor={id} className="flex-1">{label}</FieldLabel><Switch id={id} checked={checked} onCheckedChange={onChange} /></Field>
}

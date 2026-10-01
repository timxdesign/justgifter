import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "cn"
import { toast } from "sonner"
import type { DeliveryAddress, EventContent, EventDesign, EventVisibility, SectionId, WishPriority, ZoneId } from "@domain/index.ts"
import { FONTS, MOTION_LABELS, PALETTES, SECTION_LABELS, switchTemplate, templateById, templatesFor, eventTypeMeta, ZONES, zoneById, normaliseSectionOrder, ORDER_STATUS_LABEL } from "@domain/index.ts"
import type { HostEventDetail, ProductCard, ComposeResult } from "@/api"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { EventPage } from "@/components/event/event-page"
import { ShareCard } from "@/components/share"
import { Img, PageSkeleton, ErrorState, QuantityStepper, EmptyState } from "@/components/common"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ArrowLeftIcon, UndoLeftIcon, MonitorIcon, SmartphoneIcon, MagicWandIcon, AltArrowUpIcon, AltArrowDownIcon, TrashBinMinimalisticIcon, AddCircleIcon, MagnifierIcon, LockKeyholeIcon, DangerTriangleIcon, EyeIcon, MenuDotsIcon, CheckCircleIcon, GiftIcon, CheckIcon, UserPlusIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatDateTime, formatMoney, relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const COVERS = [
  "/media/e/portrait-ada@2x.webp", "/media/occasions/wedding@2x.webp", "/media/e/bride@2x.webp", "/media/e/wedding-table@2x.webp", "/media/e/venue@2x.webp",
  "/media/occasions/birthday@2x.webp", "/media/e/confetti@2x.webp", "/media/e/dinner@2x.webp", "/media/e/friends@2x.webp", "/media/occasions/baby@2x.webp",
  "/media/e/baby-blanket@2x.webp", "/media/occasions/graduation@2x.webp", "/media/e/house@2x.webp", "/media/occasions/housewarming@2x.webp", "/media/occasions/sympathy@2x.webp", "/media/e/hands-gift@2x.webp",
]

type Snapshot = { content: EventContent; design: EventDesign }

export default function EventEditorPage() {
  const { id = "" } = useParams()
  useDocumentMeta({ title: "Edit occasion", noindex: true })
  const q = useApiQuery(qk.event(id), (api) => api.getMyEvent(id))
  if (q.error) return <div className="p-10"><ErrorState error={q.error} /></div>
  if (!q.data) return <PageSkeleton />
  return <Editor detail={q.data} />
}

function Editor({ detail }: { detail: HostEventDetail }) {
  const ev = detail.event
  const qc = useQueryClient()
  const [content, setContent] = useState<EventContent>(ev.draft)
  const [design, setDesign] = useState<EventDesign>(ev.draftDesign)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [savedAt, setSavedAt] = useState(ev.updatedAt)
  const lastSaved = useRef(JSON.stringify({ content: ev.draft, design: ev.draftDesign }))

  const commit = useCallback((next: Partial<Snapshot>) => {
    setHistory((h) => [...h.slice(-30), { content, design }])
    if (next.content) setContent(next.content)
    if (next.design) setDesign(next.design)
  }, [content, design])
  const patch = (p: Partial<EventContent>) => commit({ content: { ...content, ...p } })
  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setContent(last.content)
    setDesign(last.design)
  }

  // EVT 04: drafts save automatically; nothing goes live until "Publish".
  useEffect(() => {
    const snapshot = JSON.stringify({ content, design })
    if (snapshot === lastSaved.current) return
    setSaveState("saving")
    const t = setTimeout(async () => {
      try {
        const r = await (await getApi()).saveEventDraft(ev.id, { content, design })
        lastSaved.current = snapshot
        setSavedAt(r.updatedAt)
        setSaveState("saved")
        qc.invalidateQueries({ queryKey: qk.myEvents })
      } catch (e) {
        setSaveState("error")
        toast.error(errorMessage(e))
      }
    }, 700)
    return () => clearTimeout(t)
  }, [content, design, ev.id, qc])

  const refresh = () => qc.invalidateQueries({ queryKey: qk.event(ev.id) })
  const [publishErrors, setPublishErrors] = useState<string[]>([])
  const publish = useApiMutation(async (api) => {
    await api.saveEventDraft(ev.id, { content, design })
    return api.publishEvent(ev.id)
  }, { invalidate: [qk.event(ev.id), qk.myEvents, qk.publicEvent(ev.slug)], onSuccess: (r) => { setPublishErrors(r.errors); if (r.ok) toast.success(ev.status === "published" ? "Changes published" : "Your page is live!") } })
  const status = useApiMutation((api, s: "draft" | "closed" | "archived" | "published") => api.setEventStatus(ev.id, s), { invalidate: [qk.event(ev.id), qk.myEvents], success: (_, s) => ({ draft: "Page unpublished — it's no longer visible", closed: "Closed to new gifts", archived: "Page archived", published: "Page reopened" })[s] })

  const isLive = ev.status === "published"
  const dirty = !ev.publishedVersion || ev.hasUnpublishedChanges || saveState === "saving"

  return (
    <div className="bg-sidebar flex h-dvh flex-col">
      <header className="bg-background flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-5">
        <Button variant="ghost" size="icon" asChild><Link to="/events" aria-label="Back to occasion pages"><ArrowLeftIcon /></Link></Button>
        <Logo compact className="max-sm:hidden" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{content.title || "Untitled"}</p>
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {saveState === "saving" ? "Saving draft…" : saveState === "error" ? "Couldn't save — retrying when you edit" : `Draft saved ${relativeTime(savedAt)}`}
            {isLive && <> · <span className="text-success">Live</span>{ev.hasUnpublishedChanges ? " (unpublished changes)" : ""}</>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={undo} disabled={!history.length} aria-label="Undo"><UndoLeftIcon /></Button>
          <div role="radiogroup" aria-label="Preview device" className="bg-muted hidden gap-0.5 rounded-lg p-0.5 md:flex">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={`${d} preview`} onClick={() => setDevice(d)} className={cn("grid size-8 place-items-center rounded-md", device === d ? "bg-card shadow-border" : "text-muted-foreground")}>
                {d === "desktop" ? <MonitorIcon className="size-4" /> : <SmartphoneIcon className="size-4" />}
              </button>
            ))}
          </div>
          {ev.status !== "draft" && <Button variant="outline" asChild className="max-sm:hidden"><Link to={`/e/${ev.slug}`} target="_blank"><EyeIcon data-icon="inline-start" />View</Link></Button>}
          <Button onClick={() => publish.mutate()} disabled={publish.isPending || (isLive && !dirty)}>
            {publish.isPending && <Spinner data-icon="inline-start" />}
            {isLive ? (dirty ? "Publish changes" : "Published") : "Publish"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More actions"><MenuDotsIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ev.status === "published" && <DropdownMenuItem onSelect={() => status.mutate("closed")}>Close to new gifts</DropdownMenuItem>}
              {ev.status === "closed" && <DropdownMenuItem onSelect={() => status.mutate("published")}>Reopen to gifts</DropdownMenuItem>}
              {(ev.status === "published" || ev.status === "closed") && <DropdownMenuItem onSelect={() => status.mutate("draft")}>Unpublish page</DropdownMenuItem>}
              <DropdownMenuItem className="text-destructive" onSelect={() => status.mutate("archived")}>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {publishErrors.length > 0 && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <DangerTriangleIcon />
          <AlertTitle>Fix these to publish</AlertTitle>
          <AlertDescription><ul>{publishErrors.map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription>
        </Alert>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="bg-background flex min-h-0 flex-col border-r md:w-[26rem] md:shrink-0">
          <Tabs defaultValue="content" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList variant="line" className="w-full shrink-0 justify-start gap-1 overflow-x-auto border-b px-3">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="wishlist">Wishlist <Badge variant="muted" className="tabular">{detail.wishlist.length}</Badge></TabsTrigger>
              <TabsTrigger value="sharing">Sharing</TabsTrigger>
              <TabsTrigger value="gifts">Gifts</TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TabsContent value="content" className="p-5"><ContentPanel content={content} patch={patch} /></TabsContent>
              <TabsContent value="design" className="p-5"><DesignPanel content={content} design={design} setDesign={(d) => commit({ design: d })} applyAI={(r) => commit({ design: r.design, content: { ...content, story: content.story || r.copy.story, closingMessage: content.closingMessage || r.copy.closingMessage } })} eventId={ev.id} /></TabsContent>
              <TabsContent value="wishlist" className="p-5"><WishlistPanel detail={detail} onChange={refresh} /></TabsContent>
              <TabsContent value="sharing" className="p-5"><SharingPanel detail={detail} onChange={refresh} /></TabsContent>
              <TabsContent value="gifts" className="p-5"><GiftsPanel eventId={ev.id} surprise={ev.surpriseMode} /></TabsContent>
            </div>
          </Tabs>
        </aside>
        <section aria-label="Live preview" className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className={cn("bg-background mx-auto overflow-hidden rounded-2xl shadow-[var(--shadow-float)] transition-[max-width] duration-300", device === "mobile" ? "max-w-[390px]" : "max-w-5xl")}>
            <EventPage content={content} design={design} wishlist={detail.wishlist} device={device} zoneName={zoneById(ev.deliveryZoneId)?.name} acceptingGifts={Boolean(detail.deliveryAddress) || ev.deliveryZoneId !== null} renderWishAction={() => <Button size="sm" disabled className="w-full bg-[var(--ev-accent)] text-[var(--ev-accent-text)]">Give this gift</Button>} />
          </div>
          <p className="text-muted-foreground mt-3 text-center text-xs">Preview of your draft. Guests see the last published version.</p>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Content

function ContentPanel({ content, patch }: { content: EventContent; patch: (p: Partial<EventContent>) => void }) {
  const [coverOpen, setCoverOpen] = useState(false)
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Cover photo</FieldLabel>
        <button type="button" onClick={() => setCoverOpen(true)} className="group/c relative aspect-[16/9] overflow-hidden rounded-xl">
          <Img src={content.coverImage} alt="Current cover" className="size-full" sizes="400px" />
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-sm font-medium text-white opacity-0 transition-opacity group-hover/c:opacity-100 group-focus-visible/c:opacity-100">Change cover</span>
        </button>
        <Dialog open={coverOpen} onOpenChange={setCoverOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Choose a cover</DialogTitle>
              <DialogDescription>Photos from our licensed library. Uploads are checked for type, size and content before they appear.</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[60dvh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {COVERS.map((c) => (
                <button key={c} type="button" onClick={() => { patch({ coverImage: c }); setCoverOpen(false) }} className={cn("press aspect-square overflow-hidden rounded-lg", c === content.coverImage && "ring-foreground ring-2 ring-offset-2")} aria-label="Use this cover">
                  <Img src={c.replace("@2x", "")} alt="" className="size-full" sizes="160px" />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </Field>
      <Field><FieldLabel htmlFor="c-title">Title</FieldLabel><Input id="c-title" value={content.title} onChange={(e) => patch({ title: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor="c-host">Hosted by</FieldLabel><Input id="c-host" value={content.hostDisplayName} onChange={(e) => patch({ hostDisplayName: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel htmlFor="c-date">Date</FieldLabel><Input id="c-date" type="date" value={content.date ?? ""} onChange={(e) => patch({ date: e.target.value || null })} /><FieldDescription>Leave empty for “to be confirmed”.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="c-time">Time (WAT)</FieldLabel><Input id="c-time" type="time" value={content.time ?? ""} onChange={(e) => patch({ time: e.target.value || null })} /></Field>
      </div>
      <ToggleRow id="c-showtime" label="Show the time and programme" checked={content.showTime} onChange={(v) => patch({ showTime: v })} />
      <Field><FieldLabel htmlFor="c-venue">Venue</FieldLabel><Input id="c-venue" value={content.venue} onChange={(e) => patch({ venue: e.target.value })} placeholder="The Terrace, Victoria Island" /></Field>
      <ToggleRow id="c-showvenue" label="Show the venue on the page" description="Hide it to share privately with guests instead. The wishlist still works." checked={content.showVenue} onChange={(v) => patch({ showVenue: v })} />
      <Field><FieldLabel htmlFor="c-story">Your story</FieldLabel><Textarea id="c-story" rows={5} value={content.story} onChange={(e) => patch({ story: e.target.value })} placeholder="Why this day matters to you…" /></Field>
      <FieldSet>
        <FieldLegend variant="label">Programme</FieldLegend>
        {content.agenda.map((a, i) => (
          <div key={i} className="flex gap-2">
            <Input type="time" aria-label="Time" className="w-32" value={a.time} onChange={(e) => patch({ agenda: content.agenda.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })} />
            <Input aria-label="What's happening" value={a.label} onChange={(e) => patch({ agenda: content.agenda.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => patch({ agenda: content.agenda.filter((_, j) => j !== i) })}><TrashBinMinimalisticIcon /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-fit" onClick={() => patch({ agenda: [...content.agenda, { time: "18:00", label: "" }] })}><AddCircleIcon data-icon="inline-start" />Add to programme</Button>
      </FieldSet>
      <Field><FieldLabel htmlFor="c-dress">Dress code (optional)</FieldLabel><Input id="c-dress" value={content.dressCode} onChange={(e) => patch({ dressCode: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor="c-closing">Closing note</FieldLabel><Textarea id="c-closing" rows={2} value={content.closingMessage} onChange={(e) => patch({ closingMessage: e.target.value })} /></Field>
    </FieldGroup>
  )
}

function ToggleRow({ id, label, description, checked, onChange }: { id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

// ---------------------------------------------------------------- Design

function DesignPanel({ content, design, setDesign, applyAI, eventId }: { content: EventContent; design: EventDesign; setDesign: (d: EventDesign) => void; applyAI: (r: ComposeResult) => void; eventId: string }) {
  const template = templateById(design.templateId)!
  const sensitive = eventTypeMeta(content.type)?.sensitive
  const move = (i: number, dir: -1 | 1) => {
    const order = [...design.sectionOrder]
    const j = i + dir
    if (j < 1 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    setDesign({ ...design, sectionOrder: normaliseSectionOrder(order, template) })
  }
  return (
    <div className="flex flex-col gap-7">
      <AIDialog eventId={eventId} sensitive={Boolean(sensitive)} onApply={applyAI} />
      <FieldSet>
        <FieldLegend variant="label">Template</FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          {templatesFor(content.type).map((t) => (
            <button key={t.id} type="button" aria-pressed={t.id === design.templateId} onClick={() => setDesign(switchTemplate(design, t.id))} className={cn("press bg-card flex flex-col gap-1 rounded-xl p-3 text-left transition-shadow", t.id === design.templateId ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border hover:shadow-border-hover")}>
              <span className="flex items-center justify-between text-sm font-medium">{t.name}{t.id === design.templateId && <CheckIcon className="size-4" />}</span>
              <span className="text-muted-foreground text-xs">{t.description}</span>
            </button>
          ))}
        </div>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">Colours</FieldLegend>
        <div role="radiogroup" aria-label="Colours" className="flex flex-wrap gap-2">
          {template.palettes.map((p) => {
            const pal = PALETTES[p]
            return (
              <button key={p} type="button" role="radio" aria-checked={design.palette === p} aria-label={pal.name} onClick={() => setDesign({ ...design, palette: p })} className={cn("press flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm transition-shadow", design.palette === p ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border")}>
                <span className="flex">{[pal.background, pal.accent, pal.text].map((c, i) => <span key={i} className="-ml-1 size-5 rounded-full ring-2 ring-[var(--card)] first:ml-0" style={{ background: c }} />)}</span>
                {pal.name}
              </button>
            )
          })}
        </div>
      </FieldSet>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="d-font">Heading font</FieldLabel>
          <Select value={design.font} onValueChange={(f) => setDesign({ ...design, font: f as EventDesign["font"] })}>
            <SelectTrigger id="d-font"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{template.fonts.map((f) => <SelectItem key={f} value={f}>{FONTS[f].name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="d-motion">Opening</FieldLabel>
          <Select value={design.motionPreset} onValueChange={(m) => setDesign({ ...design, motionPreset: m as EventDesign["motionPreset"] })}>
            <SelectTrigger id="d-motion"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{template.motionPresets.map((m) => <SelectItem key={m} value={m}>{MOTION_LABELS[m]}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
      </div>
      <FieldSet>
        <FieldLegend variant="label">Section order</FieldLegend>
        <FieldDescription>The cover always comes first.</FieldDescription>
        <ol className="flex flex-col gap-1.5">
          {design.sectionOrder.map((s: SectionId, i) => (
            <li key={s} className="bg-card shadow-border flex items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-3 text-sm">
              <span className="flex-1">{SECTION_LABELS[s]}</span>
              {s !== "hero" && (
                <>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${SECTION_LABELS[s]} up`} disabled={i <= 1} onClick={() => move(i, -1)}><AltArrowUpIcon /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${SECTION_LABELS[s]} down`} disabled={i === design.sectionOrder.length - 1} onClick={() => move(i, 1)}><AltArrowDownIcon /></Button>
                </>
              )}
            </li>
          ))}
        </ol>
      </FieldSet>
    </div>
  )
}

function AIDialog({ eventId, sensitive, onApply }: { eventId: string; sensitive: boolean; onApply: (r: ComposeResult) => void }) {
  const [open, setOpen] = useState(false)
  const [tone, setTone] = useState<"playful" | "elegant" | "calm" | "restrained">(sensitive ? "restrained" : "elegant")
  const [colours, setColours] = useState("")
  const [notes, setNotes] = useState("")
  const [result, setResult] = useState<ComposeResult | null>(null)
  const compose = useApiMutation((api) => api.composeEvent(eventId, { tone, colours, notes }), { onSuccess: setResult })
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null) }}>
      <DialogTrigger asChild>
        <button type="button" className="bg-brand-soft group/ai flex items-center gap-3 rounded-2xl p-4 text-left">
          <MagicWandIcon className="text-brand-text size-6" />
          <span className="flex-1"><span className="block font-medium">Design it for me</span><span className="text-muted-foreground text-sm">Suggests a template, colours and draft words. You review before anything changes.</span></span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Design it for me</DialogTitle>
          <DialogDescription>We only use approved templates, and never invent dates, venues or personal details — gaps are left for you to fill.</DialogDescription>
        </DialogHeader>
        {!result ? (
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Tone</FieldLegend>
              <div className="grid grid-cols-2 gap-2">
                {(sensitive ? ["restrained", "calm"] as const : ["playful", "elegant", "calm"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={tone === t} onClick={() => setTone(t)} className={cn("press bg-card rounded-xl p-3 text-sm capitalize transition-shadow", tone === t ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border")}>{t}</button>
                ))}
              </div>
            </FieldSet>
            <Field><FieldLabel htmlFor="ai-colours">Colours you like (optional)</FieldLabel><Input id="ai-colours" value={colours} onChange={(e) => setColours(e.target.value)} placeholder="Gold and navy" /></Field>
            <Field><FieldLabel htmlFor="ai-notes">Anything else? (optional)</FieldLabel><Textarea id="ai-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </FieldGroup>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p><span className="font-medium">Template:</span> {templateById(result.design.templateId)?.name} · {PALETTES[result.design.palette].name} · {MOTION_LABELS[result.design.motionPreset]} opening</p>
            <p className="bg-muted rounded-xl p-3 italic">{result.copy.story}</p>
            {result.copy.prompts.length > 0 && <ul className="text-muted-foreground list-disc pl-5">{result.copy.prompts.map((p) => <li key={p}>{p}</li>)}</ul>}
            <p className="text-muted-foreground text-xs">Draft words only fill empty fields. Text in [brackets] is for you to replace.</p>
          </div>
        )}
        <DialogFooter>
          {!result ? (
            <Button onClick={() => compose.mutate()} disabled={compose.isPending}>{compose.isPending ? <Spinner data-icon="inline-start" /> : <MagicWandIcon data-icon="inline-start" />}{compose.isPending ? "Designing…" : "Suggest a design"}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setResult(null)}>Try again</Button>
              <Button onClick={() => { onApply(result); setOpen(false); setResult(null); toast.success("Design applied — undo any time") }}>Apply to draft</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Wishlist

function WishlistPanel({ detail, onChange }: { detail: HostEventDetail; onChange: () => void }) {
  const ev = detail.event
  const inv = [qk.event(ev.id), qk.publicEvent(ev.slug)]
  const update = useApiMutation((api, v: { id: string; desiredQty?: number; priority?: WishPriority; note?: string }) => api.updateWishlistItem(ev.id, v.id, v), { invalidate: inv })
  const remove = useApiMutation((api, itemId: string) => api.removeWishlistItem(ev.id, itemId), { invalidate: inv, success: (r) => (r.hadActiveOrders ? "Removed. Existing orders for it will still be delivered." : "Removed from wishlist") })
  return (
    <div className="flex flex-col gap-6">
      <AddressCard detail={detail} onChange={onChange} />
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Wishes</h3>
        <AddItemDialog eventId={ev.id} zone={ev.deliveryZoneId} onAdded={onChange} />
      </div>
      {detail.wishlist.length === 0 ? (
        <EmptyState icon={<GiftIcon />} title="No wishes yet" description="Add things from approved vendors. Guests see what's still needed." />
      ) : (
        <ul className="flex flex-col gap-3">
          {detail.wishlist.map((w) => (
            <li key={w.item.id} className="bg-card shadow-border flex flex-col gap-3 rounded-2xl p-3">
              <div className="flex gap-3">
                <Img src={w.product.images[0]} alt="" className="size-14 rounded-lg" sizes="56px" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{w.product.title}</p>
                  <p className="text-muted-foreground text-xs">{w.variantName} · {formatMoney(w.price)}</p>
                  <p className="text-xs">{w.item.purchasedQty} of {w.item.desiredQty} gifted{w.availability.state === "unavailable" ? " · unavailable" : ""}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Remove ${w.product.title}`}><TrashBinMinimalisticIcon /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {w.product.title}?</AlertDialogTitle>
                      <AlertDialogDescription>{w.item.purchasedQty > 0 ? "Gifts already bought will still be delivered — guests just can't buy more." : "Guests won't see it any more."}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate(w.item.id)}>Remove</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="flex items-center gap-2">
                <QuantityStepper size="sm" value={w.item.desiredQty} min={Math.max(1, w.item.purchasedQty)} max={10} onChange={(n) => update.mutate({ id: w.item.id, desiredQty: n })} label="Wanted" />
                <Select value={w.item.priority} onValueChange={(p) => update.mutate({ id: w.item.id, priority: p as WishPriority })}>
                  <SelectTrigger size="sm" className="flex-1" aria-label="Priority"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="must">Most wanted</SelectItem><SelectItem value="love">Would love</SelectItem><SelectItem value="nice">Nice to have</SelectItem></SelectGroup></SelectContent>
                </Select>
              </div>
              <Input aria-label="Note for guests" defaultValue={w.item.note} placeholder="Add a note for guests (optional)" onBlur={(e) => e.target.value !== w.item.note && update.mutate({ id: w.item.id, note: e.target.value })} className="h-8 text-sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AddressCard({ detail, onChange }: { detail: HostEventDetail; onChange: () => void }) {
  const [editing, setEditing] = useState(!detail.deliveryAddress)
  const a = detail.deliveryAddress
  const [form, setForm] = useState<DeliveryAddress>(a ?? { recipientName: "", phone: "", line1: "", area: "", city: "Lagos", state: "Lagos", zoneId: "lagos-island" })
  const zone = ZONES.find((z) => z.id === form.zoneId)!
  const save = useApiMutation((api) => api.setEventDeliveryAddress(detail.event.id, { ...form, city: zone.city, state: zone.state }), { success: "Delivery address saved privately", onSuccess: () => { setEditing(false); onChange() } })
  return (
    <section className="bg-muted/50 flex flex-col gap-3 rounded-2xl p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium"><LockKeyholeIcon className="text-success size-4" />Private delivery address</h3>
      {!a && !editing ? null : !editing && a ? (
        <>
          <p className="text-sm">{a.recipientName}, {a.line1}, {a.area}, {a.city}</p>
          <p className="text-muted-foreground text-xs">Guests only see “{zoneById(a.zoneId)?.name}”. The vendor sees it once they accept an order.</p>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setEditing(true)}>Change</Button>
        </>
      ) : (
        <>
          {!a && <p className="text-warning text-xs">Guests can't buy from your wishlist until you add this.</p>}
          <div className="grid gap-2">
            <Input aria-label="Name" placeholder="Name" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
            <Input aria-label="Phone" placeholder="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input aria-label="Street address" placeholder="Street address" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
            <Select value={form.zoneId} onValueChange={(z) => setForm({ ...form, zoneId: z as ZoneId, area: "" })}>
              <SelectTrigger aria-label="Delivery area"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{ZONES.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <Select value={form.area || undefined} onValueChange={(ar) => setForm({ ...form, area: ar })}>
              <SelectTrigger aria-label="Area"><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent><SelectGroup>{zone.areas.map((ar) => <SelectItem key={ar} value={ar}>{ar}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
          <Button size="sm" className="w-fit" onClick={() => save.mutate()} disabled={save.isPending}>Save address</Button>
        </>
      )}
    </section>
  )
}

function AddItemDialog({ eventId, zone, onAdded }: { eventId: string; zone: ZoneId | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const query = { q: q || undefined, zoneId: zone ?? undefined, pageSize: 30, inStockOnly: true }
  const results = useApiQuery(qk.products(query), (api) => api.listProducts(query), { enabled: open, placeholderData: (p) => p })
  const [picked, setPicked] = useState<ProductCard | null>(null)
  const detail = useApiQuery(qk.product(picked?.id ?? ""), (api) => api.getProduct(picked!.id), { enabled: Boolean(picked) })
  const [variantId, setVariantId] = useState("")
  const [qty, setQty] = useState(1)
  const add = useApiMutation((api) => api.addWishlistItem(eventId, { productId: picked!.id, variantId: variantId || detail.data!.product.variants[0].id, desiredQty: qty, priority: "love", note: "" }), { success: "Added to wishlist", onSuccess: () => { onAdded(); setPicked(null); setQty(1); setVariantId("") } })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><AddCircleIcon data-icon="inline-start" />Add items</Button></DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add to your wishlist</DialogTitle>
          <DialogDescription>{zone ? `Showing items that deliver to ${zoneById(zone)?.name}.` : "Add your delivery address to see only items that deliver to you."}</DialogDescription>
        </DialogHeader>
        {!picked ? (
          <>
            <div className="relative">
              <MagnifierIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Blender, candles, books…" className="pl-9" autoFocus />
            </div>
            <ul className="grid max-h-[55dvh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {results.data?.items.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPicked(p)} className="press hover:bg-muted flex w-full flex-col gap-2 rounded-xl p-2 text-left">
                    <Img src={p.images[0]} alt="" className="aspect-square w-full rounded-lg" sizes="200px" />
                    <span className="line-clamp-2 text-sm font-medium">{p.title}</span>
                    <span className="text-muted-foreground tabular text-xs">{formatMoney(p.priceFrom)} · {p.vendor.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <Img src={picked.images[0]} alt="" className="size-20 rounded-xl" sizes="80px" />
              <div><p className="font-medium">{picked.title}</p><p className="text-muted-foreground text-sm">{picked.vendor.name}</p></div>
            </div>
            {detail.data && detail.data.product.variants.length > 1 && (
              <Field>
                <FieldLabel htmlFor="w-variant">Option</FieldLabel>
                <Select value={variantId || detail.data.product.variants[0].id} onValueChange={setVariantId}>
                  <SelectTrigger id="w-variant"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{detail.data.product.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {formatMoney(v.price)}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
            )}
            <Field><FieldLabel>How many would you like?</FieldLabel><QuantityStepper value={qty} onChange={setQty} max={10} /></Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPicked(null)}>Back</Button>
              <Button onClick={() => add.mutate()} disabled={add.isPending || !detail.data}>Add to wishlist</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Sharing

function SharingPanel({ detail, onChange }: { detail: HostEventDetail; onChange: () => void }) {
  const ev = detail.event
  const vis = useApiMutation((api, v: EventVisibility) => api.setEventVisibility(ev.id, v), { invalidate: [qk.event(ev.id)], success: "Visibility updated" })
  const surprise = useApiMutation((api, on: boolean) => api.setSurpriseMode(ev.id, on, ev.draft.date), { invalidate: [qk.event(ev.id)] })
  const [coEmail, setCoEmail] = useState("")
  const [coName, setCoName] = useState("")
  const invite = useApiMutation((api) => api.inviteCoHost(ev.id, { email: coEmail, displayName: coName || coEmail.split("@")[0], permissions: ["edit_content", "manage_wishlist"] }), { success: "Invitation sent", onSuccess: () => { setCoEmail(""); setCoName(""); onChange() } })
  const revoke = useApiMutation((api, email: string) => api.revokeCoHost(ev.id, email), { invalidate: [qk.event(ev.id)], success: "Access removed" })
  const options: { id: EventVisibility; label: string; body: string }[] = [
    { id: "unlisted", label: "Anyone with the link", body: "Hidden from search engines. Anyone you send the link to can open it." },
    { id: "private", label: "Invited guests only", body: "Guests enter an invite code before seeing anything." },
    { id: "public", label: "Public", body: "Can appear in search results." },
  ]
  return (
    <div className="flex flex-col gap-7">
      {ev.status === "draft" ? (
        <Alert><EyeIcon /><AlertTitle>Not live yet</AlertTitle><AlertDescription>Publish your page to start sharing it.</AlertDescription></Alert>
      ) : (
        <ShareCard url={detail.shareUrl} title={ev.draft.title} filename={ev.slug} />
      )}
      <FieldSet>
        <FieldLegend variant="label">Who can see it</FieldLegend>
        <div role="radiogroup" aria-label="Who can see it" className="flex flex-col gap-2">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={ev.visibility === o.id} onClick={() => vis.mutate(o.id)} className={cn("press bg-card rounded-xl p-3 text-left transition-shadow", ev.visibility === o.id ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border")}>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="text-muted-foreground text-xs">{o.body}</span>
            </button>
          ))}
        </div>
        {ev.visibility === "private" && (
          <p className="bg-muted rounded-xl p-3 text-sm">Invite code: <span className="font-mono font-semibold tracking-wider">{vis.data?.inviteCode ?? ev.inviteCode ?? "Change visibility to generate a new code"}</span></p>
        )}
      </FieldSet>
      <ToggleRow id="surprise" label="Surprise mode" description={`Hide who bought what — and which items — until ${ev.draft.date ? "the day" : "your chosen date"}. Guests still see what's left.`} checked={ev.surpriseMode} onChange={(v) => surprise.mutate(v)} />
      <FieldSet>
        <FieldLegend variant="label">Co-hosts</FieldLegend>
        <FieldDescription>Co-hosts can edit the page and wishlist. They don't see your delivery address.</FieldDescription>
        {ev.coHosts.filter((c) => c.status !== "revoked").map((c) => (
          <div key={c.email} className="bg-card shadow-border flex items-center gap-3 rounded-xl p-3 text-sm">
            <span className="flex-1"><span className="font-medium">{c.displayName}</span> <span className="text-muted-foreground">· {c.email} · {c.status}</span></span>
            <Button variant="ghost" size="sm" onClick={() => revoke.mutate(c.email)}>Remove</Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input aria-label="Co-host name" placeholder="Name" value={coName} onChange={(e) => setCoName(e.target.value)} className="w-28" />
          <Input aria-label="Co-host email" type="email" placeholder="Email" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} />
          <Button variant="outline" size="icon" aria-label="Invite co-host" onClick={() => invite.mutate()} disabled={!coEmail.includes("@")}><UserPlusIcon /></Button>
        </div>
      </FieldSet>
    </div>
  )
}

// ---------------------------------------------------------------- Gifts

function GiftsPanel({ eventId, surprise }: { eventId: string; surprise: boolean }) {
  const gifts = useApiQuery(qk.eventGifts(eventId), (api) => api.getEventGifts(eventId))
  if (!gifts.data) return <Spinner />
  if (!gifts.data.length) return <EmptyState icon={<GiftIcon />} title="No gifts yet" description="When guests buy from your wishlist, you'll see them here." />
  return (
    <div className="flex flex-col gap-3">
      {surprise && gifts.data[0]?.hiddenBySurprise && <Alert><EyeIcon /><AlertDescription>Surprise mode is on — details are hidden until the day.</AlertDescription></Alert>}
      {gifts.data.map((g) => (
        <div key={g.orderId} className="bg-card shadow-border flex gap-3 rounded-2xl p-3">
          {g.image ? <Img src={g.image} alt="" className="size-12 rounded-lg" sizes="48px" /> : <span className="bg-plum text-gold grid size-12 place-items-center rounded-lg"><GiftIcon className="size-5" /></span>}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{g.itemTitle ?? "A surprise gift"}</p>
            <p className="text-muted-foreground">{g.buyerName ? `From ${g.buyerName}` : g.hiddenBySurprise ? "Sender hidden" : "Anonymous"} · {formatDateTime(g.createdAt)}</p>
            {g.message && <p className="mt-1 italic">“{g.message}”</p>}
            <p className="mt-1 flex items-center gap-1 text-xs"><CheckCircleIcon className="text-success size-3.5" />{ORDER_STATUS_LABEL[g.status]}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

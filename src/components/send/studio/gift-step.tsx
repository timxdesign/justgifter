import { useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "cn"
import { addDays, AVOID_OPTIONS, INTERESTS, ZONES, zoneById, type InterestId } from "@domain/index.ts"
import type { AssistantPick, AssistantResponse } from "@/api"
import { getApi } from "@/api"
import { Img } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRightUpIcon, CheckCircleIcon, CheckIcon, DeliveryIcon, InfoCircleIcon, RefreshIcon, StarsIcon, TagPriceIcon } from "@/components/icons"
import { FieldError, SectionTitle, type FieldProblem } from "@/components/studio/studio-layout"
import { useApiQuery } from "@/lib/api-hooks"
import { formatDate, formatMoney, todayLagos } from "@/lib/format"
import { answer, recipientLabel, selectGift, toPreferences, type SendState } from "@/lib/send-flow"
import { Chip, ChipRow } from "../parts"

type Update = (next: SendState) => void

const BUDGETS = [1_500_000, 2_500_000, 5_000_000, 10_000_000, 20_000_000]
const PAGE = 4
/** Gifts that are eaten, drunk or put on skin: only then do allergies and "leave out" matter. */
const NEEDS_AVOID: InterestId[] = ["foodie", "sweet-tooth", "coffee-tea", "cooking", "wellness"]

export function useRecommendations(s: SendState) {
  const prefs = toPreferences(s)
  const note = [s.gift.interestNote, s.purpose].filter(Boolean).join(". ")
  return useApiQuery(["send-recs", prefs, note], (api) => api.recommend({ prefs, ...(note ? { message: note } : {}) }), { staleTime: 60_000 })
}

/** A lower budget based on what's showing, rounded to ₦1,000. Never goes below ₦5,000. */
export function cheaperBudget(s: SendState, shown: AssistantPick[]): number | null {
  const comparable = shown.map((p) => (s.gift.budgetIncludesDelivery !== false && p.totalWithDelivery !== null ? p.totalWithDelivery : p.price)).sort((a, b) => a - b)
  if (!comparable.length) return null
  const median = comparable[Math.floor(comparable.length / 2)]
  const ceiling = typeof s.gift.budgetMax === "number" ? Math.min(s.gift.budgetMax, median) : median
  const next = Math.floor((ceiling * 0.8) / 100_000) * 100_000
  return next >= 500_000 ? next : null
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="eyebrow">{title}</span>
        {hint && <span className="text-muted-foreground text-sm">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Step 2: what they'd love, and the ideas that fit. Every change refreshes the ideas. */
export function GiftStep({ s, update, problems }: { s: SendState; update: Update; problems: FieldProblem[] }) {
  const today = todayLagos()
  const g = s.gift
  const [custom, setCustom] = useState("")
  const customKobo = Math.round(Number(custom.replace(/[^\d.]/g, "")) * 100)
  const set = (id: Parameters<typeof answer>[1], patch: (d: SendState) => void) => update(answer(s, id, patch))
  const timing = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "In 3 days", value: addDays(today, 3) },
    { label: "This week", value: addDays(today, 7) },
  ]
  const showAvoid = g.interests.some((i) => NEEDS_AVOID.includes(i))
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-7" aria-labelledby="ss-prefs">
        <div id="ss-prefs">
          <SectionTitle hint="Skip anything you're unsure about. Ideas below update as you go.">What would {recipientLabel(s)} love?</SectionTitle>
        </div>
        <Block title="Budget">
          <ChipRow label="Budget">
            {BUDGETS.map((b) => (
              <Chip key={b} selected={g.budgetMax === b} onClick={() => set("budget", (d) => { d.gift.budgetMax = d.gift.budgetMax === b ? undefined : b; d.gift.budgetIncludesDelivery ??= true })}>
                Up to {formatMoney(b)}
              </Chip>
            ))}
          </ChipRow>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (customKobo >= 100_000) { set("budget", (d) => { d.gift.budgetMax = customKobo; d.gift.budgetIncludesDelivery ??= true }); setCustom("") } }}>
              <div className="flex w-40 flex-col gap-1.5">
                <Label htmlFor="ss-budget" className="text-muted-foreground text-xs">Or an amount (₦)</Label>
                <Input id="ss-budget" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={typeof g.budgetMax === "number" && !BUDGETS.includes(g.budgetMax) ? (g.budgetMax / 100).toLocaleString("en") : "e.g. 35,000"} className="h-10" />
              </div>
              <Button type="submit" variant="outline" disabled={customKobo < 100_000}>Use</Button>
            </form>
            {typeof g.budgetMax === "number" && (
              <div className="flex h-10 items-center gap-2.5">
                <Checkbox id="ss-incl" checked={g.budgetIncludesDelivery !== false} onCheckedChange={(v) => set("budget-delivery", (d) => void (d.gift.budgetIncludesDelivery = v === true))} />
                <Label htmlFor="ss-incl" className="font-normal">Including delivery</Label>
              </div>
            )}
          </div>
        </Block>
        <Block title="They enjoy">
          <ChipRow label="Interests">
            {INTERESTS.map((i) => (
              <Chip key={i.id} multi selected={g.interests.includes(i.id)} onClick={() => set("interests", (d) => { d.gift.interests = d.gift.interests.includes(i.id) ? d.gift.interests.filter((x) => x !== i.id) : [...d.gift.interests, i.id]; d.gift.interestsDone = true })}>
                {i.name}
              </Chip>
            ))}
          </ChipRow>
        </Block>
        <AnimatePresence initial={false}>
          {showAvoid && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Block title="Leave out" hint="We filter on each vendor's description. For allergies, check ingredients with the vendor too.">
                <ChipRow label="Leave out">
                  {AVOID_OPTIONS.map((o) => (
                    <Chip key={o.id} multi selected={(g.avoid ?? []).includes(o.id)} onClick={() => set("avoid", (d) => { const a = d.gift.avoid ?? []; d.gift.avoid = a.includes(o.id) ? a.filter((x) => x !== o.id) : [...a, o.id] })}>
                      {o.name}
                    </Chip>
                  ))}
                </ChipRow>
              </Block>
            </motion.div>
          )}
        </AnimatePresence>
        <Block title="Delivery area" hint="Just the area, so we only suggest what can reach them. The address comes at checkout, or they can add it themselves.">
          <ChipRow label="Delivery area">
            {ZONES.map((z) => (
              <Chip key={z.id} selected={g.zoneId === z.id} onClick={() => set("zone", (d) => void (d.gift.zoneId = d.gift.zoneId === z.id ? undefined : z.id))}>
                {z.name}
              </Chip>
            ))}
          </ChipRow>
        </Block>
        <Block title="Arrives">
          <ChipRow label="Arrives">
            {timing.map((o) => (
              <Chip key={o.label} selected={g.deliverBy === o.value} onClick={() => set("timing", (d) => void (d.gift.deliverBy = d.gift.deliverBy === o.value ? undefined : o.value))}>
                {o.label}
              </Chip>
            ))}
            <Chip selected={g.deliverBy === "any"} onClick={() => set("timing", (d) => void (d.gift.deliverBy = d.gift.deliverBy === "any" ? undefined : "any"))}>No rush</Chip>
          </ChipRow>
          <div className="flex w-48 flex-col gap-1.5">
            <Label htmlFor="ss-by" className="text-muted-foreground text-xs">Or by a date</Label>
            <Input id="ss-by" type="date" min={today} max={addDays(today, 90)} value={g.deliverBy && g.deliverBy !== "any" && !timing.some((t) => t.value === g.deliverBy) ? g.deliverBy : ""} onChange={(e) => e.target.value >= today && set("timing", (d) => void (d.gift.deliverBy = e.target.value))} className="h-10" />
          </div>
        </Block>
      </section>

      <Ideas s={s} update={update} problems={problems} />
    </div>
  )
}

function Ideas({ s, update, problems }: { s: SendState; update: Update; problems: FieldProblem[] }) {
  const recs = useRecommendations(s)
  const data = recs.data
  const picks = useMemo(() => data?.picks ?? [], [data])
  const [paging, setPaging] = useState({ session: "", page: 0 })
  const [note, setNote] = useState<string | null>(null)
  const page = data && paging.session === data.sessionId ? paging.page : 0
  const shown = picks.slice(page * PAGE, page * PAGE + PAGE)
  // A chosen gift stays visible even when the ideas move on.
  const chosen = s.selected && !shown.some((p) => p.product.id === s.selected!.productId) ? s.selected : null

  const choose = (p: AssistantPick) => {
    if (data) void getApi().then((api) => api.recordRecommendationFeedback(data.sessionId, p.product.id, true)).catch(() => {})
    update(selectGift(s, p))
  }
  const cheaper = () => {
    const next = cheaperBudget(s, shown)
    if (!next) return setNote("These are already the most affordable options that fit. Try another area or date for more choice.")
    update({ ...s, gift: { ...s.gift, budgetMax: next, budgetIncludesDelivery: s.gift.budgetIncludesDelivery ?? true, excludeIds: [] }, selected: undefined })
    setNote(`Looking for gifts up to ${formatMoney(next)}.`)
  }
  const personal = () => {
    const on = !s.gift.personalisedOnly
    update({ ...s, gift: { ...s.gift, personalisedOnly: on, excludeIds: [] } })
    setNote(on ? "Showing gifts you can personalise: a name, a message or an engraving." : "Showing all gifts again.")
  }
  const other = () => {
    if ((page + 1) * PAGE < picks.length) {
      setPaging({ session: data?.sessionId ?? "", page: page + 1 })
      setNote(null)
    } else {
      update({ ...s, gift: { ...s.gift, excludeIds: [...new Set([...s.gift.excludeIds, ...picks.map((p) => p.product.id)])] } })
      setNote("Looking a little further for you.")
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ss-ideas" aria-busy={recs.isFetching}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div id="ss-ideas">
          <SectionTitle hint="Approved, in-stock gifts that fit. Prices and delivery are checked again at checkout.">Ideas for {recipientLabel(s)}</SectionTitle>
        </div>
      </div>
      <FieldError problems={problems} field="gift" />
      {chosen && (
        <div className="ring-brand bg-brand-soft/50 flex items-center gap-3 rounded-2xl p-2.5 ring-2">
          <div className="size-14 shrink-0 overflow-hidden rounded-xl"><Img src={chosen.image} alt="" className="size-full" sizes="56px" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-brand-text text-xs font-semibold tracking-wide uppercase">Your choice</p>
            <p className="truncate font-medium">{chosen.title}</p>
            <p className="text-muted-foreground text-sm">{formatMoney(chosen.price)} · {chosen.vendorName}</p>
          </div>
        </div>
      )}
      {recs.isLoading || (recs.isFetching && !shown.length) ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
      ) : recs.isError ? (
        <Button variant="outline" className="w-fit" onClick={() => recs.refetch()}><RefreshIcon data-icon="inline-start" />Try again</Button>
      ) : data && picks.length === 0 ? (
        <NothingFits s={s} data={data} update={update} />
      ) : (
        <>
          <ul className={cn("grid gap-3 sm:grid-cols-2", recs.isFetching && "opacity-60 transition-opacity")}>
            {shown.map((p, i) => (
              <motion.li key={p.product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <PickCard s={s} pick={p} chosen={s.selected?.productId === p.product.id} onChoose={() => choose(p)} />
              </motion.li>
            ))}
          </ul>
          <ChipRow label="Refine ideas">
            <Chip icon={<TagPriceIcon className="size-4" />} onClick={cheaper}>More affordable</Chip>
            <Chip multi selected={Boolean(s.gift.personalisedOnly)} onClick={personal}>Something more personal</Chip>
            <Chip icon={<RefreshIcon className="size-4" />} onClick={other}>Show other ideas</Chip>
          </ChipRow>
          {note && <p className="text-muted-foreground text-sm" role="status">{note}</p>}
        </>
      )}
    </section>
  )
}

function PickCard({ s, pick, chosen, onChoose }: { s: SendState; pick: AssistantPick; chosen: boolean; onChoose: () => void }) {
  const p = pick.product
  const zone = s.gift.zoneId && s.gift.zoneId !== "unsure" ? zoneById(s.gift.zoneId) : null
  const by = s.gift.deliverBy && s.gift.deliverBy !== "any" ? s.gift.deliverBy : null
  const today = todayLagos()
  return (
    <article className={cn("bg-card flex h-full gap-3 rounded-2xl p-2.5 ring-1 transition-shadow sm:flex-col", chosen ? "ring-brand ring-2" : "ring-border")}>
      <div className="relative w-28 shrink-0 overflow-hidden rounded-xl sm:w-full">
        <div className="aspect-[4/5] sm:aspect-[4/3]">
          <Img src={p.images[0]} alt="" className="size-full" sizes="(min-width: 640px) 300px, 112px" />
        </div>
        {p.lowStock && <span className="bg-card/90 shadow-border absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-md">Only {p.lowStock} left</span>}
        {chosen && (
          <span className="bg-brand text-brand-foreground absolute top-2 right-2 grid size-7 place-items-center rounded-full shadow">
            <CheckIcon className="size-4" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1 sm:px-1.5">
        <div>
          <p className="text-muted-foreground truncate text-xs">{p.vendor.name}</p>
          <h3 className="leading-snug font-medium">{p.title}</h3>
        </div>
        <div className="text-sm">
          <p className="font-semibold">{formatMoney(pick.price)}</p>
          {pick.deliveryFee !== null && pick.totalWithDelivery !== null ? (
            <p className="text-muted-foreground text-xs">+ {formatMoney(pick.deliveryFee)} delivery · {formatMoney(pick.totalWithDelivery)} total</p>
          ) : (
            <p className="text-muted-foreground text-xs">Delivery fee confirmed once you choose an area</p>
          )}
        </div>
        <p className="text-muted-foreground flex gap-1.5 text-[0.8125rem] leading-snug">
          <StarsIcon className="text-brand-text mt-0.5 size-3.5 shrink-0" />
          <span>{pick.explanation}</span>
        </p>
        {zone ? (
          p.earliest ? (
            <p className="text-success flex items-center gap-1.5 text-xs font-medium">
              <CheckCircleIcon className="size-3.5 shrink-0" />
              {by ? `Can arrive in ${zone.name} by ${by === today ? "today" : formatDate(by)}` : `Delivers to ${zone.name} from ${p.earliest.date === today ? "today" : formatDate(p.earliest.date)}`}
            </p>
          ) : (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs"><DeliveryIcon className="size-3.5 shrink-0" />Delivers to {zone.name} · date confirmed at checkout</p>
          )
        ) : (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs"><InfoCircleIcon className="size-3.5 shrink-0" />Choose a delivery area to check dates</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant={chosen ? "outline" : "default"} onClick={onChoose} aria-pressed={chosen}>
            {chosen ? <><CheckIcon data-icon="inline-start" />Chosen</> : "Choose this"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/products/${p.slug}`} target="_blank" rel="noopener">
              View<ArrowRightUpIcon data-icon="inline-end" />
              <span className="sr-only"> {p.title} (opens in a new tab)</span>
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

/** Explains what's limiting and offers the change most likely to help (AI 02). */
function NothingFits({ s, data, update }: { s: SendState; data: AssistantResponse; update: Update }) {
  const g = s.gift
  const actions: { label: string; next: SendState }[] = []
  if (g.excludeIds.length) actions.push({ label: "Show the earlier ideas again", next: { ...s, gift: { ...g, excludeIds: [] } } })
  if (g.personalisedOnly) actions.push({ label: "Include gifts that aren't personalised", next: { ...s, gift: { ...g, personalisedOnly: false } } })
  if (data.limiting === "budget" && typeof g.budgetMax === "number") {
    const raised = Math.ceil((g.budgetMax * 1.5) / 100_000) * 100_000
    actions.push({ label: `Raise the budget to ${formatMoney(raised)}`, next: { ...s, gift: { ...g, budgetMax: raised } } })
    if (g.budgetIncludesDelivery !== false) actions.push({ label: "Pay for delivery on top", next: { ...s, gift: { ...g, budgetIncludesDelivery: false } } })
  }
  if (data.limiting === "date") actions.push({ label: "Allow any delivery date", next: { ...s, gift: { ...g, deliverBy: "any" } } })
  if (data.limiting === "zone") actions.push({ label: "Search every area", next: { ...s, gift: { ...g, zoneId: undefined } } })
  if (g.avoid?.length) actions.push({ label: "Clear what to leave out", next: { ...s, gift: { ...g, avoid: [] } } })
  const message = g.excludeIds.length ? "That's everything that fits right now." : g.personalisedOnly && data.limiting === "none" ? "None of the gifts that fit can be personalised." : (data.limitingMessage ?? "Nothing matches all of those details yet.")
  return (
    <div className="bg-card ring-border flex flex-col gap-3 rounded-2xl p-5 ring-1">
      <p className="font-medium">{message}</p>
      <p className="text-muted-foreground text-sm">We won't suggest something outside your budget, or that can't arrive in time.</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} variant="outline" onClick={() => update(a.next)}>{a.label}</Button>
        ))}
        <Button variant="ghost" asChild><Link to="/shop">Browse all gifts</Link></Button>
      </div>
    </div>
  )
}

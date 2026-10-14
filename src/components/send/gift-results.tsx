import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { cn } from "cn"
import { occasionById, zoneById } from "@domain/index.ts"
import type { AssistantPick, AssistantResponse } from "@/api"
import { getApi } from "@/api"
import { Img } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircleIcon, DeliveryIcon, InfoCircleIcon, ArrowRightUpIcon, RefreshIcon, TagPriceIcon, PenIcon, StarsIcon } from "@/components/icons"
import { useApiQuery } from "@/lib/api-hooks"
import { formatDate, formatMoney, todayLagos } from "@/lib/format"
import { recipientLabel, selectGift, toPreferences, type SendState } from "@/lib/send-flow"
import { AssistantSays, Chip, ChipRow, Panel } from "./parts"

const PAGE = 3

/** Refinement requests typed into the composer while results are showing. */
export function refineCommand(text: string): RefineRequest | null {
  if (/\b(cheaper|more affordable|less expensive|lower (price|budget)|too (expensive|pricey)|cheap)\b/i.test(text)) return "cheaper"
  if (/\b(more personal|personali[sz]ed?|engrav|custom)\b/i.test(text)) return "personal"
  if (/\b(other|different|more) (options|ideas|gifts|suggestions)\b|\bshow (me )?(more|others)\b|\bsomething else\b/i.test(text)) return "other"
  return null
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

export function useRecommendations(s: SendState) {
  const prefs = toPreferences(s)
  const note = [s.gift.interestNote, s.purpose].filter(Boolean).join(". ")
  return useApiQuery(["send-recs", prefs, note], (api) => api.recommend({ prefs, ...(note ? { message: note } : {}) }), { staleTime: 60_000 })
}

export type RefineRequest = "cheaper" | "personal" | "other"

export function GiftResults({ s, update, onNote, request, onRequestHandled }: { s: SendState; update: (n: SendState) => void; onNote: (note: string) => void; request: RefineRequest | null; onRequestHandled: () => void }) {
  const recs = useRecommendations(s)
  const data = recs.data
  const picks = useMemo(() => data?.picks ?? [], [data])
  // Paging belongs to one result set: new results always start on their first page.
  const [paging, setPaging] = useState({ session: "", page: 0 })
  const page = data && paging.session === data.sessionId ? paging.page : 0
  const setPage = (n: number) => setPaging({ session: data?.sessionId ?? "", page: n })
  const shown = picks.slice(page * PAGE, page * PAGE + PAGE)

  const refine = (kind: RefineRequest) => {
    if (kind === "cheaper") {
      const next = cheaperBudget(s, shown)
      if (!next) return onNote("These are already the most affordable options that fit. Try a different area or date for more choice.")
      update({ ...s, gift: { ...s.gift, budgetMax: next, budgetIncludesDelivery: s.gift.budgetIncludesDelivery ?? true, excludeIds: [] } })
      onNote(`Looking for gifts up to ${formatMoney(next)}${s.gift.budgetIncludesDelivery === false ? " before delivery" : " including delivery"}.`)
    } else if (kind === "personal") {
      const on = !s.gift.personalisedOnly
      update({ ...s, gift: { ...s.gift, personalisedOnly: on, excludeIds: [] } })
      onNote(on ? "Showing gifts you can personalise — a name, a message or an engraving." : "Showing all gifts again, personalised or not.")
    } else if ((page + 1) * PAGE < picks.length) {
      setPage(page + 1)
      onNote("Here are a few more.")
    } else {
      update({ ...s, gift: { ...s.gift, excludeIds: [...new Set([...s.gift.excludeIds, ...picks.map((p) => p.product.id)])] } })
      onNote("Looking a little further for you.")
    }
  }

  // Refinements typed into the composer arrive here.
  useEffect(() => {
    if (!request || !data) return
    refine(request)
    onRequestHandled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, data])

  const choose = (p: AssistantPick) => {
    if (data) void getApi().then((api) => api.recordRecommendationFeedback(data.sessionId, p.product.id, true)).catch(() => {})
    update(selectGift(s, p))
  }

  const occasion = s.occasion && s.occasion !== "unsure" ? occasionById(s.occasion)?.name.toLowerCase() : null
  return (
    <div className="flex flex-col gap-5" aria-busy={recs.isFetching}>
      {recs.isLoading || (recs.isFetching && !shown.length) ? (
        <>
          <AssistantSays muted>Checking stock, budgets and delivery dates…</AssistantSays>
          <Panel>
            <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
          </Panel>
        </>
      ) : recs.isError ? (
        <>
          <AssistantSays muted>I couldn't load suggestions just now.</AssistantSays>
          <Panel><Button variant="outline" className="w-fit" onClick={() => recs.refetch()}><RefreshIcon data-icon="inline-start" />Try again</Button></Panel>
        </>
      ) : data && picks.length === 0 ? (
        <NothingFits s={s} data={data} update={update} />
      ) : data ? (
        <>
          <AssistantSays hint="Only approved, in-stock listings that fit what you told me. Prices and delivery are checked again at checkout.">
            {page === 0 ? `Here are a few ideas for ${recipientLabel(s)}${occasion ? `'s ${occasion}` : ""}.` : "A few more ideas."}
          </AssistantSays>
          <Panel>
            <ul className={cn("grid gap-3 sm:grid-cols-3", recs.isFetching && "opacity-60 transition-opacity")}>
              {shown.map((p) => (
                <li key={p.product.id}>
                  <PickCard s={s} pick={p} onChoose={() => choose(p)} onAddArea={() => update({ ...s, editing: "zone" })} />
                </li>
              ))}
            </ul>
            <ChipRow label="Refine suggestions">
              <Chip icon={<TagPriceIcon className="size-4" />} onClick={() => refine("cheaper")}>More affordable</Chip>
              <Chip multi selected={Boolean(s.gift.personalisedOnly)} onClick={() => refine("personal")}>Something more personal</Chip>
              <Chip icon={<RefreshIcon className="size-4" />} onClick={() => refine("other")}>Show other options</Chip>
            </ChipRow>
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function PickCard({ s, pick, onChoose, onAddArea }: { s: SendState; pick: AssistantPick; onChoose: () => void; onAddArea: () => void }) {
  const p = pick.product
  const zone = s.gift.zoneId && s.gift.zoneId !== "unsure" ? zoneById(s.gift.zoneId) : null
  const by = s.gift.deliverBy && s.gift.deliverBy !== "any" ? s.gift.deliverBy : null
  const today = todayLagos()
  return (
    <article className="bg-card shadow-border flex h-full gap-3 rounded-2xl p-2.5 sm:flex-col">
      <div className="relative w-28 shrink-0 overflow-hidden rounded-xl sm:w-full">
        <div className="aspect-[4/5]">
          <Img src={p.images[0]} alt="" className="size-full" sizes="(min-width: 640px) 220px, 112px" />
        </div>
        {p.lowStock && <span className="bg-card/90 shadow-border absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-md">Only {p.lowStock} left</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1 sm:px-1.5">
        <div>
          <p className="text-muted-foreground truncate text-xs">{p.vendor.name}</p>
          <h3 className="leading-snug font-medium">{p.title}</h3>
          {pick.variantName && p.priceFrom !== p.priceTo && <p className="text-muted-foreground text-xs">{pick.variantName}</p>}
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
          <button type="button" onClick={onAddArea} className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-left text-xs underline decoration-dotted underline-offset-2">
            <InfoCircleIcon className="size-3.5 shrink-0" />Add a delivery area to check dates
          </button>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={onChoose}>Choose this</Button>
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

/** Explains what's limiting and offers the one change most likely to help (AI 02). */
function NothingFits({ s, data, update }: { s: SendState; data: AssistantResponse; update: (n: SendState) => void }) {
  const g = s.gift
  const actions: { label: string; next: SendState }[] = []
  if (g.excludeIds.length) actions.push({ label: "Show the earlier ideas again", next: { ...s, gift: { ...g, excludeIds: [] } } })
  if (g.personalisedOnly) actions.push({ label: "Include gifts that aren't personalised", next: { ...s, gift: { ...g, personalisedOnly: false } } })
  if (data.limiting === "budget" && typeof g.budgetMax === "number") {
    const raised = Math.ceil((g.budgetMax * 1.5) / 100_000) * 100_000
    actions.push({ label: `Raise the budget to ${formatMoney(raised)}`, next: { ...s, gift: { ...g, budgetMax: raised } } })
    if (g.budgetIncludesDelivery !== false) actions.push({ label: "Pay for delivery on top", next: { ...s, gift: { ...g, budgetIncludesDelivery: false } } })
  }
  if (data.limiting === "date") actions.push({ label: "Allow a later delivery date", next: { ...s, editing: "timing" } })
  if (data.limiting === "zone") actions.push({ label: "Choose another area", next: { ...s, editing: "zone" } })
  if (g.avoid?.length) actions.push({ label: "Change what to leave out", next: { ...s, editing: "avoid" } })
  const message = g.excludeIds.length ? "That's everything that fits right now." : g.personalisedOnly && data.limiting === "none" ? "None of the gifts that fit can be personalised." : (data.limitingMessage ?? "Nothing matches all of those details yet.")
  return (
    <>
      <AssistantSays hint="I won't suggest something outside your budget or that can't arrive in time.">{message}</AssistantSays>
      <Panel>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.label} variant="outline" onClick={() => update(a.next)}>
              {a.next.editing && <PenIcon data-icon="inline-start" />}
              {a.label}
            </Button>
          ))}
          <Button variant="ghost" asChild><Link to="/shop">Browse all gifts</Link></Button>
        </div>
      </Panel>
    </>
  )
}

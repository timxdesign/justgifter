import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import type { GiftPreferences, InterestId, OccasionId, Relationship, ZoneId } from "@domain/index.ts"
import { BUDGET_BANDS, INTERESTS, OCCASIONS, RELATIONSHIPS, occasionById, zoneById, interestName, addDays } from "@domain/index.ts"
import type { AssistantResponse } from "@/api"
import { Container, CardGridSkeleton } from "@/components/common"
import { ProductCard, ZoneSelect } from "@/components/commerce"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StarsIcon, LikeIcon, DislikeIcon, InfoCircleIcon, ArrowRightIcon } from "@/components/icons"
import { useApiMutation } from "@/lib/api-hooks"
import { getApi } from "@/api"
import { formatMoney, formatDate, todayLagos } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const EXAMPLES = [
  "Birthday gift for my sister in Lekki, she loves coffee, under ₦50k, by Friday",
  "Something calm for a colleague who just had surgery in Abuja",
  "Wedding gift for friends in Ikoyi who love cooking",
]

export default function AssistantPage() {
  useDocumentMeta({ title: "Gift assistant", description: "Describe who it's for and get gift ideas that fit your budget and can arrive in time." })
  const [params] = useSearchParams()
  const reduce = useReducedMotion()
  const [message, setMessage] = useState(params.get("q") ?? "")
  const [prefs, setPrefs] = useState<GiftPreferences>({ interests: [] })
  const [result, setResult] = useState<AssistantResponse | null>(null)
  const ask = useApiMutation((api, input: { message?: string; prefs?: GiftPreferences }) => api.recommend(input), { onSuccess: (r) => { setResult(r); setPrefs(r.prefs) } })

  useEffect(() => {
    if (params.get("q")) ask.mutate({ message: params.get("q")! })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refine = (patch: Partial<GiftPreferences>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    ask.mutate({ prefs: next })
  }

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-60" style={{ background: "radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--brand) 22%, transparent), transparent)" }} />
      <Container className="relative flex flex-col gap-10 py-14">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <span className="bg-brand-soft text-brand-text flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"><StarsIcon className="size-4" />Gift assistant</span>
          <h1 className="font-display text-5xl leading-[1.05] font-medium">Tell us who it's for.</h1>
          <p className="text-muted-foreground text-lg">We'll suggest gifts from approved vendors that fit your budget and can actually arrive in time.</p>
        </div>

        <form className="bg-card mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-3xl p-3 shadow-[var(--shadow-float)]" onSubmit={(e) => { e.preventDefault(); if (message.trim()) ask.mutate({ message, prefs: { interests: [] } }) }}>
          <Textarea aria-label="Describe the person and occasion" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="e.g. Anniversary gift for my wife in Lagos Island, she loves candles and books, around ₦60k" className="resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (message.trim()) ask.mutate({ message, prefs: { interests: [] } }) } }} />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <p className="text-muted-foreground text-xs">No exact birthdays or addresses needed.</p>
            <Button type="submit" disabled={!message.trim() || ask.isPending}>{ask.isPending ? "Thinking…" : "Find gifts"}<ArrowRightIcon data-icon="inline-end" /></Button>
          </div>
        </form>
        {!result && !ask.isPending && (
          <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => { setMessage(ex); ask.mutate({ message: ex, prefs: { interests: [] } }) }} className="press bg-card shadow-border hover:shadow-border-hover rounded-full px-4 py-2 text-left text-sm">{ex}</button>)}
          </div>
        )}

        {(result || ask.isPending) && (
          <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
            <aside className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
              <h2 className="font-semibold">What we understood</h2>
              <PrefControls prefs={prefs} refine={refine} />
              <p className="text-muted-foreground flex gap-2 text-xs"><InfoCircleIcon className="mt-0.5 size-4 shrink-0" />Suggestions come only from in-stock, approved listings. Prices and dates are checked again at checkout.</p>
            </aside>
            <section aria-live="polite" aria-busy={ask.isPending} className="flex min-w-0 flex-col gap-6">
              {ask.isPending ? (
                <><p className="text-muted-foreground flex items-center gap-2"><StarsIcon className="text-brand-text size-4 animate-pulse" />Checking stock, budgets and delivery dates…</p><CardGridSkeleton count={6} className="lg:grid-cols-3" /></>
              ) : result && result.picks.length === 0 ? (
                <div className="bg-card shadow-border flex flex-col gap-4 rounded-3xl p-8">
                  <h3 className="font-display text-2xl">Nothing fits just yet</h3>
                  <p className="text-muted-foreground">{result.limitingMessage}</p>
                  <div className="flex flex-wrap gap-2">
                    {result.limiting === "budget" && prefs.budgetMax && <Button onClick={() => refine({ budgetMax: Math.round(prefs.budgetMax! * 1.5) })}>Raise budget to {formatMoney(Math.round(prefs.budgetMax * 1.5))}</Button>}
                    {result.limiting === "date" && <Button onClick={() => refine({ deliverBy: undefined })}>Any delivery date</Button>}
                    {result.limiting === "zone" && <Button onClick={() => refine({ zoneId: undefined })}>Any area</Button>}
                    <Button variant="outline" asChild><Link to="/shop">Browse everything</Link></Button>
                  </div>
                </div>
              ) : result ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-3xl">{result.picks.length} ideas{prefs.occasion ? ` for a ${occasionById(prefs.occasion)?.name.toLowerCase()}` : ""}</h2>
                    {result.deliveryUncertain && <p className="text-muted-foreground text-sm">Delivery shown from each vendor's lowest charge — add an area for exact prices.</p>}
                  </div>
                  {result.followUps.length > 0 && (
                    <div className="flex flex-wrap gap-2">{result.followUps.map((f) => <span key={f} className="bg-muted rounded-full px-3 py-1.5 text-sm">{f}</span>)}</div>
                  )}
                  <motion.ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: reduce ? 0 : 0.06 } } }}>
                    <AnimatePresence>
                      {result.picks.map((p) => (
                        <motion.li key={p.product.id} variants={{ h: { opacity: 0, y: 12 }, s: { opacity: 1, y: 0 } }}>
                          <ProductCard product={p.product} footer={
                            <div className="mt-1 flex flex-col gap-2">
                              <p className="text-muted-foreground text-[0.8125rem] leading-snug">{p.explanation}</p>
                              <Feedback sessionId={result.sessionId} productId={p.product.id} />
                            </div>
                          } />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ul>
                </>
              ) : null}
            </section>
          </div>
        )}
      </Container>
    </div>
  )
}

function PrefControls({ prefs, refine }: { prefs: GiftPreferences; refine: (p: Partial<GiftPreferences>) => void }) {
  const today = todayLagos()
  const band = BUDGET_BANDS.find((b) => b.max === prefs.budgetMax)
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="a-occ">Occasion</FieldLabel>
        <Select value={prefs.occasion ?? "any"} onValueChange={(v) => refine({ occasion: v === "any" ? undefined : (v as OccasionId) })}>
          <SelectTrigger id="a-occ"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="any">I'm not sure</SelectItem>{OCCASIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="a-rel">They're my…</FieldLabel>
        <Select value={prefs.relationship ?? "any"} onValueChange={(v) => refine({ relationship: v === "any" ? undefined : (v as Relationship) })}>
          <SelectTrigger id="a-rel"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="any">I'd rather not say</SelectItem>{RELATIONSHIPS.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="a-budget">Budget (incl. delivery)</FieldLabel>
        <Select value={prefs.budgetMax ? String(prefs.budgetMax) : "any"} onValueChange={(v) => refine({ budgetMax: v === "any" ? undefined : Number(v) })}>
          <SelectTrigger id="a-budget"><SelectValue>{prefs.budgetMax ? `Up to ${formatMoney(prefs.budgetMax)}` : "Any budget"}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="any">Any budget</SelectItem>{[2_500_000, 5_000_000, 10_000_000, 20_000_000].map((b) => <SelectItem key={b} value={String(b)}>Up to {formatMoney(b)}</SelectItem>)}{prefs.budgetMax && !band && ![2_500_000, 5_000_000, 10_000_000, 20_000_000].includes(prefs.budgetMax) && <SelectItem value={String(prefs.budgetMax)}>Up to {formatMoney(prefs.budgetMax)}</SelectItem>}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="a-zone">Delivery area</FieldLabel>
        <ZoneSelect id="a-zone" value={prefs.zoneId ?? null} onChange={(z: ZoneId) => refine({ zoneId: z })} placeholder="Not sure yet" />
      </Field>
      <Field>
        <FieldLabel htmlFor="a-by">Needs to arrive</FieldLabel>
        <Select value={prefs.deliverBy ?? "any"} onValueChange={(v) => refine({ deliverBy: v === "any" ? undefined : v })}>
          <SelectTrigger id="a-by"><SelectValue>{prefs.deliverBy ? `By ${formatDate(prefs.deliverBy)}` : "Any time"}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="any">Any time</SelectItem><SelectItem value={today}>Today</SelectItem><SelectItem value={addDays(today, 1)}>By tomorrow</SelectItem><SelectItem value={addDays(today, 3)}>Within 3 days</SelectItem><SelectItem value={addDays(today, 7)}>Within a week</SelectItem>{prefs.deliverBy && ![today, addDays(today, 1), addDays(today, 3), addDays(today, 7)].includes(prefs.deliverBy) && <SelectItem value={prefs.deliverBy}>By {formatDate(prefs.deliverBy)}</SelectItem>}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <FieldSet>
        <FieldLegend variant="label">They enjoy</FieldLegend>
        <div className="flex flex-wrap gap-1.5">
          {INTERESTS.map((i) => {
            const on = prefs.interests.includes(i.id)
            return <button key={i.id} type="button" aria-pressed={on} onClick={() => refine({ interests: on ? prefs.interests.filter((x) => x !== i.id) : [...prefs.interests, i.id as InterestId] })} className={cn("press rounded-full px-3 py-1.5 text-xs transition-colors", on ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent")}>{i.name}</button>
          })}
        </div>
      </FieldSet>
      {prefs.zoneId && <p className="text-muted-foreground text-xs">Delivering to {zoneById(prefs.zoneId)?.name}{prefs.interests.length ? ` · likes ${prefs.interests.map(interestName).join(", ").toLowerCase()}` : ""}</p>}
    </div>
  )
}

function Feedback({ sessionId, productId }: { sessionId: string; productId: string }) {
  const [given, setGiven] = useState<boolean | null>(null)
  const send = async (helpful: boolean) => {
    setGiven(helpful)
    await (await getApi()).recordRecommendationFeedback(sessionId, productId, helpful)
  }
  if (given !== null) return <p className="text-muted-foreground relative z-10 text-xs">Thanks for the feedback</p>
  return (
    <div className="relative z-10 flex items-center gap-1">
      <span className="text-muted-foreground mr-1 text-xs">Good idea?</span>
      <button type="button" aria-label="Good suggestion" onClick={() => send(true)} className="hover:bg-muted grid size-7 place-items-center rounded-md"><LikeIcon className="size-4" /></button>
      <button type="button" aria-label="Not a good suggestion" onClick={() => send(false)} className="hover:bg-muted grid size-7 place-items-center rounded-md"><DislikeIcon className="size-4" /></button>
    </div>
  )
}

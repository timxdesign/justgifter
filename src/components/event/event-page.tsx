import type { CSSProperties, ReactNode } from "react"
import { cn } from "cn"
import { motion, useReducedMotion } from "motion/react"
import type { EventContent, EventDesign, SectionId } from "@domain/index.ts"
import { FONTS, PALETTES, templateById, eventTypeMeta } from "@domain/index.ts"
import type { WishlistItemView } from "@/api"
import { formatLongDate, formatMoney } from "@/lib/format"
import { CalendarIcon, ClockCircleIcon, MapPointIcon, TShirtIcon, HeartIcon } from "@/components/icons"
import { Img } from "@/components/common"

/**
 * Renders an occasion from validated content + design. Only allowlisted template, palette,
 * font and section values reach this component (AI 04), and user text is rendered as text —
 * never as HTML (§8 content control).
 */

export function paletteStyle(design: EventDesign): CSSProperties {
  const p = PALETTES[design.palette]
  const f = FONTS[design.font]
  return {
    "--ev-bg": p.background,
    "--ev-surface": p.surface,
    "--ev-text": p.text,
    "--ev-muted": p.muted,
    "--ev-accent": p.accent,
    "--ev-accent-text": p.accentText,
    "--ev-motif": p.motif,
    "--ev-heading": f.heading,
    "--ev-heading-variation": f.variation,
    colorScheme: p.dark ? "dark" : "light",
  } as CSSProperties
}

const headingStyle: CSSProperties = { fontFamily: "var(--ev-heading)", fontVariationSettings: "var(--ev-heading-variation)" }

export interface EventPageProps {
  content: EventContent
  design: EventDesign
  wishlist: WishlistItemView[]
  /** Renders the call to action for a wish (hold + checkout on the live page, inert in previews). */
  renderWishAction?: (w: WishlistItemView) => ReactNode
  zoneName?: string | null
  acceptingGifts?: boolean
  device?: "desktop" | "mobile"
  className?: string
}

export function EventPage({ content, design, wishlist, renderWishAction, zoneName, acceptingGifts = true, device, className }: EventPageProps) {
  const template = templateById(design.templateId)
  const tone = template?.tone ?? "elegant"
  const mobile = device === "mobile"
  const sections: Record<SectionId, ReactNode> = {
    hero: <Hero key="hero" content={content} design={design} mobile={mobile} />,
    story: content.story ? <Story key="story" text={content.story} tone={tone} /> : null,
    details: <Details key="details" content={content} mobile={mobile} />,
    agenda: content.agenda.length && content.showTime ? <Agenda key="agenda" items={content.agenda} /> : null,
    wishlist: wishlist.length ? <Wishlist key="wishlist" items={wishlist} renderAction={renderWishAction} zoneName={zoneName} accepting={acceptingGifts} mobile={mobile} /> : null,
    message: content.closingMessage ? <Closing key="message" text={content.closingMessage} /> : null,
  }
  return (
    <div style={paletteStyle(design)} className={cn("bg-[var(--ev-bg)] text-[var(--ev-text)]", className)} data-template={design.templateId}>
      {design.sectionOrder.map((id) => sections[id])}
      <footer className="flex flex-col items-center gap-1 py-12 text-center text-xs text-[var(--ev-muted)]">
        <span>Made with JustGifter</span>
        {zoneName && wishlist.length > 0 && <span>Gifts are delivered to the hosts in {zoneName}. Their address is never shown.</span>}
      </footer>
    </div>
  )
}

function SectionShell({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      aria-label={label}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
      className={cn("mx-auto w-full max-w-3xl px-6 py-14", className)}
    >
      {children}
    </motion.section>
  )
}

function Hero({ content, design, mobile }: { content: EventContent; design: EventDesign; mobile: boolean }) {
  const date = content.date ? formatLongDate(content.date) : "Date to be confirmed"
  const meta = eventTypeMeta(content.type)
  const t = design.templateId

  if (t === "confetti-pop") {
    return (
      <header className="relative overflow-hidden px-5 pt-10 pb-6 sm:px-8">
        <Dots />
        <div className={cn("relative mx-auto grid max-w-5xl items-center gap-8", !mobile && "md:grid-cols-[1.1fr_1fr]")}>
          <div className="flex flex-col gap-4">
            <span className="w-fit rounded-full bg-[var(--ev-accent)] px-3 py-1 text-xs font-semibold text-[var(--ev-accent-text)]">{meta?.name}</span>
            <h1 style={headingStyle} className={cn("text-5xl leading-[0.95] font-semibold tracking-tight", !mobile && "sm:text-7xl")}>
              {content.title}
            </h1>
            <p className="text-lg text-[var(--ev-muted)]">
              Hosted by {content.hostDisplayName} · {date}
            </p>
          </div>
          {content.coverImage && (
            <div className="relative">
              <div className="absolute -inset-3 rotate-3 rounded-[2rem] bg-[var(--ev-accent)] opacity-90" />
              <Img src={content.coverImage} alt="" eager className="relative aspect-[4/5] w-full -rotate-2 rounded-[1.75rem]" sizes="(min-width: 768px) 40vw, 90vw" />
            </div>
          )}
        </div>
      </header>
    )
  }

  if (t === "garden") {
    return (
      <header className="relative flex flex-col items-center gap-6 px-6 pt-14 pb-4 text-center">
        <Leaf className="absolute top-8 left-6 size-16 -rotate-12 text-[var(--ev-motif)] opacity-60" />
        <Leaf className="absolute top-24 right-6 size-12 rotate-[200deg] text-[var(--ev-motif)] opacity-50" />
        {content.coverImage && <Img src={content.coverImage} alt="" eager className="aspect-[3/4] w-56 rounded-t-full rounded-b-3xl sm:w-64" sizes="260px" />}
        <p className="text-sm tracking-[0.2em] text-[var(--ev-muted)] uppercase">{meta?.name}</p>
        <h1 style={headingStyle} className="max-w-xl text-4xl leading-tight font-medium sm:text-5xl">
          {content.title}
        </h1>
        <p className="text-[var(--ev-muted)]">
          {content.hostDisplayName} · {date}
        </p>
      </header>
    )
  }

  if (t === "quiet") {
    return (
      <header className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-16 pb-4">
        {content.coverImage && <Img src={content.coverImage} alt="" eager className="aspect-[16/9] w-full rounded-lg grayscale-[0.25]" sizes="(min-width: 768px) 720px, 100vw" />}
        <div className="flex flex-col gap-2 border-l-2 border-[var(--ev-motif)] pl-5">
          <h1 style={headingStyle} className="text-4xl leading-tight font-normal">
            {content.title}
          </h1>
          <p className="text-[var(--ev-muted)]">
            {content.hostDisplayName} · {date}
          </p>
        </div>
      </header>
    )
  }

  // Soirée (default): full-bleed cover with centred serif title
  return (
    <header className="relative isolate flex min-h-[min(80vh,46rem)] flex-col items-center justify-end overflow-hidden px-6 pb-16 text-center text-white">
      {content.coverImage && <Img src={content.coverImage} alt="" eager className="absolute inset-0 -z-10 size-full" sizes="100vw" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-black/25 to-black/75" />
      <p className="mb-4 text-xs tracking-[0.35em] uppercase opacity-85">{meta?.name === "Wedding" ? "Together with their families" : meta?.name}</p>
      <h1 style={headingStyle} className={cn("max-w-3xl text-5xl leading-[1.02] font-light", !mobile && "sm:text-7xl")}>
        {content.title}
      </h1>
      <div className="mt-6 flex items-center gap-4 text-sm opacity-90">
        <span className="h-px w-10 bg-current opacity-60" />
        {date}
        <span className="h-px w-10 bg-current opacity-60" />
      </div>
    </header>
  )
}

function Story({ text, tone }: { text: string; tone: string }) {
  return (
    <SectionShell label="Story">
      <p style={tone === "playful" ? undefined : headingStyle} className={cn("text-center text-xl leading-relaxed whitespace-pre-line text-pretty", tone === "playful" ? "text-lg" : "font-normal italic sm:text-2xl")}>
        {text}
      </p>
    </SectionShell>
  )
}

function Details({ content, mobile }: { content: EventContent; mobile: boolean }) {
  const items = [
    { icon: CalendarIcon, label: "Date", value: content.date ? formatLongDate(content.date) : "To be confirmed" },
    ...(content.showTime && content.time ? [{ icon: ClockCircleIcon, label: "Time", value: `${formatClock(content.time)} (WAT)` }] : []),
    ...(content.showVenue && content.venue ? [{ icon: MapPointIcon, label: "Venue", value: content.venue }] : []),
    ...(content.dressCode ? [{ icon: TShirtIcon, label: "Dress code", value: content.dressCode }] : []),
  ]
  return (
    <SectionShell label="Details">
      <ul className={cn("grid gap-3", !mobile && "sm:grid-cols-2")}>
        {items.map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-start gap-4 rounded-2xl bg-[var(--ev-surface)] p-5 shadow-[0_0_0_1px_oklch(0_0_0/0.06)]">
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--ev-accent)]" />
            <p className="flex flex-col">
              <span className="text-xs tracking-wider text-[var(--ev-muted)] uppercase">{label}</span>
              <span className="mt-1 font-medium">{value}</span>
            </p>
          </li>
        ))}
      </ul>
      {!content.showVenue && <p className="mt-4 text-center text-sm text-[var(--ev-muted)]">The hosts will share the venue with guests directly.</p>}
    </SectionShell>
  )
}

function Agenda({ items }: { items: { time: string; label: string }[] }) {
  return (
    <SectionShell label="Programme">
      <h2 style={headingStyle} className="mb-8 text-center text-3xl">
        The programme
      </h2>
      <ol className="relative mx-auto flex max-w-md flex-col gap-6 border-l border-[var(--ev-motif)] pl-8">
        {items.map((a, i) => (
          <li key={i} className="relative">
            <span className="absolute top-1.5 -left-[2.32rem] size-3 rounded-full border-2 border-[var(--ev-bg)] bg-[var(--ev-accent)]" />
            <p className="tabular text-sm text-[var(--ev-muted)]">{formatClock(a.time)}</p>
            <p className="text-lg font-medium">{a.label}</p>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

const PRIORITY_LABEL = { must: "Most wanted", love: "Would love", nice: "Nice to have" } as const

function Wishlist({ items, renderAction, zoneName, accepting, mobile }: { items: WishlistItemView[]; renderAction?: (w: WishlistItemView) => ReactNode; zoneName?: string | null; accepting: boolean; mobile: boolean }) {
  return (
    <SectionShell label="Wishlist" className="max-w-5xl">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <HeartIcon className="size-6 text-[var(--ev-accent)]" />
        <h2 style={headingStyle} className="text-3xl sm:text-4xl">
          Wishlist
        </h2>
        <p className="max-w-md text-[var(--ev-muted)]">
          {accepting ? `Choose something below and it'll be delivered straight to the hosts${zoneName ? ` in ${zoneName}` : ""}. Other guests see what's still needed, never who bought what.` : "The hosts aren't accepting gifts through this page right now."}
        </p>
      </div>
      <ul className={cn("grid gap-4", mobile ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {items.map((w) => {
          const a = w.availability
          const fulfilled = a.state === "fulfilled"
          return (
            <li key={w.item.id} className={cn("flex flex-col overflow-hidden rounded-2xl bg-[var(--ev-surface)] shadow-[0_0_0_1px_oklch(0_0_0/0.06)] transition-opacity", fulfilled && "opacity-70")}>
              <div className="relative aspect-[5/4] overflow-hidden">
                <Img src={w.product.images[0]} alt="" className="size-full" sizes="(min-width: 1024px) 30vw, 90vw" />
                <span className="absolute top-3 left-3 rounded-full bg-[var(--ev-surface)]/90 px-2.5 py-1 text-xs font-medium backdrop-blur">{PRIORITY_LABEL[w.item.priority]}</span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex-1">
                  <h3 className="leading-snug font-medium">{w.product.title}</h3>
                  <p className="text-sm text-[var(--ev-muted)]">
                    {w.variantName} · {w.product.vendor.name}
                  </p>
                  {w.item.note && <p className="mt-2 text-sm italic">“{w.item.note}”</p>}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="tabular font-semibold">{formatMoney(w.price)}</span>
                  <span className="text-xs text-[var(--ev-muted)]">
                    {fulfilled ? "Gifted — thank you" : a.state === "available" ? `${w.item.desiredQty - w.item.purchasedQty} of ${w.item.desiredQty} still wanted` : a.state === "held" ? "Someone's checking out" : "Unavailable"}
                  </span>
                </div>
                {renderAction?.(w)}
              </div>
            </li>
          )
        })}
      </ul>
    </SectionShell>
  )
}

function Closing({ text }: { text: string }) {
  return (
    <SectionShell label="Closing note">
      <p style={headingStyle} className="text-center text-2xl leading-snug whitespace-pre-line italic">
        {text}
      </p>
    </SectionShell>
  )
}

function Dots() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70">
      {[[8, 18, 10], [88, 12, 14], [72, 70, 8], [15, 78, 12], [48, 8, 6], [94, 52, 9], [30, 40, 5]].map(([x, y, s], i) => (
        <span key={i} className="absolute rounded-full" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, background: i % 2 ? "var(--ev-motif)" : "var(--ev-accent)" }} />
      ))}
    </div>
  )
}

function Leaf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <path d="M8 56C8 28 28 8 56 8c0 28-20 48-48 48Z" fill="currentColor" opacity="0.35" />
      <path d="M8 56 44 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date(Date.UTC(2000, 0, 1, h, m))
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(d).replace(":00", "").replace(" AM", "am").replace(" PM", "pm")
}

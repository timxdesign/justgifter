import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react"
import { cn } from "cn"
import { daysBetween, parseSongLink, SONG_PROVIDERS, type LetterDesign } from "@domain/index.ts"
import type { LetterView } from "@/api"
import { todayLagos } from "@/lib/format"
import { MOMENTS } from "@/lib/letter-studio"
import { Confetti } from "@/components/reveal/confetti"
import { AltArrowLeftIcon, AltArrowRightIcon, CheckIcon, PauseIcon, PlayIcon, SquareArrowRightUpIcon, StarsIcon } from "@/components/icons"
import { Flower, GoldCorner, MomentObject } from "./art"
import type { LetterLook } from "./scene"

export interface MomentProps {
  letter: LetterView
  look: LetterLook
  design: LetterDesign
  /** No entrance animation and no interactive reveals: everything is shown as it is. */
  still: boolean
}

const ease = [0.2, 0, 0, 1] as const

/** Shared scene layout: a header, then the scene, leaving room for the navigation pill below. */
export function Shell({ eyebrow, title, look, children, className }: { eyebrow: string; title: string; look: LetterLook; children: ReactNode; className?: string }) {
  return (
    <div className={cn("absolute inset-0 flex flex-col items-center gap-[2.5cqh] px-5 pt-[max(4.75rem,10cqh)] pb-[max(6.5rem,13cqh)] @3xl:px-16", className)}>
      <header className="flex max-w-xl flex-col items-center gap-1 text-center">
        <p className="text-[0.6875rem] font-semibold tracking-[0.28em] uppercase" style={{ color: look.accentText }}>
          {eyebrow}
        </p>
        <h2 className="lt-serif text-[clamp(1.75rem,7cqw,3.25rem)] leading-[1.05] font-medium text-balance italic" style={{ color: look.ink }}>
          {title}
        </h2>
      </header>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">{children}</div>
    </div>
  )
}

function SceneButton({ look, onClick, children, label, disabled }: { look: LetterLook; onClick: () => void; children: ReactNode; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium backdrop-blur transition-[transform,opacity] active:scale-95 disabled:opacity-40"
      style={{ background: look.chip, color: look.ink, boxShadow: "0 0 0 1px rgb(0 0 0 / 0.06), 0 6px 16px -8px rgb(40 20 10 / 0.35)" }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- The letter

const GREETING = /^(dear|dearest|hi|hey|hello|my dear|my dearest|to my|my love|darling)\b/i

export function LetterMoment({ letter, look, design, still }: MomentProps) {
  const body = letter.body.trim()
  const paragraphs = body.split(/\n{2,}/)
  const firstLine = paragraphs[0]?.split("\n")[0] ?? ""
  const hasGreeting = GREETING.test(firstLine.trim()) && firstLine.length < 60
  const signed = body.endsWith(letter.senderDisplayName)
  const greeting = hasGreeting ? firstLine : null
  const rest = hasGreeting ? [paragraphs[0].split("\n").slice(1).join("\n"), ...paragraphs.slice(1)].filter((p) => p.trim()) : paragraphs
  return (
    <div className="absolute inset-0 flex items-start justify-center px-4 pt-[max(4.25rem,9cqh)] pb-[max(6.5rem,13cqh)] @3xl:px-16">
      <motion.article
        initial={still ? false : { rotateX: -65, opacity: 0, y: 40 }}
        animate={{ rotateX: 0, opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease }}
        style={{ transformPerspective: 1400, transformOrigin: "50% 0%" }}
        className="lt-paper relative flex max-h-full w-full max-w-[36rem] flex-col rounded-[3px] shadow-[0_2px_4px_rgb(60_40_20/0.12),0_24px_48px_-16px_rgb(60_40_20/0.45)]"
        aria-label={`A letter for ${letter.recipientName}`}
      >
        {design.gold && (
          <>
            <GoldCorner className="absolute top-2 left-2 w-[13%] max-w-14" />
            <GoldCorner className="absolute right-2 bottom-2 w-[13%] max-w-14 rotate-180" />
          </>
        )}
        <Flower kind={design.flowers} className="pointer-events-none absolute -top-5 -right-4 w-[18%] max-w-20 rotate-12 drop-shadow-md" />
        <Flower kind={design.flowers} className="pointer-events-none absolute -bottom-5 -left-4 w-[15%] max-w-16 -rotate-12 drop-shadow-md" />
        <div className="lt-scroll flex flex-col gap-4 overflow-y-auto px-[clamp(1.25rem,7cqw,3rem)] pt-[clamp(1.75rem,6cqh,3rem)] pb-[clamp(1.75rem,6cqh,3rem)]">
          <p className="text-[0.625rem] font-semibold tracking-[0.3em] uppercase" style={{ color: FLOWER_ACCENT(look) }}>
            A letter for you
          </p>
          <p className="lt-script -mt-1 text-[clamp(2.1rem,9cqw,3.25rem)] leading-[1.1]" style={{ color: FLOWER_ACCENT(look) }}>
            {greeting ?? `${letter.recipientName},`}
          </p>
          <div className="lt-serif flex flex-col gap-3.5 text-[clamp(1.0625rem,4.4cqw,1.3125rem)] leading-[1.6] text-[#3a2a24]">
            {rest.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {i === 0 ? <DropCap text={p} colour={FLOWER_ACCENT(look)} /> : p}
              </p>
            ))}
          </div>
          {letter.moments.closing && <p className="lt-serif mt-2 text-[1.25rem] italic text-[#5b463c]">{letter.moments.closing}</p>}
          {!signed && (
            <div className={cn("mt-1 flex flex-col items-end gap-0 self-end text-right", design.gold && "mr-6 mb-3")}>
              <span className="lt-serif text-lg italic text-[#5b463c]">With love,</span>
              <span className="lt-script text-[clamp(2rem,8cqw,2.75rem)] leading-tight" style={{ color: FLOWER_ACCENT(look) }}>
                {letter.senderDisplayName}
              </span>
            </div>
          )}
        </div>
      </motion.article>
    </div>
  )
}

/** Paper is always light, so the accent on it is the day accent. */
const FLOWER_ACCENT = (look: LetterLook) => (look.dark ? look.accent : look.accentText)

function DropCap({ text, colour }: { text: string; colour: string }) {
  const first = text.charAt(0)
  return (
    <>
      <span aria-hidden="true" className="lt-serif float-left mt-1 mr-2 text-[3.4em] leading-[0.8] font-medium" style={{ color: colour }}>
        {first}
      </span>
      <span className="sr-only">{first}</span>
      {text.slice(1)}
    </>
  )
}

// ---------------------------------------------------------------- What I love

export function ReasonsMoment({ letter, look, design, still }: MomentProps) {
  const reasons = letter.moments.reasons
  const [open, setOpen] = useState<number | null>(null)
  const [seen, setSeen] = useState<Set<number>>(() => new Set())
  const [showAll, setShowAll] = useState(still)
  const n = reasons.length
  const spots = useMemo(
    () =>
      reasons.map((_, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1)
        const a = ((-62 + t * 124) * Math.PI) / 180
        const r = 17 + (i % 2) * 12 + (n > 7 ? 4 : 0)
        return { x: 50 + Math.sin(a) * r * 1.15, y: 50 - Math.cos(a) * r, rot: (i * 37) % 50 - 25 }
      }),
    [reasons, n],
  )
  const pick = (i: number) => {
    setOpen(i)
    setSeen((s) => new Set(s).add(i))
  }
  const all = seen.size === n
  return (
    <Shell eyebrow={MOMENTS.reasons.label} title={MOMENTS.reasons.title} look={look}>
      {showAll ? (
        <ol className="lt-scroll flex max-h-full w-full max-w-lg flex-col gap-2.5 overflow-y-auto">
          {reasons.map((r, i) => (
            <motion.li key={i} initial={still ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex items-start gap-3 rounded-2xl p-3.5 backdrop-blur" style={{ background: look.chip, color: look.ink }}>
              <Flower kind={design.flowers} className="mt-0.5 size-7 shrink-0" />
              <span className="lt-serif text-lg leading-snug italic">{r}</span>
            </motion.li>
          ))}
        </ol>
      ) : (
        <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-3">
          <div className="relative aspect-square w-[min(100%,46cqh,26rem)]">
            <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 size-full">
              {spots.map((s, i) => (
                <path key={i} d={`M50 78 Q${(50 + s.x) / 2} ${(78 + s.y) / 2 + 4} ${s.x} ${s.y}`} stroke="#5f7a52" strokeWidth="1" fill="none" />
              ))}
              {[
                [30, 46, -50, "#7d9670"], [70, 44, 50, "#9bb08a"], [24, 60, -70, "#a8b89a"], [76, 58, 70, "#6f8a62"], [40, 34, -20, "#9bb08a"], [60, 32, 20, "#7d9670"],
              ].map(([x, y, r, c], i) => (
                <path key={i} transform={`translate(${x} ${y}) rotate(${r})`} d="M0 0 C3 -4 9 -4 13 0 C9 4 3 4 0 0Z" fill={c as string} stroke="#4b6342" strokeOpacity=".25" strokeWidth=".4" />
              ))}
              <path d="M26 64 L50 100 L74 64 C66 60 58 66 50 70 C42 66 34 60 26 64Z" fill="#cfae84" stroke="#a88457" strokeWidth=".6" />
              <path d="M32 66 L50 96 L52 72Z" fill="#b8925f" opacity=".5" />
              <path d="M50 79 C44 70 33 71 36 79 C38 85 46 83 50 79Z M50 79 C56 70 67 71 64 79 C62 85 54 83 50 79Z" fill={look.accent} stroke="#000" strokeOpacity=".15" strokeWidth=".4" />
              <path d="M49 80 C46 86 44 90 41 93 L44 94 C47 90 49 86 50 81Z M51 80 C54 86 56 90 59 93 L56 94 C53 90 51 86 50 81Z" fill={look.accent} />
              <ellipse cx="50" cy="79.5" rx="2.6" ry="2.2" fill={look.accent} stroke="#000" strokeOpacity=".2" strokeWidth=".4" />
            </svg>
            {spots.map((s, i) => (
              <motion.button
                key={i}
                type="button"
                aria-label={`Reason ${i + 1}${seen.has(i) ? " (read)" : ""}`}
                aria-pressed={open === i}
                onClick={() => pick(i)}
                initial={still ? false : { opacity: 0, scale: 0.3, y: 20 }}
                animate={{ opacity: 1, scale: open === i ? 1.22 : 1, y: 0, rotate: s.rot }}
                whileHover={{ scale: 1.14 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: still ? 0 : 0.15 + i * 0.06 }}
                className="absolute w-[19%] -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-4"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              >
                <Flower kind={design.flowers} className={cn("w-full drop-shadow-[0_4px_6px_rgb(60_20_20/0.3)] transition-[filter]", seen.has(i) && open !== i && "saturate-[0.6]")} />
                {seen.has(i) && (
                  <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-white" style={{ background: look.accent }}>
                    <CheckIcon className="size-3" />
                  </span>
                )}
              </motion.button>
            ))}
            {all && !still && <Confetti count={24} origin={{ x: 50, y: 40 }} spread={0.5} colors={[look.petal, "#fff4e0", look.accent]} />}
          </div>
          <div className="flex min-h-[6.5rem] w-full max-w-md flex-col items-center justify-start text-center" aria-live="polite">
            <AnimatePresence mode="wait">
              {open === null ? (
                <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lt-serif text-lg italic" style={{ color: look.muted }}>
                  Tap a flower to find a reason.
                </motion.p>
              ) : (
                <motion.div key={open} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease }} className="flex flex-col items-center gap-1 rounded-2xl px-5 py-3 backdrop-blur" style={{ background: look.chip }}>
                  <span className="text-[0.625rem] font-semibold tracking-[0.25em] uppercase" style={{ color: look.accentText }}>
                    Reason {open + 1} of {n}
                  </span>
                  <span className="lt-serif text-[clamp(1.25rem,5cqw,1.6rem)] leading-snug text-balance italic" style={{ color: look.ink }}>
                    {reasons[open]}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: look.muted }}>
        {!showAll && <span>{all ? "You found every one." : `${seen.size} of ${n} found`}</span>}
        <button type="button" className="underline underline-offset-4" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Back to the bouquet" : "Read them all"}
        </button>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------- Our story

export function StoryMoment({ letter, look, design, still }: MomentProps) {
  const chapters = letter.moments.story
  const [[page, dir], setPage] = useState<[number, number]>([0, 1])
  const go = (to: number) => to >= 0 && to < chapters.length && setPage([to, to > page ? 1 : -1])
  const c = chapters[page]
  return (
    <Shell eyebrow={MOMENTS.story.label} title={MOMENTS.story.title} look={look}>
      <div className="relative flex aspect-[3/4] max-h-full w-[min(100%,24rem)] rounded-[10px] bg-[#6f8166] p-2 shadow-[0_24px_48px_-18px_rgb(30_30_20/0.6)] @3xl:aspect-[16/10] @3xl:w-[min(100%,54rem)]" style={{ perspective: 1600 }}>
        <div aria-hidden="true" className="absolute inset-y-2 left-2 w-3 rounded-l bg-[#5c6b54]" />
        <div className="lt-paper relative ml-2 flex flex-1 overflow-hidden rounded-[4px]">
          {/* Contents page, desktop only. */}
          <nav aria-label="Chapters" className="hidden w-[42%] flex-col gap-2 border-r border-[#e6dccb] p-8 @3xl:flex">
            <p className="text-[0.625rem] font-semibold tracking-[0.3em] text-[#9b8574] uppercase">Contents</p>
            <ol className="flex flex-col gap-1.5">
              {chapters.map((ch, i) => (
                <li key={i}>
                  <button type="button" onClick={() => go(i)} aria-current={i === page ? "page" : undefined} className={cn("lt-serif flex w-full items-baseline gap-2 text-left text-lg transition-colors", i === page ? "text-[#3a2a24]" : "text-[#9b8574] hover:text-[#3a2a24]")}>
                    <span className="text-xs tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className="italic">{ch.title || ch.when || `Chapter ${i + 1}`}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="relative flex-1">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.section
                key={page}
                custom={dir}
                initial={still ? false : { rotateY: dir > 0 ? 70 : -70, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={still ? undefined : { rotateY: dir > 0 ? -70 : 70, opacity: 0 }}
                transition={{ duration: 0.45, ease }}
                style={{ transformOrigin: dir > 0 ? "0% 50%" : "100% 50%" }}
                className="lt-scroll absolute inset-0 flex flex-col gap-3 overflow-y-auto p-6 @3xl:p-10"
                aria-label={`Chapter ${page + 1} of ${chapters.length}`}
              >
                <p className="text-[0.625rem] font-semibold tracking-[0.3em] text-[#9b8574] uppercase">{c.when || `Chapter ${page + 1}`}</p>
                {c.title && <h3 className="lt-serif text-[clamp(1.6rem,6cqw,2.25rem)] leading-tight text-[#3a2a24] italic">{c.title}</h3>}
                <div aria-hidden="true" className="h-px w-12" style={{ background: look.accent }} />
                <p className="lt-serif text-[1.15rem] leading-relaxed whitespace-pre-line text-[#4a3830]">{c.text}</p>
                <div aria-hidden="true" className="mt-auto flex items-end justify-between pt-6">
                  <span className="lt-serif text-sm text-[#9b8574] italic lining-nums">{page + 1}</span>
                  <Flower kind={design.flowers} className="w-16 rotate-[24deg] opacity-45 saturate-50" />
                </div>
              </motion.section>
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <SceneButton look={look} onClick={() => go(page - 1)} disabled={page === 0} label="Previous page">
          <AltArrowLeftIcon className="size-4" />
        </SceneButton>
        <span className="lt-serif min-w-14 text-center text-sm italic tabular-nums" style={{ color: look.muted }}>
          {page + 1} / {chapters.length}
        </span>
        <SceneButton look={look} onClick={() => go(page + 1)} disabled={page === chapters.length - 1} label="Next page">
          <AltArrowRightIcon className="size-4" />
        </SceneButton>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------- Our photos

export function PhotosMoment({ letter, look, still }: MomentProps) {
  const photos = letter.moments.photos
  const [order, setOrder] = useState(() => photos.map((_, i) => i))
  useEffect(() => setOrder(photos.map((_, i) => i)), [photos])
  const next = () => setOrder(([first, ...rest]) => [...rest, first])
  const tilt = (i: number) => ((i * 47) % 14) - 7
  if (!photos.length) return null
  return (
    <Shell eyebrow={MOMENTS.photos.label} title={MOMENTS.photos.title} look={look}>
      <div className="relative aspect-[4/5] w-[min(78%,44cqh,21rem)]">
        {[...order].reverse().map((idx) => {
          const depth = order.indexOf(idx)
          const top = depth === 0
          const p = photos[idx]
          return (
            <motion.figure
              key={idx}
              layout={!still}
              drag={top && !still}
              dragSnapToOrigin
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) next()
              }}
              onClick={(e) => e.stopPropagation()}
              animate={{ rotate: top ? tilt(idx) / 2 : tilt(idx), y: depth * 5, scale: 1 - Math.min(depth, 4) * 0.03 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              className={cn("absolute inset-0 flex flex-col gap-2 rounded-[3px] bg-[#fffdf8] p-[5%] pb-0 shadow-[0_2px_3px_rgb(0_0_0/0.08),0_18px_30px_-14px_rgb(40_25_10/0.5)]", top ? "cursor-grab touch-pan-y active:cursor-grabbing" : "pointer-events-none")}
              style={{ zIndex: photos.length - depth }}
              aria-hidden={!top}
            >
              <img src={p.url} alt={p.caption || `Photo ${idx + 1}`} draggable={false} className="aspect-square w-full bg-[#e9e1d3] object-cover" />
              <figcaption className="lt-script flex flex-1 items-center justify-center px-2 text-center text-[clamp(1.25rem,5.5cqw,1.75rem)] leading-tight text-[#4a3830]">{p.caption}</figcaption>
            </motion.figure>
          )
        })}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <span className="lt-serif text-sm italic tabular-nums" style={{ color: look.muted }} aria-live="polite">
          {order[0] + 1} of {photos.length}
        </span>
        {photos.length > 1 && (
          <SceneButton look={look} onClick={next}>
            Next photo
            <AltArrowRightIcon className="size-4" />
          </SceneButton>
        )}
      </div>
      {photos.length > 1 && !still && <p className="mt-2 text-xs" style={{ color: look.muted }}>Or swipe the photo away</p>}
    </Shell>
  )
}

// ---------------------------------------------------------------- Our day

function breakdown(from: string, to: string) {
  const [a, b] = from < to ? [from, to] : [to, from]
  const [y1, m1, d1] = a.split("-").map(Number)
  const [y2, m2, d2] = b.split("-").map(Number)
  let years = y2 - y1
  let months = m2 - m1
  let days = d2 - d1
  if (days < 0) {
    months -= 1
    days += new Date(Date.UTC(y2, m2 - 1, 0)).getUTCDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  const parts = [years && `${years} ${years === 1 ? "year" : "years"}`, months && `${months} ${months === 1 ? "month" : "months"}`, days && `${days} ${days === 1 ? "day" : "days"}`].filter(Boolean) as string[]
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "")
}

function CountUp({ to, still }: { to: number; still: boolean }) {
  const v = useMotionValue(still ? to : 0)
  const shown = useTransform(v, (x) => Math.round(x).toLocaleString("en"))
  useEffect(() => {
    if (still) return void v.set(to)
    const c = animate(v, to, { duration: Math.min(2.2, 0.6 + Math.log10(Math.max(to, 1)) * 0.5), ease: [0.16, 1, 0.3, 1] })
    return () => c.stop()
  }, [to, still, v])
  return <motion.span>{shown}</motion.span>
}

export function DateMoment({ letter, look, still }: MomentProps) {
  const d = letter.moments.date!
  const [turned, setTurned] = useState(still)
  const today = todayLagos()
  const diff = daysBetween(d.on, today)
  const when = new Date(`${d.on}T12:00:00Z`)
  const month = when.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })
  const weekday = when.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })
  return (
    <Shell eyebrow={MOMENTS.date.label} title={MOMENTS.date.title} look={look}>
      <div className="relative aspect-[4/5] w-[min(72%,40cqh,18rem)]" style={{ perspective: 1200 }}>
        <div aria-hidden="true" className="absolute top-[-5%] left-1/2 z-30 h-[9%] w-[34%] -translate-x-1/2 rounded-md border border-[#7d6540] bg-gradient-to-b from-[#c4a46b] to-[#8e7445] shadow" />
        {/* Pages already torn off, peeking out below. */}
        <div aria-hidden="true" className="absolute inset-0 translate-y-[3%] rotate-[2deg] rounded-lg bg-[#efe7d8] shadow" />
        <div aria-hidden="true" className="absolute inset-0 translate-y-[1.5%] -rotate-[1.5deg] rounded-lg bg-[#f6f0e5] shadow" />
        <div className="absolute inset-0 flex flex-col overflow-hidden rounded-lg bg-[#fffcf6] shadow-[0_20px_40px_-18px_rgb(40_25_10/0.55)]">
          <div className="flex items-center justify-between px-4 py-2.5 text-white" style={{ background: look.accent }}>
            <span className="text-xs font-semibold tracking-[0.25em] uppercase">{month}</span>
            <span className="text-xs tabular-nums opacity-80">{when.getUTCFullYear()}</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-[#3a2a24]">
            <span className="lt-serif text-[clamp(4.5rem,22cqw,7.5rem)] leading-none font-medium lining-nums">{when.getUTCDate()}</span>
            <span className="text-xs tracking-[0.2em] text-[#9b8574] uppercase">{weekday}</span>
            {d.label && <span className="lt-script mt-2 px-4 text-center text-[clamp(1.5rem,6cqw,2rem)] leading-tight" style={{ color: look.dark ? look.accent : look.accentText }}>{d.label}</span>}
          </div>
        </div>
        <AnimatePresence>
          {!turned && (
            <motion.button
              type="button"
              onClick={() => setTurned(true)}
              exit={{ rotateX: 105, opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.5, 0, 0.2, 1] }}
              style={{ transformOrigin: "50% 0%" }}
              className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-lg bg-[#fffcf6] text-[#3a2a24] shadow-lg"
              aria-label="Turn the page to see the date"
            >
              <span className="block h-9 w-full" style={{ background: look.accent }} />
              <span className="flex flex-1 flex-col items-center justify-center gap-2">
                <span className="lt-serif text-7xl italic">?</span>
                <span className="text-xs tracking-[0.2em] text-[#9b8574] uppercase">Tap to turn the page</span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {turned && (
          <motion.div initial={still ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: still ? 0 : 0.45 }} className="mt-6 flex max-w-sm flex-col items-center gap-1 text-center" aria-live="polite">
            {diff === 0 ? (
              <>
                <p className="lt-serif text-3xl italic" style={{ color: look.ink }}>It's today.</p>
                {!still && <Confetti count={40} origin={{ x: 50, y: 30 }} spread={0.6} />}
              </>
            ) : (
              <>
                <p className="lt-serif text-[clamp(2.25rem,10cqw,3.25rem)] leading-none font-medium lining-nums tabular-nums" style={{ color: look.ink }}>
                  <CountUp to={Math.abs(diff)} still={still} />
                </p>
                <p className="text-xs font-semibold tracking-[0.25em] uppercase" style={{ color: look.accentText }}>
                  {diff > 0 ? "days since" : "days to go"}
                </p>
                <p className="lt-serif mt-1 text-base italic" style={{ color: look.muted }}>
                  {diff > 0 ? `That's ${breakdown(d.on, today)}, and counting.` : `${breakdown(today, d.on)} from now.`}
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}

// ---------------------------------------------------------------- Our places

export function PlacesMoment({ letter, look, still }: MomentProps) {
  const places = letter.moments.places
  const [active, setActive] = useState(0)
  const pins = useMemo(() => {
    const n = places.length
    return places.map((_, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1)
      return { x: 14 + t * 72, y: 50 + Math.sin(i * 2.1 + 0.6) * 22 }
    })
  }, [places])
  const path = pins.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`
    const prev = pins[i - 1]
    const cx = (prev.x + p.x) / 2
    return `${acc} C${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`
  }, "")
  const place = places[active]
  return (
    <Shell eyebrow={MOMENTS.places.label} title={MOMENTS.places.title} look={look}>
      <div className="relative aspect-[4/3] w-[min(100%,58cqh,44rem)] @3xl:aspect-[16/9]">
        <div aria-hidden="true" className="absolute inset-0 rounded-md bg-[#eadfc6] shadow-[0_20px_40px_-18px_rgb(40_25_10/0.55)]" style={{ backgroundImage: "linear-gradient(90deg, transparent 32.8%, rgb(120 90 50 / 0.12) 33.3%, transparent 34%, transparent 66.2%, rgb(120 90 50 / 0.12) 66.6%, transparent 67.2%), linear-gradient(0deg, transparent 49.6%, rgb(120 90 50 / 0.1) 50%, transparent 50.6%)" }} />
        <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          {[18, 30, 42].map((r, i) => (
            <ellipse key={i} cx={i % 2 ? 78 : 26} cy={i % 2 ? 28 : 74} rx={r} ry={r * 0.55} fill="none" stroke="#b9a57c" strokeOpacity=".35" strokeWidth=".4" />
          ))}
          <path d="M0 62 C20 58 30 70 52 64 S84 52 100 58" fill="none" stroke="#9cb6c2" strokeOpacity=".6" strokeWidth="2.2" />
          <motion.path d={path} fill="none" stroke={look.accent} strokeWidth=".9" strokeDasharray="2 1.6" initial={still ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 + places.length * 0.35, ease: "easeInOut", delay: 0.3 }} />
        </svg>
        <svg aria-hidden="true" viewBox="0 0 40 40" className="absolute right-[3%] bottom-[5%] w-[11%]">
          <circle cx="20" cy="20" r="17" fill="#e3d2a8" stroke="#8e7445" strokeWidth="1.4" />
          <path d="M20 5 L23 20 L20 35 L17 20Z" fill={look.accent} />
          <path d="M5 20 L20 17 L35 20 L20 23Z" fill="#8e7445" opacity=".6" />
        </svg>
        {pins.map((p, i) => (
          <motion.button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={active === i}
            aria-label={`${i + 1}. ${places[i].name}`}
            initial={still ? false : { y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1, scale: active === i ? 1.25 : 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 16, delay: still ? 0 : 0.5 + i * 0.35 }}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${p.x}%`, top: `${p.y}%`, zIndex: active === i ? 2 : 1 }}
          >
            <svg viewBox="0 0 24 32" className="w-[clamp(1.4rem,5cqw,2rem)] drop-shadow-md">
              <path d="M12 31 C12 31 2 18 2 11 A10 10 0 0 1 22 11 C22 18 12 31 12 31Z" fill={active === i ? look.accent : "#fffaf0"} stroke={look.accent} strokeWidth="1.6" />
              <text x="12" y="14.5" textAnchor="middle" fontSize="9" fontWeight="600" fill={active === i ? "#fff" : look.accent}>
                {i + 1}
              </text>
            </svg>
          </motion.button>
        ))}
      </div>
      <div className="mt-4 flex w-full max-w-md items-center gap-2">
        <SceneButton look={look} onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0} label="Previous place">
          <AltArrowLeftIcon className="size-4" />
        </SceneButton>
        <div className="flex min-h-[4.5rem] flex-1 flex-col items-center justify-center text-center" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
              <p className="lt-serif text-[clamp(1.35rem,5cqw,1.75rem)] leading-tight italic" style={{ color: look.ink }}>{place.name}</p>
              {place.note && <p className="mt-0.5 text-sm text-pretty" style={{ color: look.muted }}>{place.note}</p>}
            </motion.div>
          </AnimatePresence>
        </div>
        <SceneButton look={look} onClick={() => setActive((a) => Math.min(places.length - 1, a + 1))} disabled={active === places.length - 1} label="Next place">
          <AltArrowRightIcon className="size-4" />
        </SceneButton>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------- Our wishes

export function WishesMoment({ letter, look, still }: MomentProps) {
  const wishes = letter.moments.wishes
  const [blown, setBlown] = useState(still)
  const [round, setRound] = useState(0)
  const seeds = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2
        return { a, dx: 120 + ((i * 53) % 220), dy: -80 - ((i * 37) % 200), rot: ((i * 71) % 360) - 180, delay: ((i * 13) % 10) / 22 }
      }),
    [],
  )
  return (
    <Shell eyebrow={MOMENTS.wishes.label} title={MOMENTS.wishes.title} look={look}>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 @3xl:flex-row @3xl:gap-14">
        <button type="button" onClick={() => setBlown(true)} disabled={blown} aria-label={blown ? "The dandelion has been blown" : "Blow the dandelion to release the wishes"} className="relative aspect-[3/4] w-[min(46%,30cqh,14rem)] shrink-0 rounded-3xl outline-offset-4">
          <svg key={round} viewBox="0 0 100 130" className="size-full overflow-visible" aria-hidden="true">
            <path d="M50 128 C53 104 46 80 50 56" stroke="#6f8a62" strokeWidth="2" fill="none" />
            <path d="M50 104 C40 98 34 100 28 92 C38 92 44 96 50 104Z" fill="#7d9670" />
            {seeds.map((s, i) => {
              const x2 = 50 + Math.cos(s.a) * 26
              const y2 = 40 + Math.sin(s.a) * 26
              return (
                <motion.g key={i} initial={false} animate={blown && i % 7 !== 3 ? (still ? { opacity: 0 } : { x: s.dx, y: s.dy, rotate: s.rot, opacity: 0 }) : { x: 0, y: 0, rotate: 0, opacity: 1 }} transition={{ duration: 2.4, delay: s.delay, ease: [0.3, 0, 0.2, 1] }} style={{ transformOrigin: `${x2}px ${y2}px` }}>
                  <line x1="50" y1="40" x2={x2} y2={y2} stroke={look.dark ? "#d8cfc0" : "#bfb6a6"} strokeWidth=".6" />
                  <circle cx={x2} cy={y2} r="2.4" fill={look.dark ? "#fff6ea" : "#fffdf8"} stroke="#d9d1c3" strokeWidth=".4" />
                </motion.g>
              )
            })}
            <circle cx="50" cy="40" r="4" fill="#b1a68e" />
          </svg>
          {!blown && (
            <span className="lt-bob absolute -bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg" style={{ background: look.accent }}>
              <StarsIcon className="size-3.5" />
              Tap to blow
            </span>
          )}
        </button>
        <AnimatePresence>
          {blown && (
            <motion.ol initial={false} className="lt-scroll flex max-h-full w-full max-w-md flex-col gap-2.5 overflow-y-auto" aria-label="Wishes">
              {wishes.map((w, i) => (
                <motion.li key={`${round}-${i}`} initial={still ? false : { opacity: 0, x: -24, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)" }} transition={{ delay: still ? 0 : 0.9 + i * 0.3, duration: 0.6, ease }} className="flex items-start gap-3 rounded-2xl px-4 py-3 backdrop-blur" style={{ background: look.chip, color: look.ink }}>
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1 size-4 shrink-0">
                    <line x1="10" y1="19" x2="10" y2="8" stroke={look.muted} strokeWidth="1" />
                    {[0, 40, 80, 120, 160].map((a) => (
                      <line key={a} x1="10" y1="8" x2={10 + Math.cos(((a + 190) * Math.PI) / 180) * 7} y2={8 + Math.sin(((a + 190) * Math.PI) / 180) * 7} stroke={look.muted} strokeWidth=".8" />
                    ))}
                  </svg>
                  <span className="lt-serif text-lg leading-snug italic">{w}</span>
                </motion.li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
      {blown && !still && (
        <button type="button" className="mt-3 text-xs underline underline-offset-4" style={{ color: look.muted }} onClick={() => { setBlown(false); setRound((r) => r + 1) }}>
          Grow another dandelion
        </button>
      )}
    </Shell>
  )
}

// ---------------------------------------------------------------- Our song

const PLAYER_HEIGHT: Record<string, number> = { spotify: 152, apple: 175, audiomack: 252 }

export function SongMoment({ letter, look, still }: MomentProps) {
  const song = letter.moments.song!
  const embed = parseSongLink(song.url)
  const [playing, setPlaying] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  if (!embed) return null
  const provider = SONG_PROVIDERS[embed.provider]
  return (
    <Shell eyebrow={MOMENTS.song.label} title={MOMENTS.song.title} look={look}>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 @3xl:flex-row @3xl:gap-12">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Stop the record" : "Play the record"} className="relative aspect-square w-[min(70%,34cqh,19rem)] shrink-0 rounded-[1.75rem] bg-gradient-to-br from-[#5a3a26] to-[#2f1d12] p-[7%] shadow-[0_24px_48px_-18px_rgb(30_15_5/0.7)] outline-offset-4">
          <div className="relative size-full rounded-full bg-[#141212] shadow-[inset_0_0_0_3px_#2a2626]">
            <MomentObject id="song" accent={look.accent} className={cn("size-full", playing && !still && "lt-spin")} />
          </div>
          <motion.svg aria-hidden="true" viewBox="0 0 40 120" className="absolute top-[4%] right-[4%] w-[16%]" initial={false} animate={{ rotate: playing ? 24 : 0 }} transition={{ type: "spring", stiffness: 120, damping: 14 }} style={{ transformOrigin: "50% 12%" }}>
            <circle cx="20" cy="14" r="10" fill="#c9c2b5" stroke="#8a8378" strokeWidth="2" />
            <path d="M20 14 L20 90 L10 108" stroke="#d8d1c4" strokeWidth="4" fill="none" strokeLinecap="round" />
            <rect x="2" y="104" width="14" height="10" rx="2" fill="#8a8378" />
          </motion.svg>
          <span className="absolute bottom-[5%] left-[6%] grid size-9 place-items-center rounded-full text-white shadow-lg" style={{ background: look.accent }}>
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
          </span>
        </button>
        <div className="flex w-full max-w-sm flex-col items-center gap-2 text-center @3xl:items-start @3xl:text-left">
          <p className="lt-serif text-[clamp(1.5rem,6cqw,2.1rem)] leading-tight italic" style={{ color: look.ink }}>
            {song.title || "Our song"}
          </p>
          {song.note && <p className="lt-serif text-lg leading-snug text-pretty" style={{ color: look.muted }}>{song.note}</p>}
          <div ref={frameRef} className="w-full">
            <AnimatePresence>
              {playing && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 overflow-hidden rounded-xl">
                  <iframe
                    title={`${song.title || "Our song"} on ${provider}`}
                    src={`${embed.embedUrl}${embed.provider === "youtube" ? "?autoplay=1&rel=0" : ""}`}
                    className={cn("w-full border-0", embed.provider === "youtube" && "aspect-video")}
                    style={embed.provider === "youtube" ? undefined : { height: PLAYER_HEIGHT[embed.provider] }}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    loading="lazy"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 @3xl:justify-start">
            {!playing && (
              <SceneButton look={look} onClick={() => setPlaying(true)}>
                <PlayIcon className="size-4" />
                Play on {provider}
              </SceneButton>
            )}
            <a href={embed.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-4" style={{ color: look.muted }}>
              Open in {provider}
              <SquareArrowRightUpIcon className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    </Shell>
  )
}

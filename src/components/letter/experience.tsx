import "./letter.css"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import { MOMENT_IDS, type LetterDesign, type MomentId } from "@domain/index.ts"
import type { LetterView, LetterViewMoments } from "@/api"
import { MOMENTS } from "@/lib/letter-studio"
import { LogoMark } from "@/components/brand/logo"
import { Confetti } from "@/components/reveal/confetti"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PauseIcon, PlayIcon, WidgetIcon } from "@/components/icons"
import { MomentObject, WaxSeal } from "./art"
import { Backdrop, letterLook, type LetterLook } from "./scene"
import { DateMoment, LetterMoment, PhotosMoment, PlacesMoment, ReasonsMoment, SongMoment, StoryMoment, WishesMoment, type MomentProps } from "./moments"

/** Where the reader is: the envelope, one of the moments, or the table with everything on it. */
export type LetterPage = "cover" | "table" | MomentId

/** Moments present in this letter, in order. */
export function viewMoments(m: LetterViewMoments): MomentId[] {
  return MOMENT_IDS.filter((id) => (id === "letter" ? true : id === "date" ? Boolean(m.date) : id === "song" ? Boolean(m.song) : m[id].length > 0))
}

const SCENES: Record<MomentId, (p: MomentProps) => ReactNode> = {
  letter: LetterMoment,
  reasons: ReasonsMoment,
  story: StoryMoment,
  photos: PhotosMoment,
  date: DateMoment,
  places: PlacesMoment,
  wishes: WishesMoment,
  song: SongMoment,
}

const ease = [0.2, 0, 0, 1] as const

export interface LetterExperienceProps {
  letter: LetterView
  /**
   * live: the recipient's letter page. preview: inside a studio, where the sender drives it.
   * embedded: part of another page (a gift's letter), so no logo and no navigation for a lone letter.
   */
  mode: "live" | "preview" | "embedded"
  /** Controlled page (the studio jumps to whatever is being edited). */
  page?: LetterPage
  onPageChange?: (page: LetterPage) => void
  /** Shown on the table once everything is laid out (live only): reply and report links. */
  finale?: ReactNode
  /** A sealed letter's countdown reached zero. */
  onSealExpired?: () => void
  /** Extra controls in the top bar (live: report). */
  actions?: ReactNode
  className?: string
}

/**
 * The letter as the recipient experiences it: an envelope (or gift box) to open, one scene per
 * moment, and a table that lays everything out to revisit. The studio renders this same component
 * as its live preview, so what the sender sees is exactly what is sent.
 */
export function LetterExperience({ letter, mode, page: controlled, onPageChange, finale, onSealExpired, actions, className }: LetterExperienceProps) {
  const reduce = useReducedMotion() ?? false
  const [calm, setCalm] = useState(false)
  const still = reduce || calm
  const look = useMemo(() => letterLook(letter.design), [letter.design])
  const moments = useMemo(() => viewMoments(letter.moments), [letter.moments])
  const order: LetterPage[] = useMemo(() => [...moments, "table"], [moments])

  const [page, setPageState] = useState<LetterPage>(controlled ?? "cover")
  const [dir, setDir] = useState(1)
  const [visited, setVisited] = useState<Set<MomentId>>(() => new Set())
  const sceneRef = useRef<HTMLDivElement>(null)
  const userMoved = useRef(false)

  // The studio steers the preview; a page that no longer exists falls back to the table.
  const pageRef = useRef(page)
  pageRef.current = page
  useEffect(() => {
    if (controlled === undefined || controlled === pageRef.current) return
    setDir(controlled === "cover" || order.indexOf(controlled) < order.indexOf(pageRef.current) ? -1 : 1)
    setPageState(controlled)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled])
  // A requested moment that's empty right now (the sender is about to fill it) shows the table
  // until it has something in it, then appears without the sender having to navigate.
  const shown: LetterPage = page !== "cover" && page !== "table" && !moments.includes(page) ? "table" : page

  const go = useCallback(
    (to: LetterPage) => {
      userMoved.current = true
      setDir(to === "cover" ? -1 : order.indexOf(to) >= order.indexOf(shown) ? 1 : -1)
      setPageState(to)
      onPageChange?.(to)
      if (to !== "cover" && to !== "table") setVisited((v) => new Set(v).add(to))
    },
    [order, shown, onPageChange],
  )

  const idx = shown === "cover" ? -1 : order.indexOf(shown)
  const next = shown === "cover" ? moments[0] : shown === "table" ? (moments.find((m) => !visited.has(m)) ?? "letter") : order[idx + 1]
  const prev = shown === "cover" || idx <= 0 ? null : order[idx - 1]

  // Arrow keys move between moments while the letter has focus (and always on the live page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shown === "cover" || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable=true], iframe")) return
      if (mode !== "live" && !sceneRef.current?.parentElement?.contains(t)) return
      if (e.key === "ArrowRight" && next) go(next)
      else if (e.key === "ArrowLeft" && prev) go(prev)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shown, next, prev, go, mode])

  // Keyboard and screen reader users land on the new scene.
  useEffect(() => {
    if (mode !== "live" || !userMoved.current) return
    sceneRef.current?.focus({ preventScroll: true })
  }, [shown, mode])

  // Horizontal swipes between moments, except on things that handle their own drags.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("figure, iframe, input, textarea, [data-noswipe]")) return
    swipe.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s || shown === "cover") return
    const dx = e.clientX - s.x
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(e.clientY - s.y) * 1.5) return
    if (dx < 0 && next) go(next)
    if (dx > 0 && prev) go(prev)
  }

  const label = (p: LetterPage) => (p === "table" ? "Everything" : p === "cover" ? "Cover" : MOMENTS[p].label)
  const Scene = shown !== "cover" && shown !== "table" ? SCENES[shown] : null

  return (
    <div className={cn("lt-root relative isolate size-full overflow-hidden select-none", still && "lt-still", className)} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <Backdrop design={letter.design} look={look} variant={shown === "cover" || shown === "table" ? "cover" : "frame"} />

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between p-[max(0.875rem,2.2cqh)]">
        {mode === "embedded" ? (
          <span />
        ) : (
          <span className="rounded-xl shadow-sm" title="JustGifter">
            <LogoMark className="size-8" />
          </span>
        )}
        <div className="flex items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={() => setCalm((c) => !c)}
          aria-pressed={calm}
          aria-label={calm ? "Turn animations back on" : "Pause animations"}
          className="grid size-10 place-items-center rounded-full backdrop-blur transition-transform active:scale-95"
          style={{ background: look.chip, color: look.ink, boxShadow: "0 0 0 1px rgb(0 0 0 / 0.06)" }}
        >
          {calm ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        </button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {shown === "cover" ? "" : shown === "table" ? "Everything in the letter" : `${MOMENTS[shown].label}, ${idx + 1} of ${moments.length}`}
      </p>

      <div ref={sceneRef} tabIndex={-1} className="absolute inset-0 outline-none">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={shown}
            custom={dir}
            initial={still ? { opacity: 0 } : { opacity: 0, x: dir * 36, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={still ? { opacity: 0 } : { opacity: 0, x: dir * -36, filter: "blur(6px)" }}
            transition={{ duration: still ? 0.15 : 0.45, ease }}
            className="absolute inset-0"
          >
            {shown === "cover" ? (
              <Cover letter={letter} look={look} design={letter.design} still={still} onOpen={() => go(moments[0])} onSealExpired={onSealExpired} heading={mode === "live" ? "h1" : "h2"} />
            ) : shown === "table" ? (
              <Table letter={letter} look={look} moments={moments} visited={visited} onOpen={go} finale={mode === "live" ? finale : undefined} still={still} />
            ) : Scene ? (
              <Scene letter={letter} look={look} design={letter.design} still={still} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {shown !== "cover" && !(mode === "embedded" && moments.length === 1) && (
        <nav aria-label="Letter" className="absolute bottom-[max(0.875rem,2.5cqh)] left-1/2 z-30 flex w-[min(calc(100%-1.5rem),25rem)] -translate-x-1/2 items-center gap-1.5 rounded-full p-1.5 backdrop-blur-md" style={{ background: look.chip, boxShadow: "0 0 0 1px rgb(0 0 0 / 0.06), 0 14px 32px -12px rgb(40 20 10 / 0.45)" }}>
          {shown !== "table" && (
            <NavIcon look={look} label={prev ? `Back to ${label(prev)}` : "Back"} disabled={!prev} onClick={() => prev && go(prev)}>
              <ArrowLeftIcon className="size-[1.1rem]" />
            </NavIcon>
          )}
          <NavIcon look={look} label="See everything on the table" pressed={shown === "table"} onClick={() => go("table")}>
            <WidgetIcon className="size-[1.1rem]" />
          </NavIcon>
          {next && (
            <button type="button" onClick={() => go(next)} className="flex h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-full pr-4 pl-5 text-left text-white transition-transform active:scale-[0.98]" style={{ background: look.accent }}>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-[0.625rem] font-semibold tracking-[0.2em] uppercase opacity-75">{shown === "table" ? "Continue" : "Next"}</span>
                <span className="truncate text-[0.9375rem] font-medium">{label(next)}</span>
              </span>
              <ArrowRightIcon className="size-[1.1rem] shrink-0" />
            </button>
          )}
        </nav>
      )}
    </div>
  )
}

function NavIcon({ look, label, onClick, disabled, pressed, children }: { look: LetterLook; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className="grid size-12 shrink-0 place-items-center rounded-full transition-[transform,opacity] active:scale-95 disabled:opacity-35" style={{ color: look.ink, background: pressed ? "rgb(0 0 0 / 0.06)" : "transparent", boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.07)" }}>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- Cover

function useCountdown(target: string, onDone?: () => void) {
  const [now, setNow] = useState(() => Date.now())
  const left = Math.max(0, new Date(target).getTime() - now)
  const done = useRef(false)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  useEffect(() => {
    if (left === 0 && !done.current) {
      done.current = true
      onDone?.()
    }
  }, [left, onDone])
  const s = Math.floor(left / 1000)
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 }
}

function Countdown({ target, look, onDone }: { target: string; look: LetterLook; onDone?: () => void }) {
  const c = useCountdown(target, onDone)
  const cells: [number, string][] = [
    [c.days, "days"],
    [c.hours, "hours"],
    [c.minutes, "min"],
    [c.seconds, "sec"],
  ]
  return (
    <div className="flex flex-col items-center gap-2" role="timer" aria-label={`Opens in ${c.days} days, ${c.hours} hours and ${c.minutes} minutes`}>
      <p className="text-[0.625rem] font-semibold tracking-[0.28em] uppercase" style={{ color: look.accentText }}>
        This letter opens in
      </p>
      <div className="flex gap-2" aria-hidden="true">
        {cells.map(([v, l]) => (
          <div key={l} className="flex w-16 flex-col items-center rounded-2xl py-2 backdrop-blur" style={{ background: look.chip, color: look.ink }}>
            <span className="lt-serif text-3xl font-medium tabular-nums">{String(v).padStart(2, "0")}</span>
            <span className="text-[0.625rem] tracking-[0.15em] uppercase opacity-70">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Cover({ letter, look, design, still, onOpen, onSealExpired, heading: Heading = "h1" }: { letter: LetterView; look: LetterLook; design: LetterDesign; still: boolean; onOpen: () => void; onSealExpired?: () => void; heading?: "h1" | "h2" }) {
  const [opening, setOpening] = useState(false)
  const open = () => {
    if (opening || letter.sealed) return
    setOpening(true)
    window.setTimeout(onOpen, still ? 120 : design.theme === "celebration" ? 1700 : 1500)
  }
  const party = design.theme === "celebration"
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3cqh] px-6 text-center">
      <motion.div initial={still ? false : { opacity: 0, y: 12 }} animate={{ opacity: opening ? 0 : 1, y: 0 }} transition={{ duration: 0.6, ease }} className="flex flex-col items-center gap-1">
        <p className="text-[0.6875rem] font-semibold tracking-[0.3em] uppercase @3xl:text-sm" style={{ color: look.accentText }}>
          {party ? "A surprise for" : "A letter for"}
        </p>
        <Heading className="lt-script text-[clamp(2.6rem,12cqw,4.5rem)] leading-[1.15] text-balance @3xl:text-[5.5rem]" style={{ color: look.ink }}>
          {letter.recipientName}
        </Heading>
      </motion.div>

      {party ? <GiftBox look={look} opening={opening} still={still} onOpen={open} sealed={letter.sealed} /> : <Envelope look={look} opening={opening} still={still} onOpen={open} sealed={letter.sealed} theme={design.theme} />}

      <motion.div initial={still ? false : { opacity: 0 }} animate={{ opacity: opening ? 0 : 1 }} transition={{ duration: 0.5, delay: still ? 0 : 0.3 }} className="flex flex-col items-center gap-4">
        <p className="lt-script text-[clamp(1.6rem,6cqw,2.25rem)]" style={{ color: look.accentText }}>
          with love, {letter.senderDisplayName}
        </p>
        {letter.sealed ? (
          <Countdown target={letter.opensAt} look={look} onDone={onSealExpired} />
        ) : (
          <button type="button" onClick={open} className="lt-pulse h-12 rounded-full px-7 text-[0.9375rem] font-medium text-white shadow-[0_10px_24px_-10px_rgb(60_10_20/0.7)] transition-transform active:scale-95" style={{ background: look.accent, ["--lt-pulse" as string]: look.accent } as React.CSSProperties}>
            {party ? "Pull the ribbon" : "Open the letter"}
          </button>
        )}
      </motion.div>
    </div>
  )
}

function Envelope({ look, opening, still, onOpen, sealed, theme }: { look: LetterLook; opening: boolean; still: boolean; onOpen: () => void; sealed: boolean; theme: LetterDesign["theme"] }) {
  const paper = theme === "envelope" ? "#fbe4e9" : "#f5efe3"
  const edge = theme === "envelope" ? "#ecc2cc" : "#ddd1bd"
  const t = still ? { duration: 0.01 } : undefined
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      disabled={sealed}
      aria-label={sealed ? "The letter is still sealed" : "Open the letter"}
      initial={still ? false : { opacity: 0, y: 30, rotate: -2 }}
      animate={opening ? { y: still ? 0 : 40, opacity: 0, scale: 0.96 } : { opacity: 1, y: 0, rotate: -2 }}
      transition={opening ? { delay: still ? 0 : 1.05, duration: 0.45 } : { duration: 0.7, ease }}
      whileHover={opening || sealed || still ? undefined : { rotate: 0, y: -4 }}
      className="relative aspect-[1.45] w-[min(80cqw,46cqh,24rem)] outline-offset-8 @3xl:w-[min(46cqh,32rem)]"
      style={{ perspective: 900 }}
    >
      {/* The letter inside, rising as it opens. */}
      <motion.div aria-hidden="true" className="lt-paper absolute inset-x-[7%] top-[8%] h-[80%] rounded-sm shadow" initial={false} animate={opening ? { y: still ? 0 : "-55%" } : { y: 0 }} transition={{ delay: still ? 0 : 0.55, duration: 0.6, ease }}>
        <div className="mx-auto mt-[12%] flex w-[70%] flex-col gap-[8%]">
          {[90, 100, 76, 88].map((w, i) => (
            <span key={i} className="block h-[3px] rounded bg-[#d9cdb8]" style={{ width: `${w}%` }} />
          ))}
        </div>
      </motion.div>
      <div aria-hidden="true" className="absolute inset-0 rounded-[4px] shadow-[0_2px_3px_rgb(0_0_0/0.08),0_24px_40px_-18px_rgb(50_30_15/0.55)]" style={{ background: paper, clipPath: "polygon(0 0, 50% 52%, 100% 0, 100% 100%, 0 100%)" }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(to top right, transparent 49.6%, ${edge} 50%, transparent 50.4%), linear-gradient(to top left, transparent 49.6%, ${edge} 50%, transparent 50.4%)` }} />
      </div>
      <motion.div aria-hidden="true" className="absolute inset-x-0 top-0 h-[56%] origin-top" initial={false} animate={opening ? { rotateX: 180 } : { rotateX: 0 }} transition={{ delay: still ? 0 : 0.25, duration: 0.55, ease: [0.5, 0, 0.3, 1] }} style={{ transformStyle: "preserve-3d", zIndex: opening ? 0 : 2 }}>
        <div className="absolute inset-0" style={{ background: paper, clipPath: "polygon(0 0, 100% 0, 50% 100%)", filter: "brightness(0.97)", boxShadow: "inset 0 -1px 0 rgb(0 0 0 / 0.05)" }} />
      </motion.div>
      <motion.div aria-hidden="true" className="absolute top-[56%] left-1/2 z-10 w-[22%] -translate-x-1/2 -translate-y-1/2" initial={false} animate={opening ? { scale: [1, 1.18, 0], rotate: [0, -8, 20], opacity: [1, 1, 0] } : { scale: 1, opacity: 1 }} transition={opening ? { duration: 0.45, times: [0, 0.4, 1] } : t}>
        <WaxSeal colour={look.accent} className="w-full drop-shadow-[0_3px_4px_rgb(40_0_10/0.45)]" />
      </motion.div>
    </motion.button>
  )
}

function GiftBox({ look, opening, still, onOpen, sealed }: { look: LetterLook; opening: boolean; still: boolean; onOpen: () => void; sealed: boolean }) {
  const gold = "linear-gradient(90deg, #b8862e, #f3d27a 50%, #b8862e)"
  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={onOpen}
        disabled={sealed}
        aria-label={sealed ? "The gift is still sealed" : "Pull the ribbon to open"}
        initial={still ? false : { opacity: 0, y: 30, scale: 0.9 }}
        animate={opening ? { y: still ? 0 : 30, opacity: 0 } : { opacity: 1, y: 0, scale: 1 }}
        transition={opening ? { delay: still ? 0 : 1.1, duration: 0.5 } : { type: "spring", stiffness: 160, damping: 14 }}
        whileHover={opening || sealed || still ? undefined : { rotate: [0, -3, 3, -2, 0], transition: { duration: 0.5 } }}
        className="relative aspect-square w-[min(56cqw,34cqh,16rem)] outline-offset-8 @3xl:w-[min(36cqh,20rem)]"
      >
        <div aria-hidden="true" className="absolute inset-x-[6%] top-[30%] bottom-0 rounded-md shadow-[0_24px_40px_-18px_rgb(0_0_0/0.6)]" style={{ background: `linear-gradient(160deg, ${look.accent}, color-mix(in oklch, ${look.accent} 70%, black))` }}>
          <div className="absolute inset-y-0 left-1/2 w-[16%] -translate-x-1/2" style={{ background: gold }} />
        </div>
        <motion.div aria-hidden="true" className="absolute inset-x-0 top-[18%] h-[16%] rounded-md shadow-md" initial={false} animate={opening ? { y: still ? 0 : -140, rotate: -14, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }} transition={{ delay: still ? 0 : 0.45, duration: 0.7, ease: [0.3, 0, 0.2, 1] }} style={{ background: `linear-gradient(160deg, color-mix(in oklch, ${look.accent} 85%, white), ${look.accent})` }}>
          <div className="absolute inset-y-0 left-1/2 w-[16%] -translate-x-1/2" style={{ background: gold }} />
        </motion.div>
        <motion.svg aria-hidden="true" viewBox="0 0 100 50" className="absolute top-[2%] left-1/2 w-[58%] -translate-x-1/2" initial={false} animate={opening ? { scale: [1, 1.2, 0.2], rotate: [0, 10, -40], opacity: [1, 1, 0], y: still ? 0 : -40 } : { scale: 1, opacity: 1 }} transition={{ duration: 0.6 }}>
          <path d="M50 40 C30 6 6 10 12 30 C16 42 36 42 50 40Z" fill="#e8bb52" stroke="#a87a26" strokeWidth="1.4" />
          <path d="M50 40 C70 6 94 10 88 30 C84 42 64 42 50 40Z" fill="#f3d27a" stroke="#a87a26" strokeWidth="1.4" />
          <circle cx="50" cy="40" r="6" fill="#d4a23f" stroke="#a87a26" strokeWidth="1.4" />
        </motion.svg>
      </motion.button>
      {opening && !still && <Confetti count={90} origin={{ x: 50, y: 30 }} spread={0.9} />}
    </div>
  )
}

// ---------------------------------------------------------------- Table

function Table({ letter, look, moments, visited, onOpen, finale, still }: { letter: LetterView; look: LetterLook; moments: MomentId[]; visited: Set<MomentId>; onOpen: (p: LetterPage) => void; finale?: ReactNode; still: boolean }) {
  return (
    <div className="lt-scroll absolute inset-0 flex flex-col items-center gap-[3cqh] overflow-y-auto px-5 pt-[max(5rem,12cqh)] pb-[max(7rem,15cqh)]">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-[0.6875rem] font-semibold tracking-[0.28em] uppercase" style={{ color: look.accentText }}>
          For {letter.recipientName}
        </p>
        <h2 className="lt-serif text-[clamp(1.6rem,7cqw,2.75rem)] leading-tight text-balance italic" style={{ color: look.ink }}>
          Everything on this table is yours
        </h2>
      </header>
      <ul className="flex w-full max-w-[34rem] flex-wrap justify-center gap-y-5 @3xl:max-w-[48rem]">
        {moments.map((id, i) => (
          <li key={id} className="w-1/3 @3xl:w-1/4">
            <motion.button
              type="button"
              onClick={() => onOpen(id)}
              aria-label={`${MOMENTS[id].label}${visited.has(id) ? " (seen)" : ""}`}
              initial={still ? false : { opacity: 0, y: 16, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              whileHover={still ? undefined : { y: -6, rotate: i % 2 ? 3 : -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: still ? 0 : i * 0.06 }}
              className="group flex w-full flex-col items-center gap-2 rounded-2xl p-1 outline-offset-2"
            >
              <span className={cn("relative w-[min(22cqw,6.5rem)]", id === "letter" && !visited.has("letter") && !still && "lt-bob")}>
                <MomentObject id={id} accent={look.accent} className="w-full drop-shadow-[0_10px_12px_rgb(40_20_10/0.3)]" />
                {visited.has(id) && (
                  <span className="absolute -top-1 right-0 grid size-5 place-items-center rounded-full text-white shadow" style={{ background: look.accent }}>
                    <CheckIcon className="size-3" />
                  </span>
                )}
              </span>
              <span className="lt-serif rounded-full px-2.5 py-0.5 text-[0.9375rem] whitespace-nowrap italic backdrop-blur" style={{ background: look.chip, color: look.ink }}>
                {MOMENTS[id].label}
              </span>
            </motion.button>
          </li>
        ))}
      </ul>
      {finale}
    </div>
  )
}

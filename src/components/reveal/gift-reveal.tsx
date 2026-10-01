import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import type { RevealStyle } from "@domain/index.ts"
import { Button } from "@/components/ui/button"
import { Confetti } from "./confetti"
import { RestartIcon, SkipNextIcon } from "@/components/icons"
import { LogoMark } from "@/components/brand/logo"

type Phase = "closed" | "opening" | "open"

const OPEN_DURATION_MS = { wrapped_box: 3200, envelope: 3000 } as const
const ease = [0.2, 0, 0, 1] as const

const rememberKey = (id: string) => `jg-opened:${id}`
const wasOpened = (id: string) => {
  try {
    return localStorage.getItem(rememberKey(id)) === "1"
  } catch {
    return false
  }
}

export interface GiftRevealProps {
  /** Used to remember that this viewer already opened it (MOT 05). */
  id: string
  revealStyle: RevealStyle
  recipientName: string
  fromLabel: string
  celebratory?: boolean
  preview?: boolean
  onOpened?: () => void
  /** The revealed content. Rendered as normal, accessible HTML once open. */
  children: ReactNode
  className?: string
}

export function GiftReveal({ id, revealStyle, recipientName, fromLabel, celebratory = true, preview, onOpened, children, className }: GiftRevealProps) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(() => (!preview && wasOpened(id) ? "open" : "closed"))
  const [replayKey, setReplayKey] = useState(0)
  const timer = useRef<number | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const firedOpen = useRef(false)

  const finish = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    setPhase("open")
    if (!preview) {
      try {
        localStorage.setItem(rememberKey(id), "1")
      } catch {
        /* ignore */
      }
    }
    if (!firedOpen.current) {
      firedOpen.current = true
      onOpened?.()
    }
  }, [id, onOpened, preview])

  const open = useCallback(
    (animate: boolean) => {
      if (!animate || reduce) {
        finish()
        return
      }
      setPhase("opening")
      timer.current = window.setTimeout(finish, OPEN_DURATION_MS[revealStyle])
    },
    [finish, reduce, revealStyle],
  )

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  // Move focus to the revealed content so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (phase === "open") contentRef.current?.focus({ preventScroll: true })
  }, [phase])

  const replay = () => {
    setReplayKey((k) => k + 1)
    setPhase("closed")
    requestAnimationFrame(() => open(true))
  }

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="wait" initial={false}>
        {phase !== "open" ? (
          <motion.section
            key={`stage-${replayKey}`}
            aria-label="Your gift"
            className="relative flex min-h-[min(36rem,78dvh)] flex-col items-center justify-center gap-10 px-4 py-14"
            exit={{ opacity: 0, transition: { duration: 0.35, ease } }}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="eyebrow text-plum-muted">
                {preview ? "Preview · this is what they'll see" : fromLabel}
              </motion.p>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08, ease }} className="font-display text-plum-foreground text-4xl font-medium sm:text-5xl">
                {recipientName ? <>A gift for <span className="font-display-wonk italic">{recipientName}</span></> : "A gift for you"}
              </motion.h1>
            </div>

            <div className="relative grid place-items-center">
              {revealStyle === "wrapped_box" ? (
                <WrappedBox phase={phase} onActivate={() => phase === "closed" && open(true)} />
              ) : (
                <Envelope phase={phase} recipientName={recipientName} onActivate={() => phase === "closed" && open(true)} />
              )}
              {phase === "opening" && celebratory && (
                <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: revealStyle === "wrapped_box" ? 1.1 : 1.4 }}>
                  <Confetti />
                </motion.div>
              )}
            </div>

            <div className="flex min-h-12 flex-col items-center gap-3">
              {phase === "closed" ? (
                <>
                  <Button size="xl" variant="inverse" onClick={() => open(true)} autoFocus>
                    Open your gift
                  </Button>
                  <button type="button" onClick={() => open(false)} className="text-plum-muted hover:text-plum-foreground text-sm underline decoration-current/40 underline-offset-4">
                    Open without animation
                  </button>
                </>
              ) : (
                <Button variant="ghost" className="text-plum-foreground hover:bg-white/10 hover:text-plum-foreground" onClick={finish}>
                  <SkipNextIcon data-icon="inline-start" />
                  Skip
                </Button>
              )}
            </div>
          </motion.section>
        ) : (
          <motion.div
            key="content"
            ref={contentRef}
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0.2 : 0.5, ease }}
            className="relative outline-none"
          >
            {children}
            <div className="flex justify-center pt-2 pb-10">
              <Button variant="ghost" size="sm" onClick={replay} className="text-plum-muted hover:text-plum-foreground hover:bg-white/10">
                <RestartIcon data-icon="inline-start" />
                Replay the opening
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------- Wrapped box

function WrappedBox({ phase, onActivate }: { phase: Phase; onActivate: () => void }) {
  const reduce = useReducedMotion()
  const opening = phase === "opening"
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={phase !== "closed"}
      aria-label="Open your gift"
      className="group relative size-60 cursor-pointer rounded-3xl outline-offset-8 disabled:cursor-default sm:size-72"
    >
      {/* light burst */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-[-30%] rounded-full"
        style={{ background: "radial-gradient(circle, oklch(0.95 0.08 85 / 0.9), oklch(0.83 0.12 85 / 0.35) 35%, transparent 65%)" }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={opening ? { opacity: [0, 0.95, 0], scale: [0.4, 1.3, 1.6] } : { opacity: 0, scale: 0.4 }}
        transition={{ duration: 1.6, delay: 1.0, ease }}
      />
      {/* ground shadow */}
      <motion.span aria-hidden="true" className="absolute -bottom-6 left-1/2 h-6 w-48 -translate-x-1/2 rounded-[50%] bg-black/35 blur-md" animate={opening ? { opacity: 0, scaleX: 0.6 } : { opacity: 1, scaleX: 1 }} transition={{ delay: 1.4, duration: 0.6 }} />

      <motion.span
        aria-hidden="true"
        className="absolute inset-0 block"
        animate={phase === "closed" && !reduce ? { y: [0, -7, 0], rotate: [0, -1.2, 0, 1.2, 0] } : { y: 0 }}
        transition={phase === "closed" ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      >
        {/* box body */}
        <motion.span
          className="absolute inset-x-[8%] top-[30%] bottom-0 overflow-hidden rounded-b-2xl rounded-t-md"
          style={{ background: "linear-gradient(160deg, oklch(0.72 0.17 47), oklch(0.6 0.18 38))", boxShadow: "inset 0 -18px 30px oklch(0.4 0.12 30 / 0.35), 0 20px 40px -12px oklch(0.2 0.05 30 / 0.6)" }}
          animate={opening ? { y: [0, 0, 60], opacity: [1, 1, 0], scale: [1, 1.03, 0.92] } : {}}
          transition={{ duration: 0.9, delay: 1.3, ease, times: [0, 0.3, 1] }}
        >
          <span className="absolute inset-y-0 left-1/2 w-[16%] -translate-x-1/2" style={{ background: "linear-gradient(90deg, oklch(0.78 0.12 85), oklch(0.88 0.1 90), oklch(0.76 0.12 82))" }} />
          <span className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(oklch(1 0 0 / 0.35) 1.5px, transparent 1.5px)", backgroundSize: "18px 18px" }} />
        </motion.span>

        {/* lid */}
        <motion.span
          className="absolute inset-x-[3%] top-[22%] h-[17%] rounded-xl"
          style={{ background: "linear-gradient(170deg, oklch(0.75 0.17 50), oklch(0.64 0.18 40))", boxShadow: "0 10px 18px -6px oklch(0.25 0.06 30 / 0.55)" }}
          animate={opening ? { y: [0, 6, -230], x: [0, 0, -40], rotate: [0, 0, -24], opacity: [1, 1, 0] } : {}}
          transition={{ duration: 1.05, delay: 0.45, ease, times: [0, 0.15, 1] }}
        >
          <span className="absolute inset-y-0 left-1/2 w-[15%] -translate-x-1/2" style={{ background: "linear-gradient(90deg, oklch(0.78 0.12 85), oklch(0.9 0.09 90), oklch(0.76 0.12 82))" }} />
        </motion.span>

        {/* bow */}
        <motion.svg
          viewBox="0 0 120 70"
          className="absolute top-[3%] left-1/2 w-[46%] -translate-x-1/2 drop-shadow-md"
          animate={opening ? { scale: [1, 1.18, 0], rotate: [0, 8, 30], opacity: [1, 1, 0], y: [0, -6, -40] } : {}}
          transition={{ duration: 0.7, ease, times: [0, 0.35, 1] }}
        >
          <defs>
            <linearGradient id="bow" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="oklch(0.92 0.09 90)" />
              <stop offset="1" stopColor="oklch(0.74 0.13 80)" />
            </linearGradient>
          </defs>
          <path d="M60 52 C40 20 6 8 10 34 C13 54 42 56 60 52Z" fill="url(#bow)" />
          <path d="M60 52 C80 20 114 8 110 34 C107 54 78 56 60 52Z" fill="url(#bow)" />
          <path d="M60 52 L46 70 M60 52 L74 70" stroke="oklch(0.78 0.12 82)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="60" cy="50" r="8" fill="oklch(0.84 0.11 86)" />
        </motion.svg>
      </motion.span>

    </button>
  )
}

// ---------------------------------------------------------------- Envelope

function Envelope({ phase, recipientName, onActivate }: { phase: Phase; recipientName: string; onActivate: () => void }) {
  const reduce = useReducedMotion()
  const opening = phase === "opening"
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={phase !== "closed"}
      aria-label="Open your gift"
      className="group relative h-52 w-80 cursor-pointer rounded-xl outline-offset-8 disabled:cursor-default sm:h-60 sm:w-96"
      style={{ perspective: 1000 }}
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 block"
        animate={phase === "closed" && !reduce ? { y: [0, -5, 0] } : { y: 0 }}
        transition={phase === "closed" ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      >
        <motion.span className="absolute inset-0 block" animate={opening ? { y: [0, 0, 90], opacity: [1, 1, 0] } : {}} transition={{ duration: 0.8, delay: 1.9, ease, times: [0, 0.2, 1] }}>
          {/* back */}
          <span className="absolute inset-0 rounded-xl" style={{ background: "oklch(0.88 0.03 75)", boxShadow: "0 30px 50px -18px oklch(0.15 0.04 340 / 0.7)" }} />
          {/* letter */}
          <motion.span
            className="absolute inset-x-[7%] top-[8%] bottom-[6%] flex flex-col items-center justify-center gap-1 rounded-lg px-4 text-center"
            style={{ background: "oklch(0.985 0.008 85)", boxShadow: "0 1px 0 oklch(0 0 0 / 0.05)" }}
            animate={opening ? { y: [0, 0, -150], zIndex: [1, 1, 5] } : {}}
            transition={{ duration: 0.9, delay: 1.0, ease, times: [0, 0.05, 1] }}
          >
            <span className="eyebrow text-muted-foreground">For</span>
            <span className="font-display text-foreground text-3xl italic">{recipientName || "you"}</span>
            <span className="bg-brand mt-2 h-0.5 w-10 rounded-full" />
          </motion.span>
          {/* front pocket */}
          <span className="absolute inset-0 z-[2] rounded-xl" style={{ background: "linear-gradient(180deg, oklch(0.93 0.025 78), oklch(0.9 0.03 75))", clipPath: "polygon(0 0, 50% 52%, 100% 0, 100% 100%, 0 100%)" }} />
          <span className="absolute inset-0 z-[2] rounded-xl" style={{ background: "linear-gradient(90deg, oklch(0 0 0 / 0.06), transparent 30%, transparent 70%, oklch(0 0 0 / 0.06))", clipPath: "polygon(0 0, 50% 52%, 100% 0, 100% 100%, 0 100%)" }} />
        </motion.span>
        {/* flap */}
        <motion.span
          className="absolute inset-x-0 top-0 z-[3] block h-[58%] origin-top"
          style={{ transformStyle: "preserve-3d" }}
          animate={opening ? { rotateX: [0, 180], zIndex: [3, 3, 0] } : { rotateX: 0 }}
          transition={{ duration: 0.85, delay: 0.25, ease }}
        >
          <span className="absolute inset-0 rounded-t-xl" style={{ background: "linear-gradient(180deg, oklch(0.9 0.035 75), oklch(0.86 0.04 72))", clipPath: "polygon(0 0, 100% 0, 50% 100%)", backfaceVisibility: "hidden" }} />
          <span className="absolute inset-0 rounded-t-xl" style={{ background: "oklch(0.84 0.04 72)", clipPath: "polygon(0 0, 100% 0, 50% 100%)", transform: "rotateX(180deg)", backfaceVisibility: "hidden" }} />
        </motion.span>
        {/* wax seal */}
        <motion.span
          className="absolute top-[47%] left-1/2 z-[4] grid size-14 -translate-x-1/2 place-items-center rounded-full"
          style={{ background: "radial-gradient(circle at 35% 30%, oklch(0.72 0.17 47), oklch(0.55 0.17 35))", boxShadow: "0 4px 10px oklch(0.3 0.1 30 / 0.45), inset 0 -3px 6px oklch(0.4 0.12 30 / 0.5)" }}
          animate={opening ? { scale: [1, 1.12, 0], opacity: [1, 1, 0] } : {}}
          transition={{ duration: 0.4, ease }}
        >
          <LogoMark className="size-7 opacity-80 [&_rect]:fill-transparent" />
        </motion.span>
      </motion.span>
    </button>
  )
}

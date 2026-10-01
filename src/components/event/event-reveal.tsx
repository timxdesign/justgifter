import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { EventContent, EventDesign } from "@domain/index.ts"
import { templateById, eventTypeMeta } from "@domain/index.ts"
import { Button } from "@/components/ui/button"
import { Confetti } from "@/components/reveal/confetti"
import { SkipNextIcon } from "@/components/icons"
import { paletteStyle } from "./event-page"
import { formatLongDate } from "@/lib/format"

const ease = [0.2, 0, 0, 1] as const
const key = (slug: string) => `jg-event-opened:${slug}`

/**
 * Event intro (§8 Event reveal): a short curtain, card or invitation opening that introduces
 * the host and occasion. The page underneath is always rendered and reachable; the intro is
 * skippable, remembered per visitor, and absent under reduced motion or the "none" preset.
 */
export function EventReveal({ slug, content, design, children }: { slug: string; content: EventContent; design: EventDesign; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  const preset = design.motionPreset
  const [state, setState] = useState<"intro" | "opening" | "done">(() => {
    if (preset === "none") return "done"
    try {
      return sessionStorage.getItem(key(slug)) ? "done" : "intro"
    } catch {
      return "intro"
    }
  })
  const timer = useRef<number | null>(null)
  const celebratory = templateById(design.templateId)?.celebratoryEffects && !eventTypeMeta(content.type)?.sensitive

  const finish = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setState("done")
    try {
      sessionStorage.setItem(key(slug), "1")
    } catch {
      /* ignore */
    }
  }, [slug])

  const open = (animate: boolean) => {
    if (!animate || reduce) return finish()
    setState("opening")
    timer.current = window.setTimeout(finish, preset === "curtain" ? 2000 : 2300)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // Lock background scroll while the intro covers the page.
  useEffect(() => {
    if (state === "done") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [state])

  return (
    <>
      <div aria-hidden={state !== "done" || undefined} inert={state !== "done" || undefined}>
        {children}
      </div>
      <AnimatePresence>
        {state !== "done" && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${content.title} — invitation`}
            style={paletteStyle(design)}
            className="fixed inset-0 z-50 overflow-hidden text-[var(--ev-text)]"
            exit={{ opacity: 0, transition: { duration: 0.4, ease } }}
          >
            {preset === "curtain" ? <Curtain opening={state === "opening"} /> : <div className="absolute inset-0 bg-[var(--ev-bg)]" />}
            <div className="relative grid h-full place-items-center p-6">
              <motion.div
                className="flex w-full max-w-md flex-col items-center gap-6 text-center"
                animate={state === "opening" ? (preset === "curtain" ? { opacity: 0, scale: 0.96 } : { opacity: 0, y: -30 }) : { opacity: 1 }}
                transition={{ duration: 0.5, delay: preset === "curtain" ? 0 : 1.4, ease }}
              >
                {preset === "card" ? <Card content={content} opening={state === "opening"} /> : preset === "invitation" ? <Invitation content={content} opening={state === "opening"} /> : <TitleBlock content={content} light={preset === "curtain"} />}
                {state === "intro" && (
                  <div className="flex flex-col items-center gap-3">
                    <Button size="xl" className="bg-[var(--ev-accent)] text-[var(--ev-accent-text)] hover:bg-[var(--ev-accent)]/90" onClick={() => open(true)} autoFocus>
                      {preset === "invitation" ? "Open the invitation" : "Come on in"}
                    </Button>
                    <button type="button" onClick={() => open(false)} className={preset === "curtain" ? "text-sm text-white/80 underline underline-offset-4" : "text-sm text-[var(--ev-muted)] underline underline-offset-4"}>
                      Open without animation
                    </button>
                  </div>
                )}
              </motion.div>
              {state === "opening" && celebratory && <Confetti count={60} />}
            </div>
            {state === "opening" && (
              <Button variant="ghost" size="sm" onClick={finish} className="absolute top-4 right-4 text-current hover:bg-black/5">
                <SkipNextIcon data-icon="inline-start" />
                Skip
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function TitleBlock({ content, light }: { content: EventContent; light?: boolean }) {
  return (
    <div className={light ? "flex flex-col gap-3 text-white drop-shadow" : "flex flex-col gap-3"}>
      <p className="text-xs tracking-[0.3em] uppercase opacity-80">{content.hostDisplayName} invites you</p>
      <h1 className="font-display text-5xl leading-tight font-light" style={{ fontFamily: "var(--ev-heading)", fontVariationSettings: "var(--ev-heading-variation)" }}>
        {content.title}
      </h1>
      <p className="opacity-80">{content.date ? formatLongDate(content.date) : "Date to be confirmed"}</p>
    </div>
  )
}

function Curtain({ opening }: { opening: boolean }) {
  const panel = "absolute inset-y-0 w-1/2"
  const fabric = { background: "repeating-linear-gradient(90deg, oklch(0.32 0.09 15), oklch(0.32 0.09 15) 22px, oklch(0.27 0.08 15) 30px, oklch(0.32 0.09 15) 40px)", boxShadow: "inset 0 0 80px oklch(0 0 0 / 0.45)" }
  return (
    <>
      <motion.div className={`${panel} left-0`} style={fabric} animate={opening ? { x: "-100%" } : { x: 0 }} transition={{ duration: 1.5, ease: [0.65, 0, 0.35, 1], delay: 0.2 }} />
      <motion.div className={`${panel} right-0`} style={fabric} animate={opening ? { x: "100%" } : { x: 0 }} transition={{ duration: 1.5, ease: [0.65, 0, 0.35, 1], delay: 0.2 }} />
      <div className="absolute inset-x-0 top-0 h-16" style={{ background: "linear-gradient(oklch(0.25 0.07 15), transparent)" }} />
    </>
  )
}

function Card({ content, opening }: { content: EventContent; opening: boolean }) {
  return (
    <div style={{ perspective: 1200 }} className="relative h-80 w-64">
      <motion.div className="absolute inset-0 rounded-2xl bg-[var(--ev-surface)] p-6 shadow-2xl" animate={opening ? { scale: 1.05 } : {}}>
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <p className="text-xs tracking-[0.25em] text-[var(--ev-muted)] uppercase">You're invited</p>
          <p className="text-sm">{content.date ? formatLongDate(content.date) : "Date to be confirmed"}</p>
        </div>
      </motion.div>
      <motion.div
        className="absolute inset-0 flex origin-left flex-col items-center justify-center gap-3 rounded-2xl bg-[var(--ev-accent)] p-6 text-[var(--ev-accent-text)] shadow-xl"
        style={{ backfaceVisibility: "hidden" }}
        animate={opening ? { rotateY: -170 } : { rotateY: 0 }}
        transition={{ duration: 1.1, ease }}
      >
        <p className="text-xs tracking-[0.25em] uppercase opacity-80">{content.hostDisplayName}</p>
        <h1 className="text-4xl leading-tight font-semibold" style={{ fontFamily: "var(--ev-heading)", fontVariationSettings: "var(--ev-heading-variation)" }}>
          {content.title}
        </h1>
      </motion.div>
    </div>
  )
}

function Invitation({ content, opening }: { content: EventContent; opening: boolean }) {
  return (
    <div className="relative w-72">
      <motion.div className="relative z-10 rounded-xl bg-[var(--ev-surface)] px-6 py-10 shadow-2xl" animate={opening ? { y: -40, scale: 1.04 } : {}} transition={{ duration: 0.9, delay: 0.5, ease }}>
        <TitleBlock content={content} />
      </motion.div>
      <motion.div className="absolute inset-x-[-6%] -bottom-6 h-32 rounded-b-xl bg-[var(--ev-accent)] opacity-90" style={{ clipPath: "polygon(0 0, 50% 45%, 100% 0, 100% 100%, 0 100%)" }} animate={opening ? { y: 160, opacity: 0 } : {}} transition={{ duration: 0.8, delay: 0.3, ease }} />
    </div>
  )
}

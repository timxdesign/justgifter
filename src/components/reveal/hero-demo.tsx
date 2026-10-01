import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import { Confetti } from "./confetti"
import { RestartIcon, CheckCircleIcon, DeliveryIcon } from "@/components/icons"

const ease = [0.2, 0, 0, 1] as const

/**
 * The homepage "try it" demo: a phone showing the recipient's reveal. Tapping the box plays the
 * same choreography as the real wrapped-box reveal, compressed into the phone frame.
 */
export function HeroRevealDemo({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<"closed" | "opening" | "open">("closed")
  useEffect(() => {
    if (phase !== "opening") return
    const t = setTimeout(() => setPhase("open"), reduce ? 0 : 2300)
    return () => clearTimeout(t)
  }, [phase, reduce])

  return (
    <div className={cn("relative mx-auto w-full max-w-[22rem]", className)}>
      {/* floating status cards */}
      <motion.div
        aria-hidden="true"
        className="bg-card shadow-float absolute top-16 -left-10 z-10 hidden items-center gap-3 rounded-2xl px-4 py-3 sm:flex"
        animate={reduce ? {} : { y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="bg-success-soft text-success grid size-9 place-items-center rounded-full">
          <DeliveryIcon className="size-5" />
        </span>
        <span className="text-sm">
          <span className="block font-medium">Delivered</span>
          <span className="text-muted-foreground text-xs">Today, 2:14pm · Lekki</span>
        </span>
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="bg-card shadow-float absolute -right-8 bottom-28 z-10 hidden items-center gap-3 rounded-2xl px-4 py-3 sm:flex"
        animate={reduce ? {} : { y: [0, 7, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      >
        <span className="bg-brand-soft text-brand-text grid size-9 place-items-center rounded-full">
          <CheckCircleIcon className="size-5" />
        </span>
        <span className="text-sm">
          <span className="block font-medium">Tolu opened your gift</span>
          <span className="text-muted-foreground text-xs">and sent a thank-you</span>
        </span>
      </motion.div>

      {/* phone */}
      <div className="relative rounded-[2.75rem] bg-[oklch(0.18_0.02_340)] p-2.5 shadow-[0_40px_80px_-30px_oklch(0.2_0.06_340/0.7),0_0_0_1px_oklch(1_0_0/0.06)_inset]">
        <div className="relative aspect-[9/18.5] overflow-hidden rounded-[2.2rem]" style={{ background: "radial-gradient(120% 70% at 50% 30%, oklch(0.33 0.07 345), oklch(0.2 0.05 340))" }}>
          <div className="absolute top-2.5 left-1/2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            {phase !== "open" ? (
              <motion.div key="closed" exit={{ opacity: 0, transition: { duration: 0.3 } }} className="text-plum-foreground absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center">
                <div>
                  <p className="eyebrow text-plum-muted text-[0.625rem]">From Ada</p>
                  <p className="font-display mt-1 text-[1.6rem] leading-tight">
                    A gift for <span className="font-display-wonk italic">Tolu</span>
                  </p>
                </div>
                <button type="button" onClick={() => phase === "closed" && setPhase("opening")} className="relative size-40 rounded-3xl" aria-label="Try opening the demo gift">
                  <MiniBox opening={phase === "opening"} />
                  {phase === "opening" && !reduce && <Confetti count={40} spread={0.6} />}
                </button>
                <button type="button" onClick={() => setPhase("opening")} disabled={phase !== "closed"} className="bg-plum-foreground text-plum press rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-0">
                  Tap to open
                </button>
              </motion.div>
            ) : (
              <motion.div key="open" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="bg-background absolute inset-0 flex flex-col">
                <motion.img
                  src="/media/p/peony.webp"
                  alt="Peony cloud bouquet"
                  data-no-outline
                  className="h-[52%] w-full object-cover"
                  initial={reduce ? false : { scale: 1.15, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.8, ease }}
                />
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <motion.p initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease }} className="eyebrow text-brand-text text-[0.625rem]">
                    Peony cloud bouquet
                  </motion.p>
                  <motion.p initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5, ease }} className="font-display text-[1.05rem] leading-snug italic">
                    “Happy birthday, Tolu! Thirty looks unreal on you. Dinner's on me Saturday.”
                  </motion.p>
                  <motion.p initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-muted-foreground text-xs">
                    — Ada · arriving today, 10am–7pm
                  </motion.p>
                  <div className="mt-auto flex gap-2">
                    <span className="bg-primary text-primary-foreground flex-1 rounded-full py-2 text-center text-xs font-medium">Say thank you</span>
                    <button type="button" onClick={() => setPhase("closed")} className="bg-muted press grid size-8 place-items-center rounded-full" aria-label="Replay the demo">
                      <RestartIcon className="size-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function MiniBox({ opening }: { opening: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.span aria-hidden="true" className="absolute inset-0 block" animate={!opening && !reduce ? { y: [0, -5, 0], rotate: [0, -1.5, 0, 1.5, 0] } : {}} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}>
      <motion.span className="absolute inset-[-25%] rounded-full" style={{ background: "radial-gradient(circle, oklch(0.95 0.08 85 / 0.9), transparent 60%)" }} initial={{ opacity: 0 }} animate={opening ? { opacity: [0, 0.9, 0], scale: [0.5, 1.2, 1.4] } : { opacity: 0 }} transition={{ duration: 1.3, delay: 0.8 }} />
      <motion.span className="absolute inset-x-[8%] top-[32%] bottom-0 overflow-hidden rounded-b-xl rounded-t-sm" style={{ background: "linear-gradient(160deg, oklch(0.72 0.17 47), oklch(0.6 0.18 38))" }} animate={opening ? { y: [0, 40], opacity: [1, 0] } : {}} transition={{ duration: 0.7, delay: 1.1, ease }}>
        <span className="absolute inset-y-0 left-1/2 w-[16%] -translate-x-1/2 bg-[oklch(0.84_0.11_86)]" />
      </motion.span>
      <motion.span className="absolute inset-x-[2%] top-[24%] h-[17%] rounded-lg" style={{ background: "linear-gradient(170deg, oklch(0.75 0.17 50), oklch(0.64 0.18 40))" }} animate={opening ? { y: [0, -160], rotate: [0, -25], opacity: [1, 0] } : {}} transition={{ duration: 0.9, delay: 0.35, ease }}>
        <span className="absolute inset-y-0 left-1/2 w-[15%] -translate-x-1/2 bg-[oklch(0.86_0.1_88)]" />
      </motion.span>
      <motion.svg viewBox="0 0 120 70" className="absolute top-[4%] left-1/2 w-[46%] -translate-x-1/2" animate={opening ? { scale: [1, 1.2, 0], opacity: [1, 1, 0] } : {}} transition={{ duration: 0.55, ease }}>
        <path d="M60 52 C40 20 6 8 10 34 C13 54 42 56 60 52Z" fill="oklch(0.86 0.1 88)" />
        <path d="M60 52 C80 20 114 8 110 34 C107 54 78 56 60 52Z" fill="oklch(0.86 0.1 88)" />
        <circle cx="60" cy="50" r="8" fill="oklch(0.8 0.12 84)" />
      </motion.svg>
    </motion.span>
  )
}

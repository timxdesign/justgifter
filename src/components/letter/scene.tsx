import { useMemo, type CSSProperties } from "react"
import { cn } from "cn"
import type { LetterDesign } from "@domain/index.ts"
import { Arrangement, Butterfly, Flower, FLOWER_PALETTE } from "./art"

/** Everything a scene needs to colour itself from the sender's design. */
export interface LetterLook {
  dark: boolean
  surface: string
  ink: string
  muted: string
  /** Buttons and seal. */
  accent: string
  /** Accent used as text on the surface. */
  accentText: string
  petal: string
  /** Tags and cards that sit on the surface. */
  chip: string
}

export function letterLook(d: LetterDesign): LetterLook {
  const p = FLOWER_PALETTE[d.flowers]
  const night = d.light === "night"
  const surface = d.theme === "table" ? (night ? "lt-walnut" : "lt-linen") : d.theme === "envelope" ? (night ? "lt-blush-night" : "lt-blush") : night ? "lt-party" : "lt-party-day"
  return {
    dark: night,
    surface,
    ink: night ? "#f6ecdd" : "#35251f",
    muted: night ? "#cdb8a3" : "#7a6457",
    accent: p.accent,
    accentText: night ? p.accentNight : p.accent,
    petal: p.petal,
    chip: night ? "rgb(255 248 238 / 0.1)" : "rgb(255 252 246 / 0.82)",
  }
}

/** Pseudo-random but stable values, so a scene doesn't reshuffle on every render. */
function seeded(n: number, seed: number) {
  let x = seed
  return Array.from({ length: n }, () => {
    x = (x * 9301 + 49297) % 233280
    return x / 233280
  })
}

const CONFETTI = ["#f6c945", "#e2577b", "#7fc8b6", "#9b83d1", "#fff4e0", "#f08a4b"]

function Ambient({ design, look }: { design: LetterDesign; look: LetterLook }) {
  const petals = useMemo(() => {
    const r = seeded(40, design.flowers.length * 7 + 3)
    return Array.from({ length: 12 }, (_, i) => ({
      left: `${r[i] * 100}%`,
      size: 8 + r[i + 12] * 10,
      dur: `${10 + r[i + 24] * 10}s`,
      delay: `${-r[i + 3] * 20}s`,
      drift: `${(r[i + 6] - 0.5) * 40}cqw`,
      spin: `${240 + r[i + 9] * 520}deg`,
    }))
  }, [design.flowers])
  const confetti = design.theme === "celebration"
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {(design.petals || confetti) &&
        petals.map((p, i) => (
          <span
            key={i}
            className="lt-petal"
            style={{ left: p.left, ["--lt-dur" as string]: p.dur, ["--lt-delay" as string]: p.delay, ["--lt-drift" as string]: p.drift, ["--lt-spin" as string]: p.spin } as CSSProperties}
          >
            {confetti ? (
              <span className="block" style={{ width: p.size * 0.7, height: p.size * 0.35 + 4, background: CONFETTI[i % CONFETTI.length], borderRadius: i % 4 === 0 ? 99 : 2 }} />
            ) : (
              <svg width={p.size} height={p.size * 0.8} viewBox="0 0 20 16">
                <path d="M2 8 C2 2 12 -1 18 4 C14 6 12 14 4 14 C2 13 2 10 2 8Z" fill={look.petal} opacity=".9" />
              </svg>
            )}
          </span>
        ))}
      {design.butterflies &&
        [
          { path: "path('M -40 120 C 120 40 240 260 360 160 S 520 40 700 140')", dur: "24s", delay: "-3s", size: 40 },
          { path: "path('M 760 520 C 600 600 420 380 300 480 S 80 640 -60 520')", dur: "30s", delay: "-11s", size: 32 },
        ].map((b, i) => (
          <div key={i} className="lt-butterfly" style={{ offsetPath: b.path, ["--lt-dur" as string]: b.dur, ["--lt-delay" as string]: b.delay } as CSSProperties}>
            <Butterfly colour={i ? "#f2c14e" : look.petal} style={{ width: b.size }} />
          </div>
        ))}
    </div>
  )
}

/**
 * The surface every scene sits on. `frame` keeps flowers to the corners so content has room;
 * `cover` lets them spill in from top and bottom like the reference table.
 */
export function Backdrop({ design, look, variant = "frame", className }: { design: LetterDesign; look: LetterLook; variant?: "cover" | "frame"; className?: string }) {
  const kind = design.flowers
  const cover = variant === "cover"
  return (
    <div aria-hidden="true" className={cn("absolute inset-0 overflow-hidden", look.surface, className)}>
      {design.theme === "table" && (
        <>
          <Arrangement kind={kind} className={cn("absolute", cover ? "-top-[6%] -left-[14%] w-[62%] @3xl:w-[30%] @3xl:-left-[4%]" : "-top-[10%] -left-[18%] w-[46%] @3xl:w-[22%] @3xl:-left-[6%]")} />
          <Arrangement kind={kind} flip className={cn("absolute", cover ? "-top-[8%] -right-[16%] w-[60%] @3xl:w-[28%] @3xl:-right-[4%]" : "-top-[12%] -right-[20%] w-[44%] @3xl:w-[20%] @3xl:-right-[6%]")} />
          <Arrangement kind={kind} className={cn("absolute rotate-180", cover ? "-bottom-[6%] -right-[14%] w-[64%] @3xl:w-[30%] @3xl:-right-[4%]" : "-bottom-[12%] -right-[20%] w-[44%] @3xl:w-[22%] @3xl:-right-[6%]")} />
          {cover && <Arrangement kind={kind} flip className="absolute -bottom-[8%] -left-[18%] w-[54%] rotate-180 @3xl:w-[26%] @3xl:-left-[4%]" />}
          {look.dark && <div className="lt-glow absolute top-[8%] left-1/2 size-[60cqmin] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(circle, rgb(255 196 120 / 0.22), transparent 65%)" }} />}
        </>
      )}
      {design.theme === "envelope" && (
        <>
          {[
            "top-[6%] left-[8%] w-[16%] -rotate-12",
            "top-[14%] right-[6%] w-[12%] rotate-12",
            "bottom-[10%] left-[10%] w-[12%] rotate-6",
            "bottom-[16%] right-[12%] w-[18%] -rotate-6",
          ].map((c, i) => (
            <Flower key={i} kind={kind} className={cn("lt-bob absolute opacity-80 @3xl:w-[7%]", c)} style={{ animationDelay: `${i * -0.7}s` }} />
          ))}
          {seeded(14, 5).map((r, i) => (
            <span key={i} className="lt-glow absolute text-[10px]" style={{ left: `${(r * 97 + i * 13) % 100}%`, top: `${(r * 61 + i * 29) % 100}%`, color: look.dark ? "#f8c9d4" : "#e7a5b4", animationDelay: `${-r * 3}s` }}>
              ✦
            </span>
          ))}
        </>
      )}
      {design.theme === "celebration" && (
        <svg className="absolute inset-x-0 top-0 h-[12cqh] w-full" viewBox="0 0 400 60" preserveAspectRatio="none">
          <path d="M0 6 Q100 40 200 8 T400 6" fill="none" stroke={look.dark ? "#f6c945" : "#c98d2a"} strokeWidth="1.2" />
          {Array.from({ length: 12 }, (_, i) => {
            const x = 12 + i * 33
            const y = 6 + Math.sin((i / 11) * Math.PI * 2) * 0 + (i < 6 ? (i / 5) * 22 : ((11 - i) / 5) * 22) * 0.9
            return <path key={i} d={`M${x - 9} ${y} L${x + 9} ${y} L${x} ${y + 18}Z`} fill={CONFETTI[i % CONFETTI.length]} />
          })}
        </svg>
      )}
      <Ambient design={design} look={look} />
    </div>
  )
}

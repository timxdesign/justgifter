import { useId, type CSSProperties, type SVGProps } from "react"
import { cn } from "cn"
import type { LetterFlower, MomentId } from "@domain/index.ts"

/**
 * Hand-built SVG art for letters: flowers, foliage, the envelope and seal, and one object per
 * moment. Everything is vector so it stays crisp at any size and recolours with the design.
 * All of it is decorative (aria-hidden); the meaning lives in the surrounding HTML.
 */

type Svg = SVGProps<SVGSVGElement>

/** Colours for each flower. `accent` drives buttons and headings across the letter. */
export const FLOWER_PALETTE: Record<LetterFlower, { petal: string; deep: string; light: string; centre: string; accent: string; accentNight: string }> = {
  roses: { petal: "#e9a3ab", deep: "#a3283d", light: "#f8dade", centre: "#7d1a2c", accent: "#8a2433", accentNight: "#e9a3ab" },
  peonies: { petal: "#f19a92", deep: "#d0555f", light: "#fde0d8", centre: "#c2415b", accent: "#a8364c", accentNight: "#f5b2aa" },
  sunflowers: { petal: "#f4b928", deep: "#d98a06", light: "#fde39a", centre: "#4a2a12", accent: "#8a5205", accentNight: "#f4c552" },
  lavender: { petal: "#9b83d1", deep: "#6b4fa0", light: "#d7cbf0", centre: "#4c3578", accent: "#5b4190", accentNight: "#c3b2ec" },
  hibiscus: { petal: "#e2394f", deep: "#a50f2d", light: "#fb9aa4", centre: "#6d0a20", accent: "#9c1430", accentNight: "#f68796" },
}

const LEAF = { base: "#6f8a62", dark: "#4b6342", light: "#9bb08a", sage: "#a8b89a" }

// ---------------------------------------------------------------- Flowers

/**
 * A garden rose seen from above: a scalloped ring of cupped outer petals, a tighter inner ring,
 * then a deep, swirled heart. Paler outside, deeper towards the centre, like the real thing.
 */
function Rose({ p, uid }: { p: (typeof FLOWER_PALETTE)[LetterFlower]; uid: string }) {
  const ring = (n: number, dist: number, rx: number, ry: number, offset: number, fill: string, key: string) =>
    Array.from({ length: n }, (_, i) => {
      const a = offset + (i * 360) / n
      const rad = (a * Math.PI) / 180
      const cx = 50 + Math.cos(rad) * dist
      const cy = 50 + Math.sin(rad) * dist
      return <ellipse key={`${key}${i}`} cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${a + 90} ${cx} ${cy})`} fill={fill} stroke={p.deep} strokeOpacity=".28" strokeWidth=".7" />
    })
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}ro`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="35%" stopColor={p.petal} />
          <stop offset="100%" stopColor={p.light} />
        </radialGradient>
        <radialGradient id={`${uid}rm`} cx="50%" cy="50%" r="50%">
          <stop offset="20%" stopColor={p.deep} stopOpacity=".9" />
          <stop offset="100%" stopColor={p.petal} />
        </radialGradient>
        <radialGradient id={`${uid}rc`} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor={p.petal} />
          <stop offset="70%" stopColor={p.deep} />
          <stop offset="100%" stopColor={p.centre} />
        </radialGradient>
      </defs>
      {ring(7, 27, 19, 15, 8, `url(#${uid}ro)`, "o")}
      {ring(6, 17, 14, 11, 38, `url(#${uid}rm)`, "m")}
      <circle cx="50" cy="50" r="14" fill={`url(#${uid}rc)`} />
      <path d="M43 47 C45 40 56 40 57 48 C58 55 49 58 45 53 C42 49 46 45 50 46 C53 47 53 51 50 52" fill="none" stroke={p.centre} strokeOpacity=".75" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M38 44 C40 36 50 33 56 37" fill="none" stroke={p.light} strokeOpacity=".55" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M60 56 C58 62 50 65 44 62" fill="none" stroke={p.light} strokeOpacity=".4" strokeWidth="1.1" strokeLinecap="round" />
    </g>
  )
}

function Peony({ p, uid }: { p: (typeof FLOWER_PALETTE)[LetterFlower]; uid: string }) {
  const ring = (n: number, r: number, size: number, fill: string, offset = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + offset
      return <circle key={`${r}-${i}`} cx={50 + Math.cos(a) * r} cy={50 + Math.sin(a) * r} r={size} fill={fill} stroke={p.deep} strokeOpacity=".18" strokeWidth=".6" />
    })
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}pg`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="100%" stopColor={p.petal} />
        </radialGradient>
      </defs>
      {ring(9, 30, 15, p.petal)}
      {ring(8, 20, 13, `url(#${uid}pg)`, 0.4)}
      {ring(6, 10, 11, p.light, 0.2)}
      <circle cx="50" cy="50" r="9" fill={p.light} />
      {ring(5, 4, 4, p.deep, 0.5)}
    </g>
  )
}

function Sunflower({ p }: { p: (typeof FLOWER_PALETTE)[LetterFlower] }) {
  const petals = (n: number, len: number, fill: string, offset: number) =>
    Array.from({ length: n }, (_, i) => (
      <path key={`${len}-${i}`} transform={`rotate(${(i * 360) / n + offset} 50 50)`} d={`M50 50 C46 ${50 - len * 0.4} 47 ${50 - len * 0.85} 50 ${50 - len} C53 ${50 - len * 0.85} 54 ${50 - len * 0.4} 50 50Z`} fill={fill} stroke={p.deep} strokeOpacity=".35" strokeWidth=".5" />
    ))
  return (
    <g>
      {petals(18, 46, p.deep, 10)}
      {petals(18, 42, p.petal, 0)}
      <circle cx="50" cy="50" r="17" fill={p.centre} />
      <circle cx="50" cy="50" r="17" fill="none" stroke="#2b170a" strokeWidth="2" />
      {Array.from({ length: 34 }, (_, i) => {
        const a = i * 2.4
        const r = Math.sqrt(i) * 2.6
        return <circle key={i} cx={50 + Math.cos(a) * r} cy={50 + Math.sin(a) * r} r=".9" fill="#7a4b20" />
      })}
    </g>
  )
}

function Lavender({ p }: { p: (typeof FLOWER_PALETTE)[LetterFlower] }) {
  return (
    <g>
      <path d="M50 98 C50 70 52 40 50 6" stroke={LEAF.base} strokeWidth="1.6" fill="none" />
      {Array.from({ length: 16 }, (_, i) => {
        const y = 10 + i * 4.3
        const side = i % 2 ? 1 : -1
        const fill = i % 3 === 0 ? p.deep : i % 3 === 1 ? p.petal : p.light
        return <ellipse key={i} cx={50 + side * (2.4 + (i % 4) * 0.4)} cy={y} rx="3.4" ry="2.2" transform={`rotate(${side * 30} ${50 + side * 3} ${y})`} fill={fill} />
      })}
    </g>
  )
}

function Hibiscus({ p, uid }: { p: (typeof FLOWER_PALETTE)[LetterFlower]; uid: string }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}hg`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor={p.centre} />
          <stop offset="30%" stopColor={p.deep} />
          <stop offset="100%" stopColor={p.petal} />
        </radialGradient>
      </defs>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} transform={`rotate(${a} 50 50)`} d="M50 50 C34 40 26 14 42 6 C48 3 52 6 54 4 C70 8 66 38 50 50Z" fill={`url(#${uid}hg)`} stroke={p.deep} strokeOpacity=".3" strokeWidth=".6" />
      ))}
      <path d="M50 50 L66 26" stroke={p.light} strokeWidth="2" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={63 + i * 1.2} cy={24 + (i % 2) * 2} r="1.4" fill="#f6c945" />
      ))}
    </g>
  )
}

export function Flower({ kind, className, style, ...rest }: { kind: LetterFlower } & Svg) {
  const uid = useId().replace(/:/g, "")
  const p = FLOWER_PALETTE[kind]
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className} style={style} {...rest}>
      {kind === "roses" ? <Rose p={p} uid={uid} /> : kind === "peonies" ? <Peony p={p} uid={uid} /> : kind === "sunflowers" ? <Sunflower p={p} /> : kind === "lavender" ? <Lavender p={p} /> : <Hibiscus p={p} uid={uid} />}
    </svg>
  )
}

/** A single leaf with a midrib. */
export function Leaf({ className, style, tone = 0 }: { className?: string; style?: CSSProperties; tone?: number }) {
  const fill = [LEAF.base, LEAF.light, LEAF.sage, LEAF.dark][tone % 4]
  return (
    <svg viewBox="0 0 100 40" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M2 20 C24 2 64 0 98 20 C64 40 24 38 2 20Z" fill={fill} />
      <path d="M2 20 C24 2 64 0 98 20 C64 40 24 38 2 20Z" fill="none" stroke={LEAF.dark} strokeOpacity=".25" strokeWidth=".8" />
      <path d="M4 20 C40 18 70 18 96 20" stroke={LEAF.dark} strokeOpacity=".35" strokeWidth="1" fill="none" />
    </svg>
  )
}

/** A spray of leaves on a curved stem; `variant` mixes eucalyptus rounds with pointed leaves. */
export function Foliage({ variant = 0, className, style }: { variant?: number; className?: string; style?: CSSProperties }) {
  const round = variant % 2 === 0
  const at = (t: number) => {
    // Point on the stem curve M8 92 Q30 30 94 10.
    const x = (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * 30 + t * t * 94
    const y = (1 - t) * (1 - t) * 92 + 2 * (1 - t) * t * 30 + t * t * 10
    return { x, y }
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M8 92 Q30 30 94 10" stroke={LEAF.dark} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {Array.from({ length: 8 }, (_, i) => {
        const t = (i + 1) / 9
        const { x, y } = at(t)
        const side = i % 2 ? 1 : -1
        const fill = i % 3 === 0 ? LEAF.light : i % 3 === 1 ? LEAF.base : LEAF.sage
        const size = 1.1 - t * 0.45
        return round ? (
          <ellipse key={i} cx={x + side * 5 * size} cy={y + side * 5 * size} rx={7.5 * size} ry={6.5 * size} fill={fill} stroke={LEAF.dark} strokeOpacity=".25" strokeWidth=".5" />
        ) : (
          <path key={i} transform={`translate(${x} ${y}) rotate(${side * 60 - 40}) scale(${size})`} d="M0 0 C6 -5 17 -5 24 0 C17 5 6 5 0 0Z" fill={fill} stroke={LEAF.dark} strokeOpacity=".25" strokeWidth=".5" />
        )
      })}
    </svg>
  )
}

/** Tiny white filler flowers (jasmine / baby's breath), scattered with no visible stems. */
export function Filler({ className, style }: { className?: string; style?: CSSProperties }) {
  const dots = [
    [22, 30, 1], [36, 20, 0.8], [48, 34, 1.1], [30, 48, 0.9], [60, 22, 0.8], [64, 44, 1], [46, 56, 0.85], [74, 32, 0.7], [20, 62, 0.8], [56, 70, 0.9],
  ]
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className} style={style}>
      {dots.map(([x, y, k], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
          {i % 3 === 0 && <ellipse cx="4" cy="5" rx="3.2" ry="1.4" transform="rotate(35 4 5)" fill={LEAF.light} />}
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-2.8" rx="1.8" ry="2.8" transform={`rotate(${a + i * 11})`} fill="#fffaf1" stroke="#e9dcc6" strokeWidth=".3" />
          ))}
          <circle r="1.1" fill="#f0cf7e" />
        </g>
      ))}
    </svg>
  )
}

/**
 * A corner arrangement, built like a florist would: leaves first, then a focal bloom, supporting
 * blooms, buds and filler. `flip` mirrors it for the opposite corner.
 */
export function Arrangement({ kind, className, flip = false, style }: { kind: LetterFlower; className?: string; flip?: boolean; style?: CSSProperties }) {
  const tall = kind === "lavender"
  const shadow = "drop-shadow-[0_6px_8px_rgb(50_25_15/0.28)]"
  return (
    <div aria-hidden="true" className={cn("aspect-square", className)} style={{ ...style, transform: `${style?.transform ?? ""} ${flip ? "scaleX(-1)" : ""}` }}>
      <div className="relative size-full">
        <Leaf tone={0} className="absolute top-[6%] left-[44%] w-[46%] rotate-[18deg]" />
        <Leaf tone={1} className="absolute top-[52%] left-[2%] w-[40%] rotate-[100deg]" />
        <Leaf tone={2} className="absolute top-[38%] left-[48%] w-[38%] rotate-[48deg]" />
        <Leaf tone={3} className="absolute top-[-2%] left-[-4%] w-[38%] -rotate-[28deg]" />
        <Foliage variant={0} className="absolute top-[30%] left-[36%] w-[56%] rotate-[28deg]" />
        <Foliage variant={1} className="absolute top-[-6%] left-[30%] w-[50%] -rotate-[6deg]" />
        <Filler className="absolute top-[40%] left-[38%] w-[40%] rotate-12" />
        <Filler className="absolute top-[6%] left-[56%] w-[30%] -rotate-12" />
        {tall ? (
          <>
            <Flower kind={kind} className="absolute top-[-14%] left-[18%] w-[40%] rotate-[24deg]" />
            <Flower kind={kind} className="absolute top-[-4%] left-[36%] w-[40%] rotate-[44deg]" />
            <Flower kind={kind} className="absolute top-[6%] left-[2%] w-[36%] rotate-[8deg]" />
            <Flower kind={kind} className="absolute top-[18%] left-[30%] w-[34%] rotate-[62deg]" />
          </>
        ) : (
          <>
            <Flower kind={kind} className={cn("absolute top-[44%] left-[10%] w-[30%] rotate-[40deg]", shadow)} />
            <Flower kind={kind} className={cn("absolute top-[16%] left-[48%] w-[34%] -rotate-[20deg]", shadow)} />
            <Flower kind={kind} className={cn("lt-sway absolute top-[4%] left-[6%] w-[48%]", shadow)} />
            <Flower kind={kind} className={cn("absolute top-[50%] left-[44%] w-[18%] rotate-[70deg] opacity-95", shadow)} />
            <Flower kind={kind} className={cn("absolute top-[-6%] left-[54%] w-[20%] rotate-[10deg] opacity-95", shadow)} />
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Envelope & seal

export function WaxSeal({ colour, className, style }: { colour: string; className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className} style={style}>
      <defs>
        <radialGradient id={`${uid}ws`} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".35" />
          <stop offset="40%" stopColor={colour} />
          <stop offset="100%" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
      </defs>
      <path d="M50 4 C62 6 66 2 76 10 C86 16 92 24 94 36 C98 48 94 56 96 66 C92 80 82 90 68 94 C58 98 48 94 38 97 C24 94 12 86 7 72 C3 62 6 52 3 42 C6 28 14 16 26 9 C34 4 42 7 50 4Z" fill={colour} />
      <path d="M50 4 C62 6 66 2 76 10 C86 16 92 24 94 36 C98 48 94 56 96 66 C92 80 82 90 68 94 C58 98 48 94 38 97 C24 94 12 86 7 72 C3 62 6 52 3 42 C6 28 14 16 26 9 C34 4 42 7 50 4Z" fill={`url(#${uid}ws)`} />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="2" />
      <circle cx="50" cy="50" r="29" fill="none" stroke="#fff" strokeOpacity=".15" strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} cx="50" cy="38" rx="6" ry="11" transform={`rotate(${a} 50 50)`} fill="none" stroke="#000" strokeOpacity=".3" strokeWidth="1.6" />
      ))}
      <circle cx="50" cy="50" r="4" fill="#000" fillOpacity=".25" />
    </svg>
  )
}

/** Gold filigree for a corner of the letter. Rotate the wrapper for each corner. */
export function GoldCorner({ className, style }: { className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true" focusable="false" className={className} style={style}>
      <defs>
        <linearGradient id={`${uid}gc`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3dd9b" />
          <stop offset="50%" stopColor="#c99a3c" />
          <stop offset="100%" stopColor="#8e6420" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${uid}gc)`} strokeWidth="1.3" strokeLinecap="round">
        <path d="M4 56 L4 12 Q4 4 12 4 L56 4" />
        <path d="M9 50 L9 16 Q9 9 16 9 L50 9" strokeWidth=".7" />
        <path d="M14 14 C22 8 30 18 22 22 C16 25 14 18 19 17" />
        <path d="M14 14 C8 22 18 30 22 22" />
        <path d="M24 9 C28 14 34 12 36 9" />
        <path d="M9 24 C14 28 12 34 9 36" />
        <circle cx="40" cy="9" r="1.4" fill="#c99a3c" />
        <circle cx="9" cy="40" r="1.4" fill="#c99a3c" />
      </g>
    </svg>
  )
}

/** Butterfly whose wings flap via CSS (see letter.css). */
export function Butterfly({ colour, className, style }: { colour: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 40 30" aria-hidden="true" focusable="false" className={className} style={style}>
      <g className="lt-wing-l" style={{ transformOrigin: "20px 15px" }}>
        <path d="M20 15 C12 2 2 2 3 10 C4 16 12 16 20 15Z" fill={colour} />
        <path d="M20 15 C12 18 6 26 11 27 C15 28 18 22 20 15Z" fill={colour} opacity=".8" />
      </g>
      <g className="lt-wing-r" style={{ transformOrigin: "20px 15px" }}>
        <path d="M20 15 C28 2 38 2 37 10 C36 16 28 16 20 15Z" fill={colour} />
        <path d="M20 15 C28 18 34 26 29 27 C25 28 22 22 20 15Z" fill={colour} opacity=".8" />
      </g>
      <rect x="19.2" y="8" width="1.6" height="15" rx=".8" fill="#3b2a24" />
    </svg>
  )
}

// ---------------------------------------------------------------- Moment objects

/** One object per moment, for the table and the studio. */
export function MomentObject({ id, accent, className, style }: { id: MomentId; accent: string; className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/:/g, "")
  const common = { viewBox: "0 0 100 100", "aria-hidden": true, focusable: false, className, style } as const
  switch (id) {
    case "letter":
      return (
        <svg {...common}>
          <g transform="rotate(-6 50 50)">
            <rect x="12" y="26" width="76" height="50" rx="2" fill="#f7f1e6" stroke="#d9cdb8" />
            <path d="M12 27 L50 56 L88 27" fill="#efe6d6" stroke="#d9cdb8" />
            <path d="M12 76 L42 52 M88 76 L58 52" stroke="#e2d7c3" />
            <circle cx="50" cy="55" r="8" fill={accent} />
            <circle cx="50" cy="55" r="5" fill="none" stroke="#000" strokeOpacity=".25" />
          </g>
        </svg>
      )
    case "reasons":
      return (
        <svg {...common}>
          <path d="M34 54 L50 96 L66 54Z" fill="#c9a57a" stroke="#a88457" />
          <path d="M38 56 L50 92 L56 60Z" fill="#b8925f" opacity=".6" />
          <path d="M44 74 Q50 70 56 74 M44 74 L40 82 M56 74 L60 84" stroke="#f3e7d2" strokeWidth="1.6" fill="none" />
          {[
            [36, 36, LEAF.base], [62, 34, LEAF.sage], [50, 46, LEAF.light],
          ].map(([x, y, c], i) => <ellipse key={i} cx={x as number} cy={y as number} rx="9" ry="6" fill={c as string} transform={`rotate(${i * 40 - 30} ${x} ${y})`} />)}
          <circle cx="42" cy="30" r="10" fill="#fffaf1" stroke="#e8dccb" />
          <circle cx="60" cy="26" r="9" fill="#fffaf1" stroke="#e8dccb" />
          <circle cx="52" cy="40" r="11" fill="#fdf6ea" stroke="#e8dccb" />
          <circle cx="52" cy="40" r="3" fill="#f0d488" />
          <circle cx="42" cy="30" r="2.6" fill="#f0d488" />
          <circle cx="60" cy="26" r="2.4" fill="#f0d488" />
          <circle cx="34" cy="44" r="6" fill={accent} opacity=".85" />
          <circle cx="68" cy="42" r="5" fill={accent} opacity=".7" />
        </svg>
      )
    case "story":
      return (
        <svg {...common}>
          <rect x="24" y="10" width="52" height="80" rx="3" fill="#7d8f73" stroke="#5c6b54" />
          <rect x="26" y="12" width="6" height="76" fill="#6b7c62" />
          <rect x="70" y="14" width="8" height="72" rx="1" fill="#f3ead9" />
          <rect x="38" y="30" width="28" height="18" rx="1" fill="none" stroke="#c9d1bf" strokeOpacity=".6" />
          <path d="M60 10 L60 96 L64 90 L68 96 L68 10" fill={accent} />
        </svg>
      )
    case "photos":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id={`${uid}ph`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e8c88e" />
              <stop offset="60%" stopColor="#b98758" />
              <stop offset="100%" stopColor="#6e4b33" />
            </linearGradient>
          </defs>
          <g transform="rotate(-10 50 50)"><rect x="18" y="16" width="52" height="62" rx="1.5" fill="#fbf8f2" stroke="#e1d8c8" /><rect x="23" y="21" width="42" height="40" fill="#cdb79a" /></g>
          <g transform="rotate(8 50 50)"><rect x="30" y="18" width="52" height="62" rx="1.5" fill="#fffdf8" stroke="#e1d8c8" /><rect x="35" y="23" width="42" height="40" fill={`url(#${uid}ph)`} /><circle cx="64" cy="34" r="5" fill="#fff6d8" opacity=".8" /></g>
        </svg>
      )
    case "date":
      return (
        <svg {...common}>
          <rect x="22" y="16" width="56" height="74" rx="3" fill="#fbf7ef" stroke="#ddd2bf" />
          <rect x="22" y="16" width="56" height="18" rx="3" fill={accent} />
          <rect x="38" y="8" width="24" height="12" rx="2" fill="#a88a5a" stroke="#7d6540" />
          <path d="M30 50 H70 M30 60 H70 M30 70 H58" stroke="#e5dccb" strokeWidth="2" />
        </svg>
      )
    case "places":
      return (
        <svg {...common}>
          <path d="M10 24 L36 16 L64 24 L90 16 L90 78 L64 86 L36 78 L10 86Z" fill="#e7dcc5" stroke="#c7b893" />
          <path d="M36 16 L36 78 M64 24 L64 86" stroke="#cdbd99" />
          <path d="M18 66 C30 50 44 62 54 44 S76 36 82 30" stroke={accent} strokeWidth="1.6" strokeDasharray="3 3" fill="none" />
          <circle cx="70" cy="62" r="11" fill="#d8c08a" stroke="#8e7445" strokeWidth="1.6" />
          <path d="M70 54 L73 62 L70 70 L67 62Z" fill={accent} />
        </svg>
      )
    case "wishes":
      return (
        <svg {...common}>
          <path d="M50 98 C52 80 48 62 50 46" stroke={LEAF.base} strokeWidth="1.6" fill="none" />
          <circle cx="50" cy="34" r="20" fill="#fffdf8" opacity=".35" />
          {Array.from({ length: 22 }, (_, i) => {
            const a = (i / 22) * Math.PI * 2
            return <line key={i} x1="50" y1="34" x2={50 + Math.cos(a) * 18} y2={34 + Math.sin(a) * 18} stroke="#c9c2b5" strokeWidth=".7" />
          })}
          {Array.from({ length: 22 }, (_, i) => {
            const a = (i / 22) * Math.PI * 2
            return <circle key={i} cx={50 + Math.cos(a) * 19} cy={34 + Math.sin(a) * 19} r="1.6" fill="#fffaf2" stroke="#d8d1c4" strokeWidth=".4" />
          })}
          <circle cx="50" cy="34" r="3" fill="#b9ad95" />
        </svg>
      )
    case "song":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="42" fill="#1d1a1a" />
          {[36, 30, 24].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#3a3535" strokeWidth=".8" />)}
          <path d="M22 30 A34 34 0 0 1 44 16" stroke="#fff" strokeOpacity=".18" strokeWidth="3" fill="none" />
          <circle cx="50" cy="50" r="13" fill={accent} />
          <circle cx="50" cy="50" r="2" fill="#f4ede0" />
        </svg>
      )
  }
}

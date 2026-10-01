import { useMemo } from "react"
import { motion, useReducedMotion } from "motion/react"

const DEFAULT_COLORS = ["var(--brand)", "var(--gold)", "oklch(0.75 0.12 10)", "oklch(0.7 0.1 160)", "oklch(0.95 0.01 85)"]

/**
 * Lightweight DOM confetti: a single burst, no flashing, no loop (MOT 03).
 * Decorative only — hidden from assistive technology and skipped under reduced motion.
 */
export function Confetti({ count = 70, colors = DEFAULT_COLORS, origin = { x: 50, y: 45 }, spread = 1 }: { count?: number; colors?: string[]; origin?: { x: number; y: number }; spread?: number }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
        const velocity = (180 + Math.random() * 260) * spread
        return {
          id: i,
          color: colors[i % colors.length],
          x: Math.cos(angle) * velocity,
          y: Math.sin(angle) * velocity * 0.75 - 160 * spread,
          rotate: (Math.random() - 0.5) * 720,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 10,
          delay: Math.random() * 0.12,
          round: i % 5 === 0,
          duration: 1.6 + Math.random() * 1,
        }
      }),
    [count, colors, spread],
  )
  if (reduce) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute block"
          style={{ left: `${origin.x}%`, top: `${origin.y}%`, width: p.w, height: p.round ? p.w : p.h, background: p.color, borderRadius: p.round ? 999 : 2 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.6 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 320], rotate: p.rotate, opacity: [1, 1, 0], scale: 1 }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.45, 1] }}
        />
      ))}
    </div>
  )
}

import { useId, useMemo, useState } from "react"
import { cn } from "cn"

export interface ColumnDatum {
  key: string
  /** Short axis label (e.g. "3 Oct"). */
  label: string
  value: number
  /** Formatted value for tooltips and the table. */
  display: string
}

function niceMax(max: number) {
  if (max <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(max))
  const f = max / exp
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp
}

/**
 * Single-series column chart: one validated hue (--chart-mark), ≤24px columns with 4px rounded
 * caps on a shared baseline, hairline recessive grid, per-column hover/focus tooltip, and a table
 * view so the values never depend on the graphic.
 */
export function ColumnChart({ data, title, formatTick, height = 200, className }: { data: ColumnDatum[]; title: string; formatTick: (n: number) => string; height?: number; className?: string }) {
  const [active, setActive] = useState<number | null>(null)
  const id = useId()
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data])
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(data.length / 5)
  return (
    <figure className={cn("flex flex-col gap-3", className)} aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="sr-only">{title}</figcaption>
      <div className="flex gap-3" style={{ height }}>
        <div className="text-muted-foreground tabular flex w-12 shrink-0 flex-col-reverse justify-between pb-5 text-right text-[0.6875rem]" aria-hidden="true">
          {ticks.map((t) => <span key={t} className="-translate-y-1/2 leading-none">{formatTick(t)}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 bottom-5" aria-hidden="true">
            {ticks.map((t) => <span key={t} className="border-border absolute inset-x-0 border-t" style={{ bottom: `${(t / max) * 100}%` }} />)}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-5 flex items-end" role="list">
            {data.map((d, i) => {
              const h = (d.value / max) * 100
              return (
                <div
                  key={d.key}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${d.label}: ${d.display}`}
                  className="group/col relative flex h-full flex-1 items-end justify-center outline-none"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <span className={cn("bg-chart-mark w-full max-w-6 rounded-t-[4px] transition-opacity duration-150", active !== null && active !== i && "opacity-40")} style={{ height: d.value > 0 ? `max(${h}%, 2px)` : 0, marginInline: 1 }} />
                  {active === i && (
                    <span className="bg-popover text-popover-foreground shadow-float pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap" style={{ bottom: `${h}%` }}>
                      <span className="text-muted-foreground block">{d.label}</span>
                      <span className="tabular font-semibold">{d.display}</span>
                    </span>
                  )}
                  <span className="text-muted-foreground absolute -bottom-5 text-[0.6875rem] whitespace-nowrap" aria-hidden="true">{i % labelEvery === 0 ? d.label : ""}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <details className="text-sm">
        <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs">View as table</summary>
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-muted-foreground text-left"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">{title}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.key} className="border-t"><td className="py-1">{d.label}</td><td className="tabular py-1 text-right">{d.display}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}

/** Horizontal share bars for a small breakdown (e.g. orders by source). Values are always printed. */
export function ShareBars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm"><span>{r.label}</span><span className="tabular font-medium">{r.display}</span></div>
          <div className="bg-muted h-2 rounded-full"><div className="bg-chart-mark h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

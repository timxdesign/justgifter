import { cn } from "cn"

/** The JustGifter bow: two ribbon loops and tails, drawn to sit on a text baseline. */
export function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-7", className)} {...props}>
      <rect x="2" y="2" width="28" height="28" rx="9" className="fill-brand" />
      <path
        d="M16 15.2c-1.6-3.6-6.4-5.6-7.6-3.3-1.1 2.1 2.9 3.6 7.6 3.3Zm0 0c1.6-3.6 6.4-5.6 7.6-3.3 1.1 2.1-2.9 3.6-7.6 3.3Z"
        className="stroke-brand-foreground"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M16 15.4 12.2 23M16 15.4l3.8 7.6" className="stroke-brand-foreground" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="15.3" r="1.7" className="fill-brand-foreground" />
    </svg>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-[1.375rem] leading-none font-semibold tracking-tight">
          Just<span className="font-display-wonk italic">Gifter</span>
        </span>
      )}
    </span>
  )
}

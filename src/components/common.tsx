import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { cn } from "cn"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { CheckIcon, CopyIcon, DangerTriangleIcon, RefreshIcon, MinusIcon, AddCircleIcon } from "@/components/icons"
import { errorMessage } from "@/api/errors"
import { srcSet } from "@/lib/format"
import type { StatusTone } from "@domain/index.ts"

// ---------------------------------------------------------------- Layout

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8", className)} {...props} />
}

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex max-w-2xl flex-col gap-2">
        {eyebrow && <p className="eyebrow text-brand-text">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-medium sm:text-4xl">{title}</h1>
        {description && <p className="text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeading({ eyebrow, title, description, action, className, id }: { eyebrow?: string; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex max-w-2xl flex-col gap-2">
        {eyebrow && <p className="eyebrow text-brand-text">{eyebrow}</p>}
        <h2 id={id} className="font-display text-[1.75rem] leading-tight font-medium sm:text-4xl">
          {title}
        </h2>
        {description && <p className="text-muted-foreground text-pretty sm:text-lg">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------- Images

/** Image with lazy loading, responsive sources and a soft fade-in once decoded. */
export function Img({ src, alt, className, eager, sizes = "(min-width: 1024px) 33vw, 50vw", ...props }: React.ComponentProps<"img"> & { eager?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={src}
      srcSet={src ? srcSet(src) : undefined}
      sizes={sizes}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : undefined}
      ref={(el) => {
        // Cached images can finish before React attaches onLoad.
        if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true)
      }}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      className={cn("bg-muted object-cover transition-opacity duration-500 ease-out", loaded ? "opacity-100" : "opacity-0", className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------- States

export function ErrorState({ error, retry, title = "This didn't load", className }: { error: unknown; retry?: () => void; title?: string; className?: string }) {
  return (
    <Empty className={cn("border border-dashed", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <DangerTriangleIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {retry && (
        <EmptyContent>
          <Button variant="outline" onClick={retry}>
            <RefreshIcon data-icon="inline-start" />
            Try again
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

export function EmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Empty className={cn("border border-dashed bg-card/50", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle className="font-display text-xl">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export function CardGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <Container className="flex flex-col gap-6 py-12" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-5 w-1/2" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </Container>
  )
}

// ---------------------------------------------------------------- Status

const TONE_VARIANT: Record<StatusTone, "muted" | "info" | "success" | "warning" | "danger"> = {
  neutral: "muted",
  progress: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
}

/** Status badge with a shape cue as well as colour (never colour alone). */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <Badge variant={TONE_VARIANT[tone]} className={cn("h-6 gap-1.5 px-2.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 bg-current",
          tone === "success" ? "rounded-full" : tone === "danger" ? "rotate-45 rounded-[1px]" : tone === "warning" ? "rounded-[1px]" : "rounded-full opacity-70",
        )}
      />
      {children}
    </Badge>
  )
}

// ---------------------------------------------------------------- Inputs & actions

export function CopyButton({ value, label = "Copy link", className, variant = "outline", size = "default" }: { value: string; label?: string; className?: string; variant?: "outline" | "secondary" | "ghost" | "default"; size?: "default" | "sm" | "lg" }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
        } catch {
          toast.error("Couldn't copy. Select the link and copy it manually.")
        }
      }}
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  )
}

export function QuantityStepper({ value, onChange, min = 1, max = 20, label = "Quantity", size = "default" }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label?: string; size?: "default" | "sm" }) {
  const h = size === "sm" ? "h-8" : "h-11"
  return (
    <div role="group" aria-label={label} className={cn("bg-card shadow-border inline-flex items-center rounded-xl", h)}>
      <button type="button" className={cn("press grid aspect-square place-items-center rounded-l-xl hover:bg-muted disabled:opacity-40", h)} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}>
        <MinusIcon className="size-4" />
      </button>
      <output aria-live="polite" className="tabular min-w-8 text-center text-sm font-medium">
        {value}
      </output>
      <button type="button" className={cn("press grid aspect-square place-items-center rounded-r-xl hover:bg-muted disabled:opacity-40", h)} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}>
        <AddCircleIcon className="size-4" />
      </button>
    </div>
  )
}

export function Countdown({ until, onExpire, className }: { until: string; onExpire?: () => void; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, new Date(until).getTime() - now)
  useEffect(() => {
    if (left === 0) onExpire?.()
  }, [left, onExpire])
  const m = Math.floor(left / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return (
    <time className={cn("tabular", className)} dateTime={until}>
      {m}:{String(s).padStart(2, "0")}
    </time>
  )
}

export function TextLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return <Link className={cn("font-medium underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground", className)} {...props} />
}

export function KeyValue({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 text-sm", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

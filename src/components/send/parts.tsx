import type { ReactNode } from "react"
import { cn } from "cn"
import { CheckIcon } from "@/components/icons"

/** Pill-shaped choices used across the send studio. */
export function Chip({ selected, onClick, children, icon, multi, disabled }: { selected?: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode; multi?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={multi ? Boolean(selected) : undefined}
      className={cn(
        "press inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-2 text-sm transition-colors disabled:opacity-50",
        selected ? "bg-primary text-primary-foreground" : "bg-card shadow-border hover:shadow-border-hover hover:bg-muted/60",
      )}
    >
      {multi && selected ? <CheckIcon className="size-3.5" /> : icon}
      {children}
    </button>
  )
}

export function ChipRow({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {children}
    </div>
  )
}

/** Large choice used for the opening question. */

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import { StarsIcon, PenIcon, CheckIcon } from "@/components/icons"

const ease = [0.2, 0, 0, 1] as const

export function Appear({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay, ease }}>
      {children}
    </motion.div>
  )
}

/** The assistant's turn: a small mark and the text. */
export function AssistantSays({ children, hint, className, muted }: { children: ReactNode; hint?: ReactNode; className?: string; muted?: boolean }) {
  return (
    <div className={cn("flex gap-3", className)}>
      <span aria-hidden="true" className="bg-brand-soft text-brand-text mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
        <StarsIcon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className={cn("text-pretty", muted ? "text-muted-foreground text-[0.9375rem]" : "font-display text-xl leading-snug font-medium sm:text-2xl")}>{children}</p>
        {hint && <p className="text-muted-foreground text-sm text-pretty">{hint}</p>}
      </div>
    </div>
  )
}

/** The sender's answer, with a way to change it. */
export function SenderSaid({ children, onEdit, editLabel }: { children: ReactNode; onEdit?: () => void; editLabel: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label={editLabel} className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/40 grid size-8 shrink-0 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none">
          <PenIcon className="size-3.5" />
        </button>
      )}
      <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[0.9375rem] whitespace-pre-line">{children}</p>
    </div>
  )
}

/** A selectable option. Single-choice chips answer immediately; multi-choice chips toggle. */
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
export function OptionCard({ title, description, icon, onClick, selected }: { title: string; description: string; icon: ReactNode; onClick: () => void; selected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press group/opt flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-[box-shadow,background-color]",
        selected ? "bg-brand-soft ring-brand ring-2" : "bg-card shadow-border hover:shadow-border-hover",
      )}
    >
      <span className="bg-brand-soft text-brand-text grid size-11 shrink-0 place-items-center rounded-xl [&_svg]:size-5">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-sm">{description}</span>
      </span>
    </button>
  )
}

/** The working area under the assistant's question. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-4 sm:ml-10", className)}>{children}</div>
}

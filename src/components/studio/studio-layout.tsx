import type { ReactNode } from "react"
import { Link } from "react-router"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { AltArrowLeftIcon, ArrowLeftIcon, CheckIcon, EyeIcon, RestartIcon } from "@/components/icons"

/**
 * The studio frame shared by the letter studio and the send-a-gift studio: a stepper across the
 * top, the form on the left with a sticky action bar, and the live preview on the right. On
 * narrow screens the preview moves behind a "Preview" button in the action bar.
 */

export interface StudioStepDef {
  id: string
  label: string
}

export function StudioLayout({
  steps,
  current,
  finished,
  onStep,
  startOver,
  preview,
  actionBar,
  children,
}: {
  steps: StudioStepDef[]
  current: string
  /** Everything's done (sent, or handed to checkout): the stepper shows all steps complete. */
  finished?: boolean
  onStep: (id: string) => void
  startOver?: { title: string; description: string; onConfirm: () => void }
  preview: ReactNode
  actionBar?: ReactNode
  children: ReactNode
}) {
  const index = steps.findIndex((s) => s.id === current)
  return (
    <div className="bg-background min-h-dvh">
      <header className="bg-background/85 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-8">
          <Button variant="outline" size="sm" className="eyebrow h-9 shrink-0 rounded-full px-2.5 tracking-[0.18em] sm:px-3" asChild>
            <Link to="/" aria-label="Home">
              <AltArrowLeftIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </Button>
          <Stepper steps={steps} index={finished ? steps.length : index} onStep={onStep} />
          {startOver && !finished && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="shrink-0" aria-label="Start over">
                  <RestartIcon data-icon="inline-start" />
                  <span className="hidden sm:inline">Start over</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{startOver.title}</AlertDialogTitle>
                  <AlertDialogDescription>{startOver.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep going</AlertDialogCancel>
                  <AlertDialogAction onClick={startOver.onConfirm}>Start over</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <main id="main" className="relative min-w-0">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96 opacity-70" style={{ background: "radial-gradient(60% 70% at 40% 0%, color-mix(in oklch, var(--brand) 14%, transparent), transparent)" }} />
          <div className="relative mx-auto flex w-full max-w-[44rem] flex-col gap-10 px-4 pt-8 pb-36 sm:px-10 sm:pt-14">{children}</div>
          {actionBar && (
            <div data-studio-actions className="pointer-events-none sticky bottom-0 z-20 px-3 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4" style={{ background: "linear-gradient(to top, var(--background) 55%, transparent)" }}>
              <div className="bg-card pointer-events-auto mx-auto flex w-full max-w-[42rem] items-center justify-between gap-2 rounded-full p-1.5 shadow-[var(--shadow-float)]">{actionBar}</div>
            </div>
          )}
        </main>
        <aside className="hidden border-l lg:block">
          <div className="sticky top-16 h-[calc(100dvh-4rem)] p-6 xl:p-8">{preview}</div>
        </aside>
      </div>
    </div>
  )
}

/** Numbered, labelled steps. Earlier steps are links back; the current one fills as you arrive. */
function Stepper({ steps, index, onStep }: { steps: StudioStepDef[]; index: number; onStep: (id: string) => void }) {
  const reduce = useReducedMotion()
  return (
    <nav aria-label="Steps" className="flex min-w-0 flex-1">
      <ol className="flex w-full gap-1.5">
        {steps.map((s, i) => {
          const done = i < index
          const current = i === index
          const reachable = i < index && index < steps.length
          return (
            <li key={s.id} className="flex min-w-0 flex-1">
              <button type="button" disabled={!reachable} onClick={() => onStep(s.id)} aria-current={current ? "step" : undefined} className="group flex w-full min-w-0 flex-col gap-1.5 py-2 text-left disabled:cursor-default">
                <span className="bg-muted relative block h-1.5 w-full overflow-hidden rounded-full">
                  <motion.span className={cn("absolute inset-y-0 left-0 block rounded-full", done ? "bg-brand/55" : "bg-brand", reachable && "group-hover:bg-brand/80")} initial={false} animate={{ width: done || current ? "100%" : "0%" }} transition={{ duration: reduce ? 0 : 0.6, ease: [0.2, 0, 0, 1] }} />
                </span>
                <span className={cn("hidden items-center gap-1.5 truncate text-[0.6875rem] font-semibold tracking-[0.16em] uppercase md:flex", current ? "text-foreground" : done ? "text-brand-text" : "text-muted-foreground")}>
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded-full text-[0.5625rem] tracking-normal tabular-nums", done ? "bg-brand text-brand-foreground" : current ? "bg-foreground text-background" : "bg-muted")}>{done ? <CheckIcon className="size-2.5" /> : i + 1}</span>
                  {s.label}
                </span>
                <span className="sr-only">{`${s.label}${done ? " (done)" : current ? " (current)" : ""}`}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Back, an optional Preview (narrow screens), and the primary action. */
export function StudioActionBar({ onBack, backDisabled, onPreview, children }: { onBack: () => void; backDisabled?: boolean; onPreview?: () => void; children: ReactNode }) {
  return (
    <>
      <Button variant="outline" size="lg" className="rounded-full max-sm:px-3" onClick={onBack} disabled={backDisabled} aria-label="Back">
        <ArrowLeftIcon data-icon="inline-start" />
        <span className="max-sm:hidden">Back</span>
      </Button>
      {onPreview && (
        <Button variant="outline" size="lg" className="rounded-full lg:hidden" onClick={onPreview}>
          <EyeIcon data-icon="inline-start" />
          Preview
        </Button>
      )}
      {children}
    </>
  )
}

export function StepHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span aria-hidden="true" className="bg-brand h-0.5 w-12 rounded-full" />
      <h1 className="font-display text-[clamp(2.1rem,5vw,3.75rem)] leading-[1.02] font-medium tracking-tight text-balance">{title}</h1>
      {children && <p className="text-muted-foreground max-w-xl text-lg text-pretty">{children}</p>}
    </div>
  )
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-2xl italic">{children}</h2>
      {hint && <p className="text-muted-foreground text-sm text-pretty">{hint}</p>}
    </div>
  )
}

export interface FieldProblem {
  field: string
  message: string
}

export function FieldError({ problems, field }: { problems: FieldProblem[]; field: string }) {
  const p = problems.find((x) => x.field === field)
  return p ? (
    <p className="text-destructive text-sm" role="alert" id={`err-${field}`}>
      {p.message}
    </p>
  ) : null
}

/** A hand-drawn underline for the word that matters in a heading. */
export function Underlined({ children }: { children: ReactNode }) {
  return (
    <span className="text-brand-text relative inline-block">
      {children}
      <svg aria-hidden="true" viewBox="0 0 120 14" className="absolute -bottom-2 left-0 w-full" preserveAspectRatio="none">
        <motion.path d="M2 9 C20 2 30 13 48 7 S80 2 96 8 S112 10 118 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.2 }} />
      </svg>
    </span>
  )
}

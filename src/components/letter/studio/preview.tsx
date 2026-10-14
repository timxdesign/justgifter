import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import { LETTER_THEMES, type LetterDesign, type LetterTheme } from "@domain/index.ts"
import type { LetterView } from "@/api"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AltArrowDownIcon, AltArrowUpIcon, CheckIcon, CloseIcon, MaximizeSquareMinimalisticIcon, MonitorIcon, RestartIcon, SmartphoneIcon, SortVerticalIcon } from "@/components/icons"
import { Flower } from "../art"
import { LetterExperience, viewMoments, type LetterPage } from "../experience"
import { letterLook } from "../scene"

export type Device = "phone" | "desktop"
const SIZE: Record<Device, { w: number; h: number; label: string }> = {
  phone: { w: 393, h: 852, label: "Mobile preview" },
  desktop: { w: 1440, h: 900, label: "Desktop preview" },
}

/** Renders children at a fixed CSS size, scaled down to fit the space available. */
function Scaled({ w, h, children, className }: { w: number; h: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(Math.min(el.clientWidth / w, el.clientHeight / h, 1))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h])
  return (
    <div ref={ref} className={cn("grid min-h-0 min-w-0 place-items-center", className)}>
      <div className="relative" style={{ width: w * scale, height: h * scale, visibility: scale ? "visible" : "hidden" }}>
        <div className="absolute top-0 left-0" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative size-full rounded-[3.25rem] bg-[#e3d8c8] p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_40px_80px_-30px_rgb(60_35_20/0.45)]">
      <div className="absolute top-32 -left-[5px] h-16 w-[5px] rounded-l bg-[#cdbfac]" aria-hidden="true" />
      <div className="absolute top-52 -right-[5px] h-24 w-[5px] rounded-r bg-[#cdbfac]" aria-hidden="true" />
      <div className="relative size-full overflow-hidden rounded-[2.6rem] bg-black">{children}</div>
      <div className="absolute bottom-5 left-1/2 h-1.5 w-32 -translate-x-1/2 rounded-full bg-black/25" aria-hidden="true" />
    </div>
  )
}

function BrowserFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col overflow-hidden rounded-2xl bg-[#f5efe6] shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_40px_80px_-30px_rgb(60_35_20/0.45)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/5 px-4" aria-hidden="true">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <span className="ml-4 flex-1 rounded-md bg-black/5 px-3 py-1 text-sm text-black/45">justgifter.com/l/••••••</span>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

/** A tiny, static picture of a theme for the picker and the cover step. */
export function ThemeSwatch({ theme, design, className }: { theme: LetterTheme; design: LetterDesign; className?: string }) {
  const look = letterLook({ ...design, theme })
  return (
    <span aria-hidden="true" className={cn("relative block overflow-hidden rounded-xl", look.surface, className)}>
      {theme === "table" && (
        <>
          <Flower kind={design.flowers} className="absolute -top-[18%] -left-[10%] w-[52%]" />
          <Flower kind={design.flowers} className="absolute -right-[12%] -bottom-[22%] w-[56%] rotate-45" />
          <span className="absolute top-1/2 left-1/2 block h-[38%] w-[46%] -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] rounded-[2px] bg-[#f6efe3] shadow" />
          <span className="absolute top-1/2 left-1/2 block size-[14%] -translate-x-1/2 -translate-y-[10%] rounded-full" style={{ background: look.accent }} />
        </>
      )}
      {theme === "envelope" && (
        <>
          <span className="absolute top-1/2 left-1/2 block h-[44%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-[#fbe4e9] shadow" style={{ clipPath: "polygon(0 0, 50% 50%, 100% 0, 100% 100%, 0 100%)" }} />
          <span className="absolute top-1/2 left-1/2 block size-[14%] -translate-x-1/2 -translate-y-[10%] rounded-full" style={{ background: look.accent }} />
          <span className="absolute top-[14%] right-[14%] text-[10px] text-[#e7a5b4]">✦</span>
          <span className="absolute bottom-[16%] left-[14%] text-[8px] text-[#e7a5b4]">✦</span>
        </>
      )}
      {theme === "celebration" && (
        <>
          <span className="absolute top-[38%] left-1/2 block h-[44%] w-[40%] -translate-x-1/2 rounded-[3px]" style={{ background: look.accent }} />
          <span className="absolute top-[38%] left-1/2 block h-[44%] w-[8%] -translate-x-1/2 bg-[#f3d27a]" />
          <span className="absolute top-[30%] left-1/2 block h-[12%] w-[46%] -translate-x-1/2 rounded-[3px]" style={{ background: look.accent, filter: "brightness(1.15)" }} />
          {["#f6c945", "#e2577b", "#7fc8b6", "#9b83d1"].map((c, i) => (
            <span key={c} className="absolute block h-[6%] w-[3%] rounded-[1px]" style={{ background: c, left: `${14 + i * 22}%`, top: `${10 + (i % 2) * 10}%`, transform: `rotate(${i * 40}deg)` }} />
          ))}
        </>
      )}
    </span>
  )
}

export function ThemePicker({ design, onChange, disabled }: { design: LetterDesign; onChange: (theme: LetterTheme) => void; disabled?: (t: LetterTheme) => string | null }) {
  const [open, setOpen] = useState(false)
  const current = LETTER_THEMES.find((t) => t.id === design.theme)!
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="bg-card shadow-border flex h-12 items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-medium" aria-label={`Theme: ${current.name}. Change theme`}>
          <ThemeSwatch theme={design.theme} design={design} className="size-9 rounded-full" />
          <span className="max-w-[9rem] truncate">{current.name}</span>
          <span className="text-brand-text border-l pl-3 font-semibold">Change</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-3xl p-3">
        <p className="font-display px-2 pt-1 text-xl">How it opens</p>
        <ul className="flex flex-col gap-2">
          {LETTER_THEMES.map((t) => {
            const reason = disabled?.(t.id) ?? null
            const selected = t.id === design.theme
            return (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={Boolean(reason)}
                  onClick={() => {
                    onChange(t.id)
                    setOpen(false)
                  }}
                  aria-pressed={selected}
                  className={cn("flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors disabled:opacity-50", selected ? "bg-brand-soft ring-brand ring-2" : "hover:bg-muted ring-border ring-1")}
                >
                  <ThemeSwatch theme={t.id} design={design} className="aspect-[4/3] w-20 shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-display text-lg leading-tight">{t.name}</span>
                    <span className="text-muted-foreground text-sm leading-snug">{reason ?? t.description}</span>
                  </span>
                  {selected && (
                    <span className="bg-brand text-brand-foreground grid size-7 shrink-0 place-items-center rounded-full">
                      <CheckIcon className="size-4" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="bg-muted text-muted-foreground rounded-2xl px-3 py-2.5 text-sm">Your words, photos and song stay. Only the way the letter opens changes.</p>
      </PopoverContent>
    </Popover>
  )
}

/** The order the preview arrows step through. */
export function previewPages(letter: LetterView): LetterPage[] {
  return ["cover", ...viewMoments(letter.moments), "table"]
}

export function PreviewPane({
  letter,
  page,
  onPage,
  onTheme,
  themeDisabled,
}: {
  letter: LetterView
  page: LetterPage
  onPage: (p: LetterPage) => void
  onTheme: (t: LetterTheme) => void
  themeDisabled?: (t: LetterTheme) => string | null
}) {
  const [device, setDevice] = useState<Device>("phone")
  const [replay, setReplay] = useState(0)
  const [full, setFull] = useState(false)
  const pages = useMemo(() => previewPages(letter), [letter])
  const i = Math.max(0, pages.indexOf(page))
  const size = SIZE[device]
  const restart = () => {
    setReplay((r) => r + 1)
    onPage("cover")
  }
  return (
    <section aria-label="Live preview" className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <ThemePicker design={letter.design} onChange={onTheme} disabled={themeDisabled} />
        <div role="radiogroup" aria-label="Preview size" className="bg-card shadow-border flex gap-0.5 rounded-full p-1">
          {(["phone", "desktop"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={SIZE[d].label} onClick={() => setDevice(d)} className={cn("grid size-10 place-items-center rounded-full transition-colors", device === d ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground")}>
              {d === "phone" ? <SmartphoneIcon className="size-[1.1rem]" /> : <MonitorIcon className="size-[1.1rem]" />}
            </button>
          ))}
        </div>
        <Button variant="outline" size="icon-lg" className="bg-card rounded-full" onClick={restart} aria-label="Replay from the envelope">
          <RestartIcon />
        </Button>
        <Button variant="outline" size="icon-lg" className="bg-card rounded-full" onClick={() => setFull(true)} aria-label="Open full screen">
          <MaximizeSquareMinimalisticIcon />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-4">
        <div className="hidden flex-col gap-2 xl:flex">
          <Button variant="outline" size="icon-lg" className="bg-card rounded-full" disabled={i === 0} onClick={() => onPage(pages[i - 1])} aria-label="Previous part of the letter">
            <AltArrowUpIcon />
          </Button>
          <Button variant="outline" size="icon-lg" className="bg-card rounded-full" disabled={i === pages.length - 1} onClick={() => onPage(pages[i + 1])} aria-label="Next part of the letter">
            <AltArrowDownIcon />
          </Button>
        </div>
        <Scaled w={size.w + (device === "phone" ? 24 : 0)} h={size.h + (device === "phone" ? 24 : 44)} className="size-full flex-1">
          {device === "phone" ? (
            <PhoneFrame>
              <LetterExperience key={replay} letter={letter} mode="preview" page={page} onPageChange={onPage} />
            </PhoneFrame>
          ) : (
            <BrowserFrame>
              <LetterExperience key={replay} letter={letter} mode="preview" page={page} onPageChange={onPage} />
            </BrowserFrame>
          )}
        </Scaled>
      </div>
      <p className="text-muted-foreground mx-auto flex items-center gap-3 rounded-full border px-4 py-1 text-[0.6875rem] font-semibold tracking-[0.2em] uppercase">
        <SortVerticalIcon className="size-3.5 xl:hidden" aria-hidden="true" />
        {size.label}
        <span className="tabular-nums opacity-70">
          {size.w}×{size.h}
        </span>
      </p>
      <FullscreenPreview open={full} onOpenChange={setFull} letter={letter} />
    </section>
  )
}

/** The letter filling the screen, exactly as a recipient on this device would see it. */
export function FullscreenPreview({ open, onOpenChange, letter, title = "Preview" }: { open: boolean; onOpenChange: (open: boolean) => void; letter: LetterView; title?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="h-dvh max-h-none w-screen max-w-none gap-0 rounded-none p-0 ring-0 sm:max-w-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {open && <LetterExperience letter={letter} mode="preview" />}
        <Button variant="outline" className="absolute top-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white/90 text-[#35251f] shadow-lg backdrop-blur hover:bg-white" onClick={() => onOpenChange(false)}>
          <CloseIcon data-icon="inline-start" />
          Close {title.toLowerCase()}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

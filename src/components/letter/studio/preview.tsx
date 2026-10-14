import { useMemo, useState } from "react"
import { cn } from "cn"
import { LETTER_THEMES, type LetterDesign, type LetterTheme } from "@domain/index.ts"
import type { LetterView } from "@/api"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CheckIcon } from "@/components/icons"
import { DevicePreview, FullscreenPreview as FullscreenFrame } from "@/components/studio/device-preview"
import { Flower } from "../art"
import { LetterExperience, viewMoments, type LetterPage } from "../experience"
import { letterLook } from "../scene"

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
  const [full, setFull] = useState(false)
  const pages = useMemo(() => previewPages(letter), [letter])
  const i = Math.max(0, pages.indexOf(page))
  return (
    <>
      <DevicePreview
        toolbar={<ThemePicker design={letter.design} onChange={onTheme} disabled={themeDisabled} />}
        onReplay={() => onPage("cover")}
        onFullscreen={() => setFull(true)}
        prev={{ label: "Previous part of the letter", disabled: i === 0, onClick: () => onPage(pages[i - 1]) }}
        next={{ label: "Next part of the letter", disabled: i === pages.length - 1, onClick: () => onPage(pages[i + 1]) }}
        render={(_, replay) => <LetterExperience key={replay} letter={letter} mode="preview" page={page} onPageChange={onPage} />}
      />
      <FullscreenPreview open={full} onOpenChange={setFull} letter={letter} />
    </>
  )
}

/** The letter filling the screen, exactly as a recipient on this device would see it. */
export function FullscreenPreview({ open, onOpenChange, letter, title = "Preview" }: { open: boolean; onOpenChange: (open: boolean) => void; letter: LetterView; title?: string }) {
  return (
    <FullscreenFrame open={open} onOpenChange={onOpenChange} title={title}>
      <LetterExperience letter={letter} mode="preview" />
    </FullscreenFrame>
  )
}

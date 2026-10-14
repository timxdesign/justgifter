import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AltArrowDownIcon, AltArrowUpIcon, CloseIcon, MaximizeSquareMinimalisticIcon, MonitorIcon, RestartIcon, SmartphoneIcon } from "@/components/icons"

/**
 * The live preview used by every studio (letters, gifts): what the recipient will see, in a phone
 * or a browser window, scaled to fit beside the form. Content inside is laid out with container
 * queries, so it renders exactly as it would on that device whatever the sender's screen is.
 */

export type Device = "phone" | "desktop"
export const DEVICES: Record<Device, { w: number; h: number; label: string }> = {
  phone: { w: 393, h: 852, label: "Mobile preview" },
  desktop: { w: 1440, h: 900, label: "Desktop preview" },
}

/** Renders children at a fixed CSS size, scaled down to fit the space available. */
export function Scaled({ w, h, children, className }: { w: number; h: number; children: ReactNode; className?: string }) {
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

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative size-full rounded-[3.25rem] bg-[#e3d8c8] p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_40px_80px_-30px_rgb(60_35_20/0.45)] dark:bg-[#3a302a]">
      <div className="absolute top-32 -left-[5px] h-16 w-[5px] rounded-l bg-[#cdbfac] dark:bg-[#2c241f]" aria-hidden="true" />
      <div className="absolute top-52 -right-[5px] h-24 w-[5px] rounded-r bg-[#cdbfac] dark:bg-[#2c241f]" aria-hidden="true" />
      <div className="relative size-full overflow-hidden rounded-[2.6rem] bg-black">{children}</div>
      <div className="pointer-events-none absolute bottom-5 left-1/2 h-1.5 w-32 -translate-x-1/2 rounded-full bg-black/25" aria-hidden="true" />
    </div>
  )
}

export function BrowserFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col overflow-hidden rounded-2xl bg-[#f5efe6] shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_40px_80px_-30px_rgb(60_35_20/0.45)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/5 px-4" aria-hidden="true">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <span className="ml-4 flex-1 rounded-md bg-black/5 px-3 py-1 text-sm text-black/45">justgifter.com/••••••</span>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

export interface PreviewStep {
  label: string
  disabled: boolean
  onClick: () => void
}

/**
 * Toolbar (studio-specific controls first, then device, replay and full screen), the framed
 * preview, and optional up/down arrows to step through it.
 */
export function DevicePreview({ toolbar, render, onReplay, onFullscreen, prev, next }: { toolbar?: ReactNode; render: (device: Device, replayKey: number) => ReactNode; onReplay?: () => void; onFullscreen: () => void; prev?: PreviewStep; next?: PreviewStep }) {
  const [device, setDevice] = useState<Device>("phone")
  const [replay, setReplay] = useState(0)
  const size = DEVICES[device]
  return (
    <section aria-label="Live preview" className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {toolbar}
        <div role="radiogroup" aria-label="Preview size" className="bg-card shadow-border flex gap-0.5 rounded-full p-1">
          {(["phone", "desktop"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={DEVICES[d].label} onClick={() => setDevice(d)} className={cn("grid size-10 place-items-center rounded-full transition-colors", device === d ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground")}>
              {d === "phone" ? <SmartphoneIcon className="size-[1.1rem]" /> : <MonitorIcon className="size-[1.1rem]" />}
            </button>
          ))}
        </div>
        <Button variant="outline" size="icon-lg" className="bg-card rounded-full" onClick={() => { setReplay((r) => r + 1); onReplay?.() }} aria-label="Replay from the start">
          <RestartIcon />
        </Button>
        <Button variant="outline" size="icon-lg" className="bg-card rounded-full" onClick={onFullscreen} aria-label="Open full screen">
          <MaximizeSquareMinimalisticIcon />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-4">
        {(prev || next) && (
          <div className="hidden flex-col gap-2 xl:flex">
            <Button variant="outline" size="icon-lg" className="bg-card rounded-full" disabled={!prev || prev.disabled} onClick={prev?.onClick} aria-label={prev?.label ?? "Previous"}>
              <AltArrowUpIcon />
            </Button>
            <Button variant="outline" size="icon-lg" className="bg-card rounded-full" disabled={!next || next.disabled} onClick={next?.onClick} aria-label={next?.label ?? "Next"}>
              <AltArrowDownIcon />
            </Button>
          </div>
        )}
        <Scaled w={size.w + (device === "phone" ? 24 : 0)} h={size.h + (device === "phone" ? 24 : 44)} className="size-full flex-1">
          {device === "phone" ? <PhoneFrame>{render(device, replay)}</PhoneFrame> : <BrowserFrame>{render(device, replay)}</BrowserFrame>}
        </Scaled>
      </div>
      <p className="text-muted-foreground mx-auto flex items-center gap-3 rounded-full border px-4 py-1 text-[0.6875rem] font-semibold tracking-[0.2em] uppercase">
        {size.label}
        <span className="tabular-nums">
          {size.w}×{size.h}
        </span>
      </p>
    </section>
  )
}

/** The preview filling the screen, exactly as a recipient on this device would see it. */
export function FullscreenPreview({ open, onOpenChange, title = "Preview", children }: { open: boolean; onOpenChange: (open: boolean) => void; title?: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="h-dvh max-h-none w-screen max-w-none gap-0 overflow-hidden rounded-none p-0 ring-0 sm:max-w-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {open && children}
        <Button variant="outline" className="absolute top-3 left-1/2 z-40 -translate-x-1/2 rounded-full border-0 bg-white/90 text-[#35251f] shadow-lg backdrop-blur hover:bg-white" onClick={() => onOpenChange(false)}>
          <CloseIcon data-icon="inline-start" />
          Close {title.toLowerCase()}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

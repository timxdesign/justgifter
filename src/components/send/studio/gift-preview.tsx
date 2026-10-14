import { useEffect, useRef, useState } from "react"
import type { GiftRevealView } from "@/api"
import { LockKeyholeIcon } from "@/components/icons"
import { LogoMark } from "@/components/brand/logo"
import { GiftReveal } from "@/components/reveal/gift-reveal"
import { RevealContent } from "@/components/reveal/reveal-content"
import { DevicePreview, FullscreenPreview } from "@/components/studio/device-preview"

export type GiftPreviewPage = "box" | "gift" | "letter"

/**
 * The recipient's gift page as it will look: the wrapped box, then the gift and (with a letter)
 * the letter on its flower table. The same components as `/g/:token`, laid out by container
 * queries so the phone frame shows the phone layout.
 */
export function GiftRecipientScreen({ name, from, view, page, replayKey = 0 }: { name: string; from: string; view: GiftRevealView | null; page: GiftPreviewPage; replayKey?: number }) {
  const scroller = useRef<HTMLDivElement>(null)
  const open = Boolean(view) && page !== "box"
  // Bring the letter into view while it's being written; back to the top otherwise.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const t = window.setTimeout(() => {
      const target = page === "letter" ? el.querySelector<HTMLElement>("[data-gift-letter]") : null
      // The preview is scaled: convert screen distances back to the frame's own pixels.
      const scale = el.getBoundingClientRect().height / el.clientHeight || 1
      const top = target ? el.scrollTop + (target.getBoundingClientRect().top - el.getBoundingClientRect().top) / scale - 24 : 0
      el.scrollTo({ top, behavior: "smooth" })
    }, 450)
    return () => window.clearTimeout(t)
  }, [page, view?.message])
  return (
    <div ref={scroller} className="bg-plum relative size-full overflow-y-auto overscroll-contain">
      <div className="text-plum-foreground flex h-14 items-center justify-between px-4">
        <LogoMark className="size-7" />
        <span className="text-plum-muted flex items-center gap-1.5 text-xs">
          <LockKeyholeIcon className="size-3.5" />
          Private link
        </span>
      </div>
      <GiftReveal key={`${replayKey}-${open}`} id="send-studio-preview" preview startOpen={open} revealStyle={view?.revealStyle ?? "wrapped_box"} recipientName={name.split(" ")[0]} fromLabel={`From ${from}`}>
        {view && (
          <div className="bg-background rounded-t-[2rem] pb-6">
            <RevealContent view={view} />
          </div>
        )}
      </GiftReveal>
    </div>
  )
}

const ORDER: GiftPreviewPage[] = ["box", "gift", "letter"]

export function GiftPreviewPane({ name, from, view, page, onPage }: { name: string; from: string; view: GiftRevealView | null; page: GiftPreviewPage; onPage: (p: GiftPreviewPage) => void }) {
  const [full, setFull] = useState(false)
  const pages = ORDER.filter((p) => p === "box" || (view && (p === "gift" || Boolean(view.letterDesign && view.message))))
  const i = Math.max(0, pages.indexOf(page))
  return (
    <>
      <DevicePreview
        onReplay={() => onPage("box")}
        onFullscreen={() => setFull(true)}
        prev={{ label: "Previous part of the gift", disabled: i === 0, onClick: () => onPage(pages[i - 1]) }}
        next={{ label: "Next part of the gift", disabled: i >= pages.length - 1, onClick: () => onPage(pages[i + 1]) }}
        render={(_, replay) => <GiftRecipientScreen name={name} from={from} view={view} page={page} replayKey={replay} />}
      />
      <FullscreenPreview open={full} onOpenChange={setFull}>
        <GiftRecipientScreen name={name} from={from} view={view} page={page} />
      </FullscreenPreview>
    </>
  )
}

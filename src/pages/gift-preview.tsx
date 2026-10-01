import { Link, useParams } from "react-router"
import { Logo } from "@/components/brand/logo"
import { Container } from "@/components/common"
import { GiftReveal } from "@/components/reveal/gift-reveal"
import { RevealContent } from "@/components/reveal/reveal-content"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { EyeIcon } from "@/components/icons"
import { useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"
import { errorMessage } from "@/api/errors"

/** Sender preview (MOT 06): isolated token, never counts as opening, never activates a claim. */
export default function GiftPreviewPage() {
  useDocumentMeta({ title: "Reveal preview", noindex: true })
  const { token = "" } = useParams()
  const view = useApiQuery(["gift-preview", token], (api) => api.getGiftPreview(token))
  return (
    <div className="bg-plum flex min-h-dvh flex-col">
      <header className="text-plum-foreground">
        <Container className="flex h-14 items-center justify-between">
          <Link to="/" aria-label="JustGifter home"><Logo /></Link>
          <span className="bg-gold text-plum flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <EyeIcon className="size-3.5" /> Preview only — nothing is sent
          </span>
        </Container>
      </header>
      <main id="main" className="flex-1">
        {view.error ? (
          <Container className="text-plum-foreground py-24 text-center">
            <h1 className="font-display text-3xl">Preview unavailable</h1>
            <p className="text-plum-muted mt-2">{errorMessage(view.error)}</p>
          </Container>
        ) : !view.data ? (
          <div className="grid min-h-[70dvh] place-items-center"><Spinner className="text-plum-foreground size-8" /></div>
        ) : (
          <GiftReveal id={`preview-${view.data.giftId}`} preview revealStyle={view.data.revealStyle} recipientName={view.data.recipientName.split(" ")[0]} fromLabel={view.data.anonymous ? "Someone sent you something" : `From ${view.data.senderDisplayName}`}>
            <div className="bg-background rounded-t-[2rem] pb-10">
              <RevealContent view={view.data}>
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => history.back()}>Back to your order</Button>
                </div>
              </RevealContent>
            </div>
          </GiftReveal>
        )}
      </main>
    </div>
  )
}

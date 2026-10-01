import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { zoneById } from "@domain/index.ts"
import type { PublicEventView, WishlistItemView } from "@/api"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { EventPage } from "@/components/event/event-page"
import { EventReveal } from "@/components/event/event-reveal"
import { Logo } from "@/components/brand/logo"
import { Container, PageSkeleton } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldLabel } from "@/components/ui/field"
import { LockKeyholeIcon, GiftIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { checkoutIntent } from "@/lib/cart"
import { useDocumentMeta } from "@/lib/seo"

export default function PublicEventPage() {
  const { slug = "" } = useParams()
  const [code, setCode] = useState<string | undefined>(() => sessionStorage.getItem(`jg-invite:${slug}`) ?? undefined)
  const q = useApiQuery([...qk.publicEvent(slug), code], (api) => api.getPublicEvent(slug, code), { refetchInterval: 30_000 })
  const found = q.data?.kind === "found" ? q.data.view : null
  // Only deliberately public pages are indexable (EVT 05, AC 08).
  useDocumentMeta({ title: found?.event.content.title ?? "Occasion", description: found ? `Celebrate with ${found.event.content.hostDisplayName}` : undefined, noindex: found?.event.visibility !== "public", image: found?.event.content.coverImage })

  if (q.isLoading) return <PageSkeleton />
  if (!q.data || q.data.kind === "unavailable") {
    return (
      <Container className="grid min-h-dvh place-items-center text-center">
        <div className="flex max-w-md flex-col items-center gap-4">
          <Logo />
          <h1 className="font-display text-3xl">This page isn't available</h1>
          <p className="text-muted-foreground">The host may have unpublished it. If you bought a gift, your order is safe — find it with the email you used.</p>
          <div className="flex gap-2"><Button asChild><Link to="/orders/access">Find my order</Link></Button><Button variant="outline" asChild><Link to="/">JustGifter home</Link></Button></div>
        </div>
      </Container>
    )
  }
  if (q.data.kind === "invite_required") return <InviteGate onSubmit={(c) => { sessionStorage.setItem(`jg-invite:${slug}`, c); setCode(c) }} failed={Boolean(code)} />
  return <Live view={q.data.view} slug={slug} />
}

function InviteGate({ onSubmit, failed }: { onSubmit: (c: string) => void; failed: boolean }) {
  const [v, setV] = useState("")
  return (
    <main id="main" className="bg-plum text-plum-foreground grid min-h-dvh place-items-center px-6">
      <form className="flex w-full max-w-sm flex-col items-center gap-6 text-center" onSubmit={(e) => { e.preventDefault(); onSubmit(v.trim().toUpperCase()) }}>
        <LockKeyholeIcon className="text-gold size-10" />
        <h1 className="font-display text-4xl">A private celebration</h1>
        <p className="text-plum-muted">Enter the invite code the host shared with you.</p>
        <Field className="w-full">
          <FieldLabel htmlFor="code" className="sr-only">Invite code</FieldLabel>
          <Input id="code" value={v} onChange={(e) => setV(e.target.value)} className="h-12 bg-white/10 text-center font-mono text-lg tracking-[0.3em] uppercase text-white" autoFocus autoComplete="off" />
          {failed && <p className="text-sm text-[oklch(0.8_0.12_25)]" role="alert">That code didn't work. Check it with the host.</p>}
        </Field>
        <Button size="xl" variant="inverse" type="submit" disabled={!v.trim()}>Open invitation</Button>
      </form>
    </main>
  )
}

function Live({ view, slug }: { view: PublicEventView; slug: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const ev = view.event
  const zone = zoneById(ev.deliveryZoneId)

  const give = async (w: WishlistItemView) => {
    setBusy(w.item.id)
    try {
      const api = await getApi()
      const hold = await api.holdWishlistItem(slug, w.item.id, 1)
      if (!hold.ok) {
        toast.error(hold.message ?? "This item isn't available right now.")
        await qc.invalidateQueries({ queryKey: qk.publicEvent(slug) })
        return
      }
      checkoutIntent.set({
        vendorId: w.product.vendor.id,
        vendorName: w.product.vendor.name,
        lines: [{ productId: w.product.id, variantId: w.item.variantId, quantity: 1, title: w.product.title, variantName: w.variantName, image: w.product.images[0], unitPrice: w.price, vendorId: w.product.vendor.id, vendorName: w.product.vendor.name, addedAt: new Date().toISOString() }],
        source: "wishlist",
        eventSlug: slug,
        eventTitle: ev.content.title,
        wishlistItemId: w.item.id,
        holdId: hold.holdId,
        holdExpiresAt: hold.expiresAt,
        purchaseType: "gift",
        fromBag: false,
        zoneId: ev.deliveryZoneId ?? undefined,
      })
      navigate("/checkout")
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <EventReveal slug={slug} content={ev.content} design={ev.design}>
      <main id="main">
        <EventPage
          content={ev.content}
          design={ev.design}
          wishlist={view.wishlist}
          zoneName={zone?.name}
          acceptingGifts={ev.acceptingGifts}
          renderWishAction={(w) => {
            const available = w.availability.state === "available" && ev.acceptingGifts
            return (
              <Button
                size="lg"
                onClick={() => give(w)}
                disabled={!available || busy !== null}
                className="w-full bg-[var(--ev-accent)] text-[var(--ev-accent-text)] hover:bg-[var(--ev-accent)]/90 disabled:opacity-60"
              >
                {busy === w.item.id ? <Spinner data-icon="inline-start" /> : <GiftIcon data-icon="inline-start" />}
                {w.availability.state === "fulfilled" ? "Already gifted" : w.availability.state === "held" ? "Being bought now" : available ? "Give this gift" : "Unavailable"}
              </Button>
            )
          }}
        />
      </main>
    </EventReveal>
  )
}

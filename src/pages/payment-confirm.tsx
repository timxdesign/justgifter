import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { motion, useReducedMotion } from "motion/react"
import { Container, Img } from "@/components/common"
import { OrderProgress, PriceBreakdownList } from "@/components/commerce"
import { Confetti } from "@/components/reveal/confetti"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { CheckCircleIcon, CloseCircleIcon, ClockCircleIcon, EyeIcon, GiftIcon, ArrowRightIcon, LetterIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { cart, checkoutIntent } from "@/lib/cart"
import { formatDateTime, formatDate } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"
import { useSession } from "@/lib/session"

const ease = [0.2, 0, 0, 1] as const

export default function PaymentConfirmPage() {
  useDocumentMeta({ title: "Confirming payment", noindex: true })
  const { reference = "" } = useParams()
  const [startedAt] = useState(() => Date.now())
  const status = useApiQuery(qk.payment(reference), (api) => api.getPaymentStatus(reference), {
    // PAY 05: the browser return is not proof of payment; poll until the server has verified it.
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 1500 : false),
  })
  const s = status.data?.status
  const order = useApiQuery(qk.order(status.data?.orderId ?? ""), (api) => api.getOrder(status.data!.orderId), { enabled: s === "successful" })
  const cleared = useRef(false)

  useEffect(() => {
    if (s !== "successful" || cleared.current) return
    cleared.current = true
    try {
      const meta = JSON.parse(sessionStorage.getItem(`jg-checkout:${reference}`) ?? "{}") as { fromBag?: boolean; vendorId?: string }
      if (meta.fromBag && meta.vendorId) cart.clearBag(meta.vendorId)
    } catch {
      /* ignore */
    }
    checkoutIntent.clear()
  }, [s, reference])

  if (!status.data || s === "pending") return <Confirming slow={Date.now() - startedAt > 15_000} />
  if (s === "failed" || s === "expired") return <Failed expired={s === "expired"} />
  return <Success reference={reference} detail={order.data ?? null} />
}

function Confirming({ slow }: { slow: boolean }) {
  return (
    <Container className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 py-20 text-center" role="status" aria-live="polite">
      <div className="bg-brand-soft grid size-20 place-items-center rounded-full">
        <Spinner className="text-brand-text size-9" />
      </div>
      <h1 className="font-display text-4xl font-medium">Confirming payment…</h1>
      <p className="text-muted-foreground max-w-md">We're waiting for Paystack to confirm your payment directly. This usually takes a few seconds. Please don't pay again.</p>
      {slow && <p className="text-muted-foreground bg-muted max-w-md rounded-xl p-4 text-sm">Still waiting? You won't be charged twice. We'll email your receipt the moment it's confirmed, and you can close this page safely.</p>}
    </Container>
  )
}

function Failed({ expired }: { expired: boolean }) {
  const intent = checkoutIntent.get()
  return (
    <Container className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 py-20 text-center">
      <div className="bg-destructive-soft text-destructive grid size-20 place-items-center rounded-full">
        <CloseCircleIcon className="size-10" />
      </div>
      <h1 className="font-display text-4xl font-medium">{expired ? "The payment window closed" : "Payment didn't go through"}</h1>
      <p className="text-muted-foreground max-w-md">{expired ? "We released the item so others could buy it. No money was taken." : "No money was taken. Check your card details or try a different payment method."}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {intent && (
          <Button size="lg" asChild>
            <Link to="/checkout">Try again</Link>
          </Button>
        )}
        <Button size="lg" variant="outline" asChild>
          <Link to="/shop">Keep browsing</Link>
        </Button>
      </div>
    </Container>
  )
}

function Success({ reference, detail }: { reference: string; detail: import("@/api").OrderDetail | null }) {
  const reduce = useReducedMotion()
  const { user } = useSession()
  const gift = detail?.gift
  const order = detail?.order
  const revealNow = gift ? new Date(gift.revealAt).getTime() <= Date.now() + 60_000 : false
  return (
    <div className="relative overflow-hidden">
      {!reduce && <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem]"><Confetti count={90} origin={{ x: 50, y: 20 }} /></div>}
      <Container className="flex flex-col items-center gap-10 py-16">
        <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="flex max-w-xl flex-col items-center gap-4 text-center">
          <motion.div initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.6, bounce: 0.35 }} className="bg-success-soft text-success grid size-20 place-items-center rounded-full">
            <CheckCircleIcon className="size-10" />
          </motion.div>
          <p className="eyebrow text-success">Payment confirmed</p>
          <h1 className="font-display text-4xl font-medium sm:text-5xl">
            {gift ? <>Your gift for <span className="font-display-wonk italic">{gift.recipientName}</span> is on its way</> : "Thank you — your order is in"}
          </h1>
          <p className="text-muted-foreground text-lg">
            {gift
              ? gift.claimStatus === "pending"
                ? `${gift.recipientName} has been sent a private link to add their address. They have 72 hours.`
                : revealNow
                  ? `${gift.recipientName}'s reveal has been sent. You'll know when they open it.`
                  : `Their reveal is scheduled for ${formatDateTime(gift.revealAt)} (Lagos time).`
              : `Order ${reference}. ${detail?.vendor.name ?? "The vendor"} will confirm it shortly.`}
          </p>
        </motion.div>

        {detail && order && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15, ease }} className="bg-card shadow-border w-full max-w-2xl rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-muted-foreground text-sm">Order</p>
                  <p className="tabular font-semibold">{order.reference}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-sm">Requested delivery</p>
                  <p className="font-semibold">{formatDate(order.delivery.requestedDate)}</p>
                </div>
              </div>
              <OrderProgress status={order.status} purchaseType={order.purchaseType} />
              <ul className="flex flex-col gap-3 border-t pt-5">
                {order.lines.map((l) => (
                  <li key={l.variantId} className="flex items-center gap-3">
                    <Img src={l.image} alt="" className="size-14 rounded-xl" sizes="56px" />
                    <div className="flex-1">
                      <p className="font-medium">{l.title}</p>
                      <p className="text-muted-foreground text-sm">{l.variantName} · {l.quantity}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <PriceBreakdownList pricing={order.pricing} compact />
            </div>
          </motion.div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {order && (
            <Button size="xl" asChild>
              <Link to={`/account/orders/${order.id}`}>
                Track your order
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          )}
          {gift?.previewToken && (
            <Button size="xl" variant="outline" asChild>
              <Link to={`/preview/gift/${gift.previewToken}`}>
                <EyeIcon data-icon="inline-start" />
                Preview their reveal
              </Link>
            </Button>
          )}
          {order?.source === "wishlist" && (
            <Button size="xl" variant="ghost" asChild>
              <Link to="/">
                <GiftIcon data-icon="inline-start" />
                Back to JustGifter
              </Link>
            </Button>
          )}
        </div>
        {!user && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <LetterIcon className="size-4" />
            We've emailed your receipt with a secure link to this order.
          </p>
        )}
        {gift && !revealNow && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <ClockCircleIcon className="size-4" />
            You can change the message or time until the reveal is sent.
          </p>
        )}
      </Container>
    </div>
  )
}

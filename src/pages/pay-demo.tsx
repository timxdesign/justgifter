import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import { LockKeyholeIcon, CardIcon, CloseCircleIcon, InfoCircleIcon } from "@/components/icons"
import { getApi } from "@/api"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatMoney } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

/**
 * Demo stand-in for Paystack's hosted checkout. In production the browser goes to Paystack;
 * Paystack calls our signed webhook, and the return page only shows "Confirming payment"
 * until that server-side verification lands (PAY 03–05).
 */
export default function PayDemoPage() {
  useDocumentMeta({ title: "Test payment", noindex: true })
  const { reference = "" } = useParams()
  const navigate = useNavigate()
  const status = useApiQuery(qk.payment(reference), (api) => api.getPaymentStatus(reference))
  const [busy, setBusy] = useState<null | "success" | "failure">(null)

  const act = async (outcome: "success" | "failure" | "abandon") => {
    if (outcome !== "abandon") setBusy(outcome)
    const api = await getApi()
    // "Return to merchant" before the webhook arrives: the return page must stay in "confirming".
    if (outcome === "success") void api.simulatePayment(reference, "success")
    else if (outcome === "failure") await api.simulatePayment(reference, "failure")
    navigate(`/checkout/confirm/${reference}`, { replace: true })
  }

  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-[oklch(0.96_0.01_250)] px-4 py-10 text-[oklch(0.25_0.03_250)]">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_oklch(0.3_0.05_250/0.35)]">
        <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
          <span className="text-sm font-semibold">Test payment</span>
          <span className="rounded-full bg-[oklch(0.95_0.06_85)] px-2.5 py-1 text-xs font-medium text-[oklch(0.45_0.1_70)]">Sandbox — no money moves</span>
        </div>
        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-black/60">JustGifter · {reference}</p>
            {status.data ? <p className="tabular text-3xl font-semibold">{formatMoney(status.data.amount)}</p> : <Skeleton className="h-9 w-40" />}
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-black/[0.03] p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CardIcon className="size-4" />
              Test card
            </p>
            <p className="font-mono text-sm tracking-wider text-black/70">4084 0840 8408 4081 · 12/30 · 408</p>
          </div>
          {status.data?.status !== "pending" && status.data ? (
            <p className="flex items-center gap-2 rounded-xl bg-black/[0.04] p-3 text-sm">
              <InfoCircleIcon className="size-4" />
              This payment is already {status.data.status}.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button size="xl" className="bg-[oklch(0.55_0.13_160)] text-white hover:bg-[oklch(0.5_0.13_160)]" disabled={busy !== null || status.data?.status !== "pending"} onClick={() => act("success")}>
              {busy === "success" ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
              Pay {status.data ? formatMoney(status.data.amount) : ""}
            </Button>
            <Button size="lg" variant="ghost" className={cn("text-black/70 hover:bg-black/5")} disabled={busy !== null || status.data?.status !== "pending"} onClick={() => act("failure")}>
              <CloseCircleIcon data-icon="inline-start" />
              Simulate a declined card
            </Button>
            <button type="button" className="text-sm text-black/50 underline underline-offset-4 hover:text-black/80" onClick={() => act("abandon")}>
              Close without paying
            </button>
          </div>
        </div>
        <p className="border-t border-black/5 px-6 py-4 text-center text-xs text-black/50">In production this page is Paystack's secure hosted checkout.</p>
      </div>
    </main>
  )
}

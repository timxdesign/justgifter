import { useState } from "react"
import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { WsHeader, StatCard, Panel } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DownloadIcon, InfoCircleIcon, ShieldWarningIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatMoney, formatShortDate } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"
import { isApiError } from "@/api/errors"

const PAYOUT_STATUS = { pending_delivery: ["Awaiting delivery", "neutral"], in_dispute_window: ["In dispute window", "progress"], eligible: ["Eligible", "success"], paid: ["Paid out", "success"], held: ["Held — open case", "warning"] } as const

export default function VendorPayouts() {
  useDocumentMeta({ title: "Payouts", noindex: true })
  const s = useApiQuery(qk.payouts, (api) => api.getPayoutStatement())
  if (s.error) return <ErrorState error={s.error} />
  if (!s.data) return <PageSkeleton />
  const b = s.data.balance
  const download = () => {
    const rows = [["Order", "Date", "Gross", "Discount", "Commission", "Refunds", "Net", "Payout status"], ...s.data!.lines.map((l) => [l.reference, l.date.slice(0, 10), l.gross / 100, l.discount / 100, l.commission / 100, l.refunds / 100, l.net / 100, l.payoutStatus])]
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `justgifter-statement-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <>
      <WsHeader title="Payouts" description={`Orders become eligible after delivery and a ${s.data.disputeWindowDays}-day dispute window.`} actions={<Button variant="outline" onClick={download}><DownloadIcon data-icon="inline-start" />Download statement</Button>} />
      {s.data.bank.pendingChange && <Alert className="bg-warning-soft mb-6 border-0"><ShieldWarningIcon /><AlertTitle>Bank change under review</AlertTitle><AlertDescription>Payouts are paused until our team confirms the new account.</AlertDescription></Alert>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Customer payments" value={formatMoney(b.gross)} />
        <StatCard label="Commission" value={formatMoney(b.commission)} />
        <StatCard label="Paid out" value={formatMoney(b.paidOut)} />
        <StatCard label="Owed to you" value={formatMoney(b.outstanding)} tone="attention" hint="Including orders not yet eligible" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="Orders">
          <div className="-mx-5 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-5">Order</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Commission</TableHead><TableHead className="text-right">Refunds</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="pr-5">Payout</TableHead></TableRow></TableHeader>
              <TableBody>{s.data.lines.map((l) => {
                const [label, tone] = PAYOUT_STATUS[l.payoutStatus]
                return <TableRow key={l.orderId}><TableCell className="pl-5"><span className="tabular block font-medium">{l.reference}</span><span className="text-muted-foreground text-xs">{formatShortDate(l.date.slice(0, 10))}</span></TableCell><TableCell className="tabular text-right">{formatMoney(l.gross)}</TableCell><TableCell className="tabular text-right">−{formatMoney(l.commission)}</TableCell><TableCell className="tabular text-right">{l.refunds ? `−${formatMoney(l.refunds)}` : "—"}</TableCell><TableCell className="tabular text-right font-medium">{formatMoney(l.net)}</TableCell><TableCell className="pr-5"><StatusBadge tone={tone}>{label}</StatusBadge></TableCell></TableRow>
              })}</TableBody>
            </Table>
          </div>
        </Panel>
        <aside className="flex flex-col gap-6">
          <Panel title="Payout account">
            <p className="text-sm">{s.data.bank.name} · <span className="tabular">{s.data.bank.accountMasked}</span></p>
            <BankChange />
          </Panel>
          <Panel title="Recent payouts">
            {s.data.payouts.length === 0 ? <p className="text-muted-foreground text-sm">No payouts yet.</p> : s.data.payouts.map((p) => <div key={p.id} className="flex justify-between text-sm"><span>{formatShortDate(p.scheduledFor)} · {p.orderIds.length} orders</span><span className="tabular font-medium">{formatMoney(p.amount)}</span></div>)}
          </Panel>
          <Alert><InfoCircleIcon /><AlertDescription className="text-xs">Commission rate and payout schedule are set in your vendor agreement. Funds aren't held in escrow by JustGifter; settlement follows the payment provider's marketplace terms.</AlertDescription></Alert>
        </aside>
      </div>
    </>
  )
}

function BankChange() {
  const [open, setOpen] = useState(false)
  const [bank, setBank] = useState("")
  const [account, setAccount] = useState("")
  const [code, setCode] = useState("")
  const [stage, setStage] = useState<"details" | "code">("details")
  const [msg, setMsg] = useState<string | null>(null)
  const req = useApiMutation((api) => api.requestBankChange({ bank, account, code }), {
    invalidate: [qk.payouts],
    toastError: false,
    success: "Change submitted for review",
    onSuccess: () => {
      setOpen(false)
      setStage("details")
      setCode("")
    },
    onError: (e) => {
      setMsg(e.message)
      if (isApiError(e) && e.code === "unauthorised") setStage("code")
    },
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="w-fit">Change bank details</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Change payout account</DialogTitle><DialogDescription>We'll confirm it's you, notify you by email, and pause payouts until our team reviews the change.</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor="b-bank">Bank</FieldLabel><Input id="b-bank" value={bank} onChange={(e) => setBank(e.target.value)} disabled={stage === "code"} /></Field>
          <Field><FieldLabel htmlFor="b-acct">Account number (NUBAN)</FieldLabel><Input id="b-acct" inputMode="numeric" maxLength={10} value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} disabled={stage === "code"} /></Field>
          {stage === "code" && <Field><FieldLabel htmlFor="b-code">Verification code</FieldLabel><Input id="b-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></Field>}
        </FieldGroup>
        {msg && <p className="text-muted-foreground text-sm" role="status">{msg}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { setMsg(null); req.mutate() }} disabled={req.isPending || !bank || account.length !== 10}>{stage === "code" ? "Confirm change" : "Continue"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from "react"
import { Link, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { DeliveryAddress, ReportKind, ZoneId } from "@domain/index.ts"
import { ZONES, zoneById } from "@domain/index.ts"
import type { GiftEntry, GiftRevealView } from "@/api"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { Logo } from "@/components/brand/logo"
import { Container } from "@/components/common"
import { ZoneSelect } from "@/components/commerce"
import { GiftReveal } from "@/components/reveal/gift-reveal"
import { RevealContent } from "@/components/reveal/reveal-content"
import { OtpVerify } from "@/components/otp-verify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { LockKeyholeIcon, MapPointIcon, HeartIcon, FlagIcon, CheckCircleIcon, InfoCircleIcon, ClockCircleIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatDateTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

export default function GiftPage() {
  // Gift links are private: never indexed, never in previews (GFT 06, §14).
  useDocumentMeta({ title: "You've received a gift", noindex: true })
  const { token = "" } = useParams()
  const entry = useApiQuery(qk.gift(token), (api) => api.getGiftEntry(token), { staleTime: Infinity })

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="bg-plum text-plum-foreground">
        <Container className="flex h-14 items-center justify-between">
          <Link to="/" aria-label="JustGifter home" className="rounded-lg">
            <Logo />
          </Link>
          <span className="text-plum-muted flex items-center gap-1.5 text-xs">
            <LockKeyholeIcon className="size-3.5" />
            Private link — please don't share
          </span>
        </Container>
      </header>
      <main id="main" className="bg-plum flex flex-1 flex-col">
        {entry.isLoading ? (
          <div className="bg-plum grid min-h-[70dvh] place-items-center">
            <Spinner className="text-plum-foreground size-8" />
          </div>
        ) : !entry.data || entry.data.state === "not_found" ? (
          <Notice title="This gift link isn't valid" body="Check you've opened the full link from your message. If you think something's wrong, contact our support team." />
        ) : entry.data.state === "revoked" ? (
          <Notice title="This link is no longer active" body="There's nothing you need to do. If you were expecting a gift, the sender has been in touch with our support team." />
        ) : entry.data.state === "expired" ? (
          <Notice title="The time to claim this gift has passed" body="The sender has been refunded. You haven't been charged anything." />
        ) : entry.data.state === "declined" ? (
          <Notice title="You declined this gift" body="The sender has been told and refunded. Thanks for letting us know." />
        ) : entry.data.state === "scheduled" ? (
          <Notice title="Something's coming your way" body={`This gift will be ready to open on ${formatDateTime(entry.data.revealAt!)} (Lagos time).`} />
        ) : (
          <Opened token={token} entry={entry.data} />
        )}
      </main>
      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        <Container className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <span>JustGifter keeps your address private. Only the vendor delivering your gift can see it.</span>
          {entry.data?.state === "ready" && <ReportDialog token={token} />}
        </Container>
      </footer>
    </div>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Container className="bg-background flex min-h-[60dvh] max-w-none flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      <Button variant="outline" asChild>
        <Link to="/">Visit JustGifter</Link>
      </Button>
    </Container>
  )
}

function Opened({ token, entry }: { token: string; entry: GiftEntry }) {
  const view = useApiQuery(["gift-reveal", token], (api) => api.getGiftReveal(token, ""), { staleTime: 30_000 })
  if (view.error) return <Notice title="We couldn't open this gift" body={errorMessage(view.error)} />
  if (!view.data) {
    return (
      <div className="bg-plum grid min-h-[70dvh] place-items-center">
        <Skeleton className="size-60 rounded-3xl bg-white/10" />
      </div>
    )
  }
  const v = view.data
  return (
    <div className="bg-plum flex-1">
      <GiftReveal
        id={v.giftId}
        revealStyle={v.revealStyle}
        recipientName={v.recipientName.split(" ")[0]}
        fromLabel={v.anonymous ? "Someone sent you something" : `From ${v.senderDisplayName}`}
        onOpened={async () => (await getApi()).markGiftOpened(token, "")}
      >
        <div className="bg-background rounded-t-[2rem] pb-6">
          <RevealContent view={v}>
            <Actions token={token} view={v} contact={entry.contactMasked} />
          </RevealContent>
        </div>
      </GiftReveal>
    </div>
  )
}

function Actions({ token, view, contact }: { token: string; view: GiftRevealView; contact: string | null }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<string | null>(null)
  const needsAddress = view.claim.status === "pending"
  const refresh = () => qc.invalidateQueries({ queryKey: ["gift-reveal", token] })

  return (
    <div className="flex flex-col gap-4">
      {needsAddress && (
        <section aria-labelledby="claim" className="bg-card shadow-border flex flex-col gap-5 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <MapPointIcon className="text-brand-text mt-0.5 size-6 shrink-0" />
            <div>
              <h2 id="claim" className="text-lg font-semibold">Where should we deliver it?</h2>
              <p className="text-muted-foreground text-sm">
                Your address is private: only {view.item.vendorName} sees it, to deliver your gift. The sender doesn't.
                {view.claim.deadline && <> Please add it by <span className="text-foreground font-medium">{formatDateTime(view.claim.deadline)}</span>.</>}
              </p>
            </div>
          </div>
          {!session ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">First, confirm it's you</p>
              <OtpVerify
                destination={contact ?? "the contact the sender used"}
                send={async () => (await getApi()).sendGiftCode(token)}
                verify={async (code) => {
                  const s = await (await getApi()).verifyGiftCode(token, code)
                  setSession(s.token)
                }}
                submitLabel="Continue"
              />
            </div>
          ) : (
            <AddressForm token={token} session={session} view={view} onDone={refresh} />
          )}
        </section>
      )}

      {view.claim.status === "needs_sender_approval" && (
        <Alert>
          <ClockCircleIcon />
          <AlertTitle>We've asked the sender to confirm</AlertTitle>
          <AlertDescription>Your address is outside the area they chose. They'll approve the change or cancel — either way, you won't be charged anything.</AlertDescription>
        </Alert>
      )}

      {view.claim.status === "submitted" && view.fulfilment.status !== "delivered" && (
        <Alert>
          <CheckCircleIcon className="text-success" />
          <AlertTitle>Address received</AlertTitle>
          <AlertDescription>The vendor will confirm a delivery window soon.</AlertDescription>
        </Alert>
      )}

      <ThankYou token={token} view={view} />

      {needsAddress && session && <DeclineButton token={token} session={session} onDone={refresh} />}
    </div>
  )
}

function AddressForm({ token, session, view, onDone }: { token: string; session: string; view: GiftRevealView; onDone: () => void }) {
  const [zoneId, setZoneId] = useState<ZoneId>(view.claim.zoneId)
  const zone = ZONES.find((z) => z.id === zoneId)!
  const [form, setForm] = useState({ recipientName: view.recipientName, phone: "", line1: "", line2: "", landmark: "", area: "", instructions: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const address: DeliveryAddress = { ...form, line2: form.line2 || undefined, landmark: form.landmark || undefined, instructions: form.instructions || undefined, city: zone.city, state: zone.state, zoneId }
      const res = await (await getApi()).submitGiftAddress(token, session, address)
      toast.success(res.message)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="zone">Delivery area</FieldLabel>
          <ZoneSelect id="zone" value={zoneId} onChange={(z) => { setZoneId(z); setForm((f) => ({ ...f, area: "" })) }} />
          {zoneId !== view.claim.zoneId && (
            <FieldDescription className="text-warning">The sender chose {zoneById(view.claim.zoneId)?.name}. A different area needs their approval first — you'll never be asked to pay.</FieldDescription>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="g-name">Your name</FieldLabel>
            <Input id="g-name" value={form.recipientName} onChange={set("recipientName")} autoComplete="name" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="g-phone">Phone for the rider</FieldLabel>
            <Input id="g-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" required />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="g-line1">Street address</FieldLabel>
          <Input id="g-line1" value={form.line1} onChange={set("line1")} autoComplete="address-line1" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="g-line2">Flat, floor or estate (optional)</FieldLabel>
            <Input id="g-line2" value={form.line2} onChange={set("line2")} autoComplete="address-line2" />
          </Field>
          <Field>
            <FieldLabel htmlFor="g-landmark">Nearest landmark (optional)</FieldLabel>
            <Input id="g-landmark" value={form.landmark} onChange={set("landmark")} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="g-area">Area</FieldLabel>
          <Select value={form.area || undefined} onValueChange={(a) => setForm((f) => ({ ...f, area: a }))}>
            <SelectTrigger id="g-area"><SelectValue placeholder="Choose your area" /></SelectTrigger>
            <SelectContent><SelectGroup>{zone.areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="g-instr">Delivery instructions (optional)</FieldLabel>
          <Textarea id="g-instr" rows={2} value={form.instructions} onChange={set("instructions")} placeholder="Best time to deliver, gate code…" />
        </Field>
      </FieldGroup>
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      <Button type="submit" size="lg" disabled={busy} className="w-fit">
        {busy && <Spinner data-icon="inline-start" />}
        Save delivery address
      </Button>
    </form>
  )
}

function DeclineButton({ token, session, onDone }: { token: string; session: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState("")
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-muted-foreground w-fit self-center">
          I'd rather not accept this gift
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Decline this gift?</AlertDialogTitle>
          <AlertDialogDescription>The order will be cancelled and the sender refunded. We'll let them know kindly — you don't need to give a reason.</AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="decline-reason">Message for the sender (optional)</FieldLabel>
          <Textarea id="decline-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the gift</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={async () => {
              try {
                await (await getApi()).declineGift(token, session, reason)
                toast.success("Gift declined. The sender has been refunded.")
                onDone()
                await qc.invalidateQueries({ queryKey: qk.gift(token) })
              } catch (e) {
                toast.error(errorMessage(e))
              }
            }}
          >
            Decline gift
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ThankYou({ token, view }: { token: string; view: GiftRevealView }) {
  const [note, setNote] = useState("")
  const [sent, setSent] = useState(Boolean(view.thankYouNote))
  const [busy, setBusy] = useState(false)
  if (sent) {
    return (
      <div className="bg-card shadow-border flex items-center gap-3 rounded-2xl p-5">
        <HeartIcon className="text-brand-text size-5" />
        <p className="text-sm">Your thank-you note was sent privately to {view.anonymous ? "the sender" : view.senderDisplayName}.</p>
      </div>
    )
  }
  return (
    <section aria-labelledby="thanks" className="bg-card shadow-border flex flex-col gap-3 rounded-2xl p-6">
      <h2 id="thanks" className="flex items-center gap-2 text-lg font-semibold">
        <HeartIcon className="text-brand-text size-5" />
        Say thank you <span className="text-muted-foreground text-sm font-normal">(optional)</span>
      </h2>
      <p className="text-muted-foreground text-sm">A private note to {view.anonymous ? "the sender — we'll pass it on without revealing who they are" : view.senderDisplayName}. It's never posted publicly.</p>
      <Textarea aria-label="Thank-you note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="This made my day…" />
      <Button
        className="w-fit"
        disabled={busy || note.trim().length < 2}
        onClick={async () => {
          setBusy(true)
          try {
            await (await getApi()).sendThankYou(token, "", note)
            setSent(true)
          } catch (e) {
            toast.error(errorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy && <Spinner data-icon="inline-start" />}
        Send thank-you
      </Button>
    </section>
  )
}

function ReportDialog({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ReportKind>("abusive_message")
  const [details, setDetails] = useState("")
  const [stop, setStop] = useState(true)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="hover:text-foreground flex items-center gap-1.5 underline underline-offset-4">
          <FlagIcon className="size-3.5" />
          Report or stop messages
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this gift</DialogTitle>
          <DialogDescription>Our safety team reviews every report privately. The sender isn't told who reported it.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="report-kind">What's wrong?</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as ReportKind)}>
              <SelectTrigger id="report-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="abusive_message">The message is abusive or upsetting</SelectItem>
                  <SelectItem value="harassment">I'm being harassed</SelectItem>
                  <SelectItem value="impersonation">Someone is pretending to be someone else</SelectItem>
                  <SelectItem value="other">Something else</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="report-details">Details (optional)</FieldLabel>
            <Textarea id="report-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="stop-contact" checked={stop} onCheckedChange={(c) => setStop(c === true)} />
            <FieldLabel htmlFor="stop-contact" className="font-normal">Stop sending me gift messages from JustGifter</FieldLabel>
          </Field>
        </FieldGroup>
        <Alert>
          <InfoCircleIcon />
          <AlertDescription>If you're in danger, contact local emergency services first.</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await (await getApi()).reportGift(token, "", { kind, details, stopContact: stop })
                toast.success("Thanks — our team will review this privately.")
                setOpen(false)
              } catch (e) {
                toast.error(errorMessage(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Spinner data-icon="inline-start" />}
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

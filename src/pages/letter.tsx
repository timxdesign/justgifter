import { useState } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"
import type { ReportKind } from "@domain/index.ts"
import { getApi } from "@/api"
import { errorMessage } from "@/api/errors"
import { Container } from "@/components/common"
import { LetterExperience } from "@/components/letter/experience"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FlagIcon, InfoCircleIcon, GiftIcon, LetterIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatDate } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"
import { toDateOnly, LAUNCH_TIMEZONE } from "@domain/index.ts"

export default function LetterPage() {
  // Letter links are private: never indexed, never in previews.
  useDocumentMeta({ title: "You've received a letter", noindex: true })
  const { token = "" } = useParams()
  const letter = useApiQuery(qk.letter(token), (api) => api.openLetter(token), { staleTime: Infinity, retry: false })

  if (letter.isLoading) {
    return (
      <main id="main" className="grid min-h-dvh place-items-center bg-[#efe6d6]">
        <Spinner className="size-8 text-[#8a2433]" />
      </main>
    )
  }
  if (letter.error || !letter.data) {
    return (
      <main id="main" className="flex min-h-dvh flex-col">
        {letter.error ? (
          <Notice title="We couldn't open this letter" body={errorMessage(letter.error)} />
        ) : (
          <Notice title="This letter link isn't valid" body="Check you've opened the full link you were sent. If the sender made a new link, the old one stops working." />
        )}
      </main>
    )
  }
  const l = letter.data
  return (
    <main id="main" className="fixed inset-0 h-dvh">
      <h1 className="sr-only">A letter for {l.recipientName} from {l.senderDisplayName}</h1>
      <LetterExperience
        letter={l}
        mode="live"
        onSealExpired={() => void letter.refetch()}
        actions={<ReportDialog token={token} />}
        finale={
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-white/75 p-5 text-center text-[#35251f] shadow-sm backdrop-blur">
            <p className="font-medium">Want to send something back?</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/send/letter">
                  <LetterIcon data-icon="inline-start" />
                  Write a letter
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/send?intent=gift">
                  <GiftIcon data-icon="inline-start" />
                  Send a gift
                </Link>
              </Button>
            </div>
            <p className="text-xs text-[#7a6457]">
              Sent {formatDate(toDateOnly(new Date(l.sentAt), LAUNCH_TIMEZONE))} with JustGifter. Only people with this link can open it.
            </p>
          </div>
        }
      />
    </main>
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

function ReportDialog({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ReportKind>("abusive_message")
  const [details, setDetails] = useState("")
  const [stop, setStop] = useState(true)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" aria-label="Report or stop messages" title="Report or stop messages" className="grid size-10 place-items-center rounded-full bg-white/80 text-[#35251f] shadow-[0_0_0_1px_rgb(0_0_0/0.06)] backdrop-blur transition-transform active:scale-95">
          <FlagIcon className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this letter</DialogTitle>
          <DialogDescription>Our safety team reviews every report privately. The sender isn't told who reported it.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="report-kind">What's wrong?</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as ReportKind)}>
              <SelectTrigger id="report-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="abusive_message">The letter is abusive or upsetting</SelectItem>
                  <SelectItem value="harassment">I'm being harassed</SelectItem>
                  <SelectItem value="impersonation">Someone is pretending to be someone else</SelectItem>
                  <SelectItem value="other">Something else</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="report-details">Details (optional)</FieldLabel>
            <Textarea id="report-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="stop-contact" checked={stop} onCheckedChange={(c) => setStop(c === true)} />
            <FieldLabel htmlFor="stop-contact" className="font-normal">Stop sending me letters and gift messages from JustGifter</FieldLabel>
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
                await (await getApi()).reportLetter(token, { kind, details, stopContact: stop })
                toast.success("Thanks — our team will review this privately.")
                setOpen(false)
              } catch (e) {
                toast.error(errorMessage(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

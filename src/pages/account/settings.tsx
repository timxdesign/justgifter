import { useState } from "react"
import { toast } from "sonner"
import { Container, PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DownloadIcon } from "@/components/icons"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"
import { AccountTabs } from "./tabs"

const KEY = "jg-notify-prefs"

/** Transactional messages are always sent; marketing consent is separate (SEC 06). */
export default function SettingsPage() {
  useDocumentMeta({ title: "Settings", noindex: true })
  const { user } = useSession()
  const [prefs, setPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "") as Record<string, boolean>
    } catch {
      return { opened: true, thankyou: true, reminders: true, marketing: false }
    }
  })
  const toggle = (k: string) => (v: boolean) => {
    const next = { ...prefs, [k]: v }
    setPrefs(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
    toast.success("Preferences saved")
  }
  const rows = [
    ["opened", "When a recipient opens my gift", "A short note when the reveal is opened."],
    ["thankyou", "Thank-you notes", "Private notes recipients choose to send you."],
    ["reminders", "Occasion reminders", "A nudge a week before dates you've saved."],
    ["marketing", "Gift ideas and offers", "Occasional emails. Separate from order updates, which are always sent."],
  ] as const
  return (
    <Container className="flex flex-col gap-8 py-10">
      <PageHeader title="Settings" description={user?.email} />
      <AccountTabs />
      <div className="grid max-w-2xl gap-8">
        <FieldSet className="bg-card shadow-border rounded-3xl p-6">
          <FieldLegend>Notifications</FieldLegend>
          <FieldDescription>Receipts, delivery updates and security messages are always sent.</FieldDescription>
          <FieldGroup>
            {rows.map(([k, label, desc]) => (
              <Field key={k} orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`n-${k}`}>{label}</FieldLabel>
                  <FieldDescription>{desc}</FieldDescription>
                </FieldContent>
                <Switch id={`n-${k}`} checked={Boolean(prefs[k])} onCheckedChange={toggle(k)} />
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
        <section className="bg-card shadow-border flex flex-col gap-4 rounded-3xl p-6">
          <h2 className="text-base font-medium">Your data</h2>
          <p className="text-muted-foreground text-sm">Download a copy of your data, or ask us to delete your account. We keep transaction records we're legally required to retain, then delete them on schedule.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.success("We'll email your data export within 48 hours.")}>
              <DownloadIcon data-icon="inline-start" />
              Request data export
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive">Delete my account</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>Your profile, occasion pages and saved items are deleted. Order and payment records are kept for the legally required period, then removed. Open orders must finish first.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep account</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => toast.success("Deletion requested. We'll confirm by email.")}>Request deletion</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>
      </div>
    </Container>
  )
}

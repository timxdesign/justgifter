import { useState } from "react"
import { Link } from "react-router"
import type { LetterStatus, StatusTone } from "@domain/index.ts"
import type { LetterSummary } from "@/api"
import { Container, EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { LetterIcon, LinkRoundIcon, AltArrowDownIcon } from "@/components/icons"
import { ShareCard } from "@/components/share"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatDateTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"
import { useSession } from "@/lib/session"
import { AccountTabs } from "./tabs"

const STATUS: Record<LetterStatus, { label: string; tone: StatusTone }> = {
  scheduled: { label: "Scheduled", tone: "progress" },
  sent: { label: "Sent", tone: "neutral" },
  opened: { label: "Opened", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Couldn't send", tone: "danger" },
}

function when(l: LetterSummary) {
  if (l.status === "scheduled") return `${l.delivery === "link" ? "Opens" : "Sends"} ${formatDateTime(l.sendAt)}`
  if (l.status === "opened" && l.openedAt) return `Opened ${formatDateTime(l.openedAt)}`
  if (l.status === "cancelled") return "Not sent"
  return `Sent ${formatDateTime(l.sentAt ?? l.sendAt)}`
}

export default function LettersPage() {
  useDocumentMeta({ title: "Letters", noindex: true })
  const { user } = useSession()
  const letters = useApiQuery(qk.myLetters, (api) => api.listMyLetters(), { enabled: Boolean(user) })
  const cancel = useApiMutation((api, id: string) => api.cancelLetter(id), { invalidate: [qk.myLetters], success: "Letter cancelled. It won't be sent." })
  const [renewed, setRenewed] = useState<{ id: string; url: string } | null>(null)
  const renew = useApiMutation((api, id: string) => api.renewLetterLink(id), { onSuccess: (r, id) => setRenewed({ id, url: `${window.location.origin}${r.link}` }) })
  return (
    <Container className="flex flex-col gap-8 py-10">
      <PageHeader title="Letters" description="Letters you've sent, shared or scheduled. Scheduled letters can be cancelled until they go out." actions={<Button asChild><Link to="/send/letter"><LetterIcon data-icon="inline-start" />Write a letter</Link></Button>} />
      <AccountTabs />
      {letters.error ? (
        <ErrorState error={letters.error} retry={() => letters.refetch()} />
      ) : !letters.data ? (
        <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : letters.data.length === 0 ? (
        <EmptyState icon={<LetterIcon />} title="No letters yet" description="Write a letter on its own, or add one to a gift. Letters sent with a gift appear with the order." action={<Button asChild><Link to="/send/letter">Write a letter</Link></Button>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {letters.data.map((l) => (
            <li key={l.id}>
              <Collapsible className="surface flex flex-col gap-3 rounded-2xl p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="bg-brand-soft text-brand-text grid size-11 shrink-0 place-items-center rounded-xl">{l.delivery === "link" ? <LinkRoundIcon className="size-5" /> : <LetterIcon className="size-5" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">For {l.recipientName}</p>
                    <p className="text-muted-foreground truncate text-sm">{l.contactMasked} · {when(l)}</p>
                    <StatusBadge tone={STATUS[l.status].tone} className="mt-2">{STATUS[l.status].label}</StatusBadge>
                  </div>
                  <div className="flex items-center gap-1">
                    {l.status === "scheduled" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={cancel.isPending}>Cancel</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this letter?</AlertDialogTitle>
                            <AlertDialogDescription>It won't be sent to {l.recipientName}. You can always write another.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it scheduled</AlertDialogCancel>
                            <AlertDialogAction onClick={() => cancel.mutate(l.id)}>Cancel letter</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {l.delivery === "link" && l.status !== "cancelled" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={renew.isPending}>New link</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Make a new link?</AlertDialogTitle>
                            <AlertDialogDescription>For privacy we never keep a copy of the link. A new one replaces it, and the link you shared before will stop working.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep the old link</AlertDialogCancel>
                            <AlertDialogAction onClick={() => renew.mutate(l.id)}>Make a new link</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="group/t">
                        Read
                        <AltArrowDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]/t:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                {renewed?.id === l.id && <ShareCard url={renewed.url} title={`A letter for ${l.recipientName.split(" ")[0]}`} filename="letter" />}
                <CollapsibleContent>
                  <p className="paper-grain bg-muted/50 font-display rounded-xl p-4 leading-relaxed whitespace-pre-line">{l.body}</p>
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}

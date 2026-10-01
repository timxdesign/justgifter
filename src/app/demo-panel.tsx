import { useEffect, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "cn"
import { toast } from "sonner"
import { getApi, type DemoPersona } from "@/api"
import type { DemoBackend } from "@/api/demo"
import type { OutboxMessage } from "@/api/demo/store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { InboxLineIcon, UsersGroupRoundedIcon, RestartIcon, ServerSquareIcon, ArrowRightUpIcon, CheckCircleIcon } from "@/components/icons"
import { useSession } from "@/lib/session"
import { relativeTime } from "@/lib/format"

/**
 * Demo-only control panel: switch between personas, read the simulated outbox (where gift
 * links, codes and receipts land), run scheduled jobs and reset data. Not rendered when a real
 * Supabase backend is configured.
 */
export function DemoPanel() {
  const [backend, setBackend] = useState<DemoBackend | null>(null)
  const [open, setOpen] = useState(false)
  const { user, refresh } = useSession()
  const qc = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    getApi().then((a) => setBackend(a as DemoBackend))
  }, [])

  const outbox = useSyncExternalStore(
    (fn) => backend?.store.subscribe(fn) ?? (() => {}),
    () => backend?.store.db.outbox ?? EMPTY,
  )
  const [seen, setSeen] = useState(0)
  const unread = Math.max(0, outbox.length - seen)
  useEffect(() => {
    if (open) setSeen(outbox.length)
  }, [open, outbox.length])
  useEffect(() => {
    if (backend && seen === 0) setSeen(backend.store.db.outbox.length)
  }, [backend, seen])

  if (!backend) return null
  const personas = backend.listPersonas()

  const switchTo = async (p: DemoPersona) => {
    await backend.switchPersona(p.id)
    await refresh()
    toast.success(`Now viewing as ${p.label.split(" — ")[0]}`)
    if (p.user?.roles.includes("admin")) navigate("/admin")
    else if (p.user?.roles.includes("vendor_owner") || p.user?.roles.includes("vendor_staff")) navigate("/vendor")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press bg-plum text-plum-foreground fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full py-2 pr-4 pl-2.5 text-sm shadow-[var(--shadow-float)]"
      >
        <span className="bg-gold text-plum rounded-full px-2 py-1 text-[0.625rem] leading-none font-bold tracking-wider">DEMO</span>
        <span className="max-w-36 truncate">{user ? user.name.split(" ")[0] : "Guest"}</span>
        {unread > 0 && (
          <span className="bg-brand text-brand-foreground tabular grid min-w-5 place-items-center rounded-full px-1 text-xs font-semibold" aria-label={`${unread} new messages`}>
            {unread}
          </span>
        )}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[min(28rem,94vw)] gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-5">
            <SheetTitle className="font-display text-xl">Demo controls</SheetTitle>
            <SheetDescription>No real payments, emails or deliveries happen in demo mode. Connect Supabase to go live.</SheetDescription>
          </SheetHeader>
          <Tabs defaultValue="inbox" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="mx-5 mt-4 w-auto">
              <TabsTrigger value="inbox">
                <InboxLineIcon data-icon="inline-start" />
                Inbox
              </TabsTrigger>
              <TabsTrigger value="people">
                <UsersGroupRoundedIcon data-icon="inline-start" />
                View as
              </TabsTrigger>
              <TabsTrigger value="system">
                <ServerSquareIcon data-icon="inline-start" />
                System
              </TabsTrigger>
            </TabsList>
            <TabsContent value="inbox" className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="text-muted-foreground mb-4 text-sm">Messages the platform would send by email. Gift links here open the real recipient experience.</p>
              <ul className="flex flex-col gap-2">
                {outbox.slice(0, 40).map((m) => (
                  <InboxItem key={m.id} m={m} onOpen={(href) => { setOpen(false); navigate(href) }} />
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="people" className="min-h-0 flex-1 overflow-y-auto p-5">
              <div role="radiogroup" aria-label="View as" className="flex flex-col gap-2">
                {personas.map((p) => {
                  const active = (p.user?.id ?? null) === (user?.id ?? null)
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={active} onClick={() => switchTo(p)} className={cn("flex items-center gap-3 rounded-xl p-3 text-left transition-[box-shadow,background-color]", active ? "bg-brand-soft shadow-[0_0_0_2px_var(--brand)]" : "bg-card shadow-border hover:shadow-border-hover")}>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-muted-foreground text-xs">{p.description}</p>
                      </div>
                      {active && <CheckCircleIcon className="text-brand-text size-5" />}
                    </button>
                  )
                })}
              </div>
            </TabsContent>
            <TabsContent value="system" className="flex flex-col gap-3 p-5">
              <Button
                variant="outline"
                className="justify-start"
                onClick={async () => {
                  const { processed } = await backend.runDueJobs()
                  await qc.invalidateQueries()
                  toast.success(processed ? `Ran ${processed} due ${processed === 1 ? "job" : "jobs"}` : "No jobs are due yet")
                }}
              >
                <ServerSquareIcon data-icon="inline-start" />
                Run due scheduled jobs
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="justify-start">
                    <RestartIcon data-icon="inline-start" />
                    Reset demo data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset all demo data?</AlertDialogTitle>
                    <AlertDialogDescription>Orders, occasion pages and changes you made will be replaced with the original sample data.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await backend.resetDemo()
                        localStorage.removeItem("jg-cart")
                        await refresh()
                        setSeen(backend.store.db.outbox.length)
                        toast.success("Demo data reset")
                        navigate("/")
                      }}
                    >
                      Reset demo data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  )
}

const EMPTY: OutboxMessage[] = []

function InboxItem({ m, onOpen }: { m: OutboxMessage; onOpen: (href: string) => void }) {
  const tone = m.kind === "gift_reveal" ? "brand" : m.kind === "otp" ? "info" : m.kind === "refund" ? "warning" : "muted"
  return (
    <li className="bg-card shadow-border flex flex-col gap-1.5 rounded-xl p-3.5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={tone}>{m.kind.replace(/_/g, " ")}</Badge>
        <span className="text-muted-foreground text-xs">{relativeTime(m.at)}</span>
      </div>
      <p className="text-sm font-medium">{m.subject}</p>
      <p className="text-muted-foreground text-xs">To {m.to}</p>
      <p className="text-muted-foreground line-clamp-3 text-sm">{m.body}</p>
      {m.status === "failed" && <p className="text-destructive text-xs">Not sent — the recipient asked us to stop contacting them.</p>}
      {m.link && (
        <Button size="sm" variant={m.kind === "gift_reveal" ? "brand" : "outline"} className="mt-1 w-fit" onClick={() => onOpen(m.link!.href)}>
          {m.link.label}
          <ArrowRightUpIcon data-icon="inline-end" />
        </Button>
      )}
    </li>
  )
}

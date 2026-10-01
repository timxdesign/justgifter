import { useState } from "react"
import { useNavigate } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "cn"
import type { EventType, EventVisibility } from "@domain/index.ts"
import { EVENT_TYPES } from "@domain/index.ts"
import { Container } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { ConfettiIcon, HeartsIcon, HeartShineIcon, StickerSmileCircleIcon, SquareAcademicCapIcon, HomeSmileIcon, HandStarsIcon, LeafIcon, StarsIcon, ArrowLeftIcon, GlobalIcon, LinkIcon, LockKeyholeIcon } from "@/components/icons"
import { useApiMutation } from "@/lib/api-hooks"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"
import { todayLagos } from "@/lib/format"

const ICONS: Record<EventType, typeof ConfettiIcon> = {
  birthday: ConfettiIcon, wedding: HeartsIcon, anniversary: HeartShineIcon, "baby-shower": StickerSmileCircleIcon, graduation: SquareAcademicCapIcon,
  housewarming: HomeSmileIcon, appreciation: HandStarsIcon, remembrance: LeafIcon, custom: StarsIcon,
}

const VISIBILITY: { id: EventVisibility; title: string; body: string; icon: typeof GlobalIcon }[] = [
  { id: "unlisted", title: "Anyone with the link", body: "Not shown in search engines, but anyone you share the link with can open it.", icon: LinkIcon },
  { id: "private", title: "Invited guests only", body: "Guests need an invite code you share with them.", icon: LockKeyholeIcon },
  { id: "public", title: "Public", body: "Can appear in search engines. Best for public celebrations.", icon: GlobalIcon },
]

export default function EventNewPage() {
  useDocumentMeta({ title: "New occasion page", noindex: true })
  const { user } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [type, setType] = useState<EventType | null>(null)
  const [title, setTitle] = useState("")
  const [host, setHost] = useState(user?.name.split(" ")[0] ?? "")
  const [date, setDate] = useState("")
  const [tbc, setTbc] = useState(false)
  const [visibility, setVisibility] = useState<EventVisibility>("unlisted")
  const [error, setError] = useState<string | null>(null)
  const create = useApiMutation((api) => api.createEvent({ type: type!, title, hostDisplayName: host, date: tbc ? null : date || null, visibility }), { onSuccess: (r) => navigate(`/events/${r.id}/edit`), toastError: false, onError: (e) => setError(e.message) })

  const next = () => {
    setError(null)
    if (step === 1) {
      if (!title.trim()) return setError("Give your page a title.")
      if (!tbc && !date) return setError("Choose a date, or tick “to be confirmed”.")
    }
    if (step === 2) return create.mutate()
    setStep((s) => s + 1)
  }

  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10">
      <div className="flex items-center gap-4">
        {step > 0 && <Button variant="ghost" size="icon" onClick={() => setStep((s) => s - 1)} aria-label="Back"><ArrowLeftIcon /></Button>}
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= step ? "bg-primary" : "bg-muted")} />)}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="flex flex-col gap-8">
          {step === 0 && (
            <>
              <h1 className="font-display text-4xl font-medium">What are you celebrating?</h1>
              <div role="radiogroup" aria-label="Occasion type" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {EVENT_TYPES.map((t) => {
                  const Icon = ICONS[t.id]
                  return (
                    <button key={t.id} type="button" role="radio" aria-checked={type === t.id} onClick={() => { setType(t.id); setStep(1) }} className={cn("press bg-card flex flex-col items-start gap-6 rounded-2xl p-5 text-left transition-shadow", type === t.id ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border hover:shadow-border-hover")}>
                      <Icon className="text-brand-text size-7" />
                      <span className="font-medium">{t.name}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-muted-foreground text-sm">Remembrance pages use calm templates with no confetti.</p>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="font-display text-4xl font-medium">The basics</h1>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="title">Page title</FieldLabel>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "wedding" ? "Tolu & Kunle" : "Ada turns 30"} autoFocus className="h-12 text-lg" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="host">Hosted by</FieldLabel>
                  <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} />
                  <FieldDescription>The name guests will see.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="date">Date</FieldLabel>
                  <Input id="date" type="date" min={todayLagos()} value={date} disabled={tbc} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="tbc" checked={tbc} onCheckedChange={(c) => setTbc(c === true)} />
                  <FieldLabel htmlFor="tbc" className="font-normal">Date to be confirmed</FieldLabel>
                </Field>
              </FieldGroup>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="font-display text-4xl font-medium">Who can see it?</h1>
              <FieldSet>
                <FieldLegend className="sr-only">Visibility</FieldLegend>
                <div role="radiogroup" aria-label="Visibility" className="flex flex-col gap-3">
                  {VISIBILITY.map(({ id, title: t, body, icon: Icon }) => (
                    <button key={id} type="button" role="radio" aria-checked={visibility === id} onClick={() => setVisibility(id)} className={cn("press bg-card flex items-start gap-4 rounded-2xl p-5 text-left transition-shadow", visibility === id ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border hover:shadow-border-hover")}>
                      <Icon className="mt-0.5 size-5 shrink-0" />
                      <span><span className="block font-medium">{t}</span><span className="text-muted-foreground text-sm">{body}</span></span>
                    </button>
                  ))}
                </div>
                <FieldDescription>Your delivery address is never shown on the page, whatever you choose. You can change this later.</FieldDescription>
              </FieldSet>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      {step > 0 && (
        <Button size="xl" className="w-fit" onClick={next} disabled={create.isPending}>
          {create.isPending && <Spinner data-icon="inline-start" />}
          {step === 2 ? "Create page" : "Continue"}
        </Button>
      )}
    </Container>
  )
}

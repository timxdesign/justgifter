import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { DEFAULT_LETTER_DESIGN, EMPTY_MOMENTS, OCCASIONS, type LetterTheme, type MomentId, type OccasionId } from "@domain/index.ts"
import type { LetterView } from "@/api"
import { errorMessage } from "@/api/errors"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowRightIcon, EyeIcon, SendSquareIcon } from "@/components/icons"
import { StudioActionBar, StudioLayout, Underlined } from "@/components/studio/studio-layout"
import type { LetterPage } from "@/components/letter/experience"
import { CoverStep, StepHeading } from "@/components/letter/studio/cover-step"
import { MomentsStep, type PhotoStore } from "@/components/letter/studio/moments-step"
import { FullscreenPreview, PreviewPane } from "@/components/letter/studio/preview"
import { SendStep, SentView, sendStudioLetter } from "@/components/letter/studio/send-step"
import { useApiMutation, qk } from "@/lib/api-hooks"
import { clearPhotos, getPhoto } from "@/lib/letter-photos"
import { celebrationAllowed, loadStudioDraft, newStudioDraft, previewView, saveStudioDraft, STUDIO_STEPS, studioProblems, type StudioDraft, type StudioProblem, type StudioStep } from "@/lib/letter-studio"
import { useDocumentMeta } from "@/lib/seo"
import { useSession } from "@/lib/session"

/** Where each problem's field lives, so "Next" can take the sender straight to it. */
const FIELD_TARGET: Record<string, { id: string; moment?: MomentId }> = {
  recipientName: { id: "ls-name" },
  signature: { id: "ls-sign" },
  body: { id: "ls-body", moment: "letter" },
  song: { id: "ls-song", moment: "song" },
  email: { id: "ls-to" },
  when: { id: "ls-on" },
}

export default function LetterStudioPage() {
  useDocumentMeta({ title: "Write a letter", description: "Write a letter on a table of flowers, add photos, places and your song, then share it by link, QR code or email. Free." })
  const reduce = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const { user } = useSession()
  const [d, setD] = useState<StudioDraft>(() => loadStudioDraft() ?? newStudioDraft())
  const [problems, setProblems] = useState<StudioProblem[]>([])
  const [active, setActive] = useState<MomentId | null>(null)
  const [page, setPage] = useState<LetterPage>("cover")
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [fullPreview, setFullPreview] = useState(false)
  const [example, setExample] = useState(false)

  const update = (patch: Partial<StudioDraft>) => {
    setD((cur) => ({ ...cur, ...patch }))
    if (problems.length) setProblems([])
  }
  useEffect(() => saveStudioDraft(d), [d])

  // Entry points can pre-fill: /send/letter?to=Ada&occasion=birthday (from the send assistant).
  useEffect(() => {
    const to = params.get("to")?.trim().slice(0, 80)
    const occasion = OCCASIONS.find((o) => o.id === params.get("occasion"))?.id as OccasionId | undefined
    if (!to && !occasion) return
    setD((cur) => (cur.sent ? newStudioDraft({ recipientName: to, occasion }) : { ...cur, recipientName: cur.recipientName || to || "", occasion: cur.occasion ?? occasion }))
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sign with the sender's first name unless they've chosen something.
  useEffect(() => {
    if (user && !d.signature) setD((cur) => (cur.signature ? cur : { ...cur, signature: user.name.split(" ")[0] }))
  }, [user, d.signature])

  // Draft photos come back from IndexedDB as object URLs for the preview.
  useEffect(() => {
    let live = true
    const made: string[] = []
    void Promise.all(d.moments.photos.map(async (p) => [p.id, await getPhoto(p.id)] as const)).then((rows) => {
      if (!live) return
      const next: Record<string, string> = {}
      for (const [id, blob] of rows) if (blob) made.push((next[id] = URL.createObjectURL(blob)))
      setUrls(next)
    })
    return () => {
      live = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
    // Only on load: later additions go through `photos.add`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const photos: PhotoStore = {
    urls,
    add: (id, blob) => setUrls((u) => ({ ...u, [id]: URL.createObjectURL(blob) })),
    remove: (id) =>
      setUrls((u) => {
        if (u[id]) URL.revokeObjectURL(u[id])
        const { [id]: _gone, ...rest } = u
        return rest
      }),
  }

  const view = useMemo(() => previewView(d, urls), [d, urls])

  // The preview follows whatever is being edited.
  useEffect(() => {
    setPage(d.sent ? "cover" : d.step === "cover" ? "cover" : d.step === "moments" ? (active ?? "table") : "table")
  }, [d.step, active, d.sent])

  const toTop = () => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
  const goStep = (step: StudioStep) => {
    setProblems([])
    if (step !== "moments") setActive(null)
    update({ step })
    toTop()
  }

  const send = useApiMutation(() => sendStudioLetter(d, update), {
    toastError: false,
    invalidate: [qk.myLetters],
    onSuccess: (r) => {
      setD((cur) => ({ ...cur, sent: { id: r.id, link: r.link, status: r.status, sendAt: r.sendAt, contactMasked: r.contactMasked, delivery: r.delivery } }))
      toTop()
    },
  })

  const next = () => {
    const found = studioProblems(d, d.step)
    if (found.length) {
      setProblems(found)
      const target = FIELD_TARGET[found[0].field]
      if (target?.moment && d.step === "moments") setActive(target.moment)
      window.setTimeout(() => document.getElementById(target?.id ?? "")?.focus(), 60)
      return
    }
    if (d.step === "cover") return goStep("moments")
    if (d.step === "moments") return goStep("send")
    if (user) send.mutate()
  }
  const back = () => {
    if (d.step === "moments" && active) return setActive(null)
    if (d.step === "moments") return goStep("cover")
    if (d.step === "send") return goStep("moments")
  }

  const startOver = () => {
    void clearPhotos()
    Object.values(urls).forEach((u) => URL.revokeObjectURL(u))
    setUrls({})
    setActive(null)
    setProblems([])
    setD(newStudioDraft({ signature: user?.name.split(" ")[0] }))
    toTop()
  }

  const onTheme = (theme: LetterTheme) => update({ design: { ...d.design, theme } })
  const themeDisabled = (t: LetterTheme) => (t === "celebration" && !celebrationAllowed(d.occasion) ? "Not for this occasion." : null)
  const sending = send.isPending

  return (
    <>
      <StudioLayout
        steps={STUDIO_STEPS}
        current={d.step}
        finished={Boolean(d.sent)}
        onStep={(id) => goStep(id as StudioStep)}
        startOver={{ title: "Start a new letter?", description: "This letter and its photos will be cleared from this device.", onConfirm: startOver }}
        preview={<PreviewPane letter={view} page={page} onPage={setPage} onTheme={onTheme} themeDisabled={themeDisabled} />}
        actionBar={
          d.sent ? null : (
            <StudioActionBar onBack={back} backDisabled={d.step === "cover"} onPreview={() => setFullPreview(true)}>
              <Button size="lg" className="min-w-28 rounded-full" onClick={next} disabled={sending || (d.step === "send" && !user)}>
                {d.step === "send" ? (
                  <>
                    {sending ? <Spinner data-icon="inline-start" /> : <SendSquareIcon data-icon="inline-start" />}
                    {d.delivery.mode === "link" ? "Create link" : d.delivery.when === "later" ? "Schedule" : "Send"}
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRightIcon data-icon="inline-end" />
                  </>
                )}
              </Button>
            </StudioActionBar>
          )
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={d.sent ? "sent" : d.step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: reduce ? 0 : 0.28 }} className="flex flex-col gap-10">
            {d.sent ? (
              <SentView d={d} onAnother={startOver} onPreview={() => setFullPreview(true)} />
            ) : d.step === "cover" ? (
              <>
                <StepHeading title={<>Write a letter they'll open <span className="text-brand-text italic">again and again</span></>}>
                  Lay your words on a table of flowers, then add your photos, places, a date and your song. Share it by link, QR code or email.
                </StepHeading>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b pb-8">
                  <Button variant="outline" size="lg" className="bg-card rounded-full" onClick={() => setExample(true)}>
                    <EyeIcon data-icon="inline-start" />
                    See an example
                  </Button>
                  <p className="text-muted-foreground max-w-xs text-sm">Free to write, preview and send. Nothing is shared until you press send.</p>
                </div>
                <CoverStep d={d} update={update} problems={problems} />
              </>
            ) : d.step === "moments" ? (
              <>
                {!active && <StepHeading title="Fill the table">Each moment becomes something to pick up and open. Add as many or as few as you like.</StepHeading>}
                <MomentsStep d={d} update={update} problems={problems} active={active} setActive={setActive} photos={photos} />
              </>
            ) : (
              <>
                <StepHeading title={<>Ready to <Underlined>send</Underlined></>}>A few last details before it goes.</StepHeading>
                <SendStep d={d} update={update} problems={problems} onEdit={(s) => goStep(s)} />
                {send.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMessage(send.error)}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </StudioLayout>
      <FullscreenPreview open={fullPreview} onOpenChange={setFullPreview} letter={view} />
      <FullscreenPreview open={example} onOpenChange={setExample} letter={EXAMPLE} title="Example" />
    </>
  )
}

/** A filled-in letter for "See an example". */
const EXAMPLE: LetterView = {
  recipientName: "Ada",
  recipientFirstName: "Ada",
  senderDisplayName: "Tolu",
  body: "Dear Ada,\n\nI've started this letter a dozen times, and every version sounded too small for you. So I'll just say it plainly.\n\nYou make ordinary days feel like something worth remembering. The way you laugh before you get to the end of your own joke. The way you check on everyone, even when you're the one who's tired.\n\nThank you for every slow Sunday, every long drive, and every time you stayed on the phone until I felt better.\n\nHere's to us, and to everything we haven't done yet.",
  occasion: "anniversary",
  sentAt: new Date().toISOString(),
  design: { ...DEFAULT_LETTER_DESIGN, butterflies: true },
  moments: {
    ...EMPTY_MOMENTS,
    reasons: ["The way you laugh before the punchline", "How you check on everyone", "Your Sunday jollof", "How safe I feel with you", "Your terrible dance moves", "The way you believe in me"],
    story: [
      { when: "March 2021", title: "The wrong bus", text: "You got on the wrong bus and somehow it was the right one. We talked all the way to Obalende." },
      { when: "December 2022", title: "Our first trip", text: "Calabar for Christmas. The carnival, the rain, and you insisting we try every kind of afang soup." },
      { when: "Today", title: "Still choosing you", text: "Three years in, and you're still my favourite person to tell everything to." },
    ],
    photos: [
      { url: "/media/occasions/anniversary.webp", caption: "Calabar, 2022" },
      { url: "/media/occasions/just-because.webp", caption: "Sunday mornings" },
      { url: "/media/occasions/wedding.webp", caption: "Tunde's wedding" },
    ],
    date: { on: "2021-03-14", label: "The day we met" },
    places: [
      { name: "Obalende", note: "Where the wrong bus dropped us" },
      { name: "Freedom Park", note: "Our first proper date" },
      { name: "Calabar", note: "Christmas in the rain" },
      { name: "Tarkwa Bay", note: "Where I knew" },
    ],
    wishes: ["More slow Sunday mornings", "A trip somewhere neither of us has been", "That we keep laughing like this"],
    closing: "Always yours",
  },
  sealed: false,
  opensAt: new Date().toISOString(),
}

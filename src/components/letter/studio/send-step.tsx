import { useState } from "react"
import { Link } from "react-router"
import { motion } from "motion/react"
import { cn } from "cn"
import { addDays, LETTER_THEMES, maskContact } from "@domain/index.ts"
import { getApi } from "@/api"
import { ApiError } from "@/api/errors"
import { OtpVerify } from "@/components/otp-verify"
import { ShareCard } from "@/components/share"
import { Confetti } from "@/components/reveal/confetti"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AltArrowDownIcon, ClockCircleIcon, EyeIcon, InfoCircleIcon, LetterIcon, LinkRoundIcon, LockKeyholeIcon, PenIcon } from "@/components/icons"
import { formatDateTime, todayLagos } from "@/lib/format"
import { getPhoto } from "@/lib/letter-photos"
import { includedMoments, MOMENTS, toSendInput, type StudioDraft, type StudioProblem } from "@/lib/letter-studio"
import { useSession } from "@/lib/session"
import { FieldError, SectionTitle } from "./cover-step"

type Update = (patch: Partial<StudioDraft>) => void

/**
 * Uploads any photos still on this device, then sends. Uploaded paths are saved into the draft
 * as they land, so a retry after a dropped connection never uploads the same photo twice.
 */
export async function sendStudioLetter(d: StudioDraft, update: Update) {
  const api = await getApi()
  let photos = d.moments.photos
  const included = includedMoments(d).includes("photos")
  if (included) {
    for (const p of photos) {
      if (p.path) continue
      const blob = await getPhoto(p.id)
      if (!blob) throw new ApiError("validation", "One of your photos is no longer on this device. Remove it and add it again.")
      const { path } = await api.uploadLetterPhoto(blob)
      photos = photos.map((x) => (x.id === p.id ? { ...x, path } : x))
      update({ moments: { ...d.moments, photos } })
    }
  }
  const sent = await api.sendLetter(toSendInput({ ...d, moments: { ...d.moments, photos } }, {}))
  return sent
}

/** Step 3: how it reaches them, when, and who's sending. */
export function SendStep({ d, update, problems, onEdit }: { d: StudioDraft; update: Update; problems: StudioProblem[]; onEdit: (step: "cover" | "moments") => void }) {
  const { user, refresh } = useSession()
  const [email, setEmail] = useState("")
  const [verifying, setVerifying] = useState(false)
  const today = todayLagos()
  const del = d.delivery
  const setDel = (patch: Partial<StudioDraft["delivery"]>) => update({ delivery: { ...del, ...patch } })
  const moments = includedMoments(d)
  const byLink = del.mode === "link"
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  return (
    <div className="flex flex-col gap-8">
      <section className="bg-card ring-border flex flex-col gap-4 rounded-3xl p-5 ring-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="eyebrow text-muted-foreground">Your letter</span>
            <p className="lt-serif text-2xl italic">For {d.recipientName.trim()}</p>
            <p className="text-muted-foreground text-sm">
              From {d.signature.trim()} · {LETTER_THEMES.find((t) => t.id === d.design.theme)!.name} · {moments.length} {moments.length === 1 ? "moment" : "moments"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onEdit("cover")}>
            <PenIcon data-icon="inline-start" />
            Edit
          </Button>
        </div>
        <blockquote className="lt-serif border-brand/40 text-muted-foreground line-clamp-3 border-l-2 pl-4 text-lg italic">“{d.body.trim()}”</blockquote>
        <Collapsible>
          <CollapsibleTrigger className="group/c text-brand-text flex items-center gap-1 text-sm font-semibold">
            See what's included
            <AltArrowDownIcon className="size-4 transition-transform group-data-[state=open]/c:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {moments.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => onEdit("moments")} className="bg-muted hover:bg-brand-soft rounded-full px-3 py-1 text-sm transition-colors">
                    {MOMENTS[id].label}
                  </button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3">
          <SectionTitle>How should it reach them?</SectionTitle>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Delivery">
          {([
            ["link", LinkRoundIcon, "I'll share the link", "Send it on WhatsApp, as a QR code, or anywhere you like."],
            ["email", LetterIcon, "Email it to them", "We email them a private link. No address or phone number needed."],
          ] as const).map(([id, Icon, title, hint]) => (
            <button key={id} type="button" role="radio" aria-checked={del.mode === id} onClick={() => setDel({ mode: id })} className={cn("flex items-start gap-3 rounded-2xl p-4 text-left ring-1 transition-[box-shadow,background-color]", del.mode === id ? "ring-brand bg-brand-soft/60 ring-2" : "bg-card ring-border hover:ring-foreground/25")}>
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", del.mode === id ? "bg-brand text-brand-foreground" : "bg-muted")}>
                <Icon className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-muted-foreground text-sm">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {del.mode === "email" && (
          <div className="flex max-w-md flex-col gap-1.5 pt-2">
            <Label htmlFor="ls-to">Their email</Label>
            <Input id="ls-to" type="email" inputMode="email" autoComplete="off" value={del.email} onChange={(e) => setDel({ email: e.target.value })} placeholder="name@example.com" aria-invalid={problems.some((p) => p.field === "email") || undefined} className="h-12 text-base" />
            <FieldError problems={problems} field="email" />
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3">
          <SectionTitle hint={byLink ? "Until then, the link shows a sealed envelope and a countdown." : undefined}>{byLink ? "When can they open it?" : "When should we send it?"}</SectionTitle>
        </legend>
        <div className="bg-muted/60 grid grid-cols-2 gap-1.5 rounded-2xl p-1.5" role="radiogroup" aria-label="When">
          {([
            ["now", byLink ? "Right away" : "Send now"],
            ["later", byLink ? "On a date I choose" : "Schedule it"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={del.when === id} onClick={() => setDel({ when: id, date: id === "later" ? (del.date ?? addDays(today, 1)) : del.date, time: del.time ?? "09:00" })} className={cn("rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", del.when === id ? "bg-card ring-brand text-brand-text shadow-sm ring-1" : "hover:bg-card/60")}>
              {label}
            </button>
          ))}
        </div>
        {del.when === "later" && (
          <div className="flex flex-wrap gap-3">
            <div className="flex w-48 flex-col gap-1.5">
              <Label htmlFor="ls-on">Date</Label>
              <Input id="ls-on" type="date" min={today} max={addDays(today, 90)} value={del.date ?? ""} onChange={(e) => setDel({ date: e.target.value })} className="h-12" />
            </div>
            <div className="flex w-36 flex-col gap-1.5">
              <Label htmlFor="ls-at">Time (Lagos)</Label>
              <Input id="ls-at" type="time" value={del.time ?? "09:00"} onChange={(e) => setDel({ time: e.target.value })} className="h-12" />
            </div>
          </div>
        )}
        <FieldError problems={problems} field="when" />
      </fieldset>

      {!user ? (
        <section className="bg-card ring-border flex flex-col gap-4 rounded-3xl p-5 ring-1">
          <div className="flex gap-3">
            <LockKeyholeIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Confirm your email to send</p>
              <p className="text-muted-foreground text-sm">Letters are free. We confirm every sender's email so they can't be used for spam. Your letter stays saved on this device while you do this.</p>
            </div>
          </div>
          {!verifying ? (
            <form className="flex max-w-md items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (validEmail) setVerifying(true) }}>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="ls-me">Your email</Label>
                <Input id="ls-me" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
              </div>
              <Button type="submit" size="lg" className="h-12" disabled={!validEmail}>Continue</Button>
            </form>
          ) : (
            <OtpVerify
              destination={maskContact(email)}
              send={async () => (await getApi()).signInWithEmail(email, "/send/letter")}
              verify={async (code) => {
                await (await getApi()).verifyEmailCode(email, code)
                await refresh()
              }}
              submitLabel="Confirm"
            />
          )}
        </section>
      ) : (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <InfoCircleIcon className="size-4" />
          Sending as {user.email}. Free, and you can manage it from Your letters.
        </p>
      )}
    </div>
  )
}

/** After sending: the link (shown once), or confirmation of the email. */
export function SentView({ d, onAnother, onPreview }: { d: StudioDraft; onAnother: () => void; onPreview: () => void }) {
  const sent = d.sent!
  const url = sent.link ? `${window.location.origin}${sent.link}` : null
  const scheduled = sent.status === "scheduled"
  const first = d.recipientName.trim().split(" ")[0]
  return (
    <div className="relative flex flex-col gap-6">
      <Confetti count={80} origin={{ x: 30, y: 10 }} />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
        <span aria-hidden="true" className="bg-brand h-0.5 w-12 rounded-full" />
        <h1 className="font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] font-medium tracking-tight">
          {url ? (
            <>
              Your letter is <span className="text-brand-text italic">ready</span>
            </>
          ) : scheduled ? (
            "Letter scheduled"
          ) : (
            <>
              Letter <span className="text-brand-text italic">sent</span>
            </>
          )}
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-pretty">
          {url
            ? scheduled
              ? `Share the link with ${first} now. It shows a sealed envelope and a countdown until ${formatDateTime(sent.sendAt)} (Lagos time).`
              : `Send this link to ${first}. It opens straight onto your envelope.`
            : scheduled
              ? `We'll email ${sent.contactMasked} on ${formatDateTime(sent.sendAt)} (Lagos time). You can cancel it from Your letters until then.`
              : `We've emailed ${first} at ${sent.contactMasked} with a private link to open it.`}
        </p>
      </motion.div>
      {url && (
        <>
          <ShareCard url={url} title={`A letter for ${first}`} filename="letter" />
          <p className="bg-warning-soft text-warning flex gap-2 rounded-2xl p-3 text-sm">
            <LockKeyholeIcon className="mt-0.5 size-4 shrink-0" />
            Copy or download it now. For privacy we only show a letter's link once. If you lose it, you can make a new one from Your letters, and the old one will stop working.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {url ? (
          <Button asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <EyeIcon data-icon="inline-start" />
              Open it as {first} will
            </a>
          </Button>
        ) : (
          <Button onClick={onPreview}>
            <EyeIcon data-icon="inline-start" />
            See it as {first} will
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link to="/account/letters">
            <ClockCircleIcon data-icon="inline-start" />
            Your letters
          </Link>
        </Button>
        <Button variant="ghost" onClick={onAnother}>
          <PenIcon data-icon="inline-start" />
          Write another letter
        </Button>
      </div>
    </div>
  )
}

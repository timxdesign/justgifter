import { useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import { cn } from "cn"
import { LETTER_MAX_CHARS, LETTER_TONES, MOMENT_IDS, MOMENT_LIMITS, parseSongLink, SONG_PROVIDERS, type LetterRevision, type LetterTone, type MomentId, type OccasionId } from "@domain/index.ts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { AddIcon, AltArrowLeftIcon, AltArrowRightIcon, ArrowLeftIcon, CheckCircleIcon, CloseIcon, GalleryAddIcon, InfoCircleIcon, MagicWandIcon, PenIcon, StarsIcon, TrashBinMinimalisticIcon, UndoLeftIcon } from "@/components/icons"
import { useApiMutation } from "@/lib/api-hooks"
import { IMAGE_ACCEPT, isHeic, LETTER_PHOTO, prepareImage } from "@/lib/images"
import { deletePhoto, newPhotoId, putPhoto } from "@/lib/letter-photos"
import { CLOSINGS, hasContent, momentState, MOMENTS, STARTERS, type DraftMoments, type StudioDraft, type StudioProblem } from "@/lib/letter-studio"
import { FLOWER_PALETTE, MomentObject } from "../art"
import { FieldError, SectionTitle } from "./cover-step"

type Update = (patch: Partial<StudioDraft>) => void

export interface PhotoStore {
  urls: Record<string, string>
  add: (id: string, blob: Blob) => void
  remove: (id: string) => void
}

const STATE_LABEL = { required: "Required", done: "Added", empty: "Add", off: "Hidden" } as const

/** Step 2: the table of moments, and an editor for whichever one is open. */
export function MomentsStep({ d, update, problems, active, setActive, photos }: { d: StudioDraft; update: Update; problems: StudioProblem[]; active: MomentId | null; setActive: (id: MomentId | null) => void; photos: PhotoStore }) {
  const accent = FLOWER_PALETTE[d.design.flowers].accent
  if (!active) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-3">
          <SectionTitle hint="The letter is the only thing you have to write. Everything else is optional.">What awaits {d.recipientName.trim().split(" ")[0] || "them"}</SectionTitle>
          {!d.body.trim() && (
            <button type="button" className="text-brand-text shrink-0 text-sm font-semibold" onClick={() => setActive("letter")}>
              Start with the letter
            </button>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MOMENT_IDS.map((id, i) => {
            const st = momentState(d, id)
            return (
              <li key={id}>
                <motion.button
                  type="button"
                  onClick={() => setActive(id)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.035 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  className={cn("group bg-card relative flex w-full flex-col items-center gap-2 rounded-3xl px-3 pt-4 pb-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_10px_24px_-14px_rgb(60_35_20/0.35)] ring-1 transition-shadow", st === "required" ? "ring-brand ring-2" : st === "done" ? "ring-brand/40" : "ring-border")}
                >
                  <MomentObject id={id} accent={accent} className="h-20 w-20 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105" />
                  <span className="font-medium">{MOMENTS[id].label}</span>
                  <span className={cn("flex items-center gap-1 text-sm", st === "required" ? "text-brand-text font-semibold" : st === "done" ? "text-success font-medium" : "text-muted-foreground")}>
                    {st === "done" && <CheckCircleIcon className="size-4" />}
                    {STATE_LABEL[st]}
                  </span>
                </motion.button>
              </li>
            )
          })}
        </ul>
        <FieldError problems={problems} field="body" />
      </div>
    )
  }

  const idx = MOMENT_IDS.indexOf(active)
  const st = momentState(d, active)
  const setM = (patch: Partial<DraftMoments>) => update({ moments: { ...d.moments, ...patch } })
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" className="rounded-full" onClick={() => setActive(null)}>
          <ArrowLeftIcon data-icon="inline-start" />
          All moments
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="rounded-full" disabled={idx === 0} onClick={() => setActive(MOMENT_IDS[idx - 1])} aria-label={`Previous: ${idx > 0 ? MOMENTS[MOMENT_IDS[idx - 1]].label : ""}`}>
            <AltArrowLeftIcon />
          </Button>
          <span className="text-muted-foreground min-w-12 text-center text-sm tabular-nums">
            {idx + 1} of {MOMENT_IDS.length}
          </span>
          <Button variant="outline" size="icon" className="rounded-full" disabled={idx === MOMENT_IDS.length - 1} onClick={() => setActive(MOMENT_IDS[idx + 1])} aria-label={`Next: ${idx < MOMENT_IDS.length - 1 ? MOMENTS[MOMENT_IDS[idx + 1]].label : ""}`}>
            <AltArrowRightIcon />
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={active} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }} className="flex flex-col gap-6">
          <header className="lt-linen relative flex min-h-36 items-end overflow-hidden rounded-3xl p-5 ring-1 ring-black/5 sm:p-6">
            <MomentObject id={active} accent={accent} className="lt-sway absolute -top-2 right-3 w-28 drop-shadow-[0_12px_14px_rgb(40_20_10/0.3)] sm:right-8 sm:w-36" />
            <div className="relative flex max-w-[70%] flex-col gap-1">
              <p className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: accent }}>
                  {MOMENTS[active].label}
                </span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-[#6b5a4e]">{st === "empty" ? "Still empty" : st === "required" ? "Required" : st === "off" ? "Hidden" : "Added"}</span>
              </p>
              <h2 className="lt-serif text-3xl leading-tight text-[#35251f] italic sm:text-4xl">{MOMENTS[active].title}</h2>
              <p className="text-sm text-pretty text-[#6b5a4e]">{MOMENTS[active].blurb}</p>
            </div>
          </header>

          {active !== "letter" && hasContent(d.moments, active) && (
            <label className="bg-card ring-border flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1">
              <span className="font-medium">Include {MOMENTS[active].label} in the letter</span>
              <Switch checked={!d.off.includes(active)} onCheckedChange={(v) => update({ off: v ? d.off.filter((x) => x !== active) : [...d.off, active] })} />
            </label>
          )}

          {active === "letter" ? (
            <LetterEditor d={d} update={update} problems={problems} />
          ) : active === "reasons" ? (
            <ListEditor label="Reasons" items={d.moments.reasons} onChange={(reasons) => setM({ reasons })} max={MOMENT_LIMITS.reasons.items} maxChars={MOMENT_LIMITS.reasons.chars} placeholder="Something you love about them…" starters={STARTERS.reasons ?? []} />
          ) : active === "wishes" ? (
            <ListEditor label="Wishes" items={d.moments.wishes} onChange={(wishes) => setM({ wishes })} max={MOMENT_LIMITS.wishes.items} maxChars={MOMENT_LIMITS.wishes.chars} placeholder="Something you wish for them, or for you both…" starters={STARTERS.wishes ?? []} />
          ) : active === "story" ? (
            <StoryEditor d={d} setM={setM} />
          ) : active === "photos" ? (
            <PhotosEditor d={d} setM={setM} photos={photos} />
          ) : active === "date" ? (
            <DateEditor d={d} setM={setM} />
          ) : active === "places" ? (
            <PlacesEditor d={d} setM={setM} />
          ) : (
            <SongEditor d={d} setM={setM} problems={problems} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------- The letter

const QUICK: { id: LetterRevision; label: string }[] = [
  { id: "shorter", label: "Make it shorter" },
  { id: "warmer", label: "Make it warmer" },
]

function LetterEditor({ d, update, problems }: { d: StudioDraft; update: Update; problems: StudioProblem[] }) {
  return (
    <LetterWriter
      body={d.body}
      onBody={(body) => update({ body })}
      tone={d.tone}
      onTone={(tone) => update({ tone })}
      recipientName={d.recipientName}
      occasion={d.occasion}
      signature={d.signature}
      closing={d.moments.closing}
      onClosing={(closing) => update({ moments: { ...d.moments, closing } })}
      problems={problems}
    />
  )
}

export interface LetterWriterProps {
  body: string
  onBody: (body: string) => void
  tone?: LetterTone
  onTone: (tone: LetterTone) => void
  recipientName: string
  occasion?: OccasionId
  signature: string
  /** Closing words, when the letter has a place for them (letters on their own). */
  closing?: string
  onClosing?: (closing: string) => void
  problems: StudioProblem[]
}

/** The letter itself, with help to draft, polish, shorten or warm it, and undo. Shared by both studios. */
export function LetterWriter({ body, onBody, tone, onTone, recipientName, occasion, signature, closing, onClosing, problems }: LetterWriterProps) {

  const [helper, setHelper] = useState(!body.trim())
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const brief = { recipientName: recipientName.trim() || undefined, occasion, tone, message: message.trim() || undefined, signature: signature.trim() || undefined }
  const apply = (next: string) => {
    setHistory((h) => [...h.slice(-9), body])
    onBody(next)
  }
  const compose = useApiMutation((api, mode: "draft" | "improve" | LetterRevision) =>
    api.composeLetter(mode === "draft" ? { brief, mode: "draft" } : mode === "improve" ? { brief, mode: "improve", draft: body } : { brief, mode: "revise", revision: mode, draft: body }),
  {
    onSuccess: (r) => {
      apply(r.body)
      setHelper(false)
    },
  })
  const busy = compose.isPending
  const over = body.length > LETTER_MAX_CHARS
  return (
    <div className="flex flex-col gap-6">
      <div className="from-brand-soft border-brand/20 flex flex-col gap-4 rounded-3xl border bg-gradient-to-br to-transparent p-4 sm:p-5">
        <button type="button" onClick={() => setHelper((h) => !h)} aria-expanded={helper} className="flex items-center gap-3 text-left">
          <span className="bg-brand text-brand-foreground grid size-11 shrink-0 place-items-center rounded-full">
            <MagicWandIcon className="size-5" />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="font-semibold">{body.trim() ? "Polish it with help" : "Help me write it"}</span>
            <span className="text-muted-foreground text-sm">{body.trim() ? "Tidy what you wrote, or make it shorter or warmer. You can undo anything." : "Say what you want them to know and pick a tone. You'll edit the draft before anything is sent."}</span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {helper && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-4 pt-1">
                {!body.trim() && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="ls-brief">What do you want them to know or feel?</Label>
                      <Textarea id="ls-brief" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1200} rows={3} placeholder="e.g. how proud I am of you, and that I'm always in your corner" className="bg-card resize-none text-base" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium" id="ls-tone">Tone</span>
                      <div role="radiogroup" aria-labelledby="ls-tone" className="flex flex-wrap gap-2">
                        {LETTER_TONES.map((t) => (
                          <button key={t.id} type="button" role="radio" aria-checked={tone === t.id} onClick={() => onTone(t.id as LetterTone)} className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", tone === t.id ? "border-brand bg-card text-brand-text font-medium" : "bg-card hover:border-foreground/30")}>
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {!body.trim() ? (
                    <Button disabled={busy || !message.trim()} onClick={() => compose.mutate("draft")}>
                      {busy ? <Spinner data-icon="inline-start" /> : <StarsIcon data-icon="inline-start" />}
                      Write a draft
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" className="bg-card" disabled={busy} onClick={() => compose.mutate("improve")}>
                        {busy && compose.variables === "improve" ? <Spinner data-icon="inline-start" /> : <StarsIcon data-icon="inline-start" />}
                        Polish what I wrote
                      </Button>
                      {QUICK.map((q) => (
                        <Button key={q.id} variant="outline" className="bg-card" disabled={busy} onClick={() => compose.mutate(q.id)}>
                          {busy && compose.variables === q.id && <Spinner data-icon="inline-start" />}
                          {q.label}
                        </Button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ls-body" className="eyebrow text-foreground">
            Your letter <span className="text-brand-text" aria-hidden="true">*</span>
          </Label>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { onBody(history.at(-1)!); setHistory((h) => h.slice(0, -1)) }}>
              <UndoLeftIcon data-icon="inline-start" />
              Undo
            </Button>
          )}
        </div>
        <div className={cn("lt-paper relative rounded-2xl ring-1 transition-[box-shadow,opacity] focus-within:ring-2", over ? "ring-destructive" : "ring-border focus-within:ring-brand", busy && "opacity-60")}>
          <Textarea
            id="ls-body"
            value={body}
            onChange={(e) => onBody(e.target.value)}
            disabled={busy}
            placeholder={`Dear ${recipientName.trim().split(" ")[0] || "…"},`}
            aria-invalid={over || problems.some((p) => p.field === "body") || undefined}
            className="lt-serif min-h-72 resize-none border-0 bg-transparent px-5 py-4 text-[1.1875rem] leading-relaxed text-[#35251f] shadow-none [field-sizing:content] focus-visible:ring-0 dark:bg-transparent"
          />
          <PenIcon aria-hidden="true" className="pointer-events-none absolute top-4 right-4 size-4 text-[#b3a08e]" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <FieldError problems={problems} field="body" />
          <span className={cn("ml-auto text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {body.length.toLocaleString()} / {LETTER_MAX_CHARS.toLocaleString()}
          </span>
        </div>
      </div>

      {onClosing && closing !== undefined && (
      <div className="flex flex-col gap-2">
        <Label htmlFor="ls-closing" className="eyebrow text-foreground">
          Closing words <span className="text-muted-foreground font-normal tracking-normal normal-case">(optional)</span>
        </Label>
        <Input id="ls-closing" value={closing} onChange={(e) => onClosing(e.target.value)} maxLength={MOMENT_LIMITS.closing} placeholder="Shown at the very end, above your signature" className="h-12 text-base" />
        <div className="flex flex-wrap gap-1.5">
          {CLOSINGS.map((c) => (
            <button key={c} type="button" onClick={() => onClosing(c)} className="text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-full border px-3 py-1 text-sm transition-colors">
              {c}
            </button>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Lists

function ListEditor({ label, items, onChange, max, maxChars, placeholder, starters }: { label: string; items: string[]; onChange: (v: string[]) => void; max: number; maxChars: number; placeholder: string; starters: string[] }) {
  const [draft, setDraft] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const add = (text: string) => {
    const t = text.trim()
    if (!t || items.length >= max) return
    onChange([...items, t.slice(0, maxChars)])
    setDraft("")
    input.current?.focus()
  }
  const unused = starters.filter((s) => !items.includes(s))
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2" aria-label={label}>
        <AnimatePresence initial={false}>
          {items.map((it, i) => (
            <motion.li key={`${i}-${items.length}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="bg-card ring-border flex items-center gap-2 rounded-2xl py-1.5 pr-1.5 pl-4 ring-1">
              <span className="text-muted-foreground w-5 shrink-0 text-sm tabular-nums">{i + 1}.</span>
              <Input aria-label={`${label} ${i + 1}`} value={it} maxLength={maxChars} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="h-10 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 dark:bg-transparent" />
              <Button variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <CloseIcon />
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {items.length < max ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(draft) }}>
          <Input ref={input} aria-label={`Add to ${label.toLowerCase()}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={maxChars} placeholder={placeholder} className="h-12 text-base" />
          <Button type="submit" size="lg" className="h-12" disabled={!draft.trim()}>
            <AddIcon data-icon="inline-start" />
            Add
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-sm">That's the most a letter can hold ({max}).</p>
      )}
      <p className="text-muted-foreground text-xs tabular-nums">
        {items.length} of {max}
      </p>
      {unused.length > 0 && items.length < max && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">Need a nudge? Tap one to add it, then make it yours.</p>
          <div className="flex flex-wrap gap-1.5">
            {unused.map((s) => (
              <button key={s} type="button" onClick={() => add(s)} className="hover:border-brand hover:text-brand-text flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm transition-colors">
                <AddIcon className="size-3.5" />
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Story

function StoryEditor({ d, setM }: { d: StudioDraft; setM: (p: Partial<DraftMoments>) => void }) {
  const L = MOMENT_LIMITS.story
  const story = d.moments.story
  const set = (i: number, patch: Partial<(typeof story)[number]>) => setM({ story: story.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const move = (i: number, by: number) => {
    const next = [...story]
    const [c] = next.splice(i, 1)
    next.splice(i + by, 0, c)
    setM({ story: next })
  }
  return (
    <div className="flex flex-col gap-4">
      {story.length === 0 && <p className="text-muted-foreground text-sm">Each chapter is a page in the book: when it happened, a title, and a few lines about it.</p>}
      <ol className="flex flex-col gap-3">
        {story.map((c, i) => (
          <li key={i} className="bg-card ring-border flex flex-col gap-3 rounded-2xl p-4 ring-1">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow text-muted-foreground">Chapter {i + 1}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move chapter ${i + 1} earlier`}>
                  <AltArrowLeftIcon className="rotate-90" />
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={i === story.length - 1} onClick={() => move(i, 1)} aria-label={`Move chapter ${i + 1} later`}>
                  <AltArrowRightIcon className="rotate-90" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setM({ story: story.filter((_, j) => j !== i) })} aria-label={`Remove chapter ${i + 1}`}>
                  <TrashBinMinimalisticIcon />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Input aria-label={`Chapter ${i + 1}: when`} value={c.when} maxLength={L.when} onChange={(e) => set(i, { when: e.target.value })} placeholder="When (e.g. June 2019)" className="h-11" />
              <Input aria-label={`Chapter ${i + 1}: title`} value={c.title} maxLength={L.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Title (e.g. The day we met)" className="h-11" />
            </div>
            <Textarea aria-label={`Chapter ${i + 1}: what happened`} value={c.text} maxLength={L.text} onChange={(e) => set(i, { text: e.target.value })} rows={3} placeholder="What happened, in a few lines" className="resize-none text-base" />
          </li>
        ))}
      </ol>
      {story.length < L.items && (
        <Button variant="outline" className="w-fit rounded-full" onClick={() => setM({ story: [...story, { when: "", title: "", text: "" }] })}>
          <AddIcon data-icon="inline-start" />
          Add a chapter
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Photos

function PhotosEditor({ d, setM, photos }: { d: StudioDraft; setM: (p: Partial<DraftMoments>) => void; photos: PhotoStore }) {
  const L = MOMENT_LIMITS.photos
  const list = d.moments.photos
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const addFiles = async (files: FileList | File[]) => {
    const room = L.items - list.length
    const chosen = Array.from(files).slice(0, room)
    if (Array.from(files).length > room) toast.info(`A letter can hold ${L.items} photos, so only the first ${room} were added.`)
    if (!chosen.length) return
    const added: typeof list = []
    for (const [n, f] of chosen.entries()) {
      // HEIC can take a few seconds to convert, so say what's happening.
      setBusy(`${isHeic(f) ? "Converting" : "Preparing"} photo ${n + 1} of ${chosen.length}…`)
      try {
        const blob = await prepareImage(f, LETTER_PHOTO)
        const id = newPhotoId()
        await putPhoto(id, blob)
        photos.add(id, blob)
        added.push({ id, caption: "" })
      } catch (e) {
        toast.error(e instanceof Error && e.message !== "IndexedDB unavailable" ? e.message : "This browser can't keep photos for a draft. Try another browser.")
      }
    }
    setM({ photos: [...list, ...added] })
    setBusy(null)
  }
  const remove = (id: string) => {
    setM({ photos: list.filter((p) => p.id !== id) })
    photos.remove(id)
    void deletePhoto(id)
  }
  const move = (i: number, by: number) => {
    const next = [...list]
    const [p] = next.splice(i, 1)
    next.splice(i + by, 0, p)
    setM({ photos: next })
  }
  return (
    <div className="flex flex-col gap-4">
      {list.length < L.items && (
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles(e.dataTransfer.files) }}
          className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2", over ? "border-brand bg-brand-soft" : "hover:border-foreground/30")}
        >
          {busy ? <Spinner className="size-6" /> : <GalleryAddIcon className="text-brand-text size-8" />}
          <span className="font-medium" aria-live="polite">{busy ?? "Choose photos, or drop them here"}</span>
          <span className="text-muted-foreground text-sm">JPEG, PNG, WebP or HEIC · up to {L.items} photos</span>
          <input type="file" accept={IMAGE_ACCEPT} multiple className="sr-only" disabled={Boolean(busy)} onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = "" }} />
        </label>
      )}
      {list.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((p, i) => (
            <li key={p.id} className="bg-card ring-border flex flex-col gap-2 rounded-2xl p-2 ring-1">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-xl">
                {photos.urls[p.id] ? <img src={photos.urls[p.id]} alt={p.caption || `Photo ${i + 1}`} className="size-full object-cover" /> : <span className="text-muted-foreground grid size-full place-items-center p-2 text-center text-xs">Missing on this device</span>}
                <div className="absolute top-1.5 right-1.5 flex gap-1">
                  <Button variant="outline" size="icon-sm" className="rounded-full border-0 bg-white/90 text-[#35251f] shadow backdrop-blur hover:bg-white" onClick={() => remove(p.id)} aria-label={`Remove photo ${i + 1}`}>
                    <TrashBinMinimalisticIcon />
                  </Button>
                </div>
                <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                  <Button variant="outline" size="icon-sm" className="rounded-full border-0 bg-white/90 text-[#35251f] shadow backdrop-blur hover:bg-white" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move photo ${i + 1} earlier`}>
                    <AltArrowLeftIcon />
                  </Button>
                  <Button variant="outline" size="icon-sm" className="rounded-full border-0 bg-white/90 text-[#35251f] shadow backdrop-blur hover:bg-white" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move photo ${i + 1} later`}>
                    <AltArrowRightIcon />
                  </Button>
                </div>
              </div>
              <Input aria-label={`Caption for photo ${i + 1}`} value={p.caption} maxLength={L.caption} onChange={(e) => setM({ photos: list.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)) })} placeholder="Caption (optional)" className="h-9 text-sm" />
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground flex gap-1.5 text-xs">
        <InfoCircleIcon className="mt-0.5 size-3.5 shrink-0" />
        Photos stay on this device until you send. We compress them so the letter loads fast, remove location data, and only people with the letter's link can see them.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- Date, places, song

const DATE_LABELS = ["The day we met", "Our first date", "Our wedding day", "The day you were born", "When it all began"]

function DateEditor({ d, setM }: { d: StudioDraft; setM: (p: Partial<DraftMoments>) => void }) {
  const date = d.moments.date
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ls-date">The date</Label>
          <Input id="ls-date" type="date" min="1900-01-01" max="2100-12-31" value={date?.on ?? ""} onChange={(e) => setM({ date: e.target.value ? { on: e.target.value, label: date?.label ?? "" } : null })} className="h-12 text-base" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ls-date-label">What happened</Label>
          <Input id="ls-date-label" value={date?.label ?? ""} disabled={!date} maxLength={MOMENT_LIMITS.date.label} onChange={(e) => date && setM({ date: { ...date, label: e.target.value } })} placeholder={date ? "e.g. The day we met" : "Choose a date first"} className="h-12 text-base" />
        </div>
      </div>
      {date && (
        <div className="flex flex-wrap gap-1.5">
          {DATE_LABELS.map((l) => (
            <button key={l} type="button" onClick={() => setM({ date: { ...date, label: l } })} className="text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-full border px-3 py-1 text-sm transition-colors">
              {l}
            </button>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-sm">A past date counts the days since. A future one counts down.</p>
      {date && (
        <Button variant="ghost" className="w-fit" onClick={() => setM({ date: null })}>
          <TrashBinMinimalisticIcon data-icon="inline-start" />
          Remove the date
        </Button>
      )}
    </div>
  )
}

function PlacesEditor({ d, setM }: { d: StudioDraft; setM: (p: Partial<DraftMoments>) => void }) {
  const L = MOMENT_LIMITS.places
  const places = d.moments.places
  const set = (i: number, patch: Partial<(typeof places)[number]>) => setM({ places: places.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  return (
    <div className="flex flex-col gap-4">
      {places.length === 0 && <p className="text-muted-foreground text-sm">Where you met, a favourite spot, a trip you took. They're pinned on a map in the order you add them.</p>}
      <ol className="flex flex-col gap-3">
        {places.map((p, i) => (
          <li key={i} className="bg-card ring-border flex gap-3 rounded-2xl p-3 ring-1">
            <span className="bg-brand text-brand-foreground mt-1.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold">{i + 1}</span>
            <div className="flex flex-1 flex-col gap-2">
              <Input aria-label={`Place ${i + 1}: name`} value={p.name} maxLength={L.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="e.g. Tarkwa Bay" className="h-11 text-base" />
              <Input aria-label={`Place ${i + 1}: why it matters`} value={p.note} maxLength={L.note} onChange={(e) => set(i, { note: e.target.value })} placeholder="Why it matters (optional)" className="h-10" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setM({ places: places.filter((_, j) => j !== i) })} aria-label={`Remove place ${i + 1}`}>
              <TrashBinMinimalisticIcon />
            </Button>
          </li>
        ))}
      </ol>
      {places.length < L.items && (
        <Button variant="outline" className="w-fit rounded-full" onClick={() => setM({ places: [...places, { name: "", note: "" }] })}>
          <AddIcon data-icon="inline-start" />
          Add a place
        </Button>
      )}
    </div>
  )
}

function SongEditor({ d, setM, problems }: { d: StudioDraft; setM: (p: Partial<DraftMoments>) => void; problems: StudioProblem[] }) {
  const song = d.moments.song ?? { url: "", title: "", note: "" }
  const embed = song.url.trim() ? parseSongLink(song.url) : null
  const set = (patch: Partial<typeof song>) => {
    const next = { ...song, ...patch }
    setM({ song: next.url.trim() || next.title.trim() || next.note.trim() ? next : null })
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ls-song">Song link</Label>
        <Input id="ls-song" type="url" inputMode="url" value={song.url} onChange={(e) => set({ url: e.target.value })} placeholder="Paste a Spotify, YouTube, Apple Music or Audiomack link" aria-invalid={(song.url.trim() !== "" && !embed) || undefined} className="h-12 text-base" />
        {song.url.trim() !== "" &&
          (embed ? (
            <p className="text-success flex items-center gap-1.5 text-sm font-medium">
              <CheckCircleIcon className="size-4" />
              {SONG_PROVIDERS[embed.provider]} link. They'll press play to listen.
            </p>
          ) : (
            <p className="text-destructive text-sm">That link isn't from Spotify, YouTube, Apple Music or Audiomack.</p>
          ))}
        <FieldError problems={problems} field="song" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ls-song-title">Song name</Label>
        <Input id="ls-song-title" value={song.title} maxLength={MOMENT_LIMITS.song.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Essence — Wizkid ft. Tems" className="h-12 text-base" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ls-song-note">Why this song <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea id="ls-song-note" value={song.note} maxLength={MOMENT_LIMITS.song.note} onChange={(e) => set({ note: e.target.value })} rows={2} placeholder="e.g. It was playing the first time you smiled at me." className="resize-none text-base" />
      </div>
    </div>
  )
}

export function MomentChips({ d, onOpen }: { d: StudioDraft; onOpen: (id: MomentId) => void }): ReactNode {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {MOMENT_IDS.filter((id) => momentState(d, id) === "done").map((id) => (
        <li key={id}>
          <button type="button" onClick={() => onOpen(id)} className="bg-card ring-border hover:ring-brand flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 transition-shadow">
            <CheckCircleIcon className="text-success size-3.5" />
            {MOMENTS[id].label}
          </button>
        </li>
      ))}
    </ul>
  )
}

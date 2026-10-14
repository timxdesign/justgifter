import type { DateOnly, LetterDesign, LetterMoments, LetterTone, MomentId, OccasionId, SendLetterInput } from "@domain/index.ts"
import { DEFAULT_LETTER_DESIGN, EMPTY_MOMENTS, LAUNCH_TIMEZONE, LETTER_MAX_CHARS, LETTER_SIGNATURE_MAX, MOMENT_IDS, occasionById, parseSongLink, sanitiseLetterDesign, zonedTimeToUtc } from "@domain/index.ts"
import type { LetterView, LetterViewMoments } from "@/api"

/**
 * The letter studio as plain data: the draft, what each moment is called, what's missing before
 * each step, and the payload sent to the API. Nothing here renders, so it's tested directly
 * (letter-studio.test.ts). Photos live in IndexedDB until sending (letter-photos.ts); the draft
 * only holds their ids, captions and, once uploaded, their storage paths.
 */

export type StudioStep = "cover" | "moments" | "send"
export const STUDIO_STEPS: { id: StudioStep; label: string }[] = [
  { id: "cover", label: "Cover" },
  { id: "moments", label: "Moments" },
  { id: "send", label: "Send" },
]

export interface DraftPhoto {
  /** Key of the image blob in IndexedDB. */
  id: string
  caption: string
  /** Set once uploaded, so a retried send doesn't upload twice. */
  path?: string
}

export type DraftMoments = Omit<LetterMoments, "photos"> & { photos: DraftPhoto[] }

export interface StudioDraft {
  v: 1
  /** Generated once; makes a retried send idempotent. */
  clientRef: string
  step: StudioStep
  recipientName: string
  /** How the sender signs: shown on the cover and at the end of the letter. */
  signature: string
  occasion?: OccasionId
  tone?: LetterTone
  design: LetterDesign
  body: string
  moments: DraftMoments
  /** Moments switched off without losing what was written in them. */
  off: MomentId[]
  delivery: { mode: "link" | "email"; email: string; when: "now" | "later"; date?: DateOnly; time?: string }
  sent?: { id: string; link: string | null; status: "scheduled" | "sent" | "opened" | "cancelled" | "failed"; sendAt: string; contactMasked: string; delivery: "link" | "email" }
}

function randomRef() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function newStudioDraft(prefill: { recipientName?: string; signature?: string; occasion?: OccasionId; body?: string } = {}): StudioDraft {
  return {
    v: 1,
    clientRef: randomRef(),
    step: "cover",
    recipientName: prefill.recipientName ?? "",
    signature: prefill.signature ?? "",
    occasion: prefill.occasion,
    design: defaultDesignFor(prefill.occasion),
    body: prefill.body ?? "",
    moments: { ...EMPTY_MOMENTS, photos: [] },
    off: [],
    delivery: { mode: "link", email: "", when: "now" },
  }
}

/** Celebration suits happy news only; sad occasions start (and stay) quiet. */
export const celebrationAllowed = (occasion?: OccasionId) => !occasionById(occasion)?.sensitive

export function defaultDesignFor(occasion?: OccasionId): LetterDesign {
  if (occasion === "birthday" || occasion === "graduation") return { ...DEFAULT_LETTER_DESIGN, theme: "celebration", flowers: occasion === "graduation" ? "sunflowers" : "peonies" }
  if (occasion === "sympathy" || occasion === "get-well") return { ...DEFAULT_LETTER_DESIGN, flowers: "lavender", petals: false, gold: false }
  return { ...DEFAULT_LETTER_DESIGN }
}

// ---------------------------------------------------------------- Moments

export interface MomentMeta {
  id: MomentId
  /** Short name for the object on the table. */
  label: string
  /** Scene title in the letter. */
  title: string
  /** One line telling the sender what it becomes. */
  blurb: string
}

export const MOMENTS: Record<MomentId, MomentMeta> = {
  letter: { id: "letter", label: "The letter", title: "A letter for you", blurb: "Your words on warm paper, unfolded when they open it." },
  reasons: { id: "reasons", label: "What I love", title: "A bouquet of reasons", blurb: "Every reason you write becomes a flower they can pick." },
  story: { id: "story", label: "Our story", title: "A book of us", blurb: "Chapters of your story, in a book they turn page by page." },
  photos: { id: "photos", label: "Our photos", title: "The ones we kept", blurb: "A stack of polaroids to flick through." },
  date: { id: "date", label: "Our day", title: "A day worth counting", blurb: "A date that matters, with a live count of the days since (or until)." },
  places: { id: "places", label: "Our places", title: "The map of us", blurb: "Places that matter, pinned and joined on a paper map." },
  wishes: { id: "wishes", label: "Our wishes", title: "Wishes on a dandelion", blurb: "They blow the dandelion and your wishes float out." },
  song: { id: "song", label: "Our song", title: "Press play", blurb: "A record that spins while your song plays." },
}

export function hasContent(m: DraftMoments, id: MomentId, body = "x") {
  switch (id) {
    case "letter":
      return Boolean(body.trim())
    case "date":
      return Boolean(m.date)
    case "song":
      return Boolean(m.song?.url)
    default:
      return m[id].length > 0
  }
}

/** Moments the letter will carry, in order. The letter itself is always first. */
export function includedMoments(d: StudioDraft): MomentId[] {
  return MOMENT_IDS.filter((id) => id === "letter" || (!d.off.includes(id) && hasContent(d.moments, id)))
}

export type MomentState = "required" | "done" | "empty" | "off"
export function momentState(d: StudioDraft, id: MomentId): MomentState {
  if (id === "letter") return d.body.trim() ? "done" : "required"
  if (!hasContent(d.moments, id)) return "empty"
  return d.off.includes(id) ? "off" : "done"
}

// ---------------------------------------------------------------- Checks

export interface StudioProblem {
  field: string
  message: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** What has to be fixed before leaving a step. Empty when it's fine to continue. */
export function studioProblems(d: StudioDraft, step: StudioStep, now = new Date()): StudioProblem[] {
  const out: StudioProblem[] = []
  if (step === "cover") {
    if (!d.recipientName.trim()) out.push({ field: "recipientName", message: "Add their name. It goes on the envelope." })
    if (!d.signature.trim()) out.push({ field: "signature", message: "Add how you'll sign it." })
    if (d.signature.length > LETTER_SIGNATURE_MAX) out.push({ field: "signature", message: `Keep your signature under ${LETTER_SIGNATURE_MAX} characters.` })
  }
  if (step === "moments") {
    if (!d.body.trim()) out.push({ field: "body", message: "Write the letter first. Everything else is optional." })
    if (d.body.length > LETTER_MAX_CHARS) out.push({ field: "body", message: `Keep the letter under ${LETTER_MAX_CHARS.toLocaleString("en")} characters.` })
    if (d.moments.song && !d.off.includes("song") && !parseSongLink(d.moments.song.url)) out.push({ field: "song", message: "Use a song link from Spotify, YouTube, Apple Music or Audiomack." })
  }
  if (step === "send") {
    if (d.delivery.mode === "email" && !EMAIL.test(d.delivery.email.trim())) out.push({ field: "email", message: "Enter their email address." })
    if (d.delivery.when === "later") {
      const at = sendAtFor(d)
      if (!at || new Date(at).getTime() < now.getTime() + 5 * 60_000) out.push({ field: "when", message: "Choose a time at least 5 minutes from now." })
    }
  }
  return out
}

/** UTC instant for a scheduled letter (Lagos time), or null for "now". */
export function sendAtFor(d: StudioDraft): string | null {
  const { when, date, time } = d.delivery
  if (when !== "later") return null
  if (!date || !time || !/^\d{2}:\d{2}$/.test(time)) return null
  const [h, m] = time.split(":").map(Number)
  return zonedTimeToUtc(date, h, m, LAUNCH_TIMEZONE).toISOString()
}

// ---------------------------------------------------------------- Payloads

/** Moments as they'll be sent: switched-off moments are left out, photos as storage paths. */
export function outgoingMoments(d: StudioDraft, photoPaths: Record<string, string>): LetterMoments {
  const on = (id: MomentId) => !d.off.includes(id)
  const m = d.moments
  return {
    reasons: on("reasons") ? m.reasons.filter((r) => r.trim()) : [],
    story: on("story") ? m.story.filter((c) => c.title.trim() || c.text.trim()) : [],
    photos: on("photos") ? m.photos.flatMap((p) => {
          const path = photoPaths[p.id] ?? p.path
          return path ? [{ path, caption: p.caption }] : []
        }) : [],
    date: on("date") ? m.date : null,
    places: on("places") ? m.places.filter((p) => p.name.trim()) : [],
    wishes: on("wishes") ? m.wishes.filter((w) => w.trim()) : [],
    song: on("song") && m.song?.url.trim() ? m.song : null,
    closing: m.closing,
  }
}

export function toSendInput(d: StudioDraft, photoPaths: Record<string, string>): SendLetterInput {
  return {
    clientRef: d.clientRef,
    delivery: d.delivery.mode,
    recipientName: d.recipientName.trim(),
    recipientEmail: d.delivery.mode === "email" ? d.delivery.email.trim().toLowerCase() : null,
    body: d.body.trim(),
    senderDisplayName: d.signature.trim(),
    occasion: d.occasion ?? null,
    tone: d.tone ?? null,
    sendAt: sendAtFor(d),
    design: d.design,
    moments: outgoingMoments(d, photoPaths),
  }
}

/** The draft as the reader will see it, for the live preview. `photoUrls` maps photo id → object URL. */
export function previewView(d: StudioDraft, photoUrls: Record<string, string>): LetterView {
  const out = outgoingMoments(d, {})
  const photos = d.off.includes("photos") ? [] : d.moments.photos.flatMap((p) => (photoUrls[p.id] ? [{ url: photoUrls[p.id], caption: p.caption }] : []))
  const moments: LetterViewMoments = { ...out, photos }
  const name = d.recipientName.trim() || "Your favourite person"
  return {
    recipientName: name,
    recipientFirstName: name.split(" ")[0],
    senderDisplayName: d.signature.trim() || "You",
    body: d.body,
    occasion: d.occasion ?? null,
    sentAt: new Date().toISOString(),
    design: d.design,
    moments,
    sealed: false,
    opensAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------- Persistence

const KEY = "jg-letter-studio"

export function loadStudioDraft(): StudioDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    const d = raw ? (JSON.parse(raw) as StudioDraft) : null
    if (d?.v !== 1 || !d.clientRef) return null
    // Older or hand-edited drafts: fill anything missing rather than crash.
    return { ...newStudioDraft(), ...d, design: sanitiseLetterDesign(d.design), moments: { ...EMPTY_MOMENTS, ...d.moments, photos: d.moments?.photos ?? [] }, off: d.off ?? [] }
  } catch {
    return null
  }
}

export function saveStudioDraft(d: StudioDraft | null) {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: the studio still works for this visit */
  }
}

// ---------------------------------------------------------------- Starters

/**
 * Tap-to-add starting points. They're prompts the sender finishes or edits — never facts about
 * the recipient — so nothing here can put words in the sender's mouth they didn't choose.
 */
export const STARTERS: Partial<Record<MomentId, string[]>> = {
  reasons: [
    "The way you laugh at your own jokes",
    "How you always know what to say",
    "Your kindness, even on hard days",
    "How safe I feel with you",
    "The way you make ordinary days fun",
    "How hard you work for the people you love",
  ],
  wishes: [
    "That we keep laughing like this",
    "A trip somewhere neither of us has been",
    "That every year is kinder to you than the last",
    "More slow Sunday mornings",
    "That you get everything you're working for",
  ],
}

export const CLOSINGS = ["Always yours", "Forever and a day", "With all my heart", "Yours, always", "Love you more"]

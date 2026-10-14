import type { OccasionId, Relationship } from "./types.ts"
import { OCCASIONS, RELATIONSHIPS } from "./catalog.ts"
import type { LetterDesign, LetterMoments, MomentsOptions } from "./letter-studio.ts"
import { EMPTY_MOMENTS, sanitiseLetterDesign, validateLetterMoments } from "./letter-studio.ts"

/**
 * Digital letters: a message sent on its own, or carried by a gift as its message. The composer
 * below is the rule-based fallback for when the AI service is unavailable. Like the AI, it only
 * arranges what the sender supplied — it never invents a memory, nickname or personal fact.
 */

export type LetterTone = "heartfelt" | "romantic" | "playful" | "appreciative" | "formal"
export type LetterRevision = "shorter" | "warmer" | "like-me"

export const LETTER_TONES: { id: LetterTone; name: string }[] = [
  { id: "heartfelt", name: "Heartfelt" },
  { id: "romantic", name: "Romantic" },
  { id: "playful", name: "Playful" },
  { id: "appreciative", name: "Appreciative" },
  { id: "formal", name: "Formal" },
]

/** Shared by letters and gift messages, so a letter can travel with a gift unchanged. */
export const LETTER_MAX_CHARS = 2000
export const LETTER_SIGNATURE_MAX = 60

export interface LetterBrief {
  recipientName?: string
  relationship?: Relationship
  occasion?: OccasionId
  /** Why they're writing, in their words, when no listed occasion fits. */
  purpose?: string
  /** What they want the recipient to know or feel, in their words. */
  message?: string
  tone?: LetterTone
  /** Optional memory, nickname or sentiment, used verbatim. */
  details?: string
  signature?: string
}

export interface LetterComposeRequest {
  brief: LetterBrief
  /** draft: write from the brief · improve: polish the sender's draft · revise: apply one revision. */
  mode: "draft" | "improve" | "revise"
  draft?: string
  revision?: LetterRevision
}

export interface LetterComposeResult {
  body: string
  source: "ai" | "rules"
}

const clip = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined)

/** Validates an untrusted brief (from the browser or a model) against known values and limits. */
export function sanitiseLetterBrief(input: unknown): LetterBrief {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  return {
    recipientName: clip(d.recipientName, 80),
    relationship: RELATIONSHIPS.find((r) => r.id === d.relationship)?.id,
    occasion: OCCASIONS.find((o) => o.id === d.occasion)?.id,
    purpose: clip(d.purpose, 200),
    message: clip(d.message, 1200),
    tone: LETTER_TONES.find((t) => t.id === d.tone)?.id,
    details: clip(d.details, 500),
    signature: clip(d.signature, LETTER_SIGNATURE_MAX),
  }
}

export function sanitiseComposeRequest(input: unknown): LetterComposeRequest {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const mode = d.mode === "improve" || d.mode === "revise" ? d.mode : "draft"
  const revision = (["shorter", "warmer", "like-me"] as const).find((r) => r === d.revision)
  return { brief: sanitiseLetterBrief(d.brief), mode, draft: clip(d.draft, LETTER_MAX_CHARS), revision: mode === "revise" ? (revision ?? "shorter") : undefined }
}

// ---------------------------------------------------------------- Rule-based composer

const CLOSE: Relationship[] = ["partner", "parent", "sibling", "child", "friend"]

function greeting(b: LetterBrief) {
  const name = b.recipientName?.split(/\s+/)[0]
  if (!name) return b.tone === "formal" ? "Hello," : "Hi,"
  if (b.tone === "playful") return `Hey ${name}!`
  if (b.tone === "romantic") return `My dear ${name},`
  return `Dear ${name},`
}

const OPENINGS: Record<OccasionId, string> = {
  birthday: "Happy birthday!",
  wedding: "Congratulations on your wedding.",
  anniversary: "Happy anniversary.",
  "baby-shower": "Congratulations — what wonderful news.",
  graduation: "Congratulations on graduating!",
  housewarming: "Congratulations on your new home.",
  appreciation: "Thank you.",
  "get-well": "I'm thinking of you and hoping each day feels a little easier.",
  "just-because": "No special reason — I just wanted you to hear from me.",
  sympathy: "I'm so sorry, and I'm thinking of you.",
}

/** Generic, tone-only closing lines: sentiment the sender chose, never a fact about them. */
const CLOSINGS: Record<LetterTone, string> = {
  heartfelt: "I hope you know how much you mean to me.",
  romantic: "I'm so lucky to have you.",
  playful: "Here's to you!",
  appreciative: "I'm truly grateful.",
  formal: "With every good wish.",
}

function signOff(b: LetterBrief, warmer = false) {
  const close = b.relationship ? CLOSE.includes(b.relationship) : false
  if (b.tone === "formal") return warmer ? "Warm regards," : "Kind regards,"
  if (b.tone === "appreciative") return warmer ? "With heartfelt thanks," : "With gratitude,"
  if (b.tone === "playful") return close ? "Big hugs," : "Cheers,"
  if (b.tone === "romantic") return "All my love,"
  return close ? "With love," : "Warmly,"
}

/** Sentence-case and end punctuation, without changing the sender's words. */
export function tidy(text: string) {
  const t = text.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
  if (!t) return t
  const capped = t.charAt(0).toUpperCase() + t.slice(1)
  return /[.!?…)"'”’]$/.test(capped) ? capped : `${capped}.`
}

function assemble(parts: (string | undefined)[], b: LetterBrief, opts: { closing?: string; signOff?: string } = {}) {
  const body = parts.filter((p): p is string => Boolean(p && p.trim()))
  const lines = [greeting(b), "", body.join("\n\n")]
  if (opts.closing) lines.push("", opts.closing)
  const sig = b.signature?.trim()
  lines.push("", opts.signOff ?? signOff(b), ...(sig ? [sig] : []))
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

const AFTER_HER_MEANS_YOU = new Set(["and", "or", "but", "so", "to", "for", "because", "when", "that", "with", "on", "in", "at", "too", "a", "an", "the", "more", "so much", "always", "every"])

/**
 * People describe the recipient in the third person ("she's the best", "her new job"). A letter
 * speaks to them, so swap those pronouns for "you" — only when the text never says "you" already,
 * so a sentence about someone else is left alone.
 */
export function speakToThem(text: string) {
  if (/\b(you|your|you're|yours)\b/i.test(text)) return text
  return text
    .replace(/\b(she|he)'s\b/gi, "you're")
    .replace(/\b(she|he) (is)\b/gi, "you are")
    .replace(/\b(she|he) (was)\b/gi, "you were")
    .replace(/\b(she|he) (has|does|loves|likes|makes|deserves|means)\b/gi, (_m, _p, v: string) => `you ${({ has: "have", does: "do", loves: "love", likes: "like", makes: "make", deserves: "deserve", means: "mean" } as Record<string, string>)[v.toLowerCase()]}`)
    .replace(/\b(she|he)\b/gi, "you")
    .replace(/\b(his|hers)\b/gi, (w) => (w.toLowerCase() === "hers" ? "yours" : "your"))
    .replace(/\bhim\b/gi, "you")
    .replace(/\bher\b(\s+(\w+))?/gi, (_m, rest: string | undefined, next: string | undefined) => (next && !AFTER_HER_MEANS_YOU.has(next.toLowerCase()) ? `your${rest}` : `you${rest ?? ""}`))
}

/**
 * People answer "what do you want them to know?" with fragments ("how proud I am…",
 * "to say thank you"). Give those the few words they need to stand as a sentence.
 */
export function frameMessage(message: string) {
  const m = speakToThem(message.trim())
  const lower = m.charAt(0).toLowerCase() + m.slice(1)
  if (/^(how|that|just how|what|why)\b/i.test(m)) return `I want you to know ${lower}`
  if (/^to (say|tell|let|thank|remind)\b/i.test(m)) return `I wanted ${lower}`
  return m
}

function draftFromBrief(b: LetterBrief) {
  const opening = b.occasion ? OPENINGS[b.occasion] : b.purpose ? tidy(b.purpose) : undefined
  return assemble([opening, b.message && tidy(frameMessage(b.message)), b.details && tidy(b.details)], b, { closing: CLOSINGS[b.tone ?? "heartfelt"] })
}

const TEMPLATE_LINES = new Set([...Object.values(OPENINGS), ...Object.values(CLOSINGS)])
const SALUTATION = /^(dear|hi|hey|hello|my dear|my dearest)\b[^.?\n]{0,40}[,!]$/i
const SIGN_OFF = /^(with love|lots of love|love|warmly|kind regards|warm regards|best wishes|best|cheers|big hugs|all my love|with gratitude|with heartfelt thanks|yours truly|yours|sincerely)\b[^.!?\n]{0,20},$/i

function shorten(text: string) {
  const paras = text.split(/\n{2,}/)
  const kept = paras
    .filter((p) => !TEMPLATE_LINES.has(p.trim()))
    .map((p) => {
      if (SALUTATION.test(p.trim()) || SIGN_OFF.test(p.trim().split("\n")[0])) return p
      const sentences = p.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) ?? [p]
      return sentences.slice(0, 2).join("").trim()
    })
  const out = kept.join("\n\n").trim()
  return out.length < text.length ? out : text
}

function warmer(text: string, b: LetterBrief) {
  const lines = text.split("\n")
  const signIdx = lines.findIndex((l) => SIGN_OFF.test(l.trim()))
  const line = b.relationship && CLOSE.includes(b.relationship) ? "You mean the world to me." : "It really means a lot to me to have you in my life."
  if (text.includes(line)) return text
  const so = signOff(b, true)
  if (signIdx === -1) return `${text.trim()}\n\n${line}`
  const before = lines.slice(0, signIdx).join("\n").trimEnd()
  const after = [so, ...lines.slice(signIdx + 1)].join("\n")
  return `${before}\n\n${line}\n\n${after}`.replace(/\n{3,}/g, "\n\n").trim()
}

function ensureSignature(text: string, b: LetterBrief) {
  const sig = b.signature?.trim()
  if (!sig || text.trim().endsWith(sig)) return text.trim()
  return `${text.trim()}\n\n${signOff(b)}\n${sig}`
}

/** Deterministic composer used without AI. Output always fits LETTER_MAX_CHARS. */
export function composeLetterByRules(req: LetterComposeRequest): string {
  const b = req.brief
  let out: string
  if (req.mode === "improve") {
    const paras = (req.draft ?? "").split(/\n{2,}/).map((p) => (SALUTATION.test(p.trim()) || SIGN_OFF.test(p.trim().split("\n")[0]) ? p.trim() : tidy(p)))
    out = ensureSignature(paras.join("\n\n"), b)
    if (!SALUTATION.test(out.split("\n")[0].trim())) out = `${greeting(b)}\n\n${out}`
  } else if (req.mode === "revise") {
    const current = req.draft?.trim() || draftFromBrief(b)
    if (req.revision === "shorter") out = shorten(current)
    else if (req.revision === "warmer") out = warmer(current, b)
    // "Sound more like me": the sender's own words with the lightest possible framing.
    else out = assemble([b.message && tidy(frameMessage(b.message)), b.details && tidy(b.details)], b, { signOff: signOff(b) })
  } else {
    out = draftFromBrief(b)
  }
  return out.slice(0, LETTER_MAX_CHARS)
}

/** Validates model output: non-empty, within limits, and free of template placeholders. */
export function acceptComposedLetter(body: unknown): string | null {
  if (typeof body !== "string") return null
  const t = body.trim().replace(/\n{3,}/g, "\n\n")
  if (t.length < 2 || t.length > LETTER_MAX_CHARS || /\[[^\]]{2,}\]/.test(t)) return null
  return t
}

/** Letters are text only; strip control characters that could disguise content. */
export const cleanLetterBody = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "").trim()

// ---------------------------------------------------------------- Sending

/**
 * email: we email the recipient a private link at `sendAt`.
 * link: the sender gets the link straight away to share themselves (WhatsApp, QR code); before
 * `sendAt` the link shows a sealed envelope and a countdown instead of the letter.
 */
export type LetterDelivery = "email" | "link"

export interface SendLetterInput {
  /** Generated once per letter in the browser; a retried send returns the original letter. */
  clientRef: string
  delivery?: LetterDelivery
  recipientName: string
  /** Required for email delivery; ignored for link delivery. */
  recipientEmail?: string | null
  body: string
  senderDisplayName: string
  occasion?: OccasionId | null
  tone?: LetterTone | null
  /** UTC instant; null sends (or opens) immediately. */
  sendAt: string | null
  design?: Partial<LetterDesign>
  moments?: Partial<LetterMoments>
}

export interface ValidLetterSend {
  clientRef: string
  delivery: LetterDelivery
  recipientName: string
  recipientEmail: string | null
  body: string
  senderDisplayName: string
  occasion: OccasionId | null
  tone: LetterTone | null
  sendAt: string
  design: LetterDesign
  moments: LetterMoments
}

export const LETTERS_PER_DAY = 20

export const LETTER_TRANSITIONS: Record<import("./types.ts").LetterStatus, import("./types.ts").LetterStatus[]> = {
  scheduled: ["sent", "cancelled", "failed"],
  sent: ["opened"],
  opened: [],
  cancelled: [],
  failed: ["sent"],
}

/** Shared validation for both backends. Returns cleaned values, or the first problem found. */
export function validateLetterSend(input: unknown, now: Date, maxAdvanceDays: number, opts: MomentsOptions = {}): { ok: true; value: ValidLetterSend } | { ok: false; message: string } {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const delivery: LetterDelivery = d.delivery === "link" ? "link" : "email"
  const clientRef = s(d.clientRef)
  const recipientName = s(d.recipientName)
  const recipientEmail = delivery === "email" ? s(d.recipientEmail).toLowerCase() : null
  const body = cleanLetterBody(s(d.body))
  const senderDisplayName = s(d.senderDisplayName)
  if (!/^[\w-]{8,64}$/.test(clientRef)) return { ok: false, message: "Something went wrong preparing this letter. Refresh and try again." }
  if (!recipientName || recipientName.length > 80) return { ok: false, message: "Add the recipient's name (up to 80 characters)." }
  if (recipientEmail !== null && (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipientEmail) || recipientEmail.length > 200)) return { ok: false, message: "Enter a valid email address for the recipient." }
  if (!body) return { ok: false, message: "Your letter is empty." }
  if (body.length > LETTER_MAX_CHARS) return { ok: false, message: `Keep the letter under ${LETTER_MAX_CHARS.toLocaleString("en")} characters.` }
  if (!senderDisplayName || senderDisplayName.length > LETTER_SIGNATURE_MAX) return { ok: false, message: `Add your name as the recipient should see it (up to ${LETTER_SIGNATURE_MAX} characters).` }
  let sendAt = now.toISOString()
  if (d.sendAt !== null && d.sendAt !== undefined) {
    const at = new Date(s(d.sendAt))
    if (Number.isNaN(at.getTime())) return { ok: false, message: "Choose a valid date and time to send." }
    if (at.getTime() < now.getTime() + 4 * 60_000) return { ok: false, message: "Choose a time at least 5 minutes from now, or send it now." }
    if (at.getTime() > now.getTime() + maxAdvanceDays * 86_400_000) return { ok: false, message: `Letters can be scheduled up to ${maxAdvanceDays} days ahead.` }
    sendAt = at.toISOString()
  }
  const moments = d.moments === undefined || d.moments === null ? { ok: true as const, value: EMPTY_MOMENTS } : validateLetterMoments(d.moments, opts)
  if (!moments.ok) return moments
  const occasion = OCCASIONS.find((o) => o.id === d.occasion)?.id ?? null
  const tone = LETTER_TONES.find((t) => t.id === d.tone)?.id ?? null
  return { ok: true, value: { clientRef, delivery, recipientName, recipientEmail, body, senderDisplayName, occasion, tone, sendAt, design: sanitiseLetterDesign(d.design), moments: moments.value } }
}

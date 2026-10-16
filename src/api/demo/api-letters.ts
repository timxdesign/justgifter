import type { Letter } from "@domain/index.ts"
import { canTransition, composeLetterByRules, EMPTY_MOMENTS, LETTER_TRANSITIONS, LETTERS_PER_DAY, maskContact, randomToken, sanitiseComposeRequest, sha256Hex, uid, validateLetterSend } from "@domain/index.ts"
import type { Api, LetterSummary, LetterView } from "../types"
import { ApiError } from "../errors"
import { clone, latency, type Store } from "./store"
import { runDueJobs } from "./commerce"

export const letterSummary = (l: Letter): LetterSummary => ({
  id: l.id,
  recipientName: l.recipientName,
  contactMasked: l.contactMasked,
  delivery: l.delivery,
  design: l.design,
  occasion: l.occasion,
  tone: l.tone,
  body: l.body,
  status: l.status,
  sendAt: l.sendAt,
  sentAt: l.sentAt,
  openedAt: l.openedAt,
  createdAt: l.createdAt,
})

/** Link letters are readable (or sealed) from creation; email letters only once emailed. */
async function byToken(s: Store, token: string) {
  if (!token || token.length < 20 || token.length > 100) return null
  const hash = await sha256Hex(token)
  return s.db.letters.find((l) => l.tokenHash === hash && (l.status === "sent" || l.status === "opened" || (l.delivery === "link" && l.status === "scheduled"))) ?? null
}

async function mintLink(letter: Letter) {
  const token = randomToken()
  letter.tokenHash = await sha256Hex(token)
  return `/l/${token}`
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024

export function lettersApi(s: Store): Pick<Api, "composeLetter" | "sendLetter" | "uploadLetterPhoto" | "listMyLetters" | "cancelLetter" | "renewLetterLink" | "openLetter" | "reportLetter"> {
  return {
    async composeLetter(req) {
      await latency(600)
      const clean = sanitiseComposeRequest(req)
      if (clean.mode !== "draft" && !clean.draft) throw new ApiError("validation", "There's no letter to work on yet.")
      // The demo has no AI service; production uses Claude with these rules as the fallback.
      return { body: composeLetterByRules(clean), source: "rules" as const }
    },

    async uploadLetterPhoto(blob) {
      await latency(300)
      const user = s.requireUser()
      if (!["image/webp", "image/jpeg", "image/png"].includes(blob.type) || blob.size > MAX_PHOTO_BYTES) throw new ApiError("validation", "Photos must be JPEG, PNG or WebP, up to 8 MB.")
      const path = `${user.id}/${uid("img")}.${blob.type === "image/jpeg" ? "jpg" : "webp"}`
      s.db.letterMedia[path] = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new ApiError("validation", "Couldn't read that photo."))
        r.readAsDataURL(blob)
      })
      s.persist()
      return { path }
    },

    async sendLetter(input) {
      await latency(350)
      const user = s.requireUser()
      if (!user.emailVerified) throw new ApiError("unauthorised", "Confirm your email address before sending a letter.")
      const v = validateLetterSend(input, s.now(), s.db.settings.maxAdvanceDays, { photoPathOk: (p) => p.startsWith(`${user.id}/`) && p in s.db.letterMedia })
      if (!v.ok) throw new ApiError("validation", v.message)
      const existing = s.db.letters.find((l) => l.senderUserId === user.id && l.clientRef === v.value.clientRef)
      if (existing) {
        const link = existing.delivery === "link" && existing.status !== "cancelled" ? await mintLink(existing) : null
        s.persist()
        return clone({ ...letterSummary(existing), link })
      }
      const since = s.now().getTime() - 86_400_000
      if (s.db.letters.filter((l) => l.senderUserId === user.id && new Date(l.createdAt).getTime() > since).length >= LETTERS_PER_DAY) {
        throw new ApiError("rate_limited", `You can send up to ${LETTERS_PER_DAY} letters a day. Try again tomorrow.`)
      }
      const byLink = v.value.delivery === "link"
      const letter: Letter = {
        id: uid("ltr"),
        senderUserId: user.id,
        senderEmail: user.email,
        senderDisplayName: v.value.senderDisplayName,
        recipientName: v.value.recipientName,
        recipientEmail: v.value.recipientEmail,
        contactMasked: v.value.recipientEmail ? maskContact(v.value.recipientEmail) : "Shared by link",
        delivery: v.value.delivery,
        design: v.value.design,
        moments: v.value.moments,
        occasion: v.value.occasion,
        tone: v.value.tone,
        body: v.value.body,
        sendAt: v.value.sendAt,
        status: "scheduled",
        tokenHash: "",
        clientRef: v.value.clientRef,
        createdAt: s.nowIso(),
        sentAt: null,
        openedAt: null,
        cancelledAt: null,
        reported: false,
      }
      // A link letter's address exists from the start, so the sender can share it before it opens.
      const link = byLink ? await mintLink(letter) : null
      s.db.letters.unshift(letter)
      s.enqueue("letter_delivery", letter.sendAt, `letter:${letter.id}`, { letterId: letter.id })
      s.audit(user.email, "letter_created", "letter", letter.id, `${byLink ? "Link" : "Email"}, ${input.sendAt ? `scheduled for ${letter.sendAt}` : "now"}`)
      await runDueJobs(s)
      s.persist()
      return clone({ ...letterSummary(letter), link })
    },

    async listMyLetters() {
      await latency(150)
      const user = s.requireUser()
      await runDueJobs(s)
      return clone(s.db.letters.filter((l) => l.senderUserId === user.id).map(letterSummary))
    },

    async cancelLetter(id) {
      await latency(250)
      const user = s.requireUser()
      const letter = s.db.letters.find((l) => l.id === id && l.senderUserId === user.id)
      if (!letter) throw new ApiError("not_found", "We couldn't find that letter.")
      if (!canTransition(LETTER_TRANSITIONS, letter.status, "cancelled")) throw new ApiError("conflict", "This letter has already been sent, so it can't be cancelled.")
      letter.status = "cancelled"
      letter.cancelledAt = s.nowIso()
      // A cancelled link letter's link stops working.
      letter.tokenHash = ""
      s.db.jobs.filter((j) => j.status === "queued" && j.payload.letterId === letter.id).forEach((j) => (j.status = "done"))
      s.audit(user.email, "letter_cancelled", "letter", letter.id, "Cancelled before sending")
      s.persist()
    },

    async renewLetterLink(id) {
      await latency(250)
      const user = s.requireUser()
      const letter = s.db.letters.find((l) => l.id === id && l.senderUserId === user.id)
      if (!letter) throw new ApiError("not_found", "We couldn't find that letter.")
      if (letter.delivery !== "link") throw new ApiError("conflict", "This letter was emailed, so its link is with the recipient.")
      if (letter.status === "cancelled") throw new ApiError("conflict", "This letter was cancelled.")
      const link = await mintLink(letter)
      s.audit(user.email, "letter_link_renewed", "letter", letter.id, "New link issued; the old one stopped working")
      s.persist()
      return { link }
    },

    async openLetter(token) {
      await latency(250)
      const letter = await byToken(s, token)
      if (!letter) return null
      const sealed = letter.status === "scheduled"
      if (letter.status === "sent") {
        letter.status = "opened"
        letter.openedAt = s.nowIso()
        s.persist()
      }
      const m = letter.moments
      const view: LetterView = {
        recipientName: letter.recipientName,
        recipientFirstName: letter.recipientName.split(" ")[0],
        senderDisplayName: letter.senderDisplayName,
        body: sealed ? "" : letter.body,
        occasion: letter.occasion,
        sentAt: letter.sentAt ?? letter.sendAt,
        design: letter.design,
        moments: sealed ? { ...EMPTY_MOMENTS, photos: [] } : { ...m, photos: m.photos.map((p) => ({ url: s.db.letterMedia[p.path] ?? "", caption: p.caption })).filter((p) => p.url) },
        sealed,
        opensAt: letter.sendAt,
      }
      return clone(view)
    },

    async reportLetter(token, { kind, details, stopContact }) {
      await latency(300)
      const letter = await byToken(s, token)
      if (!letter) throw new ApiError("not_found", "This letter link isn't valid.")
      s.db.reports.unshift({ id: uid("rpt"), kind, targetType: "letter", targetId: letter.id, details: details.slice(0, 1000), status: "open", createdAt: s.nowIso() })
      letter.reported = true
      if (stopContact && letter.recipientEmail && !s.db.blockedContacts.includes(letter.recipientEmail)) s.db.blockedContacts.push(letter.recipientEmail)
      s.persist()
    },
  }
}

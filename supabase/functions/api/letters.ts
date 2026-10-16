// deno-lint-ignore-file no-explicit-any
import type { Letter } from "../_shared/domain/index.ts"
import { canTransition, composeLetterByRules, EMPTY_MOMENTS, LETTER_TRANSITIONS, LETTERS_PER_DAY, maskContact, randomToken, sanitiseComposeRequest, sha256Hex, uid, validateLetterSend } from "../_shared/domain/index.ts"
import { claude } from "../_shared/ai.ts"
import { db, must } from "../_shared/db.ts"
import { fail } from "../_shared/http.ts"
import { dispatchLetter, letterBy, toLetter } from "../_shared/letters.ts"
import { audit, enqueueJob, settings } from "../_shared/repo.ts"
import type { Handler } from "./context.ts"
import { str } from "./context.ts"

/** Private bucket for letter photos (migrations/…_letter_studio.sql). Reads are signed, short-lived URLs. */
const MEDIA_BUCKET = "letter-media"
const PHOTO_URL_TTL_SECONDS = 60 * 60

const summary = (l: Letter) => ({
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
async function byToken(token: unknown): Promise<Letter | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null
  const l = await letterBy("token_hash", await sha256Hex(token))
  return l && (l.status === "sent" || l.status === "opened" || (l.delivery === "link" && l.status === "scheduled")) ? l : null
}

/** Issues a new reading link for a letter; only the hash is stored, so this is the only copy. */
async function mintLink(id: string) {
  const token = randomToken()
  must(await db().from("letters").update({ token_hash: await sha256Hex(token) }).eq("id", id).neq("status", "cancelled").select("id").single())
  return `/l/${token}`
}

/** A photo path the caller may attach: one they uploaded, in their own folder. */
const ownPhoto = (userId: string) => (path: string) => new RegExp(`^${userId}/img_[a-z0-9]{10}\\.(webp|jpg)$`).test(path)

export const letters: Record<string, Handler> = {
  async composeLetter({ args }) {
    const req = sanitiseComposeRequest(args.req)
    if (req.mode !== "draft" && !req.draft) throw fail("validation", "There's no letter to work on yet.")
    // Nothing here is stored: drafts stay in the sender's browser until they choose to send.
    const ai = await claude.composeLetter(req)
    return ai ? { body: ai, source: "ai" } : { body: composeLetterByRules(req), source: "rules" }
  },

  async uploadLetterPhotoUrl({ caller, args }) {
    // Signed upload into the private bucket. The client re-encodes images first (SEC 04), and the
    // bucket itself enforces type and size.
    if (!caller.userId || !caller.emailVerified) throw fail("unauthorised", "Confirm your email address to add photos.")
    // WebP normally; JPEG from browsers that can't encode WebP (Safari).
    const path = `${caller.userId}/${uid("img")}.${args.type === "image/jpeg" ? "jpg" : "webp"}`
    const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path)
    if (error) throw fail("unavailable", "We couldn't prepare the upload. Try again.")
    return { path, token: data.token, bucket: MEDIA_BUCKET }
  },

  async sendLetter({ args, caller }) {
    // Letters are free, so a verified sender is required to keep the channel from being used for spam.
    if (!caller.userId || !caller.email) throw fail("unauthorised", "Sign in to send a letter.")
    if (!caller.emailVerified) throw fail("unauthorised", "Confirm your email address before sending a letter.")
    const s = await settings()
    const v = validateLetterSend(args.input, new Date(), s.maxAdvanceDays, { photoPathOk: ownPhoto(caller.userId) })
    if (!v.ok) throw fail("validation", v.message)
    const existing = must(await db().from("letters").select("*").eq("sender_user_id", caller.userId).eq("client_ref", v.value.clientRef).maybeSingle())
    if (existing) {
      const l = toLetter(existing)
      // The first response may never have arrived, so a retried link letter gets a working link.
      return { ...summary(l), link: l.delivery === "link" && l.status !== "cancelled" ? await mintLink(l.id) : null }
    }
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const { count } = await db().from("letters").select("id", { count: "exact", head: true }).eq("sender_user_id", caller.userId).gt("created_at", since)
    if ((count ?? 0) >= LETTERS_PER_DAY) throw fail("rate_limited", `You can send up to ${LETTERS_PER_DAY} letters a day. Try again tomorrow.`)
    const id = uid("ltr")
    const byLink = v.value.delivery === "link"
    // A link letter's address exists from the start, so the sender can share it before it opens.
    const token = byLink ? randomToken() : null
    const { data, error } = await db().from("letters").insert({
      id,
      sender_user_id: caller.userId,
      sender_email: caller.email,
      sender_display_name: v.value.senderDisplayName,
      recipient_name: v.value.recipientName,
      recipient_email: v.value.recipientEmail,
      contact_masked: v.value.recipientEmail ? maskContact(v.value.recipientEmail) : "Shared by link",
      delivery: v.value.delivery,
      design: v.value.design,
      moments: v.value.moments,
      occasion: v.value.occasion,
      tone: v.value.tone,
      body: v.value.body,
      send_at: v.value.sendAt,
      client_ref: v.value.clientRef,
      token_hash: token ? await sha256Hex(token) : null,
    }).select("*").single()
    if (error) {
      // A concurrent retry with the same clientRef won the insert: return that letter.
      const again = must(await db().from("letters").select("*").eq("sender_user_id", caller.userId).eq("client_ref", v.value.clientRef).maybeSingle())
      if (again) {
        const l = toLetter(again)
        return { ...summary(l), link: l.delivery === "link" ? await mintLink(l.id) : null }
      }
      throw fail("unavailable", "We couldn't save your letter. Try again.")
    }
    await enqueueJob("letter_delivery", v.value.sendAt, `letter:${id}`, { letterId: id })
    await audit(caller.email, "letter_created", "letter", id, `${byLink ? "Link" : "Email"}, ${args.input?.sendAt ? `scheduled for ${v.value.sendAt}` : "now"}`)
    // "Send now" shouldn't wait up to a minute for the cron worker; the queued job stays as a backstop.
    if (!args.input?.sendAt) {
      await dispatchLetter(id)
      await db().from("jobs").update({ status: "done" }).eq("idempotency_key", `letter:${id}`).eq("status", "queued")
    }
    return { ...summary((await letterBy("id", id)) ?? toLetter(data)), link: token ? `/l/${token}` : null }
  },

  async listMyLetters({ caller }) {
    if (!caller.userId) throw fail("unauthorised", "Sign in to see your letters.")
    const rows = must(await db().from("letters").select("*").eq("sender_user_id", caller.userId).order("created_at", { ascending: false }).limit(100)) as any[]
    return rows.map((r) => summary(toLetter(r)))
  },

  async cancelLetter({ args, caller }) {
    if (!caller.userId) throw fail("unauthorised", "Sign in to manage your letters.")
    const l = await letterBy("id", str(args.id, "letter", 40))
    if (!l || l.senderUserId !== caller.userId) throw fail("not_found", "We couldn't find that letter.")
    if (!canTransition(LETTER_TRANSITIONS, l.status, "cancelled")) throw fail("conflict", "This letter has already been sent, so it can't be cancelled.")
    // Conditional update: if the job sent it a moment ago, nothing changes and we report that.
    // Clearing the hash means a cancelled link letter's link stops working.
    const { data } = await db().from("letters").update({ status: "cancelled", cancelled_at: new Date().toISOString(), token_hash: null }).eq("id", l.id).eq("status", "scheduled").select("id").maybeSingle()
    if (!data) throw fail("conflict", "This letter has already been sent, so it can't be cancelled.")
    await db().from("jobs").update({ status: "done" }).eq("idempotency_key", `letter:${l.id}`).eq("status", "queued")
    await audit(caller.email ?? caller.userId, "letter_cancelled", "letter", l.id, "Cancelled before sending")
  },

  async renewLetterLink({ args, caller }) {
    if (!caller.userId) throw fail("unauthorised", "Sign in to manage your letters.")
    const l = await letterBy("id", str(args.id, "letter", 40))
    if (!l || l.senderUserId !== caller.userId) throw fail("not_found", "We couldn't find that letter.")
    if (l.delivery !== "link") throw fail("conflict", "This letter was emailed, so its link is with the recipient.")
    if (l.status === "cancelled") throw fail("conflict", "This letter was cancelled.")
    const link = await mintLink(l.id)
    await audit(caller.email ?? caller.userId, "letter_link_renewed", "letter", l.id, "New link issued; the old one stopped working")
    return { link }
  },

  async openLetter({ args }) {
    const l = await byToken(args.token)
    if (!l) return null
    const sealed = l.status === "scheduled"
    if (l.status === "sent") await db().from("letters").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", l.id).eq("status", "sent")
    let photos: { url: string; caption: string }[] = []
    if (!sealed && l.moments.photos.length) {
      const { data } = await db().storage.from(MEDIA_BUCKET).createSignedUrls(l.moments.photos.map((p) => p.path), PHOTO_URL_TTL_SECONDS)
      const urls = new Map((data ?? []).filter((d: any) => d.signedUrl).map((d: any) => [d.path, d.signedUrl as string]))
      photos = l.moments.photos.flatMap((p) => (urls.has(p.path) ? [{ url: urls.get(p.path)!, caption: p.caption }] : []))
    }
    return {
      recipientName: l.recipientName,
      recipientFirstName: l.recipientName.split(" ")[0],
      senderDisplayName: l.senderDisplayName,
      body: sealed ? "" : l.body,
      occasion: l.occasion,
      sentAt: l.sentAt ?? l.sendAt,
      design: l.design,
      moments: sealed ? { ...EMPTY_MOMENTS, photos: [] } : { ...l.moments, photos },
      sealed,
      opensAt: l.sendAt,
    }
  },

  async reportLetter({ args }) {
    const l = await byToken(args.token)
    if (!l) throw fail("not_found", "This letter link isn't valid.")
    const kinds = ["abusive_message", "harassment", "impersonation", "other"]
    const kind = kinds.includes(args.input?.kind) ? args.input.kind : "other"
    must(await db().from("content_reports").insert({ id: uid("rpt"), kind, target_type: "letter", target_id: l.id, details: String(args.input?.details ?? "").slice(0, 1000) }))
    await db().from("letters").update({ reported: true }).eq("id", l.id)
    if (args.input?.stopContact && l.recipientEmail) await db().from("blocked_contacts").upsert({ contact: l.recipientEmail.toLowerCase() }, { onConflict: "contact", ignoreDuplicates: true })
    await audit("recipient", "letter.reported", "letter", l.id, `${kind}${args.input?.stopContact ? " + stop contact" : ""}`)
  },
}

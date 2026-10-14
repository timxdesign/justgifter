// deno-lint-ignore-file no-explicit-any
import { db, must } from "./db.ts"
import type { Letter } from "./domain/index.ts"
import { EMPTY_MOMENTS, randomToken, sanitiseLetterDesign, sha256Hex } from "./domain/index.ts"
import { enqueue } from "./notify.ts"

/** Row ↔ domain mapping for letters (see migrations/…_digital_letters.sql). */
export const toLetter = (r: any): Letter => ({
  id: r.id,
  senderUserId: r.sender_user_id,
  senderEmail: r.sender_email,
  senderDisplayName: r.sender_display_name,
  recipientName: r.recipient_name,
  recipientEmail: r.recipient_email,
  contactMasked: r.contact_masked,
  delivery: r.delivery === "link" ? "link" : "email",
  design: sanitiseLetterDesign(r.design),
  moments: { ...EMPTY_MOMENTS, ...(r.moments ?? {}) },
  occasion: r.occasion,
  tone: r.tone,
  body: r.body,
  sendAt: r.send_at,
  status: r.status,
  tokenHash: r.token_hash ?? "",
  clientRef: r.client_ref,
  createdAt: r.created_at,
  sentAt: r.sent_at,
  openedAt: r.opened_at,
  cancelledAt: r.cancelled_at,
  reported: r.reported,
})

export async function letterBy(column: "id" | "token_hash", value: string): Promise<Letter | null> {
  const row = must(await db().from("letters").select("*").eq(column, value).maybeSingle())
  return row ? toLetter(row) : null
}

/**
 * Called by the letter_delivery job (and straight away for "send now"). Email letters get their
 * reading link minted (hash stored only) and emailed; link letters already have one, so their time
 * simply arrives. The update is conditional on the letter still being scheduled, so a cancel racing
 * the job can never be overridden.
 */
export async function dispatchLetter(letterId: string) {
  const current = await letterBy("id", letterId)
  if (!current || current.status !== "scheduled") return
  const byLink = current.delivery === "link" || !current.recipientEmail
  const token = byLink ? null : randomToken()
  const { data } = await db()
    .from("letters")
    .update({ status: "sent", sent_at: new Date().toISOString(), ...(token ? { token_hash: await sha256Hex(token) } : {}) })
    .eq("id", letterId)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle()
  if (!data || !token) return
  const letter = toLetter(data)
  // Like gift reveals, the subject and preview never include the letter's contents.
  await enqueue({ to: letter.recipientEmail!, kind: "letter", subject: `${letter.senderDisplayName} wrote you a letter`, body: "Open it whenever you're ready. The link is private to you — please don't forward it.", link: { label: "Read your letter", href: `/l/${token}` } })
}

import nodemailer from "npm:nodemailer@6"
import { env } from "../env.ts"
import { type EmailParts, renderHtml, renderText } from "./layout.ts"

let transport: ReturnType<typeof nodemailer.createTransport> | null = null
function smtp() {
  // ZeptoMail (or any SMTP relay): SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS — see docs/SETUP.md.
  transport ??= nodemailer.createTransport({ host: env.smtpHost(), port: env.smtpPort(), secure: env.smtpPort() === 465, auth: { user: env.smtpUser(), pass: env.smtpPass() } })
  return transport
}

export interface Rendered {
  subject: string
  html: string
  text: string
}

export const render = (subject: string, parts: EmailParts): Rendered => ({ subject, html: renderHtml(parts), text: renderText(parts) })

/**
 * Sends immediately. Used for one-time codes, which are useless if they arrive late and must
 * never be stored in plain text. Throws if SMTP isn't configured so callers can surface it.
 */
export async function sendNow(to: string, mail: Rendered) {
  if (!env.smtpHost()) throw new Error("SMTP is not configured")
  await smtp().sendMail({ from: env.mailFrom(), to, subject: mail.subject, text: mail.text, html: mail.html })
}

export { smtp }

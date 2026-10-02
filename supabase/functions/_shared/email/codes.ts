// One-time-code emails, tailored to why the code was requested.
import type { Banner, EmailParts } from "./layout.ts"
import { strong } from "./layout.ts"
import { render, type Rendered } from "./send.ts"

export type CodePurpose =
  | { kind: "signin"; isNew: boolean; next?: string }
  | { kind: "email_change_current"; newEmail: string }
  | { kind: "email_change_new" }
  | { kind: "reauth" }
  | { kind: "gift"; from?: string }
  | { kind: "orders" }
  | { kind: "bank"; store: string }

export interface CodeContext {
  to: string
  code: string
  name?: string | null
  minutes?: number
  now?: Date
}

const TZ = "Africa/Lagos"

function greeting(now: Date, name?: string | null) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now))
  const part = hour < 5 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  return name ? `${part}, ${name}` : part
}

function requestedAt(now: Date) {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ }).format(now).replace(/\s?([ap])m$/i, (_, a) => ` ${a.toUpperCase()}M`)
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(now)
  return `${time} on ${day} (Lagos time)`
}

const SAFE = "If that wasn't you, you can ignore this email — nobody can get in without the code. JustGifter will never ask you to share it."

interface Copy {
  subject: string
  banner: Banner
  title: string
  intro: string[]
  outro?: string
  why: string
}

/** Where the person was heading when they asked to sign in shapes the whole message. */
function signinCopy(code: string, isNew: boolean, next = ""): Copy {
  const path = next.startsWith("http") ? (() => { try { return new URL(next).pathname } catch { return "" } })() : next
  const why = isNew ? "someone used this address to join JustGifter" : "someone asked to sign in to JustGifter with this address"
  const enter = isNew ? "Enter this code to confirm your email" : "Enter this code to sign in"
  if (/^\/(checkout|cart)/.test(path))
    return { subject: `${code} · finish checking out on JustGifter`, banner: "bag", title: "Your bag is waiting", intro: [`${enter} and finish checking out. Everything is still in your bag, and nothing is charged until you pay.`], why }
  if (/^\/g\//.test(path))
    return { subject: `${code} · open your gift on JustGifter`, banner: "open", title: "Your gift is one step away", intro: [`${enter}, then you can open your gift and see the message that came with it.`], why }
  if (/^\/(events|e\/|host)/.test(path))
    return { subject: `${code} · your occasion page on JustGifter`, banner: "balloons", title: "Let's plan the celebration", intro: [`${enter} to create or manage your occasion page. Guests buy from your wishlist, and nobody gets the same gift twice.`], why }
  if (/^\/vendor\/apply|^\/sell/.test(path))
    return { subject: `${code} · open your store on JustGifter`, banner: "store", title: "Let's open your store", intro: [`${enter} to continue your seller application. It takes about ten minutes, and our team reviews it within three working days.`], why }
  if (/^\/vendor/.test(path))
    return { subject: `${code} · your JustGifter store`, banner: "store", title: "Your store is ready for you", intro: [`${enter} to your vendor workspace: orders, stock, storefront and payouts.`], why }
  if (/^\/admin/.test(path))
    return { subject: `${code} · JustGifter operations sign-in`, banner: "shield", title: "Operations sign-in", intro: [`${enter} to the operations workspace. You'll confirm with your authenticator app next.`], why }
  if (/^\/account\/orders/.test(path))
    return { subject: `${code} · track your JustGifter orders`, banner: "parcel", title: "Your orders, all in one place", intro: [`${enter} to see where your orders are, from the moment the vendor accepts to the doorstep.`], why }
  if (/^\/account\/saved/.test(path))
    return { subject: `${code} · your saved gifts on JustGifter`, banner: "gift", title: "Your saved gifts are waiting", intro: [`${enter} to pick up where you left off.`], why }
  if (isNew)
    return {
      subject: `${code} is your JustGifter code`,
      banner: "open",
      title: "Welcome to JustGifter",
      intro: [`${enter} and your account is ready.`],
      outro: "Send a gift that arrives with a moment: a digital reveal they open before the doorbell rings. Not sure of their address? Send it anyway, and they'll choose where it goes.",
      why,
    }
  return { subject: `${code} is your JustGifter sign-in code`, banner: "gift", title: "Welcome back", intro: [`${enter}. No password needed.`], why }
}

export function codeEmail(purpose: CodePurpose, ctx: CodeContext): Rendered {
  const now = ctx.now ?? new Date()
  const minutes = ctx.minutes ?? 10
  const code = ctx.code
  let c: Copy
  switch (purpose.kind) {
    case "signin":
      c = signinCopy(code, purpose.isNew, purpose.next)
      break
    case "email_change_current":
      c = { subject: `${code} · confirm your JustGifter email change`, banner: "shield", title: "Confirm your email change", intro: [`Someone asked to change this account's email to ${strong(purpose.newEmail)}. Enter this code to approve it.`, "Your orders, gifts and occasion pages move with you."], why: "someone asked to change the email on your JustGifter account" }
      break
    case "email_change_new":
      c = { subject: `${code} · confirm your new JustGifter email`, banner: "shield", title: "Confirm your new email", intro: ["Enter this code to make this your JustGifter email address."], why: "someone asked to move a JustGifter account to this address" }
      break
    case "reauth":
      c = { subject: `${code} is your JustGifter security code`, banner: "shield", title: "Confirm it's you", intro: ["Enter this code to continue with a sensitive account change."], why: "a protected action was started on your JustGifter account" }
      break
    case "gift":
      c = { subject: `${code} · verify to open your gift`, banner: "open", title: purpose.from ? `A gift from ${purpose.from}` : "Someone sent you a gift", intro: ["Enter this code to confirm it's really you. Then you can open your gift and tell us where to deliver it."], why: "someone opened a JustGifter gift link that was sent to this address" }
      break
    case "orders":
      c = { subject: `${code} · view your JustGifter orders`, banner: "parcel", title: "Your orders, without an account", intro: ["Enter this code to see the orders and gifts you've paid for with this email address."], why: "someone asked to view JustGifter orders placed with this address" }
      break
    case "bank":
      c = { subject: `${code} · confirm the bank change for ${purpose.store}`, banner: "shield", title: "Confirm your new payout account", intro: [`Enter this code to confirm the change to ${strong(purpose.store)}'s payout bank details.`, "Payouts stay paused until our team confirms the new account, usually within one working day."], why: `someone asked to change the payout account for ${purpose.store}` }
      break
  }
  const parts: EmailParts = {
    preheader: `${code} — expires in ${minutes} minutes. ${c.intro[0].replace(/<[^>]+>/g, "")}`.slice(0, 140),
    banner: c.banner,
    eyebrow: greeting(now, ctx.name),
    title: c.title,
    intro: c.intro,
    code,
    codeNote: `Expires in ${minutes} minutes · Works once`,
    outro: c.outro,
    reason: `You're getting this because ${c.why} at ${requestedAt(now)}. ${purpose.kind === "bank" ? "If that wasn't you, contact support right away — and don't share this code with anyone, including people who say they're from JustGifter." : SAFE}`,
    to: ctx.to,
  }
  return render(c.subject, parts)
}

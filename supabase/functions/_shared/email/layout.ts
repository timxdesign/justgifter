// The one JustGifter email layout. Email clients ignore <style>, SVG and web fonts, so this is
// tables, inline styles and PNG artwork served from /media/brand (see scripts in docs/SETUP.md).
import { env } from "../env.ts"

export type Banner = "gift" | "open" | "bag" | "parcel" | "store" | "balloons" | "shield"

export interface EmailParts {
  /** Inbox preview line. */
  preheader: string
  banner?: Banner
  eyebrow?: string
  title: string
  /** Paragraphs; may contain the inline HTML produced by `strong()`. */
  intro: string[]
  code?: string
  codeNote?: string
  cta?: { label: string; href: string }
  /** Small label/value rows under the main content (e.g. order reference). */
  details?: [string, string][]
  /** Optional closing paragraph above the footer. */
  outro?: string
  /** Why the person received this email. */
  reason: string
  to: string
}

export const C = {
  page: "#f7f2ec",
  card: "#ffffff",
  ink: "#1e1311",
  muted: "#5f504a",
  faint: "#7a6b64",
  line: "#eee5dc",
  soft: "#fff1e3",
  accent: "#bb3f00",
  plum: "#2c1324",
}
const serif = "Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const mono = "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
export const strong = (s: string) => `<strong style="color:${C.ink};font-weight:600">${esc(s)}</strong>`

const site = () => env.siteUrl().replace(/\/$/, "")
export const absolute = (href: string) => new URL(href, site() + "/").toString()

export function renderHtml(p: EmailParts) {
  const base = site()
  const banner = p.banner
    ? `<tr><td style="padding:0;line-height:0;font-size:0"><img src="${base}/media/brand/email/${p.banner}.png" width="520" alt="" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:24px 24px 0 0"></td></tr>`
    : ""
  const code = p.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0">
        <tr><td align="center" style="background:${C.soft};border-radius:16px;padding:24px 12px 22px">
          <div style="font-family:${sans};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${C.accent};font-weight:700;margin:0 0 12px">Your code</div>
          <div style="font-family:${mono};font-size:40px;line-height:44px;letter-spacing:14px;font-weight:700;color:${C.ink};padding-left:14px;white-space:nowrap">${esc(p.code)}</div>
          ${p.codeNote ? `<div style="font-family:${sans};font-size:13px;line-height:20px;color:${C.muted};margin-top:14px">${esc(p.codeNote)}</div>` : ""}
        </td></tr>
      </table>`
    : ""
  const cta = p.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0"><tr><td style="border-radius:999px;background:${C.ink}">
        <a href="${esc(absolute(p.cta.href))}" style="display:inline-block;padding:15px 28px;font-family:${sans};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${esc(p.cta.label)} &rarr;</a>
      </td></tr></table>`
    : ""
  const details = p.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;border-top:1px solid ${C.line}">
        ${p.details.map(([k, v]) => `<tr><td style="padding:12px 0 0;font-family:${sans};font-size:14px;line-height:20px;color:${C.faint};width:40%;vertical-align:top">${esc(k)}</td><td style="padding:12px 0 0;font-family:${sans};font-size:14px;line-height:20px;color:${C.ink};font-weight:600;text-align:right;vertical-align:top">${esc(v)}</td></tr>`).join("")}
      </table>`
    : ""
  const outro = p.outro ? `<p style="margin:28px 0 0;padding-top:24px;border-top:1px solid ${C.line};font-family:${sans};font-size:14px;line-height:22px;color:${C.muted}">${p.outro}</p>` : ""

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(p.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${esc(p.preheader)}${"&#8199;&#847;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
  <tr><td align="center" style="padding:36px 12px 40px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
      <tr><td style="padding:0 8px 22px">
        <a href="${base}" style="text-decoration:none"><img src="${base}/media/brand/email-logo.png" width="148" height="36" alt="JustGifter" style="display:block;border:0;width:148px;height:36px"></a>
      </td></tr>
      <tr><td style="background:${C.card};border-radius:24px;border:1px solid ${C.line}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${banner}
          <tr><td style="padding:34px 32px 36px">
            ${p.eyebrow ? `<div style="font-family:${sans};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${C.accent};font-weight:700;margin:0 0 10px">${esc(p.eyebrow)}</div>` : ""}
            <h1 style="margin:0 0 14px;font-family:${serif};font-size:30px;line-height:36px;font-weight:600;color:${C.ink};letter-spacing:-0.01em">${esc(p.title)}</h1>
            ${p.intro.map((t, i) => `<p style="margin:${i ? "12px" : "0"} 0 0;font-family:${sans};font-size:16px;line-height:25px;color:${C.muted}">${t}</p>`).join("")}
            ${code}${cta}${details}${outro}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 14px 0">
        <p style="margin:0 0 10px;font-family:${sans};font-size:13px;line-height:20px;color:${C.muted}">${p.reason}</p>
        <p style="margin:0;font-family:${sans};font-size:13px;line-height:20px;color:${C.faint}">Sent to ${esc(p.to)} · <a href="${base}/help" style="color:${C.faint};text-decoration:underline">Help</a> · <a href="${base}" style="color:${C.faint};text-decoration:underline">justgifter.com</a><br>Thoughtful gifts, delivered with a moment.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")

export function renderText(p: EmailParts) {
  return [
    ...(p.eyebrow ? [p.eyebrow, ""] : []),
    p.title,
    "",
    ...p.intro.map(strip),
    ...(p.code ? ["", `Your code: ${p.code}`, ...(p.codeNote ? [p.codeNote] : [])] : []),
    ...(p.cta ? ["", `${p.cta.label}: ${absolute(p.cta.href)}`] : []),
    ...(p.details?.length ? ["", ...p.details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(p.outro ? ["", strip(p.outro)] : []),
    "",
    "—",
    strip(p.reason),
    "JustGifter · justgifter.com",
  ].join("\n")
}

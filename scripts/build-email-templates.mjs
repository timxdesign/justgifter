// Builds the Supabase Auth email templates in supabase/templates/ from one shared layout.
// Usage: node scripts/build-email-templates.mjs
// Paste each file into Supabase → Authentication → Emails → Templates (subjects are listed in README.md there).
// Email clients ignore <style> and SVG, so everything is tables, inline styles and a PNG logo.
import { mkdirSync, writeFileSync } from "node:fs"

const SITE = "https://justgifter.com"
const C = {
  page: "#f7f2ec",
  card: "#ffffff",
  ink: "#1e1311",
  muted: "#6b5c55",
  faint: "#7a6b64",
  line: "#eee5dc",
  soft: "#fff1e3",
  accent: "#bb3f00",
  plum: "#2c1324",
}
const serif = "Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const mono = "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

const codeBlock = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
  <tr><td align="center" style="background:${C.soft};border-radius:16px;padding:26px 16px">
    <div style="font-family:${sans};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${C.accent};font-weight:600;margin-bottom:10px">Your code</div>
    <div style="font-family:${mono};font-size:38px;line-height:1;letter-spacing:12px;font-weight:700;color:${C.ink};padding-left:12px">{{ .Token }}</div>
  </td></tr>
</table>
<p style="margin:0 0 4px;font-family:${sans};font-size:13px;line-height:20px;color:${C.faint};text-align:center">Expires in 10 minutes · Works once</p>`

function layout({ preheader, title, intro, after = "", reason }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
  <tr><td align="center" style="padding:40px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
      <tr><td style="padding:0 8px 24px">
        <a href="${SITE}" style="text-decoration:none"><img src="${SITE}/media/brand/email-logo.png" width="148" height="36" alt="JustGifter" style="display:block;border:0;width:148px;height:36px"></a>
      </td></tr>
      <tr><td style="background:${C.card};border-radius:24px;padding:40px 36px;border:1px solid ${C.line}">
        <h1 style="margin:0 0 12px;font-family:${serif};font-size:28px;line-height:34px;font-weight:600;color:${C.ink};letter-spacing:-0.01em">${title}</h1>
        <p style="margin:0;font-family:${sans};font-size:16px;line-height:25px;color:${C.muted}">${intro}</p>
        ${codeBlock}
        ${after}
      </td></tr>
      <tr><td style="padding:24px 12px 0">
        <p style="margin:0 0 10px;font-family:${sans};font-size:13px;line-height:20px;color:${C.muted}">${reason} If that wasn't you, you can safely ignore this email — nobody can get in without the code. JustGifter will never ask you to share it.</p>
        <p style="margin:0;font-family:${sans};font-size:13px;line-height:20px;color:${C.faint}">Sent to {{ .Email }} · <a href="${SITE}" style="color:${C.faint};text-decoration:underline">justgifter.com</a> · Thoughtful gifts, delivered with a moment.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`
}

const templates = {
  "magic-link.html": {
    subject: "{{ .Token }} is your JustGifter sign-in code",
    html: layout({
      preheader: "Your sign-in code is {{ .Token }}. It expires in 10 minutes.",
      title: "Welcome back",
      intro: "Enter this code on JustGifter to sign in. No password needed.",
      reason: "You're getting this because someone asked to sign in to JustGifter with this email address.",
    }),
  },
  "confirm-signup.html": {
    subject: "{{ .Token }} is your JustGifter code",
    html: layout({
      preheader: "Your code is {{ .Token }}. Enter it to finish creating your account.",
      title: "Let's get you gifting",
      intro: "Enter this code on JustGifter to confirm your email and finish creating your account.",
      after: `<p style="margin:24px 0 0;padding-top:24px;border-top:1px solid ${C.line};font-family:${sans};font-size:14px;line-height:22px;color:${C.muted}">With your account you can send gifts with a reveal, track every order, and create an occasion page with a wishlist that never gets duplicate gifts.</p>`,
      reason: "You're getting this because someone used this email address to join JustGifter.",
    }),
  },
  "email-change.html": {
    subject: "{{ .Token }} confirms your new JustGifter email",
    html: layout({
      preheader: "Confirm your new email address with code {{ .Token }}.",
      title: "Confirm your new email",
      intro: "Enter this code on JustGifter to change your account email to <strong style=\"color:#1e1311\">{{ .NewEmail }}</strong>.",
      reason: "You're getting this because someone asked to change the email on a JustGifter account.",
    }),
  },
  "reauthentication.html": {
    subject: "{{ .Token }} is your JustGifter security code",
    html: layout({
      preheader: "Your security code is {{ .Token }}.",
      title: "Confirm it's you",
      intro: "Enter this code on JustGifter to continue with a sensitive account change.",
      reason: "You're getting this because a protected action was started on your JustGifter account.",
    }),
  },
}

mkdirSync("supabase/templates", { recursive: true })
let readme = "# Supabase Auth email templates\n\nGenerated by `node scripts/build-email-templates.mjs` — edit the script, not these files.\nPaste each into Supabase → Authentication → Emails → Templates.\n\n| Supabase template | File | Subject |\n|---|---|---|\n"
const names = { "magic-link.html": "Magic Link", "confirm-signup.html": "Confirm signup", "email-change.html": "Change Email Address", "reauthentication.html": "Reauthentication" }
for (const [file, t] of Object.entries(templates)) {
  writeFileSync(`supabase/templates/${file}`, t.html)
  readme += `| ${names[file]} | \`${file}\` | \`${t.subject}\` |\n`
}
writeFileSync("supabase/templates/README.md", readme)
console.log("Wrote", Object.keys(templates).length, "templates to supabase/templates/")

// Security notices Supabase Auth can send after account changes (enabled per type in the dashboard).
import { absolute, esc, strong } from "./layout.ts"
import { render, type Rendered } from "./send.ts"

export function securityNoticeEmail(action: string, ctx: { to: string; name?: string | null; oldEmail?: string; factorType?: string }): Rendered | null {
  const hi = ctx.name ? `Hi ${esc(ctx.name)}, ` : ""
  const help = `If you didn't do this, <a href="${absolute("/help")}" style="color:#bb3f00">contact support</a> straight away.`
  const copy: Record<string, [string, string, string]> = {
    password_changed_notification: ["Your JustGifter password was changed", "Password changed", `${hi}the password on your account was just changed.`],
    email_changed_notification: ["Your JustGifter email was changed", "Email address changed", `${hi}your account email was changed${ctx.oldEmail ? ` from ${strong(ctx.oldEmail)}` : ""} to ${strong(ctx.to)}.`],
    mfa_factor_enrolled_notification: ["Two-step sign-in was turned on", "Two-step sign-in is on", `${hi}an authenticator app was added to your account. You'll use it each time you sign in to a workspace.`],
    mfa_factor_unenrolled_notification: ["Two-step sign-in was removed", "Authenticator removed", `${hi}an authenticator app was removed from your account.`],
    identity_linked_notification: ["A sign-in method was added", "New sign-in method", `${hi}a new way to sign in was linked to your account.`],
    identity_unlinked_notification: ["A sign-in method was removed", "Sign-in method removed", `${hi}a sign-in method was removed from your account.`],
  }
  const c = copy[action]
  if (!c) return null
  return render(c[0], {
    preheader: c[2].replace(/<[^>]+>/g, ""),
    banner: "shield",
    eyebrow: "Security notice",
    title: c[1],
    intro: [c[2], help],
    reason: "We send these notices whenever something important changes on your JustGifter account.",
    to: ctx.to,
  })
}

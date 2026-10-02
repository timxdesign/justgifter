// deno-lint-ignore-file no-explicit-any
// Operations team access. Roles are only ever granted here: by an admin's invite being accepted
// with a verified email, or by an admin changing someone's access. Never from client input.
import type { Caller, Role } from "./auth.ts"
import { db, must } from "./db.ts"
import { audit } from "./repo.ts"

export type PlatformRole = "admin" | "support"

export const INVITE_DAYS = 7

/** Admin implies support. "none" strips operations access but keeps customer/vendor roles. */
export function withPlatformRole(roles: Role[], role: PlatformRole | "none"): Role[] {
  const base = roles.filter((r) => r !== "admin" && r !== "support")
  if (!base.includes("customer")) base.unshift("customer")
  return role === "admin" ? [...base, "admin", "support"] : role === "support" ? [...base, "support"] : base
}

export const platformRoleOf = (roles: Role[]): PlatformRole | null => (roles.includes("admin") ? "admin" : roles.includes("support") ? "support" : null)

/** Called on every session check: a verified email with a live invite joins the team. */
export async function acceptPlatformInvite(caller: Caller) {
  if (!caller.userId || !caller.email || !caller.emailVerified) return
  const invite = must(await db().from("platform_invites").select("*").eq("email", caller.email).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle()) as any
  if (!invite) return
  const current = platformRoleOf(caller.roles)
  // Never downgrade: an existing admin accepting a support invite keeps admin.
  const role: PlatformRole = current === "admin" ? "admin" : invite.role
  const roles = withPlatformRole(caller.roles, role)
  must(await db().from("profiles").update({ roles }).eq("id", caller.userId))
  must(await db().from("platform_invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id))
  await audit(caller.email, "team.joined", "user", caller.userId, `Accepted ${invite.role} invitation from ${invite.invited_by}`)
  caller.roles = roles
}

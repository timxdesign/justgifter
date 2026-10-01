import { db } from "./db.ts"
import { fail } from "./http.ts"

export type Role = "customer" | "vendor_owner" | "vendor_staff" | "support" | "admin"

export interface Caller {
  userId: string | null
  email: string | null
  name: string
  roles: Role[]
  vendorId: string | null
  emailVerified: boolean
  /** Authenticator assurance level from the JWT: aal2 means MFA completed. */
  aal: "aal1" | "aal2" | null
}

const ANON: Caller = { userId: null, email: null, name: "", roles: [], vendorId: null, emailVerified: false, aal: null }

function decodeAal(jwt: string): "aal1" | "aal2" | null {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    return payload.aal ?? null
  } catch {
    return null
  }
}

/** Resolves the caller from the bearer token. Organisation ids are never taken from client input (SEC 01). */
export async function getCaller(req: Request): Promise<Caller> {
  const header = req.headers.get("authorization") ?? ""
  const token = header.replace(/^Bearer\s+/i, "")
  if (!token || token.split(".").length !== 3) return ANON
  const { data, error } = await db().auth.getUser(token)
  if (error || !data.user) return ANON
  const { data: profile } = await db().from("profiles").select("*").eq("id", data.user.id).maybeSingle()
  const { data: staff } = await db().from("vendor_staff").select("vendor_id").eq("user_id", data.user.id).eq("status", "active").maybeSingle()
  return {
    userId: data.user.id,
    email: (data.user.email ?? "").toLowerCase(),
    name: profile?.name ?? "",
    roles: (profile?.roles ?? ["customer"]) as Role[],
    vendorId: profile?.vendor_id ?? staff?.vendor_id ?? null,
    emailVerified: Boolean(data.user.email_confirmed_at),
    aal: decodeAal(token),
  }
}

export function requireUser(c: Caller) {
  if (!c.userId) throw fail("unauthorised", "Sign in to continue.")
  return c as Caller & { userId: string; email: string }
}

/** Vendor owners and platform staff must have completed MFA (§2 identity rules). */
export function requireRole(c: Caller, ...roles: Role[]) {
  const u = requireUser(c)
  if (!roles.some((r) => u.roles.includes(r))) throw fail("forbidden", "You don't have access to this area.")
  const privileged = u.roles.some((r) => r === "admin" || r === "support" || r === "vendor_owner")
  if (privileged && u.aal !== "aal2") throw fail("forbidden", "Complete two-step verification to continue.")
  return u
}

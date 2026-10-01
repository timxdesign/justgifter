import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"
import type { Role } from "@/api"
import { useSession } from "@/lib/session"
import { PageSkeleton } from "@/components/common"

/**
 * Route guards improve navigation only. Real enforcement is server-side: Supabase RLS and
 * Edge Function checks (or the demo backend's equivalent checks) reject unauthorised access.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  const location = useLocation()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

export function RequireRole({ roles, fallback, children }: { roles: Role[]; fallback: string; children: ReactNode }) {
  const { user, loading, hasRole } = useSession()
  const location = useLocation()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!hasRole(...roles)) return <Navigate to={fallback} replace />
  // Privileged areas require a completed second factor (aal2); the API enforces the same rule.
  const privileged = user.roles.some((r) => r === "admin" || r === "support" || r === "vendor_owner")
  if (privileged && !user.mfaVerified) return <Navigate to={`/mfa?next=${encodeURIComponent(location.pathname)}`} replace />
  return <>{children}</>
}

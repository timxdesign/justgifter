import { createContext, useContext } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { Role, SessionUser } from "@/api"
import { qk, useApiQuery } from "./api-hooks"

interface SessionContextValue {
  user: SessionUser | null
  loading: boolean
  hasRole: (...roles: Role[]) => boolean
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useApiQuery(qk.session, (api) => api.getSession(), { staleTime: 60_000 })
  const user = data ?? null
  const value: SessionContextValue = {
    user,
    loading: isLoading,
    hasRole: (...roles) => Boolean(user && roles.some((r) => user.roles.includes(r))),
    refresh: async () => {
      // A different identity can see different orders, events and workspaces: reset everything.
      await qc.resetQueries()
    },
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used inside SessionProvider")
  return ctx
}

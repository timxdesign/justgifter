import { useEffect } from "react"
import { Outlet, ScrollRestoration } from "react-router"
import { backendMode } from "@/lib/env"
import { getApi } from "@/api"
import { DemoPanel } from "@/app/demo-panel"

/** In demo mode, a timer stands in for Supabase Cron: due reveals, claim expiry, hold expiry. */
function DemoWorker() {
  useEffect(() => {
    const tick = async () => {
      const api = await getApi()
      await api.runDueJobs().catch(() => undefined)
    }
    const t = setInterval(tick, 20_000)
    return () => clearInterval(t)
  }, [])
  return null
}

export function RootLayout() {
  return (
    <>
      <a href="#main" className="bg-primary text-primary-foreground sr-only z-[100] rounded-lg px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Outlet />
      <ScrollRestoration />
      {backendMode === "demo" && (
        <>
          <DemoWorker />
          <DemoPanel />
        </>
      )}
    </>
  )
}

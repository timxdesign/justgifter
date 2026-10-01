import { NavLink } from "react-router"
import { cn } from "cn"
import { useSession } from "@/lib/session"

export function AccountTabs() {
  const { user } = useSession()
  const tabs = [
    { to: "/account", label: "Orders & gifts", end: true },
    ...(user ? [{ to: "/events", label: "Occasion pages", end: false }] : []),
    { to: "/account/saved", label: "Saved", end: false },
    ...(user ? [{ to: "/account/settings", label: "Settings", end: false }] : []),
  ]
  return (
    <nav aria-label="Account" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b px-4">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn("-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors", isActive ? "border-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent")}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

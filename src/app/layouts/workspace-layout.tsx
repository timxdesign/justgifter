import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { cn } from "cn"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Widget5Icon,
  BoxIcon,
  ShopIcon,
  Chart2Icon,
  WalletMoneyIcon,
  UsersGroupRoundedIcon,
  SettingsIcon,
  BillListIcon,
  HamburgerMenuIcon,
  ShieldCheckIcon,
  TagPriceIcon,
  RestartIcon,
  ChatRoundDotsIcon,
  RoundTransferHorizontalIcon,
  FlagIcon,
  LayersIcon,
  ServerSquareIcon,
  DocumentTextIcon,
  Shop2Icon,
  ArrowLeftIcon,
} from "@/components/icons"
import { useSession } from "@/lib/session"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { initials } from "@/lib/format"
import { ThemeSwitcher } from "./public-layout"

interface NavItem {
  to: string
  label: string
  icon: typeof Widget5Icon
  end?: boolean
  count?: number
  ownerOnly?: boolean
}

export function WorkspaceLayout({ area }: { area: "vendor" | "admin" }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return (
    <div className="bg-sidebar flex min-h-dvh">
      <aside className="bg-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex">
        <SidebarContent area={area} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{area === "vendor" ? "Vendor workspace" : "Operations"} menu</SheetTitle>
          </SheetHeader>
          <SidebarContent area={area} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-sidebar/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <HamburgerMenuIcon />
          </Button>
          <Logo compact />
          <span className="text-sm font-medium">{area === "vendor" ? "Vendor workspace" : "Operations"}</span>
        </header>
        <main id="main" className="bg-background min-h-full flex-1 lg:m-2 lg:ml-0 lg:rounded-2xl lg:shadow-border">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ area }: { area: "vendor" | "admin" }) {
  const { user, hasRole } = useSession()
  const navigate = useNavigate()
  const isOwner = hasRole("vendor_owner")
  const ws = useApiQuery(qk.vendorWorkspace, (api) => api.getVendorWorkspace(), { enabled: area === "vendor" })
  const dash = useApiQuery(qk.vendorDashboard, (api) => api.getVendorDashboard(), { enabled: area === "vendor" && ws.data?.vendor.status === "approved" })
  const ops = useApiQuery(qk.ops, (api) => api.getOpsOverview(), { enabled: area === "admin" })

  const vendorNav: NavItem[] = [
    { to: "/vendor", label: "Dashboard", icon: Widget5Icon, end: true },
    { to: "/vendor/orders", label: "Orders", icon: BillListIcon, count: dash.data?.metrics.needsAcceptance },
    { to: "/vendor/products", label: "Products & stock", icon: BoxIcon },
    { to: "/vendor/storefront", label: "Storefront", icon: ShopIcon, ownerOnly: true },
    { to: "/vendor/analytics", label: "Store analytics", icon: Chart2Icon },
    { to: "/vendor/payouts", label: "Payouts", icon: WalletMoneyIcon, ownerOnly: true },
    { to: "/vendor/staff", label: "Staff", icon: UsersGroupRoundedIcon },
    { to: "/vendor/settings", label: "Settings", icon: SettingsIcon, ownerOnly: true },
  ]
  const adminNav: NavItem[] = [
    { to: "/admin", label: "Overview", icon: Widget5Icon, end: true },
    { to: "/admin/orders", label: "Orders", icon: BillListIcon },
    { to: "/admin/vendors", label: "Vendor review", icon: ShieldCheckIcon, count: ops.data?.pendingVendors },
    { to: "/admin/listings", label: "Listing moderation", icon: TagPriceIcon, count: ops.data?.pendingListings },
    { to: "/admin/storefronts", label: "Storefronts", icon: Shop2Icon },
    { to: "/admin/refunds", label: "Refunds", icon: RestartIcon, count: ops.data?.stuckRefunds },
    { to: "/admin/cases", label: "Support cases", icon: ChatRoundDotsIcon, count: ops.data?.openCases },
    { to: "/admin/reconciliation", label: "Reconciliation", icon: RoundTransferHorizontalIcon, count: ops.data?.unmatchedPayments },
    { to: "/admin/reports", label: "Content reports", icon: FlagIcon, count: ops.data?.openReports },
    { to: "/admin/templates", label: "Templates", icon: LayersIcon },
    { to: "/admin/jobs", label: "Scheduled jobs", icon: ServerSquareIcon, count: ops.data?.failedJobs },
    { to: "/admin/audit", label: "Audit log", icon: DocumentTextIcon },
  ]
  const items = area === "vendor" ? vendorNav.filter((n) => !n.ownerOnly || isOwner) : adminNav
  const vendorName = ws.data?.vendor.name

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-4 px-4 pt-5 pb-4">
        <Link to="/" className="w-fit rounded-lg" aria-label="JustGifter home">
          <Logo />
        </Link>
        <div className="bg-card shadow-border flex items-center gap-3 rounded-xl p-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold", area === "vendor" ? "text-white" : "bg-plum text-plum-foreground")} style={area === "vendor" && ws.data ? { background: `color-mix(in oklch, ${ws.data.vendor.logoColor} 72%, black)` } : undefined}>
            {area === "vendor" ? ws.data?.vendor.logoInitials ?? "…" : "OPS"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{area === "vendor" ? vendorName ?? "Your store" : "Operations"}</p>
            <p className="text-muted-foreground truncate text-xs">{area === "vendor" ? (isOwner ? "Owner" : "Staff") : hasRole("admin") ? "Administrator" : "Support"}</p>
          </div>
        </div>
      </div>
      <nav aria-label={area === "vendor" ? "Vendor workspace" : "Operations"} className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {items.map(({ to, label, icon: Icon, end, count }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", isActive ? "bg-card text-foreground shadow-border font-medium" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground")}>
            <Icon className="size-[1.125rem] shrink-0" />
            <span className="flex-1">{label}</span>
            {!!count && <Badge variant="brand" className="tabular">{count}</Badge>}
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col gap-3 border-t p-4">
        <Button variant="ghost" size="sm" className="justify-start" onClick={() => navigate("/")}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to JustGifter
        </Button>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            {user?.avatar && <AvatarImage src={user.avatar} alt="" />}
            <AvatarFallback className="text-xs">{initials(user?.name ?? "")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
          </div>
        </div>
        <ThemeSwitcher />
      </div>
    </div>
  )
}

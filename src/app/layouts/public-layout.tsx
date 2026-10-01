import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { cn } from "cn"
import { OCCASIONS } from "@domain/index.ts"
import { Logo } from "@/components/brand/logo"
import { Container, Img } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  AltArrowDownIcon,
  BagHeartIcon,
  HamburgerMenuIcon,
  HeartIcon,
  MagnifierIcon,
  UserCircleIcon,
  StarsIcon,
  ArrowRightIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from "@/components/icons"
import { useCart, cartCount } from "@/lib/cart"
import { useSession } from "@/lib/session"
import { useTheme, type ThemePreference } from "@/lib/theme"
import { initials } from "@/lib/format"
import { getApi } from "@/api"

const NAV = [
  { to: "/shop", label: "Shop gifts" },
  { to: "/assistant", label: "Gift assistant" },
  { to: "/occasion-pages", label: "Occasion pages" },
  { to: "/vendors", label: "Vendors" },
]

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

function AnnouncementBar() {
  return (
    <div className="bg-plum text-plum-foreground text-center text-[0.8125rem]">
      <Container className="flex h-9 items-center justify-center gap-2">
        <span className="bg-gold inline-block size-1.5 rounded-full" aria-hidden="true" />
        <span className="truncate">Same-day delivery across Lagos on flowers and treats ordered before 2pm</span>
      </Container>
    </div>
  )
}

function SiteHeader() {
  const bag = useCart()
  const count = cartCount(bag)
  const [searchOpen, setSearchOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <header className={cn("sticky top-0 z-40 transition-[background-color,box-shadow] duration-200", scrolled ? "bg-background/85 shadow-[0_1px_0_var(--border)] backdrop-blur-xl" : "bg-background")}>
      <Container className="flex h-16 items-center gap-3 lg:h-[4.5rem]">
        <MobileNav />
        <Link to="/" className="rounded-lg" aria-label="JustGifter home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          <OccasionsMenu />
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("rounded-lg px-3 py-2 text-[0.9375rem] transition-colors hover:bg-muted", isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-lg" onClick={() => setSearchOpen(true)} aria-label="Search gifts">
            <MagnifierIcon />
          </Button>
          <Button variant="ghost" size="icon-lg" asChild className="max-sm:hidden">
            <Link to="/account/saved" aria-label="Saved items">
              <HeartIcon />
            </Link>
          </Button>
          <AccountMenu />
          <Button variant="ghost" size="icon-lg" asChild className="relative">
            <Link to="/cart" aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}>
              <BagHeartIcon />
              {count > 0 && <span className="bg-brand text-brand-foreground tabular absolute top-1 right-0.5 grid min-w-[1.125rem] place-items-center rounded-full px-1 text-[0.6875rem] leading-[1.125rem] font-semibold">{count}</span>}
            </Link>
          </Button>
        </div>
      </Container>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}

function OccasionsMenu() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 rounded-lg px-3 py-2 text-[0.9375rem] transition-colors aria-expanded:bg-muted aria-expanded:text-foreground">
          Occasions
          <AltArrowDownIcon className="size-4 transition-transform duration-200 [[aria-expanded=true]>&]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="w-[min(46rem,90vw)] rounded-2xl p-3">
        <div className="grid grid-cols-5 gap-2">
          {OCCASIONS.map((o) => (
            <Link key={o.id} to={`/occasions/${o.id}`} className="group/occ flex flex-col gap-2 rounded-xl p-1.5 transition-colors hover:bg-muted">
              <div className="aspect-square overflow-hidden rounded-lg">
                <Img src={o.image} alt="" className="size-full transition-[scale] duration-500 group-hover/occ:scale-105" sizes="140px" />
              </div>
              <span className="px-1 text-sm font-medium">{o.name}</span>
            </Link>
          ))}
        </div>
        <div className="bg-muted/60 mt-3 flex items-center justify-between gap-4 rounded-xl px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">Not sure what to get?</span> <span className="text-muted-foreground">Answer a few questions and we'll suggest gifts that can arrive in time.</span>
          </p>
          <Button size="sm" asChild>
            <Link to="/assistant">
              <StarsIcon data-icon="inline-start" />
              Ask the assistant
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AccountMenu() {
  const { user, hasRole, refresh } = useSession()
  const navigate = useNavigate()
  if (!user) {
    return (
      <Button variant="ghost" size="icon-lg" asChild>
        <Link to="/signin" aria-label="Sign in">
          <UserCircleIcon />
        </Link>
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="press grid size-11 place-items-center rounded-xl hover:bg-muted" aria-label={`Account menu for ${user.name}`}>
          <Avatar className="size-8">
            {user.avatar && <AvatarImage src={user.avatar} alt="" />}
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{user.name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => navigate("/account")}>Orders & gifts</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/events")}>Occasion pages</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/account/saved")}>Saved</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/account/settings")}>Settings</DropdownMenuItem>
        </DropdownMenuGroup>
        {(hasRole("vendor_owner", "vendor_staff") || hasRole("admin", "support")) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {hasRole("vendor_owner", "vendor_staff") && <DropdownMenuItem onSelect={() => navigate("/vendor")}>Vendor workspace</DropdownMenuItem>}
              {hasRole("admin", "support") && <DropdownMenuItem onSelect={() => navigate("/admin")}>Operations</DropdownMenuItem>}
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await (await getApi()).signOut()
            await refresh()
            navigate("/")
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="-ml-2 lg:hidden" aria-label="Open menu">
          <HamburgerMenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(22rem,88vw)] gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle>
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 overflow-y-auto p-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("rounded-xl px-3 py-3 text-base", isActive ? "bg-muted font-medium" : "hover:bg-muted")}>
              {n.label}
            </NavLink>
          ))}
          <p className="eyebrow text-muted-foreground mt-4 px-3 pb-1">Occasions</p>
          <div className="grid grid-cols-2 gap-1">
            {OCCASIONS.map((o) => (
              <Link key={o.id} to={`/occasions/${o.id}`} className="hover:bg-muted rounded-xl px-3 py-2.5 text-sm">
                {o.name}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-1 border-t pt-4">
            <Link to="/account" className="hover:bg-muted rounded-xl px-3 py-2.5">Orders & gifts</Link>
            <Link to="/orders/access" className="hover:bg-muted rounded-xl px-3 py-2.5">Track an order</Link>
            <Link to="/sell" className="hover:bg-muted rounded-xl px-3 py-2.5">Sell on JustGifter</Link>
            <Link to="/help" className="hover:bg-muted rounded-xl px-3 py-2.5">Help</Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}

const SUGGESTIONS = ["Flowers today in Lagos", "Hampers under 50k", "Birthday gifts for her", "Wedding registry", "Self-care", "Personalised"]

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const go = (query: string) => {
    onOpenChange(false)
    navigate(`/shop?q=${encodeURIComponent(query)}`)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search gifts</DialogTitle>
          <DialogDescription>Search products, vendors and occasions.</DialogDescription>
        </DialogHeader>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (q.trim()) go(q.trim())
          }}
          className="flex items-center gap-3 border-b px-5"
        >
          <MagnifierIcon className="text-muted-foreground size-5 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Roses, candles, “gift for my mum”…"
            aria-label="Search gifts"
            className="h-16 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-xs">Esc</kbd>
        </form>
        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="eyebrow text-muted-foreground mb-2">Popular</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => go(s)} className="press bg-muted hover:bg-accent rounded-full px-3 py-1.5 text-sm">
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Link to={q ? `/assistant?q=${encodeURIComponent(q)}` : "/assistant"} onClick={() => onOpenChange(false)} className="bg-brand-soft group/a flex items-center gap-3 rounded-xl p-4">
            <StarsIcon className="text-brand-text size-5" />
            <span className="flex-1 text-sm">
              <span className="font-medium">Describe who it's for</span> — the gift assistant suggests things that can arrive in time
            </span>
            <ArrowRightIcon className="size-4 transition-transform group-hover/a:translate-x-0.5" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SiteFooter() {
  const cols = [
    { title: "Shop", links: [["All gifts", "/shop"], ["Birthday", "/occasions/birthday"], ["Wedding", "/occasions/wedding"], ["Thank you", "/occasions/appreciation"], ["Gift assistant", "/assistant"]] },
    { title: "Celebrate", links: [["Create an occasion page", "/events/new"], ["How wishlists work", "/occasion-pages"], ["Track an order", "/orders/access"]] },
    { title: "Vendors", links: [["Sell on JustGifter", "/sell"], ["Vendor workspace", "/vendor"], ["Our vendors", "/vendors"]] },
    { title: "Help", links: [["Delivery & payment", "/help"], ["Returns & refunds", "/policies/returns"], ["Privacy", "/policies/privacy"], ["Terms", "/policies/terms"]] },
  ]
  return (
    <footer className="bg-card mt-24 border-t">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="flex max-w-xs flex-col gap-4">
          <Logo />
          <p className="text-muted-foreground text-sm">Thoughtful gifts from trusted local vendors, with a moment to remember when they arrive.</p>
          <ThemeSwitcher />
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title} className="flex flex-col gap-3">
            <p className="text-sm font-semibold">{c.title}</p>
            {c.links.map(([label, to]) => (
              <Link key={to} to={to} className="text-muted-foreground hover:text-foreground w-fit text-sm transition-colors">
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </Container>
      <Container className="text-muted-foreground flex flex-col gap-2 border-t py-6 text-xs sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} JustGifter. Prices in Nigerian naira.</p>
        <p>Secure payments by Paystack · Card details are never stored by JustGifter</p>
      </Container>
    </footer>
  )
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const options: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: MonitorIcon },
  ]
  return (
    <div role="radiogroup" aria-label="Theme" className="bg-muted inline-flex w-fit gap-0.5 rounded-xl p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} onClick={() => setTheme(value)} className={cn("grid size-8 place-items-center rounded-lg transition-colors", theme === value ? "bg-card shadow-border text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

export { ThemeSwitcher }

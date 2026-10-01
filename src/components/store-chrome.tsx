import type { ReactNode } from "react"
import { Link } from "react-router"
import type { StoreAccent } from "@domain/index.ts"
import type { VendorPublic } from "@/api"
import { Container } from "@/components/common"
import { VendorAvatar } from "@/components/commerce"
import { Button } from "@/components/ui/button"
import { BagHeartIcon, VerifiedCheckIcon } from "@/components/icons"
import { LogoMark } from "@/components/brand/logo"
import { useCart } from "@/lib/cart"

export const ACCENT: Record<StoreAccent, string> = {
  tangerine: "oklch(0.7 0.18 47)",
  plum: "oklch(0.42 0.1 340)",
  sage: "oklch(0.55 0.07 150)",
  ink: "oklch(0.3 0.02 260)",
  rose: "oklch(0.62 0.13 10)",
  gold: "oklch(0.68 0.12 80)",
}

/** Minimal store-branded chrome: a shared link lands here, not on the marketplace homepage (AC 17). */
export function StoreChrome({ vendor, slug, accent, children }: { vendor: VendorPublic; slug: string; accent: StoreAccent; children: ReactNode }) {
  const bags = useCart()
  const count = bags.bags[vendor.id]?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0
  return (
    <div className="flex min-h-dvh flex-col" style={{ "--store-accent": ACCENT[accent] } as React.CSSProperties}>
      <header className="bg-background/90 sticky top-0 z-40 border-b backdrop-blur-xl">
        <Container className="flex h-16 items-center gap-3">
          <Link to={`/stores/${slug}`} className="flex items-center gap-3 rounded-lg">
            <VendorAvatar name={vendor.name} initials={vendor.logoInitials} color={vendor.logoColor} className="size-9" />
            <span className="font-display text-lg font-medium">{vendor.name}</span>
            {vendor.verified && <VerifiedCheckIcon className="text-info size-4" aria-label="Verified by JustGifter" />}
          </Link>
          <Button variant="ghost" size="icon-lg" asChild className="relative ml-auto">
            <Link to="/cart" aria-label={`Bag, ${count} items`}>
              <BagHeartIcon />
              {count > 0 && <span className="tabular absolute top-1 right-0.5 grid min-w-[1.125rem] place-items-center rounded-full bg-[color-mix(in_oklch,var(--store-accent)_70%,black)] px-1 text-[0.6875rem] leading-[1.125rem] font-semibold text-white">{count}</span>}
            </Link>
          </Button>
        </Container>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="text-muted-foreground mt-16 border-t py-8 text-sm">
        <Container className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p>Orders, payments and support by JustGifter. Card details are handled by Paystack.</p>
          <Link to="/" className="hover:text-foreground flex items-center gap-2"><LogoMark className="size-5" />Powered by JustGifter</Link>
        </Container>
      </footer>
    </div>
  )
}

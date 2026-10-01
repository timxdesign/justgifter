import { Link } from "react-router"
import { Container, Img, SectionHeading } from "@/components/common"
import { Button } from "@/components/ui/button"
import { ShopIcon, QrCodeIcon, BillListIcon, WalletMoneyIcon, Chart2Icon, ShieldCheckIcon, ArrowRightIcon } from "@/components/icons"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"

const FEATURES = [
  { icon: ShopIcon, title: "Your own storefront", body: "A shareable store at justgifter.com/stores/your-name, branded with your colours and collections." },
  { icon: QrCodeIcon, title: "Share anywhere", body: "Copy the link or download a QR code for Instagram, WhatsApp status and printed cards." },
  { icon: BillListIcon, title: "One order dashboard", body: "Marketplace, wishlist and direct store orders in one place, each labelled by source and gift type." },
  { icon: Chart2Icon, title: "Store analytics", body: "Visits, product views, checkout starts and paid orders — so you know what's working." },
  { icon: WalletMoneyIcon, title: "Clear payouts", body: "Every order shows gross, commission and net. Download statements whenever you need them." },
  { icon: ShieldCheckIcon, title: "Payments handled", body: "Customers pay through Paystack. We verify every payment before you start preparing." },
]

export default function SellPage() {
  useDocumentMeta({ title: "Sell on JustGifter", description: "Get a storefront link, take gift orders from the marketplace and wishlists, and manage everything in one dashboard.", canonical: "/sell" })
  const { user, hasRole } = useSession()
  const cta = hasRole("vendor_owner", "vendor_staff") ? { to: "/vendor", label: "Go to your workspace" } : { to: user ? "/vendor/apply" : "/signin?next=/vendor/apply", label: "Apply to sell" }
  return (
    <>
      <Container className="grid items-center gap-12 py-16 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="eyebrow text-brand-text">For vendors</p>
          <h1 className="font-display text-5xl leading-[1.02] font-medium sm:text-6xl">Your gifts, in front of people looking for them.</h1>
          <p className="text-muted-foreground text-lg">Join a marketplace built around occasions. Take orders from gift shoppers, wedding wishlists and your own shareable store — and fulfil them all from one dashboard.</p>
          <div className="flex flex-wrap gap-3">
            <Button size="xl" asChild><Link to={cta.to}>{cta.label}<ArrowRightIcon data-icon="inline-end" /></Link></Button>
            <Button size="xl" variant="outline" asChild><Link to="/stores/bloom-and-bisi">See a storefront</Link></Button>
          </div>
          <p className="text-muted-foreground text-sm">Free to apply. We review every application within 3 working days. Commission is charged only on fulfilled orders.</p>
        </div>
        <Img src="/media/v/flower-shop@2x.webp" alt="A florist's shop front full of bouquets" eager className="aspect-[4/5] rounded-[2rem] lg:aspect-square" sizes="(min-width: 1024px) 45vw, 100vw" />
      </Container>
      <Container className="flex flex-col gap-10 py-16">
        <SectionHeading title="Everything you need to sell gifts" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="surface flex flex-col gap-3 rounded-3xl p-6">
              <Icon className="text-brand-text size-6" />
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="text-muted-foreground text-sm">{body}</p>
            </div>
          ))}
        </div>
      </Container>
      <Container className="py-16">
        <div className="bg-card shadow-border grid gap-8 rounded-[2rem] p-8 sm:p-12 lg:grid-cols-3">
          <h2 className="font-display text-3xl">What we look for</h2>
          <ul className="text-muted-foreground flex flex-col gap-3 lg:col-span-2">
            <li>• A registered business or sole trader with a Nigerian bank account for payouts</li>
            <li>• Reliable delivery in at least one of our areas — your own riders or a courier</li>
            <li>• Accurate stock and preparation times, and orders confirmed within a few hours</li>
            <li>• Products that are genuine, safe and honestly described — no medical claims or counterfeits</li>
          </ul>
        </div>
      </Container>
    </>
  )
}

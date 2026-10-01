import { Link } from "react-router"
import { motion, useReducedMotion } from "motion/react"
import { BUDGET_BANDS, OCCASIONS } from "@domain/index.ts"
import { Container, Img, SectionHeading, CardGridSkeleton } from "@/components/common"
import { ProductGrid, VendorAvatar } from "@/components/commerce"
import { HeroRevealDemo } from "@/components/reveal/hero-demo"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  DeliveryIcon,
  VerifiedCheckIcon,
  LetterOpenedIcon,
  CalendarMarkIcon,
  ListHeartIcon,
  QrCodeIcon,
  LockKeyholeIcon,
  UsersGroupRoundedIcon,
  StarsIcon,
  GiftIcon,
} from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"
import { cn } from "cn"

const ease = [0.2, 0, 0, 1] as const

export default function HomePage() {
  useDocumentMeta({ title: "", description: "Send thoughtful gifts from trusted local vendors, create occasion pages with wishlists, and give every gift a reveal they'll remember.", canonical: "/" })
  const feed = useApiQuery(qk.home, (api) => api.getHomeFeed())
  return (
    <>
      <Hero />
      <OccasionRail />
      <section aria-labelledby="featured" className="py-20 sm:py-28">
        <Container className="flex flex-col gap-10">
          <SectionHeading
            id="featured"
            eyebrow="Loved this week"
            title={<>Gifts people are <span className="font-display-wonk italic">actually</span> sending</>}
            description="Every item is stocked by an approved vendor and checked against your delivery date before you pay."
            action={
              <Button variant="outline" size="lg" asChild>
                <Link to="/shop">
                  Browse all gifts
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            }
          />
          <BudgetChips />
          {feed.data ? <ProductGrid products={feed.data.featured} /> : <CardGridSkeleton count={8} />}
        </Container>
      </section>
      <RevealStory />
      <WishlistStory />
      <section aria-labelledby="guides" className="py-20 sm:py-28">
        <Container className="flex flex-col gap-10">
          <SectionHeading id="guides" eyebrow="Gift guides" title="Start somewhere" description="Hand-picked edits from our team. Every item is in stock and deliverable." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(feed.data?.guides ?? []).map((g, i) => (
              <Link key={g.id} to={`/shop?guide=${g.id}`} className="group/g relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-3xl p-6 text-white">
                <Img src={g.image} alt="" className="absolute inset-0 -z-10 size-full transition-[scale] duration-700 group-hover/g:scale-105" sizes="(min-width: 1024px) 25vw, 50vw" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <span className="eyebrow opacity-80">Guide {String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display mt-1 text-2xl leading-tight">{g.title}</h3>
                <p className="mt-1 text-sm opacity-85">{g.description}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>
      <VendorsSection vendors={feed.data?.vendors ?? []} />
      <Faq />
      <SellBand />
    </>
  )
}

function Hero() {
  const reduce = useReducedMotion()
  const item = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 16, filter: "blur(6px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: 0.7, delay: 0.08 + i * 0.1, ease } })
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="paper-grain pointer-events-none absolute inset-0 opacity-60" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 right-[-10%] size-[44rem] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--brand) 40%, transparent), transparent 65%)" }} />
      <Container className="relative grid items-center gap-14 pt-12 pb-20 lg:grid-cols-[1.15fr_1fr] lg:pt-16 lg:pb-28">
        <div className="flex flex-col gap-7">
          <motion.p {...item(0)} className="bg-card shadow-border flex w-fit items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm">
            <span className="bg-brand text-brand-foreground rounded-full px-2 py-0.5 text-xs font-semibold">New</span>
            Occasion pages with wishlists that never double up
          </motion.p>
          <motion.h1 {...item(1)} className="font-display text-[3.25rem] leading-[0.98] font-medium tracking-[-0.03em] sm:text-7xl lg:text-[5.25rem]">
            Send something they'll <span className="font-display-wonk text-brand-text italic">remember opening.</span>
          </motion.h1>
          <motion.p {...item(2)} className="text-muted-foreground max-w-xl text-lg text-pretty sm:text-xl">
            Thoughtful gifts from trusted local vendors, delivered across Lagos, Abuja and Port Harcourt — with a reveal they open on their phone, right when you choose.
          </motion.p>
          <motion.div {...item(3)} className="flex flex-col gap-3 sm:flex-row">
            <Button size="xl" asChild>
              <Link to="/shop">
                <GiftIcon data-icon="inline-start" />
                Send a gift
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link to="/events/new">Create an occasion page</Link>
            </Button>
          </motion.div>
          <motion.ul {...item(4)} className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li className="flex items-center gap-2">
              <VerifiedCheckIcon className="text-info size-4" /> Approved vendors only
            </li>
            <li className="flex items-center gap-2">
              <DeliveryIcon className="text-brand-text size-4" /> Same-day in Lagos
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheckIcon className="text-success size-4" /> Secure Paystack checkout
            </li>
          </motion.ul>
        </div>
        <motion.div initial={reduce ? false : { opacity: 0, y: 30, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 1, delay: 0.3, ease }}>
          <HeroRevealDemo />
        </motion.div>
      </Container>
    </section>
  )
}

function OccasionRail() {
  return (
    <section aria-labelledby="occasions" className="bg-card border-y py-16">
      <Container className="flex flex-col gap-8">
        <div className="flex items-end justify-between gap-4">
          <h2 id="occasions" className="font-display text-3xl font-medium sm:text-4xl">
            What are we celebrating?
          </h2>
          <Link to="/shop" className="text-muted-foreground hover:text-foreground hidden text-sm sm:block">
            All gifts →
          </Link>
        </div>
      </Container>
      <div className="scrollbar-none mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 sm:scroll-px-6 sm:px-6 lg:scroll-px-[max(2rem,calc((100vw-1240px)/2+2rem))] lg:px-[max(2rem,calc((100vw-1240px)/2+2rem))]">
        {OCCASIONS.map((o, i) => (
          <Link key={o.id} to={`/occasions/${o.id}`} className="group/o relative isolate flex aspect-[3/4] w-44 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-4 text-white sm:w-52">
            <Img src={o.image} alt="" eager={i < 5} className="absolute inset-0 -z-10 size-full transition-[scale] duration-700 group-hover/o:scale-105" sizes="210px" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <span className="font-display text-xl leading-tight">{o.name}</span>
            <span className="text-xs opacity-80">{o.blurb}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function BudgetChips() {
  return (
    <nav aria-label="Shop by budget" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
      <span className="text-muted-foreground shrink-0 self-center pr-1 text-sm">Shop by budget</span>
      {BUDGET_BANDS.map((b) => (
        <Link key={b.id} to={`/shop?budget=${b.id}`} className="press bg-card shadow-border hover:shadow-border-hover shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-shadow">
          {b.label}
        </Link>
      ))}
    </nav>
  )
}

function RevealStory() {
  const steps = [
    { icon: GiftIcon, title: "Choose a gift that can arrive in time", body: "We only show dates the vendor can actually make, so there are no last-minute surprises of the wrong kind." },
    { icon: LetterOpenedIcon, title: "Write a message, pick the moment", body: "Send the reveal straight away or schedule it for midnight on their birthday. Edit it any time before it's sent." },
    { icon: StarsIcon, title: "They open it on their phone", body: "An envelope or a wrapped box opens to show what you sent. No app, no account — and no price shown." },
    { icon: DeliveryIcon, title: "The real thing arrives", body: "Delivery is tracked separately, so “on its way” only appears once the vendor has actually sent it." },
  ]
  return (
    <section aria-labelledby="reveal-story" className="bg-plum text-plum-foreground relative overflow-hidden py-24 sm:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, oklch(0.5 0.12 20), transparent 60%)" }} />
      <Container className="relative grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="flex flex-col gap-6">
          <p className="eyebrow text-gold">How it works</p>
          <h2 id="reveal-story" className="font-display text-4xl leading-[1.05] font-medium sm:text-6xl">
            Every gift arrives <span className="font-display-wonk text-gold italic">twice.</span>
          </h2>
          <p className="text-plum-muted max-w-md text-lg">Once as a moment on their phone. Once at their door. We keep the two separate, so a reveal never promises something the courier hasn't done yet.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Button size="xl" variant="inverse" asChild>
              <Link to="/shop">Find a gift</Link>
            </Button>
            <Button size="xl" variant="ghost" className="text-plum-foreground hover:bg-white/10 hover:text-plum-foreground" asChild>
              <Link to="/assistant">
                <StarsIcon data-icon="inline-start" />
                Ask the gift assistant
              </Link>
            </Button>
          </div>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className={cn("flex flex-col gap-3 rounded-3xl bg-white/[0.06] p-6 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.08)]", i % 2 === 1 && "sm:translate-y-8")}>
              <span className="flex items-center justify-between">
                <span className="bg-gold/15 text-gold grid size-11 place-items-center rounded-2xl">
                  <Icon className="size-5" />
                </span>
                <span className="font-display text-plum-muted text-sm">0{i + 1}</span>
              </span>
              <h3 className="text-lg leading-snug font-medium">{title}</h3>
              <p className="text-plum-muted text-sm">{body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}

function WishlistStory() {
  const features = [
    { icon: CalendarMarkIcon, text: "Templates for birthdays, weddings, baby showers and more" },
    { icon: ListHeartIcon, text: "A wishlist that stops two guests buying the same blender" },
    { icon: LockKeyholeIcon, text: "Your address stays private — guests only see your delivery area" },
    { icon: QrCodeIcon, text: "Share a link or QR code on invites and WhatsApp" },
  ]
  const wishes = [
    { img: "/media/p/espresso.webp", title: "Home espresso station", state: "Gifted — thank you", tone: "muted" },
    { img: "/media/p/knit-throw.webp", title: "Chunky knit throw", state: "1 of 2 still wanted", tone: "ok" },
    { img: "/media/p/cookware.webp", title: "Enamel cookware set", state: "Someone's checking out", tone: "held" },
  ]
  return (
    <section aria-labelledby="wishlists" className="py-24 sm:py-32">
      <Container className="grid items-center gap-16 lg:grid-cols-2">
        <div className="relative order-2 lg:order-1">
          <div className="bg-[oklch(0.975_0.012_85)] relative overflow-hidden rounded-[2rem] p-3 text-[oklch(0.25_0.03_60)] shadow-[var(--shadow-float)]">
            <div className="relative isolate flex aspect-[16/9] flex-col items-center justify-end overflow-hidden rounded-[1.5rem] p-6 text-center text-white">
              <Img src="/media/occasions/wedding.webp" alt="" className="absolute inset-0 -z-10 size-full" sizes="560px" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 to-transparent" />
              <p className="text-[0.625rem] tracking-[0.3em] uppercase opacity-85">Together with their families</p>
              <p className="font-display text-3xl font-light">Tolu & Kunle</p>
            </div>
            <ul className="flex flex-col gap-2 p-3">
              {wishes.map((w) => (
                <li key={w.title} className="flex items-center gap-3 rounded-xl bg-white/70 p-2 shadow-[0_0_0_1px_oklch(0_0_0/0.05)]">
                  <Img src={w.img} alt="" className="size-12 rounded-lg" sizes="48px" />
                  <span className="flex-1 text-sm font-medium">{w.title}</span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs", w.tone === "ok" ? "bg-[oklch(0.47_0.1_70)] text-white" : w.tone === "held" ? "bg-[oklch(0.95_0.04_85)]" : "bg-black/5 text-black/70")}>{w.state}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card shadow-float absolute -bottom-6 -left-4 hidden items-center gap-3 rounded-2xl px-4 py-3 sm:flex">
            <UsersGroupRoundedIcon className="text-brand-text size-5" />
            <span className="text-sm">
              <span className="font-medium">38 guests</span> <span className="text-muted-foreground">viewed this week</span>
            </span>
          </div>
        </div>
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <p className="eyebrow text-brand-text">Occasion pages</p>
          <h2 id="wishlists" className="font-display text-4xl leading-[1.05] font-medium sm:text-5xl">
            One link for the date, the story and the wishlist.
          </h2>
          <p className="text-muted-foreground text-lg">Make a page for your birthday, wedding or baby shower in minutes. Guests open it, choose a gift, and pay — it's delivered to you without them ever seeing your address.</p>
          <ul className="flex flex-col gap-3">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <Icon className="text-brand-text mt-0.5 size-5 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="xl" asChild>
              <Link to="/events/new">Create your page — it's free</Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link to="/e/tolu-and-kunle">See an example</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}

function VendorsSection({ vendors }: { vendors: import("@/api").VendorPublic[] }) {
  return (
    <section aria-labelledby="vendors" className="bg-card border-y py-20 sm:py-28">
      <Container className="flex flex-col gap-10">
        <SectionHeading
          id="vendors"
          eyebrow="Trusted vendors"
          title="Small businesses we'd send to our own families"
          description="Every vendor is reviewed before they can sell, and we watch acceptance times, stock accuracy and late deliveries."
          action={
            <Button variant="outline" size="lg" asChild>
              <Link to="/vendors">
                Meet the vendors
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          }
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.slice(0, 6).map((v) => (
            <Link key={v.id} to={v.storefrontSlug ? `/stores/${v.storefrontSlug}` : "/vendors"} className="group/v surface-interactive flex flex-col overflow-hidden rounded-3xl">
              <div className="aspect-[16/9] overflow-hidden">
                <Img src={v.coverImage} alt="" className="size-full transition-[scale] duration-700 group-hover/v:scale-105" sizes="(min-width: 1024px) 33vw, 50vw" />
              </div>
              <div className="flex items-start gap-3 p-5">
                <VendorAvatar name={v.name} initials={v.logoInitials} color={v.logoColor} className="-mt-10 size-12 ring-4 ring-[var(--card)]" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    {v.name}
                    {v.verified && <VerifiedCheckIcon className="text-info size-4" aria-label="Verified" />}
                  </p>
                  <p className="text-muted-foreground line-clamp-2 text-sm">{v.tagline}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  )
}

const FAQ = [
  ["Where do you deliver?", "We currently deliver to Lagos Island, Lagos Mainland, Lekki & Ajah, Abuja Central and Port Harcourt. Each vendor lists the areas they cover, and we check the date before you pay."],
  ["What if I don't know their address?", "Choose “Let them add it” at checkout. They'll get a private link to add their address within 72 hours. You're never charged more without approving it first, and they're never charged anything. If they decline or don't respond, you're refunded under our cancellation policy. Perishable and personalised items need an address up front."],
  ["When is my payment confirmed?", "Only once Paystack confirms it to us directly — not when your browser returns from the payment page. Until then you'll see “Confirming payment”, and no reveal is sent."],
  ["Will they see how much I spent?", "No. The reveal shows what you sent and your message, never the price. You can also send anonymously; we keep your details privately for support and safety."],
  ["What happens if something goes wrong?", "If a vendor can't fulfil your order, it's cancelled and refunded in full — we never substitute an item without asking. If something arrives damaged, open a case from your order and our team will help."],
  ["Can I pay from outside Nigeria?", "Yes, if your card or payment method is supported by Paystack. Prices are in naira and the recipient must be in one of our delivery areas."],
]

function Faq() {
  return (
    <section aria-labelledby="faq" className="py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <p className="eyebrow text-brand-text">Delivery & payment</p>
          <h2 id="faq" className="font-display text-4xl font-medium">
            Good questions
          </h2>
          <p className="text-muted-foreground">
            Anything else? Visit the{" "}
            <Link to="/help" className="text-foreground underline underline-offset-4">
              help centre
            </Link>
            .
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map(([q, a]) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger className="py-5 text-base">{q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-5 text-[0.9375rem] leading-relaxed">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  )
}

function SellBand() {
  return (
    <section aria-labelledby="sell">
      <Container>
        <div className="bg-brand relative isolate flex flex-col items-start gap-6 overflow-hidden rounded-[2rem] p-8 sm:p-14 lg:flex-row lg:items-center lg:justify-between">
          <div aria-hidden="true" className="absolute -right-20 -bottom-24 -z-10 size-96 rounded-full bg-white/20 blur-2xl" />
          <div className="text-brand-foreground flex max-w-2xl flex-col gap-3">
            <h2 id="sell" className="font-display text-3xl font-medium sm:text-5xl">
              Sell your gifts on JustGifter
            </h2>
            <p className="text-lg opacity-85">Get a storefront link to share on Instagram and WhatsApp, take orders from the marketplace and wishlists, and manage it all in one dashboard.</p>
          </div>
          <Button size="xl" asChild>
            <Link to="/sell">
              Apply to sell
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </Container>
    </section>
  )
}

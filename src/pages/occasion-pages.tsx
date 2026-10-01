import { Link } from "react-router"
import { TEMPLATES, PALETTES } from "@domain/index.ts"
import { Container, Img, SectionHeading } from "@/components/common"
import { Button } from "@/components/ui/button"
import { CalendarMarkIcon, ListHeartIcon, LockKeyholeIcon, QrCodeIcon, MagicWandIcon, UsersGroupRoundedIcon } from "@/components/icons"
import { useDocumentMeta } from "@/lib/seo"

const STEPS = [
  { icon: CalendarMarkIcon, title: "Add the basics", body: "Title, date (or “to be confirmed”) and who's hosting. Two minutes." },
  { icon: MagicWandIcon, title: "Pick a design", body: "Choose a template, colours and opening — or let us suggest one from your notes." },
  { icon: ListHeartIcon, title: "Build your wishlist", body: "Add items from approved vendors, with quantities and notes. Guests see what's still needed." },
  { icon: LockKeyholeIcon, title: "Add your address privately", body: "It's stored separately and only shared with a vendor once they accept an order." },
  { icon: QrCodeIcon, title: "Share it", body: "A link, a QR code for printed invites, or straight to WhatsApp." },
  { icon: UsersGroupRoundedIcon, title: "Invite a co-host", body: "Plan together. Co-hosts can edit the page without seeing your address." },
]

export default function OccasionPagesLanding() {
  useDocumentMeta({ title: "Occasion pages & wishlists", description: "Create a page for your birthday, wedding or baby shower with a wishlist guests can buy from — without duplicates.", canonical: "/occasion-pages" })
  return (
    <>
      <section className="bg-plum text-plum-foreground relative overflow-hidden">
        <Container className="grid items-center gap-12 py-20 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <p className="eyebrow text-gold">Occasion pages</p>
            <h1 className="font-display text-5xl leading-[1.02] font-medium sm:text-6xl">A beautiful page for your day — and gifts that never double up.</h1>
            <p className="text-plum-muted text-lg">Free to create. Guests buy from your wishlist and it's delivered straight to you. When the last unit of something is in someone's basket, nobody else can buy it.</p>
            <div className="flex flex-wrap gap-3">
              <Button size="xl" variant="inverse" asChild><Link to="/events/new">Create your page</Link></Button>
              <Button size="xl" variant="ghost" className="text-plum-foreground hover:text-plum-foreground hover:bg-white/10" asChild><Link to="/e/tolu-and-kunle">See an example</Link></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Img src="/media/occasions/wedding@2x.webp" alt="" className="aspect-[3/4] rounded-3xl" sizes="300px" eager />
            <Img src="/media/e/portrait-ada@2x.webp" alt="" className="mt-12 aspect-[3/4] rounded-3xl" sizes="300px" eager />
          </div>
        </Container>
      </section>
      <Container className="flex flex-col gap-12 py-24">
        <SectionHeading eyebrow="How it works" title="Six steps, about ten minutes" />
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="surface flex flex-col gap-3 rounded-3xl p-6">
              <span className="flex items-center justify-between"><Icon className="text-brand-text size-6" /><span className="font-display text-muted-foreground">0{i + 1}</span></span>
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="text-muted-foreground text-sm">{body}</p>
            </li>
          ))}
        </ol>
      </Container>
      <Container className="flex flex-col gap-10 pb-12">
        <SectionHeading eyebrow="Templates" title="Designed to feel like you" description="Every template works on phones, respects reduced-motion settings, and keeps the page readable if the animation doesn't run." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((t) => {
            const p = PALETTES[t.palettes[0]]
            return (
              <div key={t.id} className="surface flex flex-col overflow-hidden rounded-3xl">
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-6 text-center" style={{ background: p.background, color: p.text }}>
                  <span className="text-[0.625rem] tracking-[0.3em] uppercase opacity-70">{t.tone}</span>
                  <span className="font-display text-3xl" style={{ fontVariationSettings: t.fonts[0] === "soft-serif" ? '"SOFT" 100, "WONK" 1' : undefined }}>{t.name}</span>
                  <span className="flex gap-1.5">{t.palettes.map((pid) => <span key={pid} className="size-4 rounded-full ring-1 ring-black/10" style={{ background: PALETTES[pid].accent }} />)}</span>
                </div>
                <div className="p-5"><p className="text-muted-foreground text-sm">{t.description}</p></div>
              </div>
            )
          })}
        </div>
      </Container>
    </>
  )
}

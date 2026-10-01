import { Link, NavLink, useParams } from "react-router"
import { cn } from "cn"
import { ZONES } from "@domain/index.ts"
import { Container } from "@/components/common"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useDocumentMeta } from "@/lib/seo"

/**
 * Help and policy pages. Policy text is a plain-language draft for founder and legal review
 * (§15 "Policy work required") — it must be approved before live payments.
 */
const POLICIES: Record<string, { title: string; body: [string, string][] }> = {
  returns: {
    title: "Returns, cancellations & refunds",
    body: [
      ["Before the vendor accepts", "Cancel from your order page for a full refund, including delivery."],
      ["If the vendor can't fulfil", "We cancel and refund in full. We never substitute an item without your agreement."],
      ["Recipient declines or doesn't claim", "For gifts sent without an address, if the recipient declines or doesn't add an address within 72 hours, the order is cancelled and fully refunded."],
      ["Damaged, missing or wrong items", "Open a case from your order within 48 hours of delivery, with a photo if you can. We'll arrange a replacement or refund under the vendor's policy."],
      ["Personalised and fresh items", "These are made for you and can't be returned unless there's an error on our or the vendor's side."],
      ["Refund timing", "Refunds go back to your original payment method. Your bank usually shows them within 3–10 working days. You'll see each step — requested, approved, sent, completed — on your order."],
    ],
  },
  privacy: {
    title: "Privacy",
    body: [
      ["What we collect", "What's needed to deliver gifts: names, contact details, delivery addresses and order history. We don't need dates of birth."],
      ["Addresses", "Delivery addresses are stored separately from everything else and shared only with the vendor fulfilling an order, after they accept it. Wishlist guests never see a host's address."],
      ["Gift links", "Each gift link is unique and private. Previews of gift links never show the item, message or (for anonymous gifts) the sender."],
      ["Recommendations", "The gift assistant uses only what you type and our catalogue. It never receives addresses, contact details or payment information."],
      ["Payments", "Card details go directly to Paystack. JustGifter never sees or stores them."],
      ["Your choices", "Request a copy of your data or deletion from Settings. We keep financial records for as long as the law requires, then delete them."],
    ],
  },
  terms: {
    title: "Terms of use",
    body: [
      ["Who sells", "Products are sold by independent, approved vendors. JustGifter runs the marketplace, checkout and support."],
      ["Accounts", "You must be 18 or over to hold an account or receive gifts directly. Gifts for children should be addressed to a parent or guardian."],
      ["Content", "Messages and occasion pages must not be abusive, misleading or impersonate others. We may remove content and suspend accounts that break these rules, with a right of appeal."],
      ["Pricing", "Prices are in naira and include VAT where it applies. The total is shown before you pay and recipients are never charged."],
    ],
  },
}

const FAQ: [string, string][] = [
  ["When will my gift arrive?", "You choose a date at checkout from the dates the vendor can actually make. Until the vendor accepts, the time is an estimate; after that you'll see a confirmed window."],
  ["How do I know my payment worked?", "You'll see “Payment confirmed” only after Paystack confirms it to us directly, and we email a receipt. If you see “Confirming payment”, please don't pay again."],
  ["Can I change my message?", "Yes — until the reveal is sent. Open the order and choose “Edit message or time”."],
  ["What does the recipient see?", "A private link that opens an envelope or wrapped box to reveal the item and your message. Never the price."],
  ["Can I send anonymously?", "Yes. The recipient won't see your name anywhere. We keep it privately for support and safety."],
  ["I'm a vendor — how do payouts work?", "Each order becomes eligible for payout after delivery and a short dispute window. You can see every order's commission and net amount in your Payouts page."],
]

export default function HelpPage() {
  const { policy } = useParams()
  const p = policy ? POLICIES[policy] : null
  useDocumentMeta({ title: p?.title ?? "Help centre", canonical: policy ? `/policies/${policy}` : "/help" })
  const nav = [["/help", "Help centre"], ["/policies/returns", "Returns & refunds"], ["/policies/privacy", "Privacy"], ["/policies/terms", "Terms"]]
  return (
    <Container className="grid gap-10 py-12 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Help" className="flex gap-1 overflow-x-auto lg:flex-col">
        {nav.map(([to, label]) => <NavLink key={to} to={to} end className={({ isActive }) => cn("shrink-0 rounded-lg px-3 py-2 text-sm", isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>{label}</NavLink>)}
      </nav>
      <article className="flex max-w-3xl flex-col gap-8">
        {p ? (
          <>
            <h1 className="font-display text-4xl font-medium">{p.title}</h1>
            {p.body.map(([h, b]) => <section key={h} className="flex flex-col gap-2"><h2 className="text-lg font-semibold">{h}</h2><p className="text-muted-foreground leading-relaxed">{b}</p></section>)}
          </>
        ) : (
          <>
            <h1 className="font-display text-4xl font-medium">How can we help?</h1>
            <Accordion type="single" collapsible>
              {FAQ.map(([q, a]) => <AccordionItem key={q} value={q}><AccordionTrigger className="text-base">{q}</AccordionTrigger><AccordionContent className="text-muted-foreground leading-relaxed">{a}</AccordionContent></AccordionItem>)}
            </Accordion>
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Delivery areas</h2>
              <ul className="grid gap-3 sm:grid-cols-2">{ZONES.map((z) => <li key={z.id} className="surface rounded-2xl p-4"><p className="font-medium">{z.name}</p><p className="text-muted-foreground text-sm">{z.areas.join(", ")}</p></li>)}</ul>
            </section>
            <section className="surface flex flex-col gap-2 rounded-2xl p-6">
              <h2 className="text-lg font-semibold">Contact support</h2>
              <p className="text-muted-foreground">For an existing order, open a case from the order page — it reaches our team with all the details. We reply within one working day, Monday to Saturday, 8am–8pm.</p>
              <Link to="/orders/access" className="w-fit text-sm font-medium underline underline-offset-4">Find my order</Link>
            </section>
          </>
        )}
      </article>
    </Container>
  )
}

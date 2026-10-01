import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { cn } from "cn"
import type { CategoryId, ZoneId } from "@domain/index.ts"
import { CATEGORIES, ZONES } from "@domain/index.ts"
import type { VendorApplicationInput } from "@/api"
import { Container } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useApiMutation } from "@/lib/api-hooks"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"

const STEPS = ["Business", "Delivery", "Payouts", "Review"]

export default function VendorApply() {
  useDocumentMeta({ title: "Apply to sell", noindex: true })
  const { user, hasRole, refresh } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState<VendorApplicationInput>({
    businessName: "", businessType: "sole_proprietor", ownerName: user?.name ?? "", ownerEmail: user?.email ?? "", ownerPhone: "", address: "", city: "Lagos",
    zones: [], categories: [], fulfilment: "vendor_delivery", openHour: 8, closeHour: 18, days: [1, 2, 3, 4, 5, 6], prepHours: 4, payoutBank: "", payoutAccount: "", about: "", acceptTerms: false,
  })
  const set = <K extends keyof VendorApplicationInput>(k: K, v: VendorApplicationInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const submit = useApiMutation((api) => api.submitVendorApplication(f), { toastError: false, onError: (e) => setError(e.message), onSuccess: async () => { await refresh(); navigate("/vendor") } })

  if (hasRole("vendor_owner", "vendor_staff")) {
    return <Container className="py-20 text-center"><h1 className="font-display text-3xl">You already have a vendor workspace</h1><Button className="mt-6" asChild><Link to="/vendor">Open workspace</Link></Button></Container>
  }

  const next = () => {
    setError(null)
    if (step === 0 && (!f.businessName.trim() || !f.ownerPhone.trim() || !f.address.trim())) return setError("Fill in your business name, phone and address.")
    if (step === 1 && (!f.zones.length || !f.categories.length)) return setError("Choose at least one delivery area and one category.")
    if (step === 2 && (!f.payoutBank || !/^\d{10}$/.test(f.payoutAccount))) return setError("Add your bank and 10-digit account number.")
    if (step === 3) return submit.mutate()
    setStep(step + 1)
  }

  return (
    <Container className="flex max-w-2xl flex-col gap-8 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow text-brand-text">Apply to sell · step {step + 1} of 4</p>
        <h1 className="font-display text-4xl font-medium">{["Tell us about your business", "How you deliver", "Where we pay you", "Check and submit"][step]}</h1>
        <div className="mt-2 grid grid-cols-4 gap-1.5">{STEPS.map((s, i) => <span key={s} className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />)}</div>
      </div>
      <div className="surface rounded-3xl p-6 sm:p-8">
        {step === 0 && (
          <FieldGroup>
            <Field><FieldLabel htmlFor="a-name">Business name</FieldLabel><Input id="a-name" value={f.businessName} onChange={(e) => set("businessName", e.target.value)} /><FieldDescription>Names that imitate JustGifter or other brands aren't allowed.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="a-type">Business type</FieldLabel>
              <Select value={f.businessType} onValueChange={(v) => set("businessType", v as VendorApplicationInput["businessType"])}><SelectTrigger id="a-type"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="sole_proprietor">Sole trader</SelectItem><SelectItem value="partnership">Partnership</SelectItem><SelectItem value="limited_company">Limited company</SelectItem></SelectGroup></SelectContent></Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="a-owner">Your name</FieldLabel><Input id="a-owner" value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="a-phone">Phone</FieldLabel><Input id="a-phone" type="tel" value={f.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} /></Field>
            </div>
            <Field><FieldLabel htmlFor="a-addr">Business address</FieldLabel><Input id="a-addr" value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="a-about">What do you sell?</FieldLabel><Textarea id="a-about" rows={3} value={f.about} onChange={(e) => set("about", e.target.value)} /></Field>
          </FieldGroup>
        )}
        {step === 1 && (
          <FieldGroup>
            <FieldSet><FieldLegend variant="label">Areas you deliver to</FieldLegend>
              <div className="grid gap-2 sm:grid-cols-2">{ZONES.map((z) => <label key={z.id} className="bg-card shadow-border flex cursor-pointer items-center gap-3 rounded-xl p-3 text-sm"><Checkbox checked={f.zones.includes(z.id)} onCheckedChange={(c) => set("zones", c ? [...f.zones, z.id as ZoneId] : f.zones.filter((x) => x !== z.id))} />{z.name}</label>)}</div>
            </FieldSet>
            <FieldSet><FieldLegend variant="label">What you sell</FieldLegend>
              <div className="flex flex-wrap gap-1.5">{CATEGORIES.map((c) => { const on = f.categories.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => set("categories", on ? f.categories.filter((x) => x !== c.id) : [...f.categories, c.id as CategoryId])} className={cn("press rounded-full px-3 py-1.5 text-sm", on ? "bg-primary text-primary-foreground" : "bg-muted")}>{c.name}</button> })}</div>
            </FieldSet>
            <Field><FieldLabel htmlFor="a-ful">Who delivers?</FieldLabel>
              <Select value={f.fulfilment} onValueChange={(v) => set("fulfilment", v as VendorApplicationInput["fulfilment"])}><SelectTrigger id="a-ful"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="vendor_delivery">My own riders</SelectItem><SelectItem value="courier">A courier partner</SelectItem></SelectGroup></SelectContent></Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field><FieldLabel htmlFor="a-open">Open (hour)</FieldLabel><Input id="a-open" type="number" value={f.openHour} onChange={(e) => set("openHour", Number(e.target.value))} /></Field>
              <Field><FieldLabel htmlFor="a-close">Close (hour)</FieldLabel><Input id="a-close" type="number" value={f.closeHour} onChange={(e) => set("closeHour", Number(e.target.value))} /></Field>
              <Field><FieldLabel htmlFor="a-prep">Typical prep (hours)</FieldLabel><Input id="a-prep" type="number" value={f.prepHours} onChange={(e) => set("prepHours", Number(e.target.value))} /></Field>
            </div>
          </FieldGroup>
        )}
        {step === 2 && (
          <FieldGroup>
            <Field><FieldLabel htmlFor="a-bank">Bank</FieldLabel><Input id="a-bank" value={f.payoutBank} onChange={(e) => set("payoutBank", e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="a-acct">Account number (NUBAN)</FieldLabel><Input id="a-acct" inputMode="numeric" maxLength={10} value={f.payoutAccount} onChange={(e) => set("payoutAccount", e.target.value.replace(/\D/g, ""))} /><FieldDescription>The account name must match your business or your name. We may ask for ID documents during review; they're stored privately.</FieldDescription></Field>
          </FieldGroup>
        )}
        {step === 3 && (
          <div className="flex flex-col gap-4 text-sm">
            <dl className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted-foreground">Business</dt><dd>{f.businessName}</dd>
              <dt className="text-muted-foreground">Delivers to</dt><dd>{f.zones.map((z) => ZONES.find((x) => x.id === z)?.name).join(", ")}</dd>
              <dt className="text-muted-foreground">Sells</dt><dd>{f.categories.map((c) => CATEGORIES.find((x) => x.id === c)?.name).join(", ")}</dd>
              <dt className="text-muted-foreground">Payouts</dt><dd>{f.payoutBank} •••• {f.payoutAccount.slice(-4)}</dd>
            </dl>
            <label className="bg-muted/60 flex items-start gap-3 rounded-xl p-4">
              <Checkbox checked={f.acceptTerms} onCheckedChange={(c) => set("acceptTerms", c === true)} className="mt-0.5" />
              <span>I agree to the <Link to="/policies/terms" className="underline">marketplace terms</Link>, delivery standards and returns policy, and confirm my products are genuine and honestly described.</span>
            </label>
          </div>
        )}
        {error && <p className="text-destructive mt-4 text-sm" role="alert">{error}</p>}
        <div className="mt-8 flex justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
          <Button size="lg" onClick={next} disabled={submit.isPending || (step === 3 && !f.acceptTerms)}>{submit.isPending && <Spinner data-icon="inline-start" />}{step === 3 ? "Submit application" : "Continue"}</Button>
        </div>
      </div>
    </Container>
  )
}

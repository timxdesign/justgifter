import { useState } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Container } from "@/components/common"
import { OtpVerify } from "@/components/otp-verify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { getApi } from "@/api"
import { maskContact } from "@domain/index.ts"
import { useDocumentMeta } from "@/lib/seo"

/** Guest order access: an emailed code, never a guessable order reference alone (§2 identity rules). */
export default function OrderAccessPage() {
  useDocumentMeta({ title: "Track an order", noindex: true })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [email, setEmail] = useState("")
  const [ready, setReady] = useState(false)
  return (
    <Container className="grid min-h-[70dvh] place-items-center py-16">
      <div className="bg-card shadow-border flex w-full max-w-md flex-col gap-6 rounded-3xl p-8">
        <div>
          <h1 className="font-display text-3xl">Track an order</h1>
          <p className="text-muted-foreground mt-1">Enter the email you used at checkout. We'll send a code to confirm it's you.</p>
        </div>
        {!ready ? (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (email.includes("@")) setReady(true) }}>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
              <FieldDescription>For your security, an order number alone isn't enough to view an order.</FieldDescription>
            </Field>
            <Button type="submit" size="lg">Continue</Button>
          </form>
        ) : (
          <OtpVerify
            destination={maskContact(email)}
            send={async () => (await getApi()).requestOrderAccess(email)}
            verify={async (code) => {
              await (await getApi()).verifyOrderAccess(email, code)
              await qc.invalidateQueries()
              navigate("/account")
            }}
            submitLabel="View my orders"
          />
        )}
      </div>
    </Container>
  )
}

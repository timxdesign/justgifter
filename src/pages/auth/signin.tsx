import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Logo } from "@/components/brand/logo"
import { Container } from "@/components/common"
import { OtpVerify } from "@/components/otp-verify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { getApi } from "@/api"
import { maskContact } from "@domain/index.ts"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"

export default function SignInPage() {
  useDocumentMeta({ title: "Sign in", noindex: true })
  const [params] = useSearchParams()
  const next = params.get("next") ?? "/account"
  const navigate = useNavigate()
  const { refresh } = useSession()
  const [email, setEmail] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [error, setError] = useState<string | null>(null)

  return (
    <Container className="grid min-h-[70dvh] place-items-center py-16">
      <div className="bg-card shadow-border flex w-full max-w-md flex-col gap-6 rounded-3xl p-8">
        <Logo />
        <div>
          <h1 className="font-display text-3xl">Sign in or create an account</h1>
          <p className="text-muted-foreground mt-1">No password needed — we'll email you a one-time code.</p>
        </div>
        {step === "email" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.")
              setError(null)
              setStep("code")
            }}
          >
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              {error && <FieldDescription className="text-destructive">{error}</FieldDescription>}
            </Field>
            <Button type="submit" size="lg">Continue</Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <OtpVerify
              destination={maskContact(email)}
              send={async () => (await getApi()).signInWithEmail(email, next)}
              verify={async (code) => {
                await (await getApi()).verifyEmailCode(email, code)
                await refresh()
                navigate(next, { replace: true })
              }}
              submitLabel="Sign in"
            />
            <button type="button" className="text-muted-foreground w-fit text-sm underline underline-offset-4" onClick={() => setStep("email")}>Use a different email</button>
          </div>
        )}
        <p className="text-muted-foreground border-t pt-4 text-sm">
          Bought as a guest? <Link to="/orders/access" className="text-foreground underline underline-offset-4">Find your order</Link>
        </p>
      </div>
    </Container>
  )
}

import { useState } from "react"
import { toast } from "sonner"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { errorMessage } from "@/api/errors"
import { backendMode } from "@/lib/env"

/**
 * Six-digit code entry. Paste is allowed and autocomplete hints at one-time codes. In demo mode
 * the code is also shown in a toast and the demo inbox, since no email is actually sent.
 */
export function OtpVerify({
  destination,
  send,
  verify,
  submitLabel = "Verify",
}: {
  destination: string
  send: () => Promise<{ devCode?: string }>
  verify: (code: string) => Promise<void>
  submitLabel?: string
}) {
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doSend = async () => {
    setSending(true)
    setError(null)
    try {
      const r = await send()
      setSent(true)
      if (backendMode === "demo" && r.devCode) toast.info(`Demo code: ${r.devCode}`, { description: "In production this goes to the email or phone on file.", duration: 12000 })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  const doVerify = async (value = code) => {
    if (value.length !== 6) {
      setError("Enter all 6 digits.")
      return
    }
    setVerifying(true)
    setError(null)
    try {
      await verify(value)
    } catch (e) {
      setError(errorMessage(e))
      setCode("")
    } finally {
      setVerifying(false)
    }
  }

  if (!sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">We'll send a 6-digit code to {destination}.</p>
        <Button size="lg" onClick={doSend} disabled={sending} className="w-fit">
          {sending && <Spinner data-icon="inline-start" />}
          Send code
        </Button>
        {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void doVerify()
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="otp">Enter the code sent to {destination}</FieldLabel>
        <InputOTP
          id="otp"
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          value={code}
          onChange={(v) => {
            setCode(v)
            if (v.length === 6) void doVerify(v)
          }}
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          aria-invalid={Boolean(error)}
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot key={i} index={i} className="size-12 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <FieldError>{error}</FieldError>
        <FieldDescription>
          Didn't get it?{" "}
          <button type="button" className="text-foreground underline underline-offset-4" onClick={doSend} disabled={sending}>
            Send a new code
          </button>
        </FieldDescription>
      </Field>
      <Button type="submit" size="lg" disabled={verifying} className="w-fit">
        {verifying && <Spinner data-icon="inline-start" />}
        {submitLabel}
      </Button>
    </form>
  )
}

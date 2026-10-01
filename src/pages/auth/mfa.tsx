import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { Container } from "@/components/common"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { ShieldCheckIcon } from "@/components/icons"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"
import { backendMode } from "@/lib/env"

type Stage = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "challenge"; factorId: string } | { kind: "error"; message: string }

/**
 * Two-step verification (TOTP) for vendor owners and platform staff (§2 identity rules).
 * Uses Supabase Auth MFA; the API rejects privileged calls unless the session is aal2.
 */
export default function MfaPage() {
  useDocumentMeta({ title: "Two-step verification", noindex: true })
  const [params] = useSearchParams()
  const next = params.get("next") ?? "/"
  const navigate = useNavigate()
  const { refresh } = useSession()
  const [stage, setStage] = useState<Stage>({ kind: "loading" })
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (backendMode !== "supabase") {
      navigate(next, { replace: true })
      return
    }
    ;(async () => {
      const { supabase } = await import("@/api/supabase")
      const sb = supabase()
      const { data: factors } = await sb.auth.mfa.listFactors()
      const verified = factors?.totp.find((f) => f.status === "verified")
      if (verified) return setStage({ kind: "challenge", factorId: verified.id })
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "JustGifter" })
      if (error || !data) return setStage({ kind: "error", message: "We couldn't start setup. Refresh and try again." })
      setStage({ kind: "enroll", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    })()
  }, [navigate, next])

  const verify = async (value: string) => {
    if (stage.kind !== "enroll" && stage.kind !== "challenge") return
    setBusy(true)
    setError(null)
    const { supabase } = await import("@/api/supabase")
    const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: value })
    setBusy(false)
    if (error) {
      setError("That code didn't work. Codes change every 30 seconds — try the latest one.")
      setCode("")
      return
    }
    await refresh()
    navigate(next, { replace: true })
  }

  return (
    <Container className="grid min-h-dvh place-items-center py-16">
      <div className="bg-card shadow-border flex w-full max-w-md flex-col gap-6 rounded-3xl p-8">
        <Logo />
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="text-success mt-1 size-6 shrink-0" />
          <div>
            <h1 className="font-display text-3xl">Two-step verification</h1>
            <p className="text-muted-foreground mt-1">Vendor and operations accounts protect payouts and customer data with an authenticator app.</p>
          </div>
        </div>
        {stage.kind === "loading" && <Spinner className="size-6" />}
        {stage.kind === "error" && <p className="text-destructive text-sm">{stage.message}</p>}
        {stage.kind === "enroll" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm">Scan this with Google Authenticator, 1Password or a similar app, then enter the 6-digit code.</p>
            <img src={stage.qr} alt="QR code for your authenticator app" className="size-48 rounded-xl bg-white p-2" data-no-outline />
            <p className="text-muted-foreground text-xs">Can't scan? Enter this key: <span className="font-mono">{stage.secret}</span></p>
          </div>
        )}
        {(stage.kind === "enroll" || stage.kind === "challenge") && (
          <form className="flex flex-col items-center gap-4" onSubmit={(e) => { e.preventDefault(); void verify(code) }}>
            <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={(v) => { setCode(v); if (v.length === 6) void verify(v) }} autoFocus autoComplete="one-time-code" inputMode="numeric" aria-label="Authenticator code">
              <InputOTPGroup>{Array.from({ length: 6 }, (_, i) => <InputOTPSlot key={i} index={i} className="size-12 text-lg" />)}</InputOTPGroup>
            </InputOTP>
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <Button type="submit" size="lg" disabled={busy || code.length !== 6}>{busy && <Spinner data-icon="inline-start" />}Verify</Button>
          </form>
        )}
      </div>
    </Container>
  )
}

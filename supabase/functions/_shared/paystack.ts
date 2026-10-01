import { env } from "./env.ts"

/**
 * Paystack integration (PAY 03–05, §14). Hosted checkout via transaction/initialize, signed
 * webhooks (HMAC-SHA512 of the raw body with the secret key), server-side verification, and
 * refunds. Amounts are kobo. Card data never touches JustGifter.
 */
const BASE = "https://api.paystack.co"

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${env.paystackSecret()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    })
    const body = await res.json()
    if (!res.ok || body.status === false) throw new Error(`Paystack ${path} failed: ${body.message ?? res.status}`)
    return body.data as T
  } finally {
    clearTimeout(t)
  }
}

export function initializeTransaction(input: { email: string; amount: number; reference: string; callbackUrl: string; metadata: Record<string, unknown>; subaccount?: string }) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({ email: input.email, amount: input.amount, currency: "NGN", reference: input.reference, callback_url: input.callbackUrl, metadata: input.metadata, ...(input.subaccount ? { subaccount: input.subaccount } : {}) }),
  })
}

export function verifyTransaction(reference: string) {
  return call<{ status: string; amount: number; currency: string; reference: string; id: number; paid_at: string }>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

export function createRefund(input: { transaction: string; amount: number; reason: string }) {
  return call<{ id: number; status: string }>("/refund", { method: "POST", body: JSON.stringify({ transaction: input.transaction, amount: input.amount, merchant_note: input.reason }) })
}

/** Constant-time comparison of the x-paystack-signature header against HMAC-SHA512(rawBody). */
export async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.paystackSecret()), { name: "HMAC", hash: "SHA-512" }, false, ["sign"])
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)))
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("")
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

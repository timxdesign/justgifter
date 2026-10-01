/**
 * Security tokens (SEC 03, GFT 06). High-entropy, URL-safe, and stored only as SHA-256 hashes.
 * Uses Web Crypto, available in browsers, Deno and Cloudflare Workers.
 */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** 32 random bytes → 43-character token (256 bits of entropy). */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return b64url(buf)
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Six-digit one-time code without modulo bias. */
export function randomOtp(): string {
  const buf = new Uint32Array(1)
  let n: number
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= 4_294_000_000)
  return String(n % 1_000_000).padStart(6, "0")
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** Human-friendly order reference, e.g. JG-7K3M-Q9TD. Not a secret: never sufficient on its own to view an order. */
export function orderReference(): string {
  const buf = new Uint8Array(8)
  crypto.getRandomValues(buf)
  const chars = Array.from(buf, (b) => CROCKFORD[b % 32]).join("")
  return `JG-${chars.slice(0, 4)}-${chars.slice(4)}`
}

export function uid(prefix: string): string {
  const buf = new Uint8Array(10)
  crypto.getRandomValues(buf)
  return `${prefix}_${Array.from(buf, (b) => CROCKFORD[b % 32]).join("").toLowerCase()}`
}

/** Constant-time comparison for codes and signatures. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Masks contact details for display and logs (SEC 05). */
export function maskContact(value: string): string {
  if (value.includes("@")) {
    const [user, domain] = value.split("@")
    return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`
  }
  const digits = value.replace(/\D/g, "")
  return digits.length > 4 ? `••• ••• ${digits.slice(-4)}` : "•••"
}

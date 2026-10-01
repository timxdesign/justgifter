import type { Currency, Minor } from "./types.ts"

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: Currency, fractionDigits: number) {
  const key = `${currency}:${fractionDigits}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    formatters.set(key, f)
  }
  return f
}

/** Formats integer minor units. Whole-naira amounts drop the kobo for readability. */
export function formatMoney(amount: Minor, currency: Currency = "NGN"): string {
  const major = amount / 100
  const digits = Number.isInteger(major) ? 0 : 2
  return formatter(currency, digits).format(major)
}

/** Compact form for chips and filters, e.g. ₦25k. */
export function formatMoneyCompact(amount: Minor): string {
  const major = amount / 100
  if (major >= 1_000_000) return `₦${trim(major / 1_000_000)}m`
  if (major >= 1_000) return `₦${trim(major / 1_000)}k`
  return `₦${major}`
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""))

export const toMinor = (major: number): Minor => Math.round(major * 100)

/** Basis-point percentage of an amount, rounded half-up to the nearest minor unit. */
export const applyBps = (amount: Minor, bps: number): Minor => Math.round((amount * bps) / 10_000)

export function assertMinor(n: number, label = "amount"): asserts n is Minor {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} must be a non-negative integer in minor units`)
}

import { addDays, formatMoney, LAUNCH_TIMEZONE, toDateOnly, type DateOnly, type Iso } from "@domain/index.ts"

export { formatMoney }

const tz = LAUNCH_TIMEZONE

const dateFmt = new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const longDateFmt = new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
const shortDateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "UTC" })
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz })
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz })

const asUtcDate = (d: DateOnly) => new Date(`${d}T12:00:00Z`)

/** "Fri 9 Oct" — calendar dates are timezone-free. */
export const formatDate = (d: DateOnly) => dateFmt.format(asUtcDate(d))
export const formatLongDate = (d: DateOnly) => longDateFmt.format(asUtcDate(d))
export const formatShortDate = (d: DateOnly) => shortDateFmt.format(asUtcDate(d))
/** Wall-clock times are shown in Lagos time with an explicit label where ambiguity matters. */
export const formatTime = (iso: Iso) => timeFmt.format(new Date(iso)).replace(":00", "").replace(" AM", "am").replace(" PM", "pm")
export const formatDateTime = (iso: Iso) => dateTimeFmt.format(new Date(iso))

export function friendlyDate(d: DateOnly): string {
  const today = toDateOnly(new Date(), tz)
  if (d === today) return "Today"
  if (d === addDays(today, 1)) return "Tomorrow"
  return formatDate(d)
}

export function formatWindow(start: Iso, end: Iso) {
  return `${formatTime(start)}–${formatTime(end)}`
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
export function relativeTime(iso: Iso): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), "second")
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour")
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day")
  return formatDateTime(iso)
}

export const todayLagos = () => toDateOnly(new Date(), tz)

export function pluralise(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export const percent = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

/** Responsive image helper for the seeded media (640w + 1400w variants). */
export function srcSet(src: string) {
  if (!src.startsWith("/media/") || src.includes("@2x")) return undefined
  return `${src} 640w, ${src.replace(/\.webp$/, "@2x.webp")} 1400w`
}

export const large = (src: string) => (src.startsWith("/media/") && !src.includes("@2x") ? src.replace(/\.webp$/, "@2x.webp") : src)

import { formatMoneyCompact } from "@domain/index.ts"
/** Axis ticks: compact naira, e.g. ₦250k. */
export const formatMoneyCompactSafe = (minor: number) => (minor === 0 ? "₦0" : formatMoneyCompact(minor))

import type { DateOnly, Iso } from "./types.ts"

/**
 * Timezone-aware calendar helpers built on Intl only (no dependencies), so the same code
 * runs in browsers and Deno. Business rules work in the launch timezone; storage is UTC.
 */

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
    partsFormatters.set(timeZone, f)
  }
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(date)) p[part.type] = part.value
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: weekdays.indexOf(p.weekday),
  }
}

/** Offset in minutes between the zone and UTC at the given instant. */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}

/** Converts a wall-clock time in a timezone to a UTC instant (handles DST by re-checking the offset). */
export function zonedTimeToUtc(date: DateOnly, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute))
  const offset = tzOffsetMinutes(guess, timeZone)
  const result = new Date(guess.getTime() - offset * 60000)
  const offset2 = tzOffsetMinutes(result, timeZone)
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000)
}

export function toDateOnly(date: Date, timeZone: string): DateOnly {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export const pad = (n: number) => String(n).padStart(2, "0")

/** Pure calendar arithmetic on YYYY-MM-DD strings (timezone-free). */
export function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function weekdayOf(date: DateOnly): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function compareDates(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function daysBetween(a: DateOnly, b: DateOnly): number {
  const [y1, m1, d1] = a.split("-").map(Number)
  const [y2, m2, d2] = b.split("-").map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export const isDateOnly = (v: unknown): v is DateOnly => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)

export const addMinutes = (iso: Iso | Date, minutes: number): Iso =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()

export const addHours = (iso: Iso | Date, hours: number): Iso => addMinutes(iso, hours * 60)

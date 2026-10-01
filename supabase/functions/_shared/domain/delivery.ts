import type { DateOnly, Iso, Minor, OperatingCalendar, Vendor, ZoneId } from "./types.ts"
import { addDays, compareDates, daysBetween, toDateOnly, zonedParts, zonedTimeToUtc } from "./time.ts"

/**
 * Delivery promise (FUL 02): combines stock-independent operating rules — preparation time,
 * cutoff, operating calendar, blackout dates, daily capacity and zone coverage.
 * Stock is checked separately by eligibility so the two failure reasons stay distinct.
 */

export interface DeliveryContext {
  now: Date
  timezone: string
  vendor: Pick<Vendor, "operating" | "zones" | "fulfilment">
  zoneId: ZoneId
  /** Product preparation plus any personalisation lead time, in clock hours. */
  prepHours: number
  /** Orders already booked per date, for capacity limits. */
  bookedByDate?: Record<DateOnly, number>
  maxAdvanceDays: number
}

export type DeliveryFailure =
  | "zone_unsupported"
  | "before_earliest"
  | "closed_day"
  | "blackout"
  | "at_capacity"
  | "too_far_ahead"
  | "no_dates"

export interface DeliverySlot {
  date: DateOnly
  windowStart: Iso
  windowEnd: Iso
  fee: Minor
  sameDay: boolean
}

export type DeliveryCheck =
  | ({ feasible: true; earliest: DateOnly } & DeliverySlot)
  | { feasible: false; earliest: DateOnly | null; reason: DeliveryFailure; message: string; fee: Minor | null }

const isOpenDay = (cal: OperatingCalendar, date: DateOnly) => {
  const [y, m, d] = date.split("-").map(Number)
  return cal.days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()) && !cal.blackoutDates.includes(date)
}

function hasCapacity(ctx: DeliveryContext, date: DateOnly) {
  const booked = ctx.bookedByDate?.[date] ?? 0
  return booked < ctx.vendor.operating.dailyCapacity
}

function nextOpenDay(cal: OperatingCalendar, from: DateOnly, limit = 60): DateOnly | null {
  let d = from
  for (let i = 0; i <= limit; i++) {
    if (isOpenDay(cal, d)) return d
    d = addDays(d, 1)
  }
  return null
}

/** When preparation can actually begin, honouring the order cutoff and opening hours. */
export function preparationStart(ctx: DeliveryContext): Date | null {
  const cal = ctx.vendor.operating
  const today = toDateOnly(ctx.now, ctx.timezone)
  const local = zonedParts(ctx.now, ctx.timezone)
  if (isOpenDay(cal, today) && local.hour < cal.cutoffHour) {
    const open = zonedTimeToUtc(today, cal.openHour, 0, ctx.timezone)
    return ctx.now > open ? ctx.now : open
  }
  const next = nextOpenDay(cal, addDays(today, 1))
  return next ? zonedTimeToUtc(next, cal.openHour, 0, ctx.timezone) : null
}

/** Earliest date the vendor can deliver into the zone. */
export function earliestDelivery(ctx: DeliveryContext): DeliverySlot | null {
  const zone = ctx.vendor.zones.find((z) => z.zoneId === ctx.zoneId)
  if (!zone) return null
  const cal = ctx.vendor.operating
  const start = preparationStart(ctx)
  if (!start) return null

  const readyAt = new Date(start.getTime() + ctx.prepHours * 3_600_000)
  let readyDate = toDateOnly(readyAt, ctx.timezone)
  const readyLocal = zonedParts(readyAt, ctx.timezone)
  // A delivery needs at least two hours of the delivery window left after the item is ready.
  const sameDayPossible = zone.leadDays === 0 && readyLocal.hour <= cal.deliveryWindow[1] - 2 && isOpenDay(cal, readyDate)
  if (!sameDayPossible && (readyLocal.hour > cal.deliveryWindow[1] - 2 || !isOpenDay(cal, readyDate))) {
    readyDate = addDays(readyDate, 1)
  }

  const today = toDateOnly(ctx.now, ctx.timezone)
  let candidate = addDays(readyDate, sameDayPossible ? 0 : zone.leadDays)
  for (let i = 0; i < ctx.maxAdvanceDays + 1; i++) {
    if (daysBetween(today, candidate) > ctx.maxAdvanceDays) return null
    if (isOpenDay(cal, candidate) && hasCapacity(ctx, candidate)) {
      const sameDay = candidate === toDateOnly(readyAt, ctx.timezone) && sameDayPossible
      return slotFor(ctx, candidate, zone.fee, sameDay ? readyAt : null)
    }
    candidate = addDays(candidate, 1)
  }
  return null
}

function slotFor(ctx: DeliveryContext, date: DateOnly, fee: Minor, notBefore: Date | null): DeliverySlot {
  const cal = ctx.vendor.operating
  const start = zonedTimeToUtc(date, cal.deliveryWindow[0], 0, ctx.timezone)
  const end = zonedTimeToUtc(date, cal.deliveryWindow[1], 0, ctx.timezone)
  const effectiveStart = notBefore && notBefore > start ? notBefore : start
  return {
    date,
    windowStart: effectiveStart.toISOString(),
    windowEnd: end.toISOString(),
    fee,
    sameDay: notBefore !== null,
  }
}

const MESSAGES: Record<DeliveryFailure, string> = {
  zone_unsupported: "This vendor doesn't deliver to that area yet.",
  before_earliest: "That date is too soon for this gift to be prepared and delivered.",
  closed_day: "The vendor doesn't deliver on that day.",
  blackout: "The vendor isn't delivering on that date.",
  at_capacity: "The vendor is fully booked on that date.",
  too_far_ahead: "That date is further ahead than we can schedule right now.",
  no_dates: "There are no delivery dates available for this area at the moment.",
}

export const deliveryFailureMessage = (r: DeliveryFailure) => MESSAGES[r]

/** Validates a requested date (AC 01: impossible dates block payment with an explanation). */
export function checkDeliveryDate(ctx: DeliveryContext, requested: DateOnly | null): DeliveryCheck {
  const zone = ctx.vendor.zones.find((z) => z.zoneId === ctx.zoneId)
  if (!zone) return fail("zone_unsupported", null, null)
  const earliest = earliestDelivery(ctx)
  if (!earliest) return fail("no_dates", null, zone.fee)
  if (!requested) return { feasible: true, earliest: earliest.date, ...earliest }

  const cal = ctx.vendor.operating
  const today = toDateOnly(ctx.now, ctx.timezone)
  if (daysBetween(today, requested) > ctx.maxAdvanceDays) return fail("too_far_ahead", earliest.date, zone.fee)
  if (compareDates(requested, earliest.date) < 0) return fail("before_earliest", earliest.date, zone.fee)
  if (cal.blackoutDates.includes(requested)) return fail("blackout", earliest.date, zone.fee)
  if (!isOpenDay(cal, requested)) return fail("closed_day", earliest.date, zone.fee)
  if (!hasCapacity(ctx, requested)) return fail("at_capacity", earliest.date, zone.fee)
  const slot = requested === earliest.date ? earliest : slotFor(ctx, requested, zone.fee, null)
  return { feasible: true, earliest: earliest.date, ...slot }
}

function fail(reason: DeliveryFailure, earliest: DateOnly | null, fee: Minor | null): DeliveryCheck {
  return { feasible: false, reason, earliest, message: MESSAGES[reason], fee }
}

/** Deliverable dates for a calendar picker, starting from the earliest feasible date. */
export function deliverableDates(ctx: DeliveryContext, count = 21): DateOnly[] {
  const earliest = earliestDelivery(ctx)
  if (!earliest) return []
  const out: DateOnly[] = []
  let d = earliest.date
  const today = toDateOnly(ctx.now, ctx.timezone)
  while (out.length < count && daysBetween(today, d) <= ctx.maxAdvanceDays) {
    if (isOpenDay(ctx.vendor.operating, d) && hasCapacity(ctx, d)) out.push(d)
    d = addDays(d, 1)
  }
  return out
}

/** Lowest zone fee a vendor charges — used when the recipient's zone is still unknown. */
export const minimumZoneFee = (vendor: Pick<Vendor, "zones">): Minor | null =>
  vendor.zones.length ? Math.min(...vendor.zones.map((z) => z.fee)) : null

/**
 * Vendor acceptance deadline (§9, proposed four operating hours). Hours outside the vendor's
 * opening times don't count, so an order paid at 23:00 is due mid-morning, not at 03:00.
 */
export function acceptanceDeadline(vendor: Pick<Vendor, "operating">, from: Date, hours: number, timezone: string): Date {
  const cal = vendor.operating
  let remaining = hours * 60
  let cursor = from
  for (let guard = 0; guard < 400 && remaining > 0; guard++) {
    const day = toDateOnly(cursor, timezone)
    const open = zonedTimeToUtc(day, cal.openHour, 0, timezone)
    const close = zonedTimeToUtc(day, cal.closeHour, 0, timezone)
    if (!isOpenDay(cal, day) || cursor >= close) {
      const next = nextOpenDay(cal, addDays(day, 1))
      if (!next) break
      cursor = zonedTimeToUtc(next, cal.openHour, 0, timezone)
      continue
    }
    if (cursor < open) cursor = open
    const available = (close.getTime() - cursor.getTime()) / 60_000
    const used = Math.min(available, remaining)
    cursor = new Date(cursor.getTime() + used * 60_000)
    remaining -= used
  }
  return cursor
}

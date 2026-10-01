import type { EventContent, OccasionEvent } from "@domain/index.ts"
import {
  defaultDesign,
  EVENT_TRANSITIONS,
  assertTransition,
  eventTypeMeta,
  isDateOnly,
  LAUNCH_TIMEZONE,
  ORDER_STATUS_LABEL,
  sha256Hex,
  templateById,
  templatesFor,
  uid,
  validateDesign,
  wishlistRemaining,
  toDateOnly,
  compareDates,
  randomToken,
} from "@domain/index.ts"
import type { Api, ComposeResult, EventSummary, HostEventDetail } from "../types"
import { ApiError } from "../errors"
import { clone, latency, type Store } from "./store"
import { isPurchasable, wishlistViews } from "./views"
import { makeHold } from "./commerce"

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40) || "celebration"

const sameContent = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function hasUnpublishedChanges(ev: OccasionEvent) {
  return !ev.published || !sameContent(ev.published.content, ev.draft) || !sameContent(ev.published.design, ev.draftDesign)
}

function requireHosted(s: Store, id: string, permission?: "edit_content" | "manage_wishlist" | "publish") {
  const u = s.requireUser()
  const ev = s.db.events.find((e) => e.id === id)
  if (!ev) throw new ApiError("not_found", "We couldn't find that occasion.")
  const co = ev.coHosts.find((c) => c.email === u.email && c.status === "accepted")
  const isHost = ev.hostUserId === u.id
  if (!isHost && !(co && (!permission || co.permissions.includes(permission)))) {
    s.audit(u.email, "access_denied", "event", id, "Not a host or permitted co-host")
    throw new ApiError("forbidden", "You don't have permission to change this occasion.")
  }
  return { ev, user: u, isHost }
}

/** Fills draft copy without inventing facts: missing details stay as visible prompts (AI 05). */
function composeCopy(content: EventContent, tone: string): ComposeResult["copy"] {
  const meta = eventTypeMeta(content.type)
  const who = content.hostDisplayName || "we"
  const prompts: string[] = []
  if (!content.date) prompts.push("Add the date when you know it")
  if (!content.venue) prompts.push("Add a venue, or keep it hidden")
  if (!content.story) prompts.push("Share a sentence or two about why this matters to you")
  const stories: Record<string, string> = {
    playful: `${who} would love for you to be part of this ${meta?.name.toLowerCase() ?? "celebration"}. [Add a favourite memory or what you're looking forward to.]`,
    elegant: `${who} warmly invite you to celebrate with us. [Add a few lines about what this day means.]`,
    calm: `We're gathering to mark this moment with the people who matter most. [Add a personal note.]`,
    restrained: `We'd be grateful for your company as we come together. [Add any details you'd like guests to know.]`,
  }
  const closings: Record<string, string> = {
    playful: "Can't wait to celebrate with you!",
    elegant: "With love and gratitude.",
    calm: "Thank you for being here.",
    restrained: "Thank you for your kindness and support.",
  }
  return { story: content.story || stories[tone] || stories.calm, closingMessage: content.closingMessage || closings[tone] || closings.calm, prompts }
}

export function eventsApi(s: Store): Pick<Api,
  | "listMyEvents" | "createEvent" | "getMyEvent" | "saveEventDraft" | "publishEvent" | "setEventStatus" | "setEventVisibility" | "setEventDeliveryAddress"
  | "setSurpriseMode" | "addWishlistItem" | "updateWishlistItem" | "removeWishlistItem" | "composeEvent" | "getEventGifts" | "inviteCoHost" | "revokeCoHost"
  | "getPublicEvent" | "holdWishlistItem" | "releaseHold"
> {
  const inviteCodes = new Map<string, string>()

  return {
    async listMyEvents() {
      await latency(150)
      const u = s.requireUser()
      const mine = s.db.events.filter((e) => e.status !== "archived" || e.hostUserId === u.id).filter((e) => e.hostUserId === u.id || e.coHosts.some((c) => c.email === u.email && c.status === "accepted"))
      const out: EventSummary[] = mine.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.draft.title,
        type: e.draft.type,
        date: e.draft.date,
        status: e.status,
        visibility: e.visibility,
        coverImage: e.draft.coverImage,
        wishlistCount: e.wishlist.filter((w) => w.status !== "removed").length,
        purchasedCount: e.wishlist.reduce((n, w) => n + w.purchasedQty, 0),
        hasUnpublishedChanges: e.status === "published" && hasUnpublishedChanges(e),
        updatedAt: e.updatedAt,
        role: e.hostUserId === u.id ? "host" : "co_host",
      }))
      return clone(out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    },

    async createEvent(input) {
      await latency(300)
      const u = s.requireUser()
      if (!input.title.trim()) throw new ApiError("validation", "Give your occasion a title.")
      if (input.date && !isDateOnly(input.date)) throw new ApiError("validation", "Choose a valid date, or mark it as to be confirmed.")
      let slug = slugify(input.title)
      while (s.db.events.some((e) => e.slug === slug)) slug = `${slugify(input.title)}-${Math.random().toString(36).slice(2, 6)}`
      const now = s.nowIso()
      const design = defaultDesign(input.type)
      const ev: OccasionEvent = {
        id: uid("evt"),
        slug,
        hostUserId: u.id,
        status: "draft",
        visibility: input.visibility,
        draft: {
          title: input.title.trim(),
          hostDisplayName: input.hostDisplayName.trim() || u.name.split(" ")[0],
          type: input.type,
          date: input.date,
          time: null,
          timezone: LAUNCH_TIMEZONE,
          story: "",
          venue: "",
          showVenue: false,
          showTime: false,
          agenda: [],
          dressCode: "",
          coverImage: defaultCover(input.type),
          closingMessage: "",
        },
        draftDesign: design,
        published: null,
        wishlist: [],
        deliveryZoneId: null,
        hasDeliveryAddress: false,
        surpriseMode: false,
        surpriseRevealDate: null,
        inviteCodeHash: null,
        coHosts: [],
        createdAt: now,
        updatedAt: now,
      }
      if (input.visibility === "private") {
        const code = randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
        ev.inviteCodeHash = await sha256Hex(code)
        inviteCodes.set(ev.id, code)
      }
      s.db.events.push(ev)
      s.persist()
      return { id: ev.id }
    },

    async getMyEvent(id) {
      await latency(150)
      const { ev, user, isHost } = requireHosted(s, id)
      const detail: HostEventDetail = {
        event: {
          id: ev.id,
          slug: ev.slug,
          status: ev.status,
          visibility: ev.visibility,
          draft: ev.draft,
          draftDesign: ev.draftDesign,
          publishedVersion: ev.published?.version ?? null,
          publishedAt: ev.published?.publishedAt ?? null,
          hasUnpublishedChanges: hasUnpublishedChanges(ev),
          deliveryZoneId: ev.deliveryZoneId,
          surpriseMode: ev.surpriseMode,
          surpriseRevealDate: ev.surpriseRevealDate,
          coHosts: ev.coHosts,
          updatedAt: ev.updatedAt,
          createdAt: ev.createdAt,
          inviteCode: ev.visibility === "private" ? inviteCodes.get(ev.id) ?? (ev.id === "evt_baby_chidera" ? "CHIDERA24" : null) : null,
        },
        wishlist: wishlistViews(s, ev),
        // Co-hosts don't get automatic address access (§2 roles).
        deliveryAddress: isHost ? s.db.eventAddresses[ev.id] ?? null : null,
        hostEmailVerified: user.emailVerified,
        shareUrl: `${location.origin}/e/${ev.slug}`,
      }
      return clone(detail)
    },

    async saveEventDraft(id, patch) {
      const { ev } = requireHosted(s, id, "edit_content")
      if (patch.content) ev.draft = { ...ev.draft, ...patch.content }
      if (patch.design) {
        const v = validateDesign(patch.design, ev.draft.type)
        if (!v.ok) throw new ApiError("validation", v.errors[0])
        ev.draftDesign = v.design
      }
      ev.updatedAt = s.nowIso()
      s.persist()
      return { updatedAt: ev.updatedAt }
    },

    async publishEvent(id) {
      await latency(500)
      const { ev, user } = requireHosted(s, id, "publish")
      const errors: string[] = []
      if (!user.emailVerified) errors.push("Verify your email address before publishing.")
      if (!ev.draft.title.trim()) errors.push("Add a title.")
      if (!ev.draft.hostDisplayName.trim()) errors.push("Add a host name.")
      if (!ev.draft.timezone) errors.push("Choose a timezone.")
      if (ev.draft.date && compareDates(ev.draft.date, toDateOnly(s.now(), LAUNCH_TIMEZONE)) < 0) errors.push("The date is in the past. Update it or mark it as to be confirmed.")
      const v = validateDesign(ev.draftDesign, ev.draft.type)
      if (!v.ok) errors.push(...v.errors)
      if (errors.length) return { ok: false, errors }
      if (ev.status === "draft" || ev.status === "closed") assertTransition(EVENT_TRANSITIONS, ev.status, "published", "event")
      ev.status = "published"
      ev.published = { content: clone(ev.draft), design: clone(ev.draftDesign), version: (ev.published?.version ?? 0) + 1, publishedAt: s.nowIso() }
      ev.updatedAt = s.nowIso()
      s.audit(user.email, "event.publish", "event", ev.id, `Published version ${ev.published.version}`)
      s.persist()
      return { ok: true, errors: [] }
    },

    async setEventStatus(id, status) {
      await latency(300)
      const { ev, user } = requireHosted(s, id, "publish")
      if (status === ev.status) return
      assertTransition(EVENT_TRANSITIONS, ev.status, status, "event")
      ev.status = status
      // Unpublishing makes the page non-public immediately; existing orders are untouched (EVT 06, AC 12).
      ev.updatedAt = s.nowIso()
      s.audit(user.email, `event.${status}`, "event", ev.id, `Status changed to ${status}`)
      s.persist()
    },

    async setEventVisibility(id, visibility) {
      await latency(250)
      const { ev } = requireHosted(s, id, "publish")
      ev.visibility = visibility
      let code: string | null = null
      if (visibility === "private") {
        code = randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
        ev.inviteCodeHash = await sha256Hex(code)
        inviteCodes.set(ev.id, code)
      } else {
        ev.inviteCodeHash = null
      }
      ev.updatedAt = s.nowIso()
      s.persist()
      return { inviteCode: code }
    },

    async setEventDeliveryAddress(id, address) {
      await latency(400)
      const { ev, isHost } = requireHosted(s, id)
      if (!isHost) throw new ApiError("forbidden", "Only the main host can set the delivery address.")
      for (const [f, label] of [["recipientName", "a recipient name"], ["phone", "a phone number"], ["line1", "a street address"], ["area", "an area"]] as const) {
        if (!address[f]?.trim()) throw new ApiError("validation", `Add ${label}.`)
      }
      s.db.eventAddresses[ev.id] = address
      ev.deliveryZoneId = address.zoneId
      ev.hasDeliveryAddress = true
      ev.updatedAt = s.nowIso()
      s.persist()
    },

    async setSurpriseMode(id, enabled, revealDate) {
      const { ev } = requireHosted(s, id)
      ev.surpriseMode = enabled
      ev.surpriseRevealDate = enabled ? revealDate ?? ev.draft.date : null
      ev.updatedAt = s.nowIso()
      s.persist()
    },

    async addWishlistItem(eventId, input) {
      await latency(250)
      const { ev } = requireHosted(s, eventId, "manage_wishlist")
      const product = s.db.products.find((p) => p.id === input.productId)
      if (!product || !isPurchasable(s, product)) throw new ApiError("unavailable", "That item isn't available to add right now.")
      if (!product.variants.some((v) => v.id === input.variantId)) throw new ApiError("validation", "Choose an option for this item.")
      if (input.desiredQty < 1 || input.desiredQty > 10) throw new ApiError("validation", "Choose a quantity between 1 and 10.")
      const existing = ev.wishlist.find((w) => w.variantId === input.variantId && w.status !== "removed")
      if (existing) {
        existing.desiredQty = Math.min(10, existing.desiredQty + input.desiredQty)
      } else {
        ev.wishlist.push({ id: uid("wsh"), eventId, ...input, purchasedQty: 0, status: "active", alternativeProductIds: [], addedAt: s.nowIso() })
      }
      ev.updatedAt = s.nowIso()
      s.persist()
    },

    async updateWishlistItem(eventId, itemId, patch) {
      const { ev } = requireHosted(s, eventId, "manage_wishlist")
      const item = ev.wishlist.find((w) => w.id === itemId)
      if (!item) throw new ApiError("not_found", "That wishlist item no longer exists.")
      if (patch.desiredQty !== undefined) {
        if (patch.desiredQty < item.purchasedQty) throw new ApiError("validation", `${item.purchasedQty} already bought — the quantity can't go lower than that.`)
        item.desiredQty = patch.desiredQty
      }
      if (patch.priority) item.priority = patch.priority
      if (patch.note !== undefined) item.note = patch.note.slice(0, 140)
      if (patch.variantId) {
        if (item.purchasedQty > 0) throw new ApiError("conflict", "Someone has already bought this item, so the option can't change. Add the other option as a new item.")
        item.variantId = patch.variantId
      }
      ev.updatedAt = s.nowIso()
      s.persist()
    },

    async removeWishlistItem(eventId, itemId) {
      await latency(250)
      const { ev } = requireHosted(s, eventId, "manage_wishlist")
      const item = ev.wishlist.find((w) => w.id === itemId)
      if (!item) return { hadActiveOrders: false }
      const active = s.db.orders.some((o) => o.wishlistItemId === itemId && !["cancelled", "declined", "payment_expired", "delivered"].includes(o.status))
      // WIS 07: historical purchases are kept; the item just stops accepting new ones.
      item.status = "removed"
      ev.updatedAt = s.nowIso()
      s.persist()
      return { hadActiveOrders: active }
    },

    async composeEvent(eventId, req) {
      await latency(1200)
      const { ev } = requireHosted(s, eventId, "edit_content")
      const type = ev.draft.type
      const sensitive = eventTypeMeta(type)?.sensitive
      const tone = sensitive ? "restrained" : req.tone
      const candidates = templatesFor(type).filter((t) => t.tone === tone)
      const template = candidates[0] ?? templatesFor(type)[0]
      const colourHints: Record<string, string[]> = { gold: ["ivory-gold", "midnight"], pink: ["blush"], blush: ["blush"], green: ["sage"], sage: ["sage"], orange: ["tangerine"], navy: ["midnight"], blue: ["midnight"], black: ["ink"], white: ["ivory-gold", "ink"] }
      const wanted = Object.entries(colourHints).filter(([k]) => req.colours?.toLowerCase().includes(k)).flatMap(([, v]) => v)
      const palette = template.palettes.find((p) => wanted.includes(p)) ?? template.palettes[0]
      // The proposed config goes through the same allowlist validator an LLM response would (AC 10).
      const proposal = { templateId: template.id, palette, font: template.fonts[0], motionPreset: sensitive ? "none" : template.defaultMotion, sectionOrder: template.defaultOrder }
      const v = validateDesign(proposal, type)
      const design = v.ok ? v.design : defaultDesign(type)
      return clone({ design, copy: composeCopy(ev.draft, tone), source: "rules" as const, rejected: v.ok ? [] : v.errors })
    },

    async getEventGifts(eventId) {
      await latency(200)
      const { ev } = requireHosted(s, eventId)
      const today = toDateOnly(s.now(), LAUNCH_TIMEZONE)
      const hidden = ev.surpriseMode && (!ev.surpriseRevealDate || compareDates(today, ev.surpriseRevealDate) < 0)
      return clone(
        s.db.orders
          .filter((o) => o.eventId === ev.id && o.paymentStatus === "successful")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((o) => {
            const gift = s.db.gifts.find((g) => g.id === o.giftId)
            return {
              orderId: o.id,
              itemTitle: hidden ? null : o.lines[0].title,
              image: hidden ? null : o.lines[0].image,
              buyerName: hidden || gift?.anonymous ? null : gift?.senderDisplayName ?? o.buyerName.split(" ")[0],
              message: hidden ? null : gift?.message ?? null,
              status: o.status,
              statusLabel: ORDER_STATUS_LABEL[o.status],
              createdAt: o.createdAt,
              hiddenBySurprise: hidden,
            }
          }),
      )
    },

    async inviteCoHost(eventId, input) {
      await latency(300)
      const { ev, isHost, user } = requireHosted(s, eventId)
      if (!isHost) throw new ApiError("forbidden", "Only the main host can invite co-hosts.")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new ApiError("validation", "Enter a valid email address.")
      ev.coHosts = ev.coHosts.filter((c) => c.email !== input.email.toLowerCase())
      ev.coHosts.push({ userId: null, email: input.email.toLowerCase(), displayName: input.displayName, permissions: input.permissions, status: "invited", invitedAt: s.nowIso(), respondedAt: null })
      s.notify({ to: input.email, kind: "host", subject: `${user.name.split(" ")[0]} invited you to co-host “${ev.draft.title}”`, body: "Accept the invitation to help manage the page and wishlist." })
      s.audit(user.email, "event.cohost_invite", "event", ev.id, `${input.email} (${input.permissions.join(", ")})`)
      s.persist()
    },

    async revokeCoHost(eventId, email) {
      const { ev, isHost, user } = requireHosted(s, eventId)
      if (!isHost) throw new ApiError("forbidden", "Only the main host can change co-hosts.")
      const c = ev.coHosts.find((x) => x.email === email)
      if (c) {
        c.status = "revoked"
        c.respondedAt = s.nowIso()
      }
      s.audit(user.email, "event.cohost_revoke", "event", ev.id, email)
      s.persist()
    },

    async getPublicEvent(slug, inviteCode) {
      await latency(180)
      const ev = s.db.events.find((e) => e.slug === slug)
      const user = s.user()
      const isHostPreview = ev && user && (ev.hostUserId === user.id || ev.coHosts.some((c) => c.email === user.email && c.status === "accepted"))
      if (!ev || !ev.published || (ev.status !== "published" && ev.status !== "closed" && !isHostPreview)) return { kind: "unavailable" }
      if (ev.visibility === "private" && !isHostPreview) {
        if (!inviteCode || (await sha256Hex(inviteCode.trim().toUpperCase())) !== ev.inviteCodeHash) return { kind: "invite_required", title: "A private celebration" }
      }
      const content = clone(ev.published.content)
      // EVT 02: venue and time can be hidden independently of the wishlist.
      if (!content.showVenue) content.venue = ""
      if (!content.showTime) content.time = null
      return clone({
        kind: "found" as const,
        view: {
          event: { id: ev.id, slug: ev.slug, status: ev.status, content, design: ev.published.design, deliveryZoneId: ev.deliveryZoneId, acceptingGifts: ev.status === "published" && ev.hasDeliveryAddress, visibility: ev.visibility },
          wishlist: wishlistViews(s, ev),
        },
      })
    },

    async holdWishlistItem(slug, itemId, quantity) {
      await latency(250)
      const ev = s.db.events.find((e) => e.slug === slug && e.status === "published")
      const item = ev?.wishlist.find((w) => w.id === itemId && w.status === "active")
      if (!ev || !item) return { ok: false, message: "This item is no longer on the wishlist." }
      if (!ev.hasDeliveryAddress) return { ok: false, message: "The host hasn't finished setting up delivery yet. Check back soon." }
      const now = s.now()
      // AC 02: the check and the insert happen in one synchronous step, the equivalent of the
      // `create_wishlist_hold` database function's row lock.
      const remaining = wishlistRemaining(item, s.db.holds, now)
      if (remaining < quantity) {
        return { ok: false, message: remaining === 0 ? "Someone else is buying this right now. It'll become available again if they don't complete payment." : `Only ${remaining} still needed.` }
      }
      try {
        const hold = makeHold(s, item.variantId, quantity, item.id)
        s.persist()
        return { ok: true, holdId: hold.id, expiresAt: hold.expiresAt }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : "This item just sold out." }
      }
    },

    async releaseHold(holdId) {
      const h = s.db.holds.find((x) => x.id === holdId && x.status === "active" && !x.orderId)
      if (h) {
        h.status = "released"
        s.persist()
      }
    },
  }
}

function defaultCover(type: string) {
  const map: Record<string, string> = {
    birthday: "/media/occasions/birthday@2x.webp",
    wedding: "/media/occasions/wedding@2x.webp",
    anniversary: "/media/occasions/anniversary@2x.webp",
    "baby-shower": "/media/occasions/baby@2x.webp",
    graduation: "/media/occasions/graduation@2x.webp",
    housewarming: "/media/occasions/housewarming@2x.webp",
    appreciation: "/media/occasions/appreciation@2x.webp",
    remembrance: "/media/occasions/sympathy@2x.webp",
    custom: "/media/e/confetti@2x.webp",
  }
  return map[type] ?? map.custom
}

export const templateName = (id: string) => templateById(id)?.name ?? id

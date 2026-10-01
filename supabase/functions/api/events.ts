// deno-lint-ignore-file no-explicit-any
import type { EventContent, OccasionEvent } from "../_shared/domain/index.ts"
import { assertTransition, compareDates, defaultDesign, EVENT_TRANSITIONS, eventTypeMeta, isDateOnly, ORDER_STATUS_LABEL, randomToken, sha256Hex, templatesFor, toDateOnly, uid, validateDesign, LAUNCH_TIMEZONE, ZONES } from "../_shared/domain/index.ts"
import { db, must } from "../_shared/db.ts"
import { env } from "../_shared/env.ts"
import { fail } from "../_shared/http.ts"
import { requireUser, type Caller } from "../_shared/auth.ts"
import { claude } from "../_shared/ai.ts"
import { createHold } from "../_shared/commerce.ts"
import { enqueue } from "../_shared/notify.ts"
import { activeHolds, audit, eventBy, products, settings, toGift, toOrder, vendorsById } from "../_shared/repo.ts"
import { wishlistViews } from "../_shared/views.ts"
import type { Handler } from "./context.ts"
import { str } from "./context.ts"

const changed = (ev: OccasionEvent) => !ev.published || JSON.stringify(ev.published.content) !== JSON.stringify(ev.draft) || JSON.stringify(ev.published.design) !== JSON.stringify(ev.draftDesign)

async function hosted(caller: Caller, id: unknown, permission?: "edit_content" | "manage_wishlist" | "publish") {
  const u = requireUser(caller)
  const ev = await eventBy("id", str(id, "event", 60))
  if (!ev) throw fail("not_found", "We couldn't find that occasion.")
  const co = ev.coHosts.find((c) => c.email === u.email && c.status === "accepted")
  const isHost = ev.hostUserId === u.userId
  if (!isHost && !(co && (!permission || co.permissions.includes(permission)))) {
    await audit(u.email, "access_denied", "event", ev.id, "Not a host or permitted co-host")
    throw fail("forbidden", "You don't have permission to change this occasion.")
  }
  return { ev, user: u, isHost }
}

async function views(ev: OccasionEvent) {
  const prods = await products({ ids: ev.wishlist.map((w) => w.productId) })
  const vendors = await vendorsById([...new Set(prods.map((p) => p.vendorId))])
  const holds = await activeHolds(ev.wishlist.map((w) => w.variantId))
  return wishlistViews(ev, prods, vendors, holds, await settings())
}

const touch = (id: string, patch: Record<string, unknown>) => db().from("events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)
const inviteCode = () => randomToken(9).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)

export const events: Record<string, Handler> = {
  async listMyEvents({ caller }) {
    const u = requireUser(caller)
    const own = must(await db().from("events").select("*").eq("host_user_id", u.userId)) as any[]
    const shared = must(await db().from("events").select("*").contains("co_hosts", [{ email: u.email, status: "accepted" }])) as any[]
    const rows = [...own, ...shared.filter((r) => !own.some((o) => o.id === r.id))].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    const wishes = must(await db().from("wishlist_items").select("event_id, status, purchased_qty").in("event_id", rows.map((r) => r.id).concat("-"))) as any[]
    return rows.filter((r) => r.status !== "archived" || r.host_user_id === u.userId).map((r) => {
      const w = wishes.filter((x) => x.event_id === r.id)
      const ev = { draft: r.draft, draftDesign: r.draft_design, published: r.published } as OccasionEvent
      return { id: r.id, slug: r.slug, title: r.draft.title, type: r.draft.type, date: r.draft.date, status: r.status, visibility: r.visibility, coverImage: r.draft.coverImage, wishlistCount: w.filter((x) => x.status !== "removed").length, purchasedCount: w.reduce((n, x) => n + x.purchased_qty, 0), hasUnpublishedChanges: r.status === "published" && changed(ev), updatedAt: r.updated_at, role: r.host_user_id === u.userId ? "host" : "co_host" }
    })
  },

  async createEvent({ caller, args }) {
    const u = requireUser(caller)
    const input = args.input ?? {}
    if (!eventTypeMeta(input.type)) throw fail("validation", "Choose an occasion type.")
    const title = str(input.title, "title", 80).trim()
    if (!title) throw fail("validation", "Give your occasion a title.")
    if (input.date && !isDateOnly(input.date)) throw fail("validation", "Choose a valid date, or mark it as to be confirmed.")
    const base = title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 40) || "celebration"
    const { data: clash } = await db().from("events").select("id").eq("slug", base).maybeSingle()
    const slug = clash ? `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4)}` : base
    const id = uid("evt")
    const draft: EventContent = { title, hostDisplayName: String(input.hostDisplayName ?? "").slice(0, 60).trim() || caller.name, type: input.type, date: input.date ?? null, time: null, timezone: LAUNCH_TIMEZONE, story: "", venue: "", showVenue: false, showTime: false, agenda: [], dressCode: "", coverImage: "/media/e/confetti@2x.webp", closingMessage: "" }
    const visibility = ["public", "unlisted", "private"].includes(input.visibility) ? input.visibility : "unlisted"
    must(await db().from("events").insert({ id, slug, host_user_id: u.userId, visibility, draft, draft_design: defaultDesign(input.type), invite_code_hash: visibility === "private" ? await sha256Hex(inviteCode()) : null }))
    return { id }
  },

  async getMyEvent({ caller, args }) {
    const { ev, user, isHost } = await hosted(caller, args.id)
    const addr = isHost ? (must(await db().from("event_addresses").select("address").eq("event_id", ev.id).maybeSingle()) as any)?.address ?? null : null
    return {
      event: { id: ev.id, slug: ev.slug, status: ev.status, visibility: ev.visibility, draft: ev.draft, draftDesign: ev.draftDesign, publishedVersion: ev.published?.version ?? null, publishedAt: ev.published?.publishedAt ?? null, hasUnpublishedChanges: changed(ev), deliveryZoneId: ev.deliveryZoneId, surpriseMode: ev.surpriseMode, surpriseRevealDate: ev.surpriseRevealDate, coHosts: ev.coHosts, updatedAt: ev.updatedAt, createdAt: ev.createdAt, inviteCode: null },
      wishlist: await views(ev), deliveryAddress: addr, hostEmailVerified: user.emailVerified, shareUrl: `${env.siteUrl()}/e/${ev.slug}`,
    }
  },

  async saveEventDraft({ caller, args }) {
    const { ev } = await hosted(caller, args.id, "edit_content")
    const patch: Record<string, unknown> = {}
    if (args.patch?.content) {
      // Content is plain text rendered as text — never HTML (§8 content control).
      const c = { ...ev.draft, ...args.patch.content }
      c.title = String(c.title).slice(0, 80); c.story = String(c.story ?? "").slice(0, 2000); c.closingMessage = String(c.closingMessage ?? "").slice(0, 300); c.venue = String(c.venue ?? "").slice(0, 160)
      if (c.coverImage && !String(c.coverImage).startsWith("/media/") && !String(c.coverImage).startsWith(`${env.supabaseUrl()}/storage/`)) c.coverImage = ev.draft.coverImage
      patch.draft = c
    }
    if (args.patch?.design) {
      const v = validateDesign(args.patch.design, ev.draft.type)
      if (!v.ok) throw fail("validation", v.errors[0])
      patch.draft_design = v.design
    }
    const updatedAt = new Date().toISOString()
    must(await db().from("events").update({ ...patch, updated_at: updatedAt }).eq("id", ev.id))
    return { updatedAt }
  },

  async publishEvent({ caller, args }) {
    const { ev, user } = await hosted(caller, args.id, "publish")
    const errors: string[] = []
    if (!user.emailVerified) errors.push("Verify your email address before publishing.")
    if (!ev.draft.title.trim()) errors.push("Add a title.")
    if (!ev.draft.hostDisplayName.trim()) errors.push("Add a host name.")
    if (ev.draft.date && compareDates(ev.draft.date, toDateOnly(new Date(), LAUNCH_TIMEZONE)) < 0) errors.push("The date is in the past. Update it or mark it as to be confirmed.")
    const v = validateDesign(ev.draftDesign, ev.draft.type)
    if (!v.ok) errors.push(...v.errors)
    if (errors.length) return { ok: false, errors }
    if (ev.status === "draft" || ev.status === "closed") assertTransition(EVENT_TRANSITIONS, ev.status, "published", "event")
    const version = (ev.published?.version ?? 0) + 1
    await touch(ev.id, { status: "published", published: { content: ev.draft, design: ev.draftDesign, version, publishedAt: new Date().toISOString() } })
    await audit(user.email, "event.publish", "event", ev.id, `Published version ${version}`)
    return { ok: true, errors: [] }
  },

  async setEventStatus({ caller, args }) {
    const { ev, user } = await hosted(caller, args.id, "publish")
    if (args.status === ev.status) return
    assertTransition(EVENT_TRANSITIONS, ev.status, args.status, "event")
    // Unpublishing takes effect immediately; existing orders are untouched (EVT 06, AC 12).
    await touch(ev.id, { status: args.status })
    await audit(user.email, `event.${args.status}`, "event", ev.id, "")
  },

  async setEventVisibility({ caller, args }) {
    const { ev } = await hosted(caller, args.id, "publish")
    if (!["public", "unlisted", "private"].includes(args.visibility)) throw fail("validation", "Choose a visibility.")
    const code = args.visibility === "private" ? inviteCode() : null
    await touch(ev.id, { visibility: args.visibility, invite_code_hash: code ? await sha256Hex(code) : null })
    return { inviteCode: code }
  },

  async setEventDeliveryAddress({ caller, args }) {
    const { ev, isHost } = await hosted(caller, args.id)
    if (!isHost) throw fail("forbidden", "Only the main host can set the delivery address.")
    const a = args.address ?? {}
    for (const [f, label] of [["recipientName", "a recipient name"], ["phone", "a phone number"], ["line1", "a street address"], ["area", "an area"]] as const) if (typeof a[f] !== "string" || !a[f].trim()) throw fail("validation", `Add ${label}.`)
    const zone = ZONES.find((z) => z.id === a.zoneId)
    if (!zone) throw fail("validation", "Choose a delivery area.")
    must(await db().from("event_addresses").upsert({ event_id: ev.id, address: { ...a, city: zone.city, state: zone.state }, updated_at: new Date().toISOString() }))
    await touch(ev.id, { delivery_zone_id: zone.id, has_delivery_address: true })
  },

  async setSurpriseMode({ caller, args }) {
    const { ev } = await hosted(caller, args.id)
    await touch(ev.id, { surprise_mode: Boolean(args.enabled), surprise_reveal_date: args.enabled ? args.revealDate ?? ev.draft.date : null })
  },

  async addWishlistItem({ caller, args }) {
    const { ev } = await hosted(caller, args.eventId, "manage_wishlist")
    const i = args.input ?? {}
    const [p] = await products({ ids: [str(i.productId, "product")] })
    const vendor = p && (await vendorsById([p.vendorId])).get(p.vendorId)
    if (!p || p.status !== "active" || vendor?.status !== "approved") throw fail("unavailable", "That item isn't available to add right now.")
    if (!p.variants.some((v) => v.id === i.variantId)) throw fail("validation", "Choose an option for this item.")
    const qty = Number(i.desiredQty)
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw fail("validation", "Choose a quantity between 1 and 10.")
    const existing = ev.wishlist.find((w) => w.variantId === i.variantId && w.status !== "removed")
    if (existing) await db().from("wishlist_items").update({ desired_qty: Math.min(10, existing.desiredQty + qty) }).eq("id", existing.id)
    else must(await db().from("wishlist_items").insert({ id: uid("wsh"), event_id: ev.id, product_id: p.id, variant_id: i.variantId, desired_qty: qty, priority: ["must", "love", "nice"].includes(i.priority) ? i.priority : "love", note: String(i.note ?? "").slice(0, 140) }))
    await touch(ev.id, {})
  },

  async updateWishlistItem({ caller, args }) {
    const { ev } = await hosted(caller, args.eventId, "manage_wishlist")
    const item = ev.wishlist.find((w) => w.id === args.itemId)
    if (!item) throw fail("not_found", "That wishlist item no longer exists.")
    const p = args.patch ?? {}
    const patch: Record<string, unknown> = {}
    if (p.desiredQty !== undefined) {
      if (p.desiredQty < item.purchasedQty) throw fail("validation", `${item.purchasedQty} already bought — the quantity can't go lower than that.`)
      patch.desired_qty = Math.min(10, Math.max(1, Number(p.desiredQty)))
    }
    if (p.priority && ["must", "love", "nice"].includes(p.priority)) patch.priority = p.priority
    if (p.note !== undefined) patch.note = String(p.note).slice(0, 140)
    if (p.variantId) {
      if (item.purchasedQty > 0) throw fail("conflict", "Someone has already bought this item, so the option can't change. Add the other option as a new item.")
      patch.variant_id = p.variantId
    }
    await db().from("wishlist_items").update(patch).eq("id", item.id)
  },

  async removeWishlistItem({ caller, args }) {
    const { ev } = await hosted(caller, args.eventId, "manage_wishlist")
    const { count } = await db().from("orders").select("id", { count: "exact", head: true }).eq("wishlist_item_id", args.itemId).not("status", "in", "(cancelled,declined,payment_expired,delivered)")
    // WIS 07: historical purchases stay; the item just stops accepting new ones.
    await db().from("wishlist_items").update({ status: "removed" }).eq("id", args.itemId).eq("event_id", ev.id)
    return { hadActiveOrders: (count ?? 0) > 0 }
  },

  async composeEvent({ caller, args }) {
    const { ev } = await hosted(caller, args.eventId, "edit_content")
    const type = ev.draft.type
    const sensitive = eventTypeMeta(type)?.sensitive
    const tone = sensitive ? "restrained" : args.req?.tone ?? "elegant"
    const rejected: string[] = []
    let source: "ai" | "rules" = "rules"
    let design = null
    let copy = null as null | { story: string; closingMessage: string }
    const ai = await claude.composeEvent({ type, tone, colours: args.req?.colours, notes: args.req?.notes, content: { title: ev.draft.title, hostDisplayName: ev.draft.hostDisplayName, story: ev.draft.story, hasDate: Boolean(ev.draft.date), hasVenue: Boolean(ev.draft.venue) } }) as any
    if (ai) {
      // AC 10: the proposal must pass the same allowlist validator as manual edits.
      const v = validateDesign(ai, type)
      if (v.ok && !(sensitive && v.design.motionPreset !== "none" && v.design.tone !== "restrained")) {
        design = v.design
        copy = { story: ev.draft.story || String(ai.story ?? "").slice(0, 1200), closingMessage: ev.draft.closingMessage || String(ai.closingMessage ?? "").slice(0, 300) }
        source = "ai"
      } else rejected.push(...(v.ok ? ["Celebratory design rejected for a sensitive occasion"] : v.errors))
    }
    if (!design) {
      const t = templatesFor(type).find((x) => x.tone === tone) ?? templatesFor(type)[0]
      design = validateDesign({ templateId: t.id, palette: t.palettes[0], font: t.fonts[0], motionPreset: sensitive ? "none" : t.defaultMotion, sectionOrder: t.defaultOrder }, type)
      design = design.ok ? design.design : defaultDesign(type)
    }
    const prompts = [!ev.draft.date && "Add the date when you know it", !ev.draft.venue && "Add a venue, or keep it hidden", !ev.draft.story && "Share a sentence or two about why this matters to you"].filter(Boolean) as string[]
    return { design, copy: { story: copy?.story ?? (ev.draft.story || `[Add a few lines about what this ${eventTypeMeta(type)?.name.toLowerCase()} means to you.]`), closingMessage: copy?.closingMessage ?? (ev.draft.closingMessage || "Thank you for being part of this."), prompts }, source, rejected }
  },

  async getEventGifts({ caller, args }) {
    const { ev } = await hosted(caller, args.eventId)
    const hidden = ev.surpriseMode && (!ev.surpriseRevealDate || compareDates(toDateOnly(new Date(), LAUNCH_TIMEZONE), ev.surpriseRevealDate) < 0)
    const rows = must(await db().from("orders").select("*").eq("event_id", ev.id).eq("payment_status", "successful").order("created_at", { ascending: false })) as any[]
    const giftRows = must(await db().from("gifts").select("*").in("order_id", rows.map((r) => r.id).concat("-"))) as any[]
    return rows.map((r) => {
      const o = toOrder(r)
      const g = giftRows.find((x) => x.order_id === r.id)
      const gift = g ? toGift(g) : null
      return { orderId: o.id, itemTitle: hidden ? null : o.lines[0].title, image: hidden ? null : o.lines[0].image, buyerName: hidden || gift?.anonymous ? null : gift?.senderDisplayName ?? o.buyerName.split(" ")[0], message: hidden ? null : gift?.message ?? null, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status], createdAt: o.createdAt, hiddenBySurprise: hidden }
    })
  },

  async inviteCoHost({ caller, args }) {
    const { ev, isHost, user } = await hosted(caller, args.eventId)
    if (!isHost) throw fail("forbidden", "Only the main host can invite co-hosts.")
    const email = str(args.input?.email, "email", 200).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("validation", "Enter a valid email address.")
    const perms = (args.input?.permissions ?? []).filter((p: string) => ["edit_content", "manage_wishlist", "publish"].includes(p))
    const coHosts = [...ev.coHosts.filter((c) => c.email !== email), { userId: null, email, displayName: String(args.input?.displayName ?? "").slice(0, 60), permissions: perms, status: "invited", invitedAt: new Date().toISOString(), respondedAt: null }]
    await touch(ev.id, { co_hosts: coHosts })
    await enqueue({ to: email, kind: "host", subject: `${user.name || "A host"} invited you to co-host “${ev.draft.title}”`, body: "Sign in with this email to accept and help manage the page and wishlist.", link: { label: "Open JustGifter", href: "/events" } })
    await audit(user.email, "event.cohost_invite", "event", ev.id, `${email} (${perms.join(", ")})`)
  },

  async revokeCoHost({ caller, args }) {
    const { ev, isHost, user } = await hosted(caller, args.eventId)
    if (!isHost) throw fail("forbidden", "Only the main host can change co-hosts.")
    await touch(ev.id, { co_hosts: ev.coHosts.map((c) => (c.email === args.email ? { ...c, status: "revoked", respondedAt: new Date().toISOString() } : c)) })
    await audit(user.email, "event.cohost_revoke", "event", ev.id, String(args.email))
  },

  async getPublicEvent({ caller, args }) {
    const ev = await eventBy("slug", str(args.slug, "slug", 60))
    const isHost = ev && caller.userId && (ev.hostUserId === caller.userId || ev.coHosts.some((c) => c.email === caller.email && c.status === "accepted"))
    if (!ev || !ev.published || (ev.status !== "published" && ev.status !== "closed" && !isHost)) return { kind: "unavailable" }
    if (ev.visibility === "private" && !isHost) {
      if (!args.inviteCode || (await sha256Hex(String(args.inviteCode).trim().toUpperCase())) !== ev.inviteCodeHash) return { kind: "invite_required", title: "A private celebration" }
    }
    const content = { ...ev.published.content }
    if (!content.showVenue) content.venue = ""
    if (!content.showTime) content.time = null
    return { kind: "found", view: { event: { id: ev.id, slug: ev.slug, status: ev.status, content, design: ev.published.design, deliveryZoneId: ev.deliveryZoneId, acceptingGifts: ev.status === "published" && ev.hasDeliveryAddress, visibility: ev.visibility }, wishlist: await views(ev) } }
  },

  async holdWishlistItem({ args }) {
    const ev = await eventBy("slug", str(args.slug, "slug", 60))
    const item = ev?.wishlist.find((w) => w.id === args.itemId && w.status === "active")
    if (!ev || ev.status !== "published" || !item) return { ok: false, message: "This item is no longer on the wishlist." }
    if (!ev.hasDeliveryAddress) return { ok: false, message: "The host hasn't finished setting up delivery yet. Check back soon." }
    try {
      // AC 02: the row-locked database function guarantees one hold for the final unit.
      const h = await createHold(item.variantId, Math.max(1, Math.min(10, Number(args.quantity) || 1)), item.id, (await settings()).holdMinutes)
      return { ok: true, holdId: h.id, expiresAt: h.expiresAt }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "This item isn't available right now." }
    }
  },

  async releaseHold({ args }) {
    await db().from("stock_holds").update({ status: "released" }).eq("id", str(args.holdId, "hold")).eq("status", "active").is("order_id", null)
  },
}

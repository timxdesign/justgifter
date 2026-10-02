import { beforeEach, describe, expect, it } from "vitest"
import { createDemoApi, type DemoBackend } from "./index"
import type { CheckoutDraft } from "../types"
import { earliestDelivery, LAUNCH_TIMEZONE } from "@domain/index.ts"

let api: DemoBackend

const giftLinkFor = (recipientEmail: string) => {
  const msg = api.store.db.outbox.find((m) => m.to === recipientEmail && m.kind === "gift_reveal")
  return msg?.link?.href.replace("/g/", "") ?? null
}

function draftFor(productId: string, overrides: Partial<CheckoutDraft> = {}): CheckoutDraft {
  const p = api.store.db.products.find((x) => x.id === productId)!
  const v = api.store.db.vendors.find((x) => x.id === p.vendorId)!
  const zoneId = overrides.zoneId ?? v.zones[0].zoneId
  const date = earliestDelivery({ now: new Date(), timezone: LAUNCH_TIMEZONE, vendor: v, zoneId, prepHours: p.prepHours + 30, maxAdvanceDays: 90 })!.date
  return {
    vendorId: v.id,
    source: "marketplace",
    purchaseType: "self",
    lines: [{ productId, variantId: p.variants[0].id, quantity: 1 }],
    buyer: { name: "Test Buyer", email: "buyer@example.com" },
    zoneId,
    requestedDate: date,
    addressKnown: true,
    address: { recipientName: "Test", phone: "+2348000000000", line1: "1 Test Street", area: "Somewhere", city: "Lagos", state: "Lagos", zoneId },
    ...overrides,
  }
}

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  api = await createDemoApi()
  await api.switchPersona("guest")
})

describe("demo seed", () => {
  it("builds a consistent world", () => {
    const db = api.store.db
    expect(db.vendors.length).toBeGreaterThan(10)
    expect(db.products.length).toBeGreaterThan(40)
    expect(db.orders.length).toBeGreaterThan(15)
    // every paid order posted exactly one charge
    for (const o of db.orders.filter((x) => x.paymentStatus === "successful")) {
      expect(db.ledger.filter((l) => l.orderId === o.id && l.type === "charge")).toHaveLength(1)
    }
    expect(db.outbox.some((m) => m.kind === "gift_reveal")).toBe(true)
  })
})

describe("checkout and payments", () => {
  it("AC 03/21: replayed webhooks create one order, one stock commitment and one gift", async () => {
    const p = api.store.db.products.find((x) => x.id === "prd_celebration_box")!
    const before = p.variants[0].stock
    const draft = draftFor("prd_celebration_box", {
      source: "storefront",
      storefrontId: "stf_hamper",
      purchaseType: "gift",
      recipient: { name: "Recipient", email: "r1@example.com" },
      gift: { senderDisplayName: "Me", anonymous: false, message: "Hi", revealStyle: "envelope", revealAt: null, timezone: LAUNCH_TIMEZONE },
    })
    const session = await api.createCheckout(draft)
    await api.simulatePayment(session.reference, "success")
    await api.simulatePayment(session.reference, "success")
    const order = api.store.db.orders.find((o) => o.id === session.orderId)!
    expect(order.status).toBe("awaiting_vendor_acceptance")
    expect(order.source).toBe("storefront")
    expect(api.store.db.products.find((x) => x.id === "prd_celebration_box")!.variants[0].stock).toBe(before - 1)
    expect(api.store.db.gifts.filter((g) => g.orderId === order.id)).toHaveLength(1)
    expect(api.store.db.ledger.filter((l) => l.orderId === order.id && l.type === "charge")).toHaveLength(1)
    expect(api.store.db.outbox.filter((m) => m.to === "r1@example.com" && m.kind === "gift_reveal")).toHaveLength(1)
  })

  it("AC 04: without verified payment the order stays pending and no reveal is sent", async () => {
    const session = await api.createCheckout(draftFor("prd_amber_candle", { purchaseType: "gift", recipient: { name: "R", email: "r2@example.com" }, gift: { senderDisplayName: "Me", anonymous: false, message: "", revealStyle: "envelope", revealAt: null, timezone: LAUNCH_TIMEZONE } }))
    const status = await api.getPaymentStatus(session.reference)
    expect(status.status).toBe("pending")
    expect(giftLinkFor("r2@example.com")).toBeNull()
  })

  it("AC 19: marketplace and storefront buyers can't both take the last unit", async () => {
    const p = api.store.db.products.find((x) => x.id === "prd_espresso")!
    p.variants[0].stock = 1
    await api.createCheckout(draftFor("prd_espresso"))
    await expect(api.createCheckout(draftFor("prd_espresso", { source: "storefront", storefrontId: "stf_nest", buyer: { name: "B", email: "b@example.com" } }))).rejects.toThrow(/sold out|left/i)
  })

  it("AC 20: a paused storefront blocks new checkout", async () => {
    api.store.db.storefronts.find((x) => x.id === "stf_hamper")!.status = "paused"
    await expect(api.createCheckout(draftFor("prd_kraft_treats", { source: "storefront", storefrontId: "stf_hamper" }))).rejects.toThrow(/paused/i)
  })

  it("AC 18: self purchase needs no gift fields; gift purchase requires recipient", async () => {
    await expect(api.createCheckout(draftFor("prd_kraft_treats"))).resolves.toBeTruthy()
    await expect(api.createCheckout(draftFor("prd_kraft_treats", { purchaseType: "gift" }))).rejects.toThrow(/recipient/i)
  })

  it("AC 01: an impossible date blocks payment", async () => {
    await expect(api.createCheckout(draftFor("prd_choc_drip_cake", { requestedDate: "2020-01-01" }))).rejects.toThrow(/too soon|date/i)
  })
})

describe("wishlists", () => {
  it("AC 02: only one of two guests acquires the final unit's hold", async () => {
    const ev = api.store.db.events.find((e) => e.slug === "ada-turns-30")!
    const item = ev.wishlist.find((w) => w.productId === "prd_pendant")!
    const [a, b] = await Promise.all([api.holdWishlistItem("ada-turns-30", item.id, 1), api.holdWishlistItem("ada-turns-30", item.id, 1)])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    const view = await api.getPublicEvent("ada-turns-30")
    if (view.kind !== "found") throw new Error("expected event")
    expect(view.view.wishlist.find((w) => w.item.id === item.id)!.availability.state).toBe("held")
  })

  it("never exposes the host's address to guests", async () => {
    const view = await api.getPublicEvent("ada-turns-30")
    expect(JSON.stringify(view)).not.toContain("Admiralty")
  })

  it("AC 12: unpublishing keeps paid orders accessible", async () => {
    await api.switchPersona("usr_ada")
    await api.setEventStatus("evt_ada30", "draft")
    await api.switchPersona("guest")
    expect((await api.getPublicEvent("ada-turns-30")).kind).toBe("unavailable")
    await api.switchPersona("usr_tunde")
    const orders = await api.listMyOrders()
    expect(orders.some((o) => o.source === "wishlist")).toBe(true)
  })
})

describe("recipient", () => {
  async function sendUnknownAddressGift(anonymous = false) {
    const session = await api.createCheckout(draftFor("prd_celebration_box", {
      zoneId: "lagos-island",
      addressKnown: false,
      address: undefined,
      purchaseType: "gift",
      recipient: { name: "Kemi", email: "kemi.r@example.com" },
      gift: { senderDisplayName: "Bola", anonymous, message: "For you", revealStyle: "wrapped_box", revealAt: null, timezone: LAUNCH_TIMEZONE },
    }))
    await api.simulatePayment(session.reference, "success")
    return { session, token: giftLinkFor("kemi.r@example.com")! }
  }

  it("AC 06: address-unknown gifts need contact verification and an in-zone address", async () => {
    const { session, token } = await sendUnknownAddressGift()
    const entry = await api.getGiftEntry(token)
    expect(entry.verificationRequired).toBe(true)
    await expect(api.submitGiftAddress(token, "bogus", { recipientName: "K", phone: "1", line1: "x", area: "y", city: "Lagos", state: "Lagos", zoneId: "lagos-island" })).rejects.toThrow(/confirm/i)
    const { devCode } = await api.sendGiftCode(token)
    const gs = await api.verifyGiftCode(token, devCode!)
    const res = await api.submitGiftAddress(token, gs.token, { recipientName: "Kemi", phone: "+234", line1: "2 Road", area: "Ikoyi", city: "Lagos", state: "Lagos", zoneId: "lagos-island" })
    expect(res.status).toBe("submitted")
    expect(api.store.db.orders.find((o) => o.id === session.orderId)!.status).toBe("awaiting_vendor_acceptance")
  })

  it("routes out-of-zone addresses to the sender without charging the recipient", async () => {
    const { session, token } = await sendUnknownAddressGift()
    const gs = await api.verifyGiftCode(token, (await api.sendGiftCode(token)).devCode!)
    const res = await api.submitGiftAddress(token, gs.token, { recipientName: "Kemi", phone: "+234", line1: "2 Road", area: "Wuse", city: "Abuja", state: "FCT", zoneId: "abuja-central" })
    expect(res.status).toBe("needs_sender_approval")
    expect(api.store.db.orders.find((o) => o.id === session.orderId)!.pricing.total).toBe(api.store.db.payments.find((p) => p.orderId === session.orderId)!.amount)
  })

  it("AC 13: declining runs cancellation and refund exactly once", async () => {
    const { session, token } = await sendUnknownAddressGift()
    const gs = await api.verifyGiftCode(token, (await api.sendGiftCode(token)).devCode!)
    await api.declineGift(token, gs.token, "")
    await expect(api.declineGift(token, gs.token, "")).rejects.toThrow()
    expect(api.store.db.refunds.filter((r) => r.orderId === session.orderId)).toHaveLength(1)
    expect(api.store.db.orders.find((o) => o.id === session.orderId)!.status).toBe("cancelled")
  })

  it("AC 07: anonymous gifts reveal no sender identity", async () => {
    const { token } = await sendUnknownAddressGift(true)
    const reveal = await api.getGiftReveal(token, "")
    expect(reveal.senderDisplayName).toBeNull()
    expect(JSON.stringify(reveal)).not.toContain("Test Buyer")
    const email = api.store.db.outbox.find((m) => m.to === "kemi.r@example.com" && m.kind === "gift_reveal")!
    expect(email.subject).not.toContain("Bola")
    expect(email.subject + email.body).not.toMatch(/hamper|celebration box|₦/i)
  })

  it("MOT 06: previews don't count as opening the gift", async () => {
    const { session, token } = await sendUnknownAddressGift()
    await api.switchPersona("guest")
    const order = await api.getOrder(session.orderId)
    const preview = await api.getGiftPreview(order.gift!.previewToken!)
    expect(preview.preview).toBe(true)
    expect((await api.getGiftEntry(token)).state).toBe("ready")
    expect(api.store.db.gifts.find((g) => g.orderId === session.orderId)!.openedAt).toBeNull()
  })
})

describe("vendor and operations", () => {
  it("AC 11: vendor A can't read vendor B's orders, and the attempt is logged", async () => {
    await api.switchPersona("usr_bisi")
    const other = api.store.db.orders.find((o) => o.vendorId !== "ven_bloom")!
    await expect(api.getVendorOrder(other.id)).rejects.toThrow()
    expect(api.store.db.audit[0].action).toBe("access_denied")
  })

  it("STF 09: storefront orders show in the vendor dashboard with source and type", async () => {
    await api.switchPersona("usr_bisi")
    const orders = await api.listVendorOrders({ source: "storefront" })
    expect(orders.length).toBeGreaterThan(0)
    expect(orders.every((o) => o.order.source === "storefront")).toBe(true)
    const pending = orders.find((o) => o.order.status === "awaiting_vendor_acceptance")!
    expect(pending.deliveryAddress).toBeNull()
    await api.vendorOrderAction(pending.order.id, "accept")
    expect((await api.getVendorOrder(pending.order.id)).deliveryAddress).not.toBeNull()
  })

  it("staff without catalogue scope can't edit products", async () => {
    await api.switchPersona("usr_tomi")
    await expect(api.listVendorProducts()).rejects.toThrow(/catalogue/)
    await expect(api.listVendorOrders({})).resolves.toBeTruthy()
  })

  it("AC 14: bank changes need re-authentication and hold payouts", async () => {
    await api.switchPersona("usr_bisi")
    let code = ""
    try {
      await api.requestBankChange({ bank: "Access", account: "0123456789", code: "" })
    } catch (e) {
      code = String((e as Error).message).match(/\d{6}/)![0]
    }
    await api.requestBankChange({ bank: "Access", account: "0123456789", code })
    expect((await api.getPayoutStatement()).bank.pendingChange).toBe(true)
  })

  it("AC 22-adjacent: suspension blocks purchases everywhere", async () => {
    await api.switchPersona("usr_kelechi")
    await api.reviewVendor("ven_hamper", "suspend", "Repeated late deliveries")
    await api.switchPersona("guest")
    await expect(api.createCheckout(draftFor("prd_kraft_treats"))).rejects.toThrow(/isn't taking new orders/)
    expect((await api.getStorefront("the-hamper-room")).kind).toBe("unavailable")
  })

  it("STF 11: old storefront slugs redirect", async () => {
    expect(await api.getStorefront("bisi-flowers")).toEqual({ kind: "redirect", slug: "bloom-and-bisi" })
  })
})

describe("operations team", () => {
  it("admins invite by email; the role is granted on verified sign-in and can be removed", async () => {
    await api.switchPersona("usr_kelechi")
    await api.inviteTeamMember({ email: "New.Ops@Example.com", role: "support", note: "Welcome!" })
    let team = await api.listTeam()
    expect(team.invites.map((i) => [i.email, i.role])).toEqual([["new.ops@example.com", "support"]])
    expect(api.store.db.outbox.some((m) => m.to === "new.ops@example.com" && m.kind === "team_invite")).toBe(true)
    await expect(api.inviteTeamMember({ email: "kelechi@justgifter.example", role: "support" })).rejects.toThrow(/already has/)

    await api.switchPersona("guest")
    const { devCode } = await api.signInWithEmail("new.ops@example.com")
    const joined = await api.verifyEmailCode("new.ops@example.com", devCode!)
    expect(joined.roles).toEqual(expect.arrayContaining(["customer", "support"]))
    expect(joined.roles).not.toContain("admin")
    await expect(api.listTeam()).rejects.toThrow(/access/)

    await api.switchPersona("usr_kelechi")
    team = await api.listTeam()
    expect(team.invites).toHaveLength(0)
    const member = team.members.find((m) => m.email === "new.ops@example.com")!
    await expect(api.setTeamRole(team.members.find((m) => m.isYou)!.userId, "none", "test")).rejects.toThrow(/your own access/)
    await api.setTeamRole(member.userId, "none", "Left the company")
    expect((await api.listTeam()).members.some((m) => m.email === "new.ops@example.com")).toBe(false)
    expect(api.store.db.audit.slice(0, 4).map((a) => a.action)).toEqual(expect.arrayContaining(["team.removed", "team.joined", "team.invited"]))
  })

  it("non-admins can't invite", async () => {
    await api.switchPersona("usr_ada")
    await expect(api.inviteTeamMember({ email: "x@example.com", role: "admin" })).rejects.toThrow(/access/)
  })
})

describe("vendor application: needs information", () => {
  it("the applicant replies with documents and the application goes back to review", async () => {
    api.store.db.users.push({ id: "usr_aso", name: "Aso Owner", email: "owner@aso.example", emailVerified: true, roles: ["customer", "vendor_owner"], vendorId: "ven_pending" })
    await api.switchPersona("usr_kelechi")
    await api.reviewVendor("ven_pending", "needs_information", "Send your CAC certificate.")

    await api.switchPersona("usr_aso")
    const ws = await api.getVendorWorkspace()
    expect(ws?.vendor.status).toBe("needs_information")
    await expect(api.uploadApplicationDocument(new File(["x"], "virus.exe", { type: "application/x-msdownload" }))).rejects.toThrow(/PDF, JPG or PNG/)
    const doc = await api.uploadApplicationDocument(new File(["%PDF-1.4 test"], "CAC certificate.pdf", { type: "application/pdf" }))
    await expect(api.respondToApplication({ message: "  ", documents: [] })).rejects.toThrow(/message or attach/)
    await api.respondToApplication({ message: "Here's our CAC certificate.", documents: [doc] })

    const after = await api.getVendorWorkspace()
    expect(after?.vendor.status).toBe("under_review")
    expect(after?.application?.responses).toHaveLength(1)
    expect(api.store.db.outbox.some((m) => m.to === "kelechi@justgifter.example" && /replied/.test(m.subject))).toBe(true)
    await expect(api.respondToApplication({ message: "again", documents: [] })).rejects.toThrow(/isn't waiting/)

    await api.switchPersona("usr_kelechi")
    expect(await api.getApplicationDocumentUrl("ven_pending", doc.path)).toMatch(/^data:application\/pdf/)
    await api.reviewVendor("ven_pending", "approve", "")
    expect((await api.listVendorsForReview()).find((r) => r.vendor.id === "ven_pending")?.vendor.status).toBe("approved")
  })

  it("the team can resume review after an off-platform reply", async () => {
    await api.switchPersona("usr_kelechi")
    await api.reviewVendor("ven_pending", "needs_information", "Send your CAC certificate.")
    await api.reviewVendor("ven_pending", "resume_review", "Received by email")
    expect((await api.listVendorsForReview()).find((r) => r.vendor.id === "ven_pending")?.vendor.status).toBe("under_review")
  })
})

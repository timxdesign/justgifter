import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Api, SessionUser } from "../types"
import { ApiError, type ApiErrorCode } from "../errors"
import { env } from "@/lib/env"

/**
 * Production backend: Supabase Auth for identity, and the `api` Edge Function for everything else
 * (it authorises each call and talks to Postgres with RLS enforced). Only the publishable anon key
 * is used here (TECH 02).
 */

const ACCESS_KEY = "jg-order-access"

let client: SupabaseClient | null = null
export function supabase() {
  client ??= createClient(env.supabaseUrl!, env.supabaseAnonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

function accessTokens(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(ACCESS_KEY) ?? "[]") as string[]
  } catch {
    return []
  }
}
function rememberAccess(token: string) {
  try {
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify([...new Set([...accessTokens(), token])].slice(-20)))
  } catch {
    /* ignore */
  }
}

async function call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data: session } = await supabase().auth.getSession()
  const res = await fetch(`${env.supabaseUrl}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseAnonKey!,
      Authorization: `Bearer ${session.session?.access_token ?? env.supabaseAnonKey}`,
    },
    body: JSON.stringify({ method, args: { ...args, accessTokens: accessTokens() } }),
  }).catch(() => {
    throw new ApiError("unavailable", "We couldn't reach JustGifter. Check your connection and try again.")
  })
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { code: ApiErrorCode; message: string } } | null
  if (!res.ok || body?.error) throw new ApiError(body?.error?.code ?? "unavailable", body?.error?.message ?? "Something went wrong. Try again.")
  return body!.data as T
}

export async function createSupabaseApi(): Promise<Api> {
  const sb = supabase()
  return {
    mode: "supabase",

    // ---------------------------------------------------------------- identity
    async getSession() {
      const { data } = await sb.auth.getSession()
      if (!data.session) return null
      return call<SessionUser | null>("getSession")
    },
    async signInWithEmail(email, next) {
      // The redirect is never followed (sign-in uses the code), but it tells the email hook why
      // the code was requested so the message can match. It must be in Auth → URL Configuration.
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true, emailRedirectTo: new URL(safeNext, location.origin).toString() },
      })
      // Same message either way to avoid account enumeration; only surface rate limits.
      if (error && /rate|seconds/i.test(error.message)) throw new ApiError("rate_limited", "Too many codes requested. Wait a minute before asking for another.")
      return {}
    },
    async verifyEmailCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" })
      if (error) throw new ApiError("invalid_code", "That code doesn't match or has expired. Request a new one.")
      const user = await call<SessionUser | null>("getSession")
      if (!user) throw new ApiError("unauthorised", "Sign-in didn't complete. Try again.")
      return user
    },
    async signOut() {
      await sb.auth.signOut()
      try {
        sessionStorage.removeItem(ACCESS_KEY)
      } catch {
        /* ignore */
      }
    },
    listPersonas: () => [],
    async switchPersona() {
      throw new ApiError("forbidden", "Personas are only available in demo mode.")
    },
    async resetDemo() {
      throw new ApiError("forbidden", "Reset is only available in demo mode.")
    },

    // ---------------------------------------------------------------- catalogue
    getHomeFeed: () => call("getHomeFeed"),
    listProducts: (q) => call("listProducts", q as Record<string, unknown>),
    getProduct: (idOrSlug) => call("getProduct", { idOrSlug }),
    getDeliveryQuote: (input) => call("getDeliveryQuote", input),
    listVendors: (input) => call("listVendors", input ?? {}),
    getStorefront: (slug) => call("getStorefront", { slug }),
    recordStoreVisit: (storefrontId, kind, productId) => call("recordStoreVisit", { storefrontId, kind, productId }),
    recommend: (req) => call("recommend", req as Record<string, unknown>),
    recordRecommendationFeedback: (sessionId, productId, helpful) => call("recordRecommendationFeedback", { sessionId, productId, helpful }),

    // ---------------------------------------------------------------- checkout
    previewCheckout: (draft) => call("previewCheckout", { draft }),
    async createCheckout(draft) {
      const session = await call<Awaited<ReturnType<Api["createCheckout"]>>>("createCheckout", { draft })
      rememberAccess(session.orderAccessToken)
      return session
    },
    getPaymentStatus: (reference) => call("getPaymentStatus", { reference }),
    async simulatePayment() {
      throw new ApiError("forbidden", "Test payments run on Paystack's sandbox in this environment.")
    },

    // ---------------------------------------------------------------- buyer
    requestOrderAccess: (email) => call("requestOrderAccess", { email }),
    async verifyOrderAccess(email, code) {
      const { accessToken } = await call<{ accessToken: string }>("verifyOrderAccess", { email, code })
      rememberAccess(accessToken)
    },
    listMyOrders: () => call("listMyOrders"),
    getOrder: (id) => call("getOrder", { id }),
    updateGift: (orderId, patch) => call("updateGift", { orderId, patch }),
    respondToRevisedQuote: (orderId, approve) => call("respondToRevisedQuote", { orderId, approve }),
    cancelOrder: (orderId, reason) => call("cancelOrder", { orderId, reason }),
    requestRefund: (orderId, reason, note) => call("requestRefund", { orderId, reason, note }),
    openCase: (input) => call("openCase", input),

    // ---------------------------------------------------------------- recipient
    getGiftEntry: (token) => call("getGiftEntry", { token }),
    sendGiftCode: (token) => call("sendGiftCode", { token }),
    verifyGiftCode: (token, code) => call("verifyGiftCode", { token, code }),
    getGiftReveal: (token, session) => call("getGiftReveal", { token, session }),
    getGiftPreview: (previewToken) => call("getGiftPreview", { previewToken }),
    markGiftOpened: (token, session) => call("markGiftOpened", { token, session }),
    submitGiftAddress: (token, session, address) => call("submitGiftAddress", { token, session, address }),
    declineGift: (token, session, reason) => call("declineGift", { token, session, reason }),
    sendThankYou: (token, session, note) => call("sendThankYou", { token, session, note }),
    reportGift: (token, session, input) => call("reportGift", { token, session, ...input }),

    // ---------------------------------------------------------------- host
    listMyEvents: () => call("listMyEvents"),
    createEvent: (input) => call("createEvent", { input }),
    getMyEvent: (id) => call("getMyEvent", { id }),
    saveEventDraft: (id, patch) => call("saveEventDraft", { id, patch }),
    publishEvent: (id) => call("publishEvent", { id }),
    setEventStatus: (id, status) => call("setEventStatus", { id, status }),
    setEventVisibility: (id, visibility) => call("setEventVisibility", { id, visibility }),
    setEventDeliveryAddress: (id, address) => call("setEventDeliveryAddress", { id, address }),
    setSurpriseMode: (id, enabled, revealDate) => call("setSurpriseMode", { id, enabled, revealDate }),
    addWishlistItem: (eventId, input) => call("addWishlistItem", { eventId, input }),
    updateWishlistItem: (eventId, itemId, patch) => call("updateWishlistItem", { eventId, itemId, patch }),
    removeWishlistItem: (eventId, itemId) => call("removeWishlistItem", { eventId, itemId }),
    composeEvent: (eventId, req) => call("composeEvent", { eventId, req }),
    getEventGifts: (eventId) => call("getEventGifts", { eventId }),
    inviteCoHost: (eventId, input) => call("inviteCoHost", { eventId, input }),
    revokeCoHost: (eventId, email) => call("revokeCoHost", { eventId, email }),
    getPublicEvent: (slug, inviteCode) => call("getPublicEvent", { slug, inviteCode }),
    holdWishlistItem: (slug, itemId, quantity) => call("holdWishlistItem", { slug, itemId, quantity }),
    releaseHold: (holdId) => call("releaseHold", { holdId }),

    // ---------------------------------------------------------------- vendor
    submitVendorApplication: (input) => call("submitVendorApplication", { input }),
    getVendorWorkspace: () => call("getVendorWorkspace"),
    getVendorDashboard: () => call("getVendorDashboard"),
    listVendorOrders: (filter) => call("listVendorOrders", { filter }),
    getVendorOrder: (id) => call("getVendorOrder", { id }),
    vendorOrderAction: (id, action, note) => call("vendorOrderAction", { id, action, note }),
    listVendorProducts: () => call("listVendorProducts"),
    saveVendorProduct: (input) => call("saveVendorProduct", { input }),
    updateStock: (productId, variantId, stock) => call("updateStock", { productId, variantId, stock }),
    archiveProduct: (productId) => call("archiveProduct", { productId }),
    saveStorefront: (input) => call("saveStorefront", { input }),
    setStorefrontStatus: (status) => call("setStorefrontStatus", { status }),
    getStorefrontAnalytics: (days) => call("getStorefrontAnalytics", { days }),
    getPayoutStatement: () => call("getPayoutStatement"),
    requestBankChange: (input) => call("requestBankChange", { input }),
    listStaff: () => call("listStaff"),
    inviteStaff: (input) => call("inviteStaff", { input }),
    removeStaff: (id) => call("removeStaff", { id }),
    updateVendorSettings: (input) => call("updateVendorSettings", { input }),
    async uploadApplicationDocument(file) {
      const { path, token, bucket } = await call<{ path: string; token: string; bucket: string }>("applicationDocumentUploadUrl", { type: file.type, size: file.size })
      const { error } = await sb.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type })
      if (error) throw new ApiError("unavailable", `${file.name} didn't upload. Try again.`)
      return { id: path, name: file.name, path, size: file.size, type: file.type }
    },
    respondToApplication: (input) => call("respondToApplication", { input }),

    async uploadMedia(blob, purpose) {
      const { path, token, bucket } = await call<{ path: string; token: string; bucket: string }>("uploadMediaUrl", { purpose })
      const { error } = await sb.storage.from(bucket).uploadToSignedUrl(path, token, blob, { contentType: "image/webp" })
      if (error) throw new ApiError("unavailable", "The photo didn't upload. Try again.")
      return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl
    },

    // ---------------------------------------------------------------- operations
    getOpsOverview: () => call("getOpsOverview"),
    listVendorsForReview: () => call("listVendorsForReview"),
    reviewVendor: (vendorId, decision, reason) => call("reviewVendor", { vendorId, decision, reason }),
    getApplicationDocumentUrl: async (vendorId, path) => (await call<{ url: string }>("getApplicationDocumentUrl", { vendorId, path })).url,
    listModerationQueue: () => call("listModerationQueue"),
    moderateListing: (productId, decision, note) => call("moderateListing", { productId, decision, note }),
    listAllOrders: (filter) => call("listAllOrders", { filter }),
    getAdminOrder: (id) => call("getAdminOrder", { id }),
    adminOrderAction: (id, action, note) => call("adminOrderAction", { id, action, note }),
    listRefunds: () => call("listRefunds"),
    refundAction: (refundId, action, note) => call("refundAction", { refundId, action, note }),
    listCases: () => call("listCases"),
    updateCase: (id, patch) => call("updateCase", { id, patch }),
    listReconciliation: () => call("listReconciliation"),
    listReports: () => call("listReports"),
    actionReport: (id, decision, note) => call("actionReport", { id, decision, note }),
    listAuditLog: () => call("listAuditLog"),
    listJobs: () => call("listJobs"),
    retryJob: (id) => call("retryJob", { id }),
    runDueJobs: () => call("runDueJobs"),
    listStorefrontsForModeration: () => call("listStorefrontsForModeration"),
    setStorefrontModeration: (storefrontId, action, reason) => call("setStorefrontModeration", { storefrontId, action, reason }),
    listTeam: () => call("listTeam"),
    inviteTeamMember: (input) => call("inviteTeamMember", { input }),
    revokeTeamInvite: (inviteId) => call("revokeTeamInvite", { inviteId }),
    setTeamRole: (userId, role, reason) => call("setTeamRole", { userId, role, reason }),
  }
}

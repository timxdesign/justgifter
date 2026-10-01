// Paystack webhook (PAY 04, §14). Authenticated by HMAC-SHA512 signature, deduplicated by event id
// inside `commit_verified_payment`, and cross-checked with the Verify Transaction API before any
// money-dependent state changes. Always answers 200 once recorded so Paystack stops retrying.
import { db } from "../_shared/db.ts"
import * as paystack from "../_shared/paystack.ts"
import { completeRefund, processVerifiedPayment } from "../_shared/commerce.ts"
import { sha256Hex } from "../_shared/domain/index.ts"

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })
  const raw = await req.text()
  if (!(await paystack.verifySignature(raw, req.headers.get("x-paystack-signature")))) {
    console.warn("rejected webhook with invalid signature")
    return new Response("Invalid signature", { status: 401 })
  }
  const event = JSON.parse(raw) as { event: string; data: Record<string, any> }
  // Paystack has no event id field; the payload hash is a stable dedupe key for replays.
  const eventId = `paystack:${event.event}:${event.data?.id ?? ""}:${(await sha256Hex(raw)).slice(0, 16)}`
  try {
    switch (event.event) {
      case "charge.success": {
        const verified = await paystack.verifyTransaction(event.data.reference)
        if (verified.status !== "success" || verified.currency !== "NGN") break
        await processVerifiedPayment(eventId, verified.reference, verified.amount, event)
        break
      }
      case "charge.failed": {
        const { data: p } = await db().from("payments").select("*").eq("reference", event.data.reference).maybeSingle()
        if (p?.status === "pending") {
          await db().from("payments").update({ status: "failed" }).eq("id", p.id)
          await db().from("orders").update({ payment_status: "failed" }).eq("id", p.order_id)
          await db().from("stock_holds").update({ status: "released" }).eq("order_id", p.order_id).eq("status", "active")
        }
        break
      }
      case "refund.processed": {
        const { data: r } = await db().from("refunds").select("id").eq("provider_reference", String(event.data.id ?? event.data.refund_reference ?? "")).maybeSingle()
        if (r) await completeRefund(r.id)
        break
      }
      case "refund.failed": {
        await db().from("refunds").update({ status: "failed", updated_at: new Date().toISOString() }).eq("provider_reference", String(event.data.id ?? ""))
        break
      }
    }
    return new Response("ok", { status: 200 })
  } catch (e) {
    console.error("webhook processing failed", e)
    // Non-2xx makes Paystack retry; processing is idempotent so a retry is safe.
    return new Response("retry", { status: 500 })
  }
})

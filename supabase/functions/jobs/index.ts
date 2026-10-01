// Scheduled worker (§14 Cron and Queues). Invoked every minute by pg_cron + pg_net (see
// supabase/cron.sql). Processes a bounded batch: expires holds/payments, runs due jobs with
// retry + backoff, delivers the notification outbox, and verifies stuck pending payments.
import { db } from "../_shared/db.ts"
import { env } from "../_shared/env.ts"
import { runJob, processVerifiedPayment } from "../_shared/commerce.ts"
import { deliverOutbox } from "../_shared/notify.ts"
import * as paystack from "../_shared/paystack.ts"

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== env.cronSecret()) return new Response("Forbidden", { status: 403 })
  const started = Date.now()
  await db().rpc("expire_holds_and_payments")

  const { data: jobs } = await db().rpc("claim_due_jobs", { p_limit: 50 })
  let done = 0
  for (const job of jobs ?? []) {
    try {
      await runJob(job.kind, job.payload)
      await db().from("jobs").update({ status: "done", last_error: null }).eq("id", job.id)
      done++
    } catch (e) {
      const backoff = new Date(Date.now() + 2 ** job.attempts * 60_000).toISOString()
      await db().from("jobs").update({ status: job.attempts >= 5 ? "failed" : "queued", run_at: backoff, last_error: String(e).slice(0, 300) }).eq("id", job.id)
    }
    if (Date.now() - started > 40_000) break
  }

  // Reconcile payments the webhook may have missed (provider outage, network).
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: pending } = await db().from("payments").select("reference").eq("status", "pending").lt("created_at", cutoff).limit(10)
  for (const p of pending ?? []) {
    try {
      const v = await paystack.verifyTransaction(p.reference)
      if (v.status === "success") await processVerifiedPayment(`reconcile:${p.reference}`, v.reference, v.amount, { source: "reconciliation" })
    } catch { /* still pending at the provider */ }
  }

  const sent = await deliverOutbox()
  return Response.json({ jobs: done, emails: sent, ms: Date.now() - started })
})

# Operations

How the platform runs once it's deployed: the scheduler, emails, payments and refunds. Plus a runbook for when something goes wrong.

## Scheduler (`jobs` Edge Function)

`pg_cron` calls `POST /functions/v1/jobs` **every minute** with the `x-cron-secret` header (see `supabase/cron.sql`). Each run is bounded to about 40 seconds and does the following, in order:

1. **Expire** lapsed holds and pending payments (`expire_holds_and_payments`). Orders move to `payment_expired` and their gift links are revoked.
2. **Claim due jobs**: up to 50 queued jobs whose `run_at` has passed, claimed with `FOR UPDATE SKIP LOCKED`.
3. **Run each job** (`runJob` in `_shared/commerce.ts`). A success marks the job `done`. A failure requeues it with exponential backoff (2^attempts minutes); after 5 attempts it is marked `failed`.
4. **Reconcile** up to 10 payments that have been `pending` for more than 2 minutes, by asking Paystack directly. This catches missed webhooks.
5. **Deliver the outbox** (up to 25 emails).

It returns `{ jobs, emails, ms }`, which you can see in the function logs.

### Job kinds

Every job has an idempotency key, so the same business event never schedules the same job twice.

| Kind | Scheduled when | What it does |
|---|---|---|
| `reveal_notification` | A gift is paid and its `revealAt` is in the future (`reveal:<gift>`) | Mints the gift link token and emails the recipient. |
| `claim_reminder` | An address-unknown gift is revealed (`claim-reminder:<gift>`) | 24 h before the claim deadline: reminds the recipient, unless they asked for no more contact. |
| `claim_expiry` | Same (`claim-expiry:<gift>`) | At the deadline, if there's still no address: expires the claim, then cancels and refunds the order. |
| `acceptance_timeout` | An order reaches `awaiting_vendor_acceptance` (`accept:<order>`) | If the vendor still hasn't accepted, declines the order and refunds the buyer. |
| `letter_delivery` | A letter is scheduled (or sent now, as a backstop) | Email letters: mints the reading link and emails the recipient. Link letters: just marks them `sent`, which unseals the link they already have. The update is conditional on `status = 'scheduled'`, so a cancel that races the job always wins. |
| `hold_expiry` | — | Reserved. Holds are expired by step 1 of every run. |
| `notification_retry` | — | Reserved. Outbox retries happen in step 5. The demo seeds one failed example for the jobs screen. |
| `reconciliation` | — | Reserved. Payment reconciliation happens in step 4. |

Staff can see and retry jobs at `/admin/jobs` (`listJobs`, `retryJob`), or run the scheduler immediately (`runDueJobs`).

### Adding a job kind

1. Add it to `JobKind` in `_shared/domain/types.ts`.
2. Handle it in `runJob` (`_shared/commerce.ts`) **and** in the demo scheduler (`runDueJobs` in `src/api/demo/commerce.ts`).
3. Schedule it with `enqueueJob(kind, runAt, idempotencyKey, payload)`, using a key derived from the business event.
4. Add a row to the table above. `npm run docs:check` checks for it.

## Email

There are two paths, and both use the same branded layout (`_shared/email/layout.ts`):

| Path | Used for | How |
|---|---|---|
| **Immediate** (`sendNow`) | One-time codes and Supabase Auth emails (`auth-email` hook) | Sent synchronously, so a plain code is never stored. If sending fails, the code is deleted and the user sees "try again". |
| **Outbox** (`enqueue` → `notifications` → `deliverOutbox`) | Gift reveals, letters, claim reminders, receipts, refunds, vendor new-order emails, host notices, team invites | Stored inside the business transaction and delivered by the worker. Up to 5 attempts. |

Rules:

- **Outside production nothing is sent.** Unless `SEND_REAL_EMAIL=true`, outbox messages are logged as `[mail suppressed outside production]` and marked `accepted`.
- Contacts in `blocked_contacts` are stored as `suppressed` and never sent.
- `accepted` means the SMTP relay took the message. It doesn't confirm inbox delivery. For bounces, check ZeptoMail's processed and bounce logs.
- Gift and letter emails never include the item, the price, an anonymous sender or the letter text.

## Payments (Paystack)

- `createCheckout` initialises a transaction. Its callback URL is `/checkout/confirm/<reference>`.
- The **webhook** (`paystack-webhook`) handles four events:

| Event | Handling |
|---|---|
| `charge.success` | Re-verified with the Verify Transaction API (status `success`, currency `NGN`), then `processVerifiedPayment`. |
| `charge.failed` | The pending payment and order are marked `failed`, and the holds are released. |
| `refund.processed` | `completeRefund`: marks the refund completed, posts the reversal ledger entries, emails the buyer. |
| `refund.failed` | The refund is marked `failed` (staff can resubmit). |

- The handler returns 200 once an event is recorded and 500 on unexpected errors, so Paystack retries. Every step is idempotent, so retries are safe.
- Refunds: the refund is created as `requested` (buyer) or `approved` (system and staff), submitted to the Paystack Refunds API (`submitted`), and completed by the webhook.

## Runbook

| Symptom | Where to look | Likely fix |
|---|---|---|
| "Confirming payment" never finishes | `payments` row for the reference; `paystack-webhook` logs | Check the webhook URL and secret key. The jobs worker reconciles pending payments after 2 minutes, so look at `jobs` logs too. |
| Buyer charged but order not paid | `/admin/reconciliation` (`unmatched` or `amount_mismatch`) | Match it manually or refund through Paystack. Then record an `adjustment`. |
| "Late payment conflict" support case | `/admin/cases` | Offer a funded alternative with the buyer's consent, or refund in full. |
| Recipient never got the gift email | `notifications` (status, `last_error`); `blocked_contacts`; ZeptoMail logs | Retry from `/admin/jobs`, or fix the SMTP secrets. Check that `SEND_REAL_EMAIL=true` in production. |
| Reveals or timeouts not happening | `cron.job_run_details`; `jobs` function logs; `/admin/jobs` | Check the Vault secrets `project_url` and `cron_secret`, and that `CRON_SECRET` matches. |
| Jobs stuck `failed` | `/admin/jobs` → `last_error` | Fix the cause, then **Retry**. |
| Staff can't open `/admin` | User has no TOTP factor (`aal1`) | They must enrol at `/mfa`. Grant roles with the team screen or the SQL in [SETUP.md](SETUP.md). |
| User sees "Reference abc12345" | `api` function logs, search for `[abc12345]` | That's the correlation id for the stack trace. |
| Rate-limited during testing | `LIMITED` in `api/index.ts` | Limits are per instance. Wait a minute. |

## Monitoring checklist

- Edge Function logs: `api`, `paystack-webhook`, `jobs`, `auth-email` (Supabase dashboard, or the MCP `get_logs`).
- Worker observability in Cloudflare (`observability.enabled` in `wrangler.jsonc`).
- `/admin` overview counts: overdue acceptance, unresolved claims, stuck refunds, failed jobs, unmatched payments, hold conflicts.
- Supabase advisors (security and performance) after every migration.

# Database

Postgres 17 on Supabase. The schema is defined only by the migrations in [`supabase/migrations`](../supabase/migrations). Don't change a production database through the dashboard.

## Security posture

- **RLS is enabled on every table.** Browsers hold only the anon key or a user JWT. They can read:
  - approved vendors, published storefronts, and active products and their variants. This public catalogue is also what the Cloudflare Worker reads for SEO.
  - their own profile.
  - their own orders as a buyer, or their organisation's **paid** orders as a vendor member.
  - their own events and wishlists as a host.
- **Everything else has no client policy.** That covers addresses, gifts, payments, ledger, OTPs, jobs, audit, letters and invites. Only the service role inside Edge Functions can reach it, and each handler authorises the caller first.
- Atomic SQL functions are `revoke`d from `anon` and `authenticated`, so they can't be called through `/rest/v1/rpc`.
- `private.my_vendor_ids()` is `SECURITY DEFINER` and lives in a schema the Data API doesn't expose.
- Every function has a pinned `search_path` (advisor lint 0011).
- `ledger_entries` has a trigger (`ledger_append_only`) that rejects updates and deletes.

## Tables

| Area | Table | Purpose |
|---|---|---|
| Identity | `profiles` | One row per auth user (created by the `handle_new_user` trigger). Holds `roles[]` and `vendor_id`. |
| | `platform_invites` | Operations-team invitations. One pending invite per email. Accepted on a verified sign-in. |
| | `otps` | Hashed one-time codes for order access, gift verification and bank changes. 10-minute expiry, 5 attempts. |
| | `order_access` | Guest access grants to orders. |
| Settings | `platform_settings` | Overrides for `DEFAULT_SETTINGS` (commission, holds, windows). |
| Vendors | `vendors` | The vendor organisation: status, zones and fees, operating calendar, fulfilment model. |
| | `vendor_applications` | Onboarding application, review notes, and `responses` (applicant replies with documents). |
| | `vendor_payout_accounts` | Bank details. Changes need re-authentication. |
| | `vendor_staff` | Members, with scopes `catalogue`, `orders` and `support`. |
| | `storefronts` | Branded store: slug plus slug history for redirects (guarded by `guard_storefront_slug`), layout, collections. |
| Catalogue | `products` | Listings. Full-text search index. Moderation status. |
| | `variants` | Price (kobo), SKU, stock. |
| Occasions | `events` | Occasion pages: draft and published content and design, visibility, surprise mode, co-hosts. |
| | `event_addresses` | The host's private delivery address. Never exposed to guests. |
| | `wishlist_items` | Desired and purchased quantity, priority, alternatives. |
| Commerce | `stock_holds` | Time-limited reservations (checkout and wishlist). |
| | `orders` | One vendor per order. Lines and pricing (JSON), status, timeline, source attribution, delivery. |
| | `order_addresses` | Delivery address, kept apart from `orders` so the vendor RLS policy can't reach it. |
| | `payments` | Payment attempts per order (reference, amount, expiry). |
| | `webhook_events` | Every processed provider event id. This is what makes replays idempotent. |
| | `revised_quotes` | A vendor-proposed price change awaiting buyer approval. |
| Gifts | `gifts` | Recipient, message (≤ 2,000 characters), reveal style and time, claim status, token hashes. |
| | `gift_sessions` | Short-lived recipient sessions after code verification. |
| Letters | `letters` | Stand-alone digital letters: recipient, body, schedule, status, token hash, `delivery` (`email` or `link`; link letters have no `recipient_email`), `design` and `moments` (jsonb, validated by the API, capped at 64 KB). Unique on `(sender_user_id, client_ref)`. |
| Money | `refunds` | Refund lifecycle and the provider reference. |
| | `ledger_entries` | Append-only financial record. Unique idempotency key. |
| | `payouts` | Vendor payouts. |
| | `reconciliation` | Provider payments matched to orders, unmatched, or with amount mismatches. |
| Support | `support_cases` | Damaged, missing, late, wrong item, personalisation error, chargeback, general. |
| | `content_reports` | Abuse and fraud reports from recipients and visitors. |
| | `blocked_contacts` | Contacts who asked never to be messaged again. The outbox suppresses them. |
| | `audit_events` | Who did what, including denied access attempts. |
| Platform | `jobs` | Scheduled work with retry and backoff (see [OPERATIONS.md](OPERATIONS.md)). |
| | `notifications` | Email outbox. |
| | `analytics_events` | Storefront visits, product views, checkout starts. |
| | `recommendation_sessions` | Gift-assistant sessions (preferences and source, no contacts). |
| | `recommendation_feedback` | Helpful or not helpful, per pick. |

## SQL functions

Defined in `20261001000100_commerce_functions.sql`. All are callable only by the service role.

| Function | What it does |
|---|---|
| `sellable_units(variant)` | Stock minus active holds. |
| `wishlist_remaining(item)` | Desired − purchased − active holds. |
| `create_stock_hold(...)` | Locks the variant (and wishlist item) row, checks availability, inserts a hold. Two concurrent sessions can't both get the last unit. |
| `commit_verified_payment(event_id, provider, payload, reference, amount)` | The single place stock is decremented. Records the event (a duplicate returns `duplicate`), checks the amount (otherwise `amount_mismatch` plus a reconciliation row), and locks variants in id order. It then either commits (`committed`) or records a late-payment `conflict`. |
| `restock_order(order)` | Cancellation before dispatch: returns stock, and restores wishlist quantity only if the item is still active. |
| `expire_holds_and_payments()` | Expires lapsed holds and payments, moves orders to `payment_expired`, and revokes their gift links. |
| `claim_due_jobs(limit)` | `FOR UPDATE SKIP LOCKED` batch claim, so concurrent workers never run a job twice. |

## Storage buckets

From `20261001000200_storage.sql` and `20261014090000_letter_studio.sql`:

| Bucket | Public | Limit | Types | Use |
|---|---|---|---|---|
| `product-media` | yes | 8 MB | webp, jpeg, png | Listing images. Uploaded through signed URLs after a vendor-scope check. |
| `storefront-media` | yes | 8 MB | webp, jpeg, png | Store covers. |
| `private-evidence` | no | 10 MB | images, pdf | Application documents (`applications/<vendor_id>/`) and support evidence. Read only through short-lived signed URLs. |
| `letter-media` | no | 8 MB | webp, jpeg, png | Letter photos (`<user_id>/img_….webp`). Uploaded by confirmed senders through signed URLs; read only through one-hour signed URLs when the recipient opens the letter. |

Images are re-encoded in the browser before upload, which strips EXIF (`src/lib/images.ts`).

## Migrations

| File | Contents |
|---|---|
| `20261001000000_core_schema.sql` | All core tables, indexes, RLS enablement, base policies, the signup trigger, the ledger trigger. |
| `20261001000100_commerce_functions.sql` | Holds, payment commit, restock, expiry, job claiming. |
| `20261001000200_storage.sql` | Storage buckets (no client policies; uploads and private reads go through signed URLs). |
| `20261001134213_harden_functions_and_policies.sql` | Advisor fixes: pinned `search_path`, revoked RPC access, `private.my_vendor_ids`, one policy per role and action. |
| `20261002144356_platform_team_invites.sql` | `platform_invites`. |
| `20261002171223_vendor_application_responses.sql` | `vendor_applications.responses`. |
| `20261004090000_digital_letters.sql` | `letters`. Raises the gift message limit to 2,000 characters. |
| `20261014090000_letter_studio.sql` | Letter `delivery`, `design` and `moments`; `recipient_email` becomes optional for link letters; private `letter-media` bucket. |

### Writing a migration

1. Create `supabase/migrations/<UTC timestamp>_<snake_name>.sql`. You can use `npx supabase migration new <name>`.
2. Start the file with a comment explaining why the change exists and who may read or write the data.
3. For a new table: `enable row level security`, then either add explicit policies or `revoke all ... from anon, authenticated` if it's service-role only.
4. For a new function: pin `search_path` and revoke `public`, `anon` and `authenticated` unless clients really need it.
5. Mirror any new columns in the row ↔ domain mappers in `supabase/functions/_shared/repo.ts` (or the feature's module) and in the demo `Store`.
6. Apply locally or to staging with `npx supabase db push`, then run `npx supabase` advisors (or the MCP `get_advisors`).
7. **Add the file to the table above**, and any new table to the tables list. `npm run docs:check` enforces both.
8. If the migration should run in CI's database job, check that the glob in `.github/workflows/ci.yml` matches it.

## Seed data

`src/data/seed-catalog.ts` is the single source for the starter catalogue. `npm run seed:sql` turns it into `supabase/seed.sql`. Load the seed into development and staging only.

## Scheduler

`supabase/cron.sql` registers a `pg_cron` job that calls the `jobs` Edge Function every minute through `pg_net`. The URL and secret come from Vault (`project_url`, `cron_secret`). Run it once per environment after deploying `jobs`. See [SETUP.md](SETUP.md#1-supabase).

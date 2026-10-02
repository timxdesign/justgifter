# Connecting JustGifter to real services

Do this once per environment (development, staging, production). Each environment gets its **own** Supabase project, Paystack keys and Cloudflare deployment — previews must never use production secrets or send real messages (PRD TECH 01).

## 1. Supabase

1. Create a project at supabase.com (region close to Lagos, e.g. `eu-west-2`).
2. Install the CLI and link: `npx supabase login && npx supabase link --project-ref <ref>`.
3. Apply the schema: `npx supabase db push` (runs everything in `supabase/migrations`).
4. Load the starter catalogue (staging/dev only): `npm run seed:sql && npx supabase db execute -f supabase/seed.sql` (or paste it into the SQL editor).
5. **Auth** (Dashboard → Authentication):
   - Providers → Email: enable, set OTP length 6. The app signs people in with emailed codes (no passwords).
   - URL configuration: Site URL `https://justgifter.com`; add staging and `http://127.0.0.1:5173` to redirect URLs (TECH 04).
   - Multi-factor: enable **TOTP**. Vendor owners, support and admins must complete it — the API rejects privileged calls without `aal2`.
   - Email templates: change the magic-link template to show `{{ .Token }}` so people receive a 6-digit code.
6. **Platform staff**: after your ops person signs in once, grant roles in SQL:
   `update profiles set roles = array['customer','admin','support'] where email = 'ops@justgifter.com';`
7. **Edge Functions**:
   ```bash
   cp supabase/.env.example supabase/.env      # fill in real values
   npx supabase secrets set --env-file supabase/.env
   npx supabase functions deploy api
   npx supabase functions deploy paystack-webhook --no-verify-jwt
   npx supabase functions deploy jobs --no-verify-jwt
   ```
8. **Scheduler**: enable the `pg_cron` and `pg_net` extensions, create the two Vault secrets described at the top of `supabase/cron.sql`, then run that file. The worker runs every minute.
9. **Frontend env**: copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable anon key only — never the service role key).

## 2. Paystack

1. Use **test keys** until launch. Put the secret key in `PAYSTACK_SECRET_KEY` (Edge Function secret only).
2. Dashboard → Settings → API Keys & Webhooks: set the webhook URL to
   `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`.
3. The callback URL is set per transaction (`/checkout/confirm/<reference>`); the page shows “Confirming payment” until the server has verified the charge with Paystack.
4. Refunds are submitted through the Refunds API and completed by the `refund.processed` webhook.
5. Before live payments: confirm the marketplace settlement model (subaccounts/splits), merchant of record and payout timing with Paystack and your advisers. The code records vendor payables in an append-only ledger and does **not** describe funds as escrow.

## 3. ZeptoMail (transactional email by Zoho)

1. In ZeptoMail, verify the `justgifter.com` domain (add the SPF/DKIM records it lists to your DNS, plus a DMARC record).
2. Mail Agents → your agent → SMTP: host `smtp.zeptomail.com`, port 465 (SSL), username `emailapikey`, password = the generated SMTP password.
3. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (any `@justgifter.com` sender). Set `SEND_REAL_EMAIL=true` **only in production**.
4. Supabase Auth emails: Dashboard → Authentication → SMTP → use the same ZeptoMail credentials.
5. The outbox records provider acceptance only; check ZeptoMail's processed/bounce logs for delivery.

## 4. Claude (gift assistant and page designer)

1. Create an API key at platform.claude.com and set `ANTHROPIC_API_KEY`.
2. Default model `claude-opus-5-5` at low effort with structured outputs and an 8-second timeout. Override with `AI_MODEL` after running your evaluation set (PRD §12).
3. Without a key, both features run on deterministic rules — browsing and templates never depend on AI.
4. The AI only sees preferences and eligible product titles/prices — never addresses, contacts or payment data — and every suggestion is re-validated against the live catalogue before display.

## 5. Cloudflare

1. `npx wrangler login`.
2. In `wrangler.jsonc`, set `PUBLIC_SITE_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` under `vars` (production) and `env.staging.vars` (staging). These are public values; the Worker only reads RLS-protected public data.
3. Build-time env: create `.env.production` with the `VITE_*` values, then `npm run deploy` (or `npm run build && npx wrangler deploy --env staging`).
4. Add your domain under Workers → Custom domains.
5. After deploying, verify (TECH 07): share a store and product link in WhatsApp to check previews; open a gift link and confirm `Cache-Control: no-store`; make a test payment and watch the webhook and reveal arrive.

## 6. Optional

- **Turnstile**: set `VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` when abuse on OTP or claim flows warrants a challenge. Per-IP rate limits are already applied in the API.
- **Sentry**: set `VITE_SENTRY_DSN` and add the Sentry SDK; scrub contacts, tokens and addresses in `beforeSend`.

## Launch checklist (PRD §18–19)

- [ ] Founder decisions in `docs/DECISIONS.md` confirmed and settings updated (`platform_settings`).
- [ ] Policies in `src/pages/help.tsx` reviewed by legal.
- [ ] Paystack live keys + settlement model approved.
- [ ] Backups and a restore rehearsal done; RPO/RTO measured.
- [ ] Pilot vendors approved, storefronts published, stock verified.
- [ ] End-to-end test in staging: signup, recovery, gift reveal, receipts, refunds.

## Automatic deploys from GitHub (Cloudflare Workers Builds)

Every push to `main` builds and deploys the site; other branches get a private preview version.

1. Cloudflare dashboard → Workers & Pages → **justgifter** → Settings → **Build** → Connect → GitHub → `timxdesign/justgifter`.
2. Production branch: `main`. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
   Non-production branch deploy command: `npx wrangler versions upload`.
3. Root directory: `/` (leave blank). No build variables are needed: public values come from `.env.production`.

Edge Functions and database migrations are not part of this build; deploy them with the Supabase CLI.

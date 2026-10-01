# JustGifter

Thoughtful gifts from trusted local vendors, occasion pages with wishlists that never double up, vendor storefronts, and a digital reveal for every gift. Built from `JustGifter_Product_Requirements.md` (v1.3).

**Stack:** Vite + React 19 + TypeScript · Tailwind v4 + shadcn/ui (Radix) · Solar Icons · TanStack Query · React Hook Form + Zod · Motion · Supabase (Postgres, Auth, Edge Functions, Storage, Cron) · Paystack · ZeptoMail SMTP · Claude API · Cloudflare Workers (static assets + edge metadata).

## Run it now (no accounts needed)

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

With no Supabase credentials the app runs an **in-browser demo backend** that enforces the same rules as production (stock holds, idempotent payments, ledger, scheduled reveals, claim windows, refunds). Use the **DEMO** button (bottom-left) to:

- **View as** — Adaeze (customer & host), Tunde (customer), Bisi (vendor owner), Tomi (vendor staff), Kelechi (platform ops), or a guest.
- **Inbox** — every email the platform would send. Gift links here open the real recipient experience.
- **System** — run scheduled jobs now, or reset the demo data.

Try: buy something as a gift → pay on the sandbox → open the recipient link from the inbox → open the reveal. Then switch to Bisi and accept an order, or to Kelechi and review a vendor.

## Connect the real services

See **[docs/SETUP.md](docs/SETUP.md)** — Supabase, Paystack, ZeptoMail, Claude, Cloudflare, step by step. Setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` switches the app to the real backend; nothing else in the UI changes.

## Project layout

```
src/
  api/types.ts            The API contract the UI codes against
  api/demo/               In-browser backend (demo/development)
  api/supabase/           Production adapter → Supabase Auth + `api` Edge Function
  app/                    Router, layouts, guards, demo panel
  components/             UI kit (shadcn/ui), commerce, reveal, event renderer, charts
  pages/                  Public, checkout, recipient, account, host, vendor, admin
supabase/
  functions/_shared/domain/   Pure business rules shared by browser AND Edge Functions
  functions/api/              RPC-style API (catalogue, orders, gifts, events, vendor, admin)
  functions/paystack-webhook/ Signed, idempotent payment + refund webhooks
  functions/jobs/             Cron worker: reveals, claim expiry, timeouts, outbox, reconciliation
  migrations/                 Schema, RLS, atomic SQL (holds, payment commit), storage buckets
  seed.sql                    Generated from src/data/seed-catalog.ts (`npm run seed:sql`)
worker/index.ts           Cloudflare Worker: SEO metadata/HTML for public pages, private-route headers
e2e/                      Playwright journeys (desktop + mobile)
```

The domain layer (`supabase/functions/_shared/domain`) holds pricing, delivery feasibility, eligibility, state machines, wishlist holds, recommendations, template validation, tokens and ledger rules. Both backends import it, so a rule changes in one place.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Vite + Cloudflare Worker runtime) |
| `npm run build` | Typecheck and production build |
| `npm test` | Domain unit tests + backend acceptance tests (Vitest) |
| `npx playwright test` | End-to-end journeys on desktop and mobile |
| `npm run seed:sql` | Regenerate `supabase/seed.sql` from the seed catalogue |
| `npm run deploy` | Build and deploy to Cloudflare |
| `./supabase/tests/commerce_test.sh` | Database concurrency & idempotency checks (needs Postgres) |

## What's verified

- **59 unit/integration tests** covering delivery promises, pricing, eligibility, state machines, holds, ledger, tokens and acceptance criteria AC 01–07, 11–14, 17–22 against the demo backend.
- **Database tests on real Postgres**: two concurrent sessions racing for the last unit (only one hold), replayed webhooks committing stock once, append-only ledger.
- **E2E (desktop + mobile)**: direct gift → payment → recipient reveal; wishlist purchase without exposing the host's address; storefront self-purchase with source attribution.
- Every route crawled as each persona with zero runtime errors (`node scripts/qa/crawl.mjs`).
- Edge Functions typecheck under Deno (`deno check`).

## Product decisions still open

Commission rate, dispute window, delivery fees and policy wording are placeholders pending founder and legal sign-off — see [docs/DECISIONS.md](docs/DECISIONS.md).

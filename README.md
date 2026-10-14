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

Try: buy something as a gift → pay on the sandbox → open the recipient link from the inbox → open the reveal. Or go to `/send` and write a letter. Then switch to Bisi and accept an order, or to Kelechi and review a vendor.

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
  lib/                    Query hooks, session, cart, send-gift conversation logic
  pages/                  Public, checkout, recipient, letters, account, host, vendor, admin
supabase/
  functions/_shared/domain/   Pure business rules shared by browser AND Edge Functions
  functions/api/              RPC-style API (catalogue, orders, gifts, letters, events, vendor, admin)
  functions/auth-email/       Supabase Auth Send Email hook (branded code emails)
  functions/paystack-webhook/ Signed, idempotent payment + refund webhooks
  functions/jobs/             Cron worker: reveals, claim expiry, timeouts, outbox, reconciliation
  migrations/                 Schema, RLS, atomic SQL (holds, payment commit), storage buckets
  seed.sql                    Generated from src/data/seed-catalog.ts (`npm run seed:sql`)
worker/index.ts           Cloudflare Worker: SEO metadata/HTML for public pages, private-route headers
e2e/                      Playwright journeys and accessibility checks (desktop + mobile)
docs/                     Project documentation (start at docs/README.md)
```

The domain layer (`supabase/functions/_shared/domain`) holds pricing, delivery feasibility, eligibility, state machines, wishlist holds, recommendations, template validation, tokens and ledger rules. Both backends import it, so a rule changes in one place.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Vite + Cloudflare Worker runtime) |
| `npm run build` | Typecheck and production build |
| `npm test` | Domain unit tests + backend acceptance tests (Vitest) |
| `npm run docs:check` | Checks the docs cover every API method, route, table, job, env var and script |
| `npx playwright test` | End-to-end journeys on desktop and mobile |
| `npm run seed:sql` | Regenerate `supabase/seed.sql` from the seed catalogue |
| `npm run deploy` | Build and deploy to Cloudflare |
| `./supabase/tests/commerce_test.sh` | Database concurrency & idempotency checks (needs Postgres) |

## What's verified

- **Unit and integration tests** (Vitest): delivery promises, pricing, eligibility, state machines, holds, ledger, tokens, the send conversation, and acceptance criteria run against the demo backend.
- **Database tests on real Postgres**: two concurrent sessions racing for the last unit get only one hold, replayed webhooks commit stock once, and the ledger is append-only.
- **E2E (desktop and mobile)**: direct gift → payment → recipient reveal; a wishlist purchase that never exposes the host's address; a storefront self-purchase with source attribution; letter and gift journeys through `/send`; axe accessibility checks.
- **Edge Functions** type-check under Deno (`deno check`).

Details are in [docs/TESTING.md](docs/TESTING.md).

## Documentation

Everything else is in **[docs/](docs/README.md)**: architecture, product journeys, business rules, API reference, database, frontend, operations runbook, security, testing and setup. The docs are kept in step with the code: `npm run docs:check` runs in CI, and a Claude Code hook flags code changes that need a doc update.

## Product decisions still open

Commission rate, dispute window, delivery fees and policy wording are placeholders pending founder and legal sign-off — see [docs/DECISIONS.md](docs/DECISIONS.md).

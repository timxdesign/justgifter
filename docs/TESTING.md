# Testing

| Layer | Tool | Where | Run |
|---|---|---|---|
| Domain rules | Vitest | `supabase/functions/_shared/domain/domain.test.ts` | `npm test` |
| Backend acceptance (demo backend) | Vitest | `src/api/demo/demo.test.ts` | `npm test` |
| Send conversation logic | Vitest | `src/lib/send-flow.test.ts` | `npm test` |
| End-to-end journeys | Playwright (desktop Chrome and Pixel 7) | `e2e/gifting.spec.ts`, `e2e/send.spec.ts` | `npx playwright test` |
| Accessibility | Playwright + axe (WCAG 2.2 AA) | `e2e/a11y.spec.ts` | `npx playwright test e2e/a11y.spec.ts` |
| Database concurrency and idempotency | bash + psql | `supabase/tests/commerce_test.sh` | `PSQL="psql <conn>" ./supabase/tests/commerce_test.sh` |
| Edge Function types | Deno | `supabase/functions/**` | `deno check --config supabase/functions/deno.json supabase/functions/*/index.ts` |
| Route crawl | Playwright script | `scripts/qa/crawl.mjs` | `node scripts/qa/crawl.mjs <outdir>` |
| Docs coverage | Node script | `scripts/check-docs.mjs` | `npm run docs:check` |

## What each suite proves

- **`domain.test.ts`**: delivery promises (cut-offs, lead days, blackout dates, capacity, time zones), pricing and settlement, eligibility codes, every state machine, holds and wishlist arithmetic, ledger idempotency, tokens, recommendations, template validation and letters.
- **`demo.test.ts`**: acceptance criteria (AC 01–07, 11–14, 17–22) run end to end against the demo backend. The demo uses the same domain layer, so these tests check the workflows that production follows.
- **`send-flow.test.ts`**: the `/send` conversation never asks the same question twice, letter-only senders never see gift questions, and editing an earlier answer keeps later ones.
- **`letter-studio.test.ts`**: per-step checks, switched-off moments, photo paths, the payload passing the shared validator, the Celebration rule, and the CSP allowing every music player the parser accepts.
- **`gifting.spec.ts`**:
  - direct gift → sandbox payment → recipient opens the reveal from the demo inbox.
  - a wishlist purchase that never exposes the host's address.
  - a storefront self-purchase with source attribution.
- **`send.spec.ts`**:
  - letter only: `/send` hands over to the studio → draft with help → sign in → email it → recipient opens it.
  - letter by link: moments (reasons, a song link checked live) → link shown once → recipient picks a reason and sees everything on the table.
  - gift: a detailed first message is understood, answers can be changed, and checkout is pre-filled.
- **`a11y.spec.ts`**: no serious or critical axe violations on key pages and on every occasion template. Manual keyboard and screen-reader passes are still required before launch.
- **`commerce_test.sh`**:
  - two concurrent sessions racing for the last unit get exactly one hold (AC 19).
  - a replayed webhook commits stock once (AC 03).
  - the ledger rejects updates.

## Rules for E2E

- Tests **always run against the demo backend**. `playwright.config.ts` starts Vite on port 5174 with `VITE_DEMO_MODE=true`, so the live Supabase project in `.env` is never touched.
- To test a deployed build, set `E2E_BASE_URL`. No local server is started.
- Use role and label selectors (`getByRole`, `getByLabel`). They double as accessibility checks.
- Reach recipient pages through the demo inbox or the outbox in `localStorage` (`jg-demo-db`), the same way a real recipient would get the link.

## CI (`.github/workflows/ci.yml`)

CI runs on every push to `main` and on every pull request.

| Job | Steps |
|---|---|
| `web` | `npm ci` → `npm run docs:check` → `npm run typecheck` → `npm test` → `npm run build` → Playwright (Chromium) |
| `edge-functions` | `deno check` on `api`, `paystack-webhook` and `jobs` |
| `database` | Postgres 17 service → Supabase stub → core, commerce and hardening migrations → seed → `commerce_test.sh` |

> The `database` job applies migrations by explicit glob. Later migrations (team invites, application responses, letters) and the storage migration aren't applied there yet. Widen the glob when a test needs them.

## When you change something

| You changed | Add or update |
|---|---|
| A domain rule | A case in `domain.test.ts` |
| An API workflow | An acceptance test in `demo.test.ts` |
| A user journey | A Playwright step or spec in `e2e/` |
| A new public page | Add it to `PAGES` in `a11y.spec.ts` |
| SQL holds or payments | `commerce_test.sh` |

# JustGifter documentation

JustGifter is a gifting marketplace for Nigeria. People buy gifts from trusted local vendors and can send them without knowing the recipient's address. Hosts run occasion pages with wishlists that never double up, vendors get branded storefronts, every gift comes with a digital reveal, and anyone can send a letter.

## Start here

| If you want to… | Read |
|---|---|
| Run the app in two minutes | [Root README](../README.md) |
| Understand how it fits together | [ARCHITECTURE.md](ARCHITECTURE.md) |
| See what the product does, journey by journey | [FEATURES.md](FEATURES.md) |
| Work on the code | [DEVELOPMENT.md](DEVELOPMENT.md) |

## Reference

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, the two backends, request and payment lifecycles, edge rendering. |
| [FEATURES.md](FEATURES.md) | Built journeys: gifting with and without an address, wishlists, storefronts, `/send` letters, vendor and admin workspaces. |
| [DOMAIN.md](DOMAIN.md) | Business rules: settings, money, ledger, holds, delivery, eligibility, state machines, gifts, letters, assistant, templates. |
| [API.md](API.md) | Every `Api` method with its access level, plus transport, errors and rate limits. |
| [DATABASE.md](DATABASE.md) | Tables, RLS posture, SQL functions, storage buckets, migrations, seed, cron. |
| [FRONTEND.md](FRONTEND.md) | `src/` layout, every route, data fetching, styling rules, demo mode and personas. |
| [OPERATIONS.md](OPERATIONS.md) | Scheduler and job kinds, email outbox, Paystack events, runbook, monitoring. |
| [SECURITY.md](SECURITY.md) | Access control, MFA, data minimisation, tokens, headers, secrets, abuse controls, AI safeguards. |
| [TESTING.md](TESTING.md) | Test layers, what each proves, E2E rules, CI. |
| [SETUP.md](SETUP.md) | Connecting Supabase, Paystack, ZeptoMail, Claude and Cloudflare; configuration reference; launch checklist. |
| [DECISIONS.md](DECISIONS.md) | Open founder decisions and where each placeholder lives. |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes. |
| [CREDITS.md](CREDITS.md) | Photography, icons, typefaces, UI libraries. |

The product intent is in [`JustGifter_Product_Requirements.md`](../JustGifter_Product_Requirements.md) (PRD v1.3). These docs describe what is **built**; the PRD describes what was **asked for**.

## Which doc to update

The docs are kept in step with the code. When you change something in the left column, update the doc on the right in the same change, and add a line to [CHANGELOG.md](CHANGELOG.md).

| You changed | Update |
|---|---|
| `src/api/types.ts`, `supabase/functions/api/*`, `src/api/supabase/*` | [API.md](API.md) |
| `supabase/functions/_shared/domain/*` | [DOMAIN.md](DOMAIN.md), and [DECISIONS.md](DECISIONS.md) if a placeholder moved |
| `supabase/migrations/*`, `supabase/cron.sql`, `src/data/seed-catalog.ts` | [DATABASE.md](DATABASE.md) |
| `src/app/router.tsx`, `src/pages/*`, `src/components/*`, `src/lib/*` | [FRONTEND.md](FRONTEND.md), plus [FEATURES.md](FEATURES.md) if a journey changed |
| `src/api/demo/*` | [FRONTEND.md](FRONTEND.md#demo-mode) (personas, inbox), [API.md](API.md) |
| `jobs`, `paystack-webhook`, `auth-email`, `_shared/{commerce,notify,letters,paystack,email}` | [OPERATIONS.md](OPERATIONS.md) |
| `_shared/{auth,http,team,ai}.ts`, `worker/index.ts` | [SECURITY.md](SECURITY.md), [ARCHITECTURE.md](ARCHITECTURE.md) |
| `e2e/*`, `*.test.ts`, `.github/workflows/*`, `supabase/tests/*` | [TESTING.md](TESTING.md) |
| `.env.example`, `supabase/.env.example`, `wrangler.jsonc`, `supabase/config.toml` | [SETUP.md](SETUP.md) |
| `package.json` scripts, `scripts/*` | [DEVELOPMENT.md](DEVELOPMENT.md) |

### How this is enforced

- **`npm run docs:check`** (`scripts/check-docs.mjs`) fails when the code defines something the owning doc doesn't name. It checks API methods, routes, tables, SQL functions, migrations, Edge Functions, job kinds, order statuses, env vars and npm scripts, and also catches broken relative links. It runs in CI before the tests.
- **Claude Code Stop hook** (`.claude/settings.json`): at the end of each turn it runs the same checks, and gives a one-time reminder that lists source files changed after the docs, with the doc each one maps to.
- **`CLAUDE.md`** tells Claude Code to treat doc updates as part of every change.

The checks can only see names, not meaning. If you change *how* something behaves, re-read the section that describes it.

## Writing style for these docs

- Describe what the code does today, and link to the file that does it.
- Prefer tables for reference material and numbered steps for procedures.
- Don't copy type definitions. Point to `types.ts`, which is commented and authoritative.
- Don't hard-code counts that drift (number of tests, products and so on).

# Development guide

## Prerequisites

- Node 24 (the version CI uses) and npm.
- Optional:
  - Deno 2 (to type-check Edge Functions)
  - the Supabase CLI (`npx supabase`), for a local stack or deploys
  - Docker, for `supabase start`
  - Postgres client tools, for `commerce_test.sh`

## Run it

```bash
npm install
npm run dev            # http://127.0.0.1:5173. Demo backend unless VITE_SUPABASE_* are set
```

Keep the dev server on **port 5173** (`strictPort`). The `api` Edge Function only accepts CORS from the origins in `ALLOWED_ORIGINS`.

To develop against a real backend, copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see [SETUP.md](SETUP.md)). To force the demo again without editing `.env`, run `VITE_DEMO_MODE=true npm run dev`.

### Local Supabase (optional)

```bash
npx supabase start                    # Postgres, Auth, Storage, Functions on :54321
npx supabase db reset                 # apply migrations + seed
npx supabase functions serve --env-file supabase/.env
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with the Cloudflare Worker runtime (`@cloudflare/vite-plugin`). |
| `npm run build` | Type-checks (`tsc -b`) and builds into `dist/`. |
| `npm run preview` | Serves the production build locally. |
| `npm run typecheck` | `tsc -b` only. |
| `npm test` | Vitest: domain, demo-backend acceptance and send-flow tests. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run docs:check` | Fails if the docs miss an API method, route, table, migration, job kind, env var or script, or contain a broken link. |
| `npm run seed:sql` | Regenerates `supabase/seed.sql` from `src/data/seed-catalog.ts`. |
| `npm run deploy` | Builds and runs `wrangler deploy` (Worker and static assets). |
| `npm run cf-typegen` | Regenerates `worker-configuration.d.ts` from `wrangler.jsonc`. |
| `npx playwright test` | E2E and accessibility tests (desktop and mobile), always against the demo backend. |
| `./supabase/tests/commerce_test.sh` | Database concurrency and idempotency checks (needs `PSQL`). |
| `node scripts/qa/crawl.mjs <outdir>` | Visits every route as each demo persona and reports runtime errors. |
| `node scripts/qa/flow.mjs <outdir>` | Screenshots the gift checkout and reveal flow (dev server on :5174). |
| `node scripts/shot.mjs <url> <out.png> [w] [h] [--full]` | Takes a screenshot. |
| `python3 scripts/fetch-media.py` | Re-downloads the Unsplash photography listed in [CREDITS.md](CREDITS.md). |

## Conventions

- **Business rules live in `supabase/functions/_shared/domain`.** They are pure TypeScript with `.ts` import suffixes, so Deno and Vite can share them. Every rule change gets a test in `domain.test.ts`. See [DOMAIN.md](DOMAIN.md).
- **The UI talks only to `src/api/types.ts`.** It never imports from `src/api/demo` or `src/api/supabase` directly.
- **The server decides.** Prices, stock, eligibility, delivery dates and permissions are computed on the server. Values in the client are display snapshots.
- **Money is integer kobo** (`Minor`). Percentages are basis points.
- **Errors are user-facing.** Raise `fail(code, "Plain-language message that says what to do")`. Anything else becomes a generic 500 with a correlation id.
- **Colours are semantic tokens** in `src/index.css` (contrast-checked). Icons come from `src/components/icons.ts`. UI primitives come from shadcn (`npx shadcn add`).
- **Motion** must have a reduced-motion path, and must never be the only signal of a state change.
- **Privacy by default.** Store hashes of tokens, never the tokens. Mask contacts. Keep addresses in their own tables. Give AI calls minimal context. See [SECURITY.md](SECURITY.md).
- Code comments cite PRD ids (for example `AC 03`, `TECH 04`) where a line exists because of a requirement.

## Recipes

### Add an API capability

The full checklist is in [API.md](API.md#adding-or-changing-a-method). In short, these files change:

```
src/api/types.ts  →  src/api/demo/api-<area>.ts  →  supabase/functions/api/<area>.ts  →  src/api/supabase/index.ts  →  docs/API.md
```

### Add a page

1. Create `src/pages/<area>/<name>.tsx` with a default export. Call `useDocumentMeta` (`src/lib/seo.ts`) for its title, and set `noindex` for private pages.
2. Register it in `src/app/router.tsx` under the right layout, with `RequireAuth` or `RequireRole` if needed.
3. If it's private, add its prefix to `PRIVATE` in `worker/index.ts`. If it's public and shareable, consider adding Worker metadata.
4. If it's public, add it to `PAGES` in `e2e/a11y.spec.ts`.
5. List it in [FRONTEND.md](FRONTEND.md#routes). `docs:check` enforces this.

### Change the schema

See [DATABASE.md](DATABASE.md#writing-a-migration).

### Add a scheduled job

See [OPERATIONS.md](OPERATIONS.md#adding-a-job-kind).

### Add an environment variable

1. Add it to `.env.example` (public, `VITE_*`) or `supabase/.env.example` (secret), with a comment.
2. Read it through `src/lib/env.ts` or `supabase/functions/_shared/env.ts`. Don't read `import.meta.env` or `Deno.env` anywhere else.
3. Document it in [SETUP.md](SETUP.md#configuration-reference).

### Change a placeholder business decision

Update the value where [DECISIONS.md](DECISIONS.md) says, then update that row.

## Keeping the docs current

Docs are part of the change, not a follow-up.

1. When you change behaviour, update the doc that owns it. The **source → doc map** is in [docs/README.md](README.md#which-doc-to-update).
2. Add a line to [CHANGELOG.md](CHANGELOG.md) under **Unreleased** for anything a user, operator or developer would notice.
3. Run `npm run docs:check`. CI runs it too and fails the build on gaps.
4. In Claude Code, a project **Stop hook** (`.claude/settings.json`) runs `node scripts/check-docs.mjs --hook` at the end of each turn. It feeds back coverage gaps, plus a one-time reminder listing the source files that changed after the docs did. `CLAUDE.md` tells Claude to update the docs as part of every change.

## Developer skills

Installed in project scope:

```bash
npx skills add jakubkrehel/skills   # better-accessibility, better-colors, better-interface, better-layout,
                                    # better-typography, better-ui, better-writing, break, explain-interface,
                                    # interface-review, variant
npx skills add shadcn/ui            # shadcn
```

The Supabase skills (`supabase`, `supabase-postgres-best-practices`) live in `.agents/skills` and are linked into `.claude/skills`. Exact revisions are pinned in `skills-lock.json`; run `npx skills experimental_install` to restore them.

The Supabase MCP server is configured in `.mcp.json`.

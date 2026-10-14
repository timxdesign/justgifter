# JustGifter: notes for Claude Code

Start with [docs/README.md](docs/README.md). It indexes every doc and has the **source → doc map**.

## Keep the docs current (required)

Documentation is part of every change, not a follow-up task.

1. When you change behaviour, structure, configuration or a workflow, update the doc that owns it in the same turn. The map is in [docs/README.md](docs/README.md#which-doc-to-update).
2. Add a line under **Unreleased** in [docs/CHANGELOG.md](docs/CHANGELOG.md) for anything a user, operator or developer would notice.
3. Run `npm run docs:check` before you finish. It must pass; CI enforces it.
4. The Stop hook (`node scripts/check-docs.mjs --hook`) may report coverage gaps or list files changed since the docs. Update the listed docs. If a change really needs no doc update (pure refactor, styling tweak), say so in one line and stop.
5. Describe what the code does now. Don't document plans, and don't hard-code counts that drift.

## Ground rules from the codebase

- Business rules go in `supabase/functions/_shared/domain` (pure TypeScript, `.ts` import suffixes), with a test in `domain.test.ts`.
- The UI talks only to `src/api/types.ts`. A new capability touches `types.ts`, `src/api/demo/api-*.ts`, `supabase/functions/api/*.ts` and `src/api/supabase/index.ts`.
- Every API handler authorises the caller itself. Route guards are for navigation only.
- Money is integer kobo. Store hashes of tokens, never the tokens. Mask contacts. Never put secrets in `VITE_*` variables.
- E2E tests run against the demo backend (`VITE_DEMO_MODE=true`), never the live Supabase project in `.env`.
- Verify with `npm run typecheck && npm test && npm run docs:check`, plus `npx playwright test` for UI journeys.

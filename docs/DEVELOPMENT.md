# Development notes

## Developer skills (PRD §14)

Installed in project scope with:

```bash
npx skills add jakubkrehel/skills   # all skills: better-accessibility, better-colors, better-interface, better-layout,
                                    # better-typography, better-ui, better-writing, break, explain-interface,
                                    # interface-review, variant
npx skills add shadcn/ui            # skill: shadcn
```

Exact source revisions are pinned in `skills-lock.json`. Run `npx skills experimental_install` to restore them.

## Conventions

- Business rules live in `supabase/functions/_shared/domain` (pure TypeScript, `.ts` import suffixes so Deno and Vite share it). Add a unit test in `domain.test.ts` with every rule change.
- The UI talks only to `src/api/types.ts`. A new capability means: add it to `Api`, implement it in `src/api/demo` and `supabase/functions/api`, map it in `src/api/supabase`.
- Colours are semantic tokens in `src/index.css` (contrast-checked); icons come from `src/components/icons.ts`.
- Motion must have a reduced-motion path and never be the only signal of a state change.

## QA scripts

- `node scripts/qa/crawl.mjs <outdir>` — visits every route as each demo persona and reports runtime errors.
- `node scripts/shot.mjs <url> <out.png> [w] [h] [--full]` — screenshots.

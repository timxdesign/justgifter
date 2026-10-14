#!/usr/bin/env node
// Keeps docs/ in step with the code.
//
//   node scripts/check-docs.mjs          Coverage checks (CI, `npm run docs:check`). Exit 1 on gaps.
//   node scripts/check-docs.mjs --hook   Claude Code Stop hook: coverage checks, plus a one-time
//                                        reminder when source files changed after the docs did.
//                                        Exit 2 feeds the message back to Claude.
//
// Coverage = every item the code defines (API methods, routes, tables, migrations, job kinds, env
// vars, npm scripts, order statuses, edge functions) is named in the doc that owns it, and every
// relative link in the docs resolves. See docs/README.md for the source → doc map.
import { execSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(join(root, p), "utf8")
const hook = process.argv.includes("--hook")

// ---------------------------------------------------------------- what the code defines

function apiMethods() {
  const src = read("src/api/types.ts")
  const body = src.slice(src.indexOf("export interface Api {"))
  const block = body.slice(0, body.indexOf("\n}\n"))
  return [...block.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1])
}

const routeSegments = () => [...read("src/app/router.tsx").matchAll(/path: "([^"]+)"/g)].map((m) => m[1])

const migrations = () => readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql"))

function sqlNames(re) {
  const names = new Set()
  for (const f of migrations()) for (const m of read(`supabase/migrations/${f}`).matchAll(re)) names.add(m[1])
  return [...names]
}

function unionMembers(file, typeName) {
  const src = read(file)
  const start = src.indexOf(`export type ${typeName} =`)
  const rest = src.slice(start + typeName.length + 14)
  const end = rest.search(/\n(export|interface|\/\*\*|\n)/)
  return [...rest.slice(0, end).matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
}

const edgeFunctions = () =>
  readdirSync(join(root, "supabase/functions"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)

function envKeys() {
  const keys = new Set()
  for (const f of [".env.example", "supabase/.env.example"]) {
    if (!existsSync(join(root, f))) continue
    for (const m of read(f).matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)) keys.add(m[1])
  }
  return [...keys]
}

const npmScripts = () => Object.keys(JSON.parse(read("package.json")).scripts ?? {})

// ---------------------------------------------------------------- checks

const has = (doc, name) => doc.includes("`" + name + "`")

const CHECKS = [
  { what: "API method", doc: "docs/API.md", items: apiMethods, ok: has },
  {
    what: "route",
    doc: "docs/FRONTEND.md",
    items: routeSegments,
    // Nested routes are documented with their full path; match on the last segment(s).
    ok: (doc, seg) => seg === "*" ? has(doc, "*") : [...doc.matchAll(/`(\/[^`]*)`/g)].some((m) => m[1] === `/${seg}` || m[1].endsWith(`/${seg}`)),
  },
  { what: "migration", doc: "docs/DATABASE.md", items: migrations, ok: has },
  { what: "table", doc: "docs/DATABASE.md", items: () => sqlNames(/create table public\.([a-z_]+)/g), ok: has },
  { what: "SQL function", doc: "docs/DATABASE.md", items: () => sqlNames(/create (?:or replace )?function (?:public|private)\.([a-z_]+)/g), ok: (doc, n) => doc.includes(n) },
  { what: "edge function", doc: "docs/ARCHITECTURE.md", items: edgeFunctions, ok: has },
  { what: "job kind", doc: "docs/OPERATIONS.md", items: () => unionMembers("supabase/functions/_shared/domain/types.ts", "JobKind"), ok: has },
  { what: "order status", doc: "docs/DOMAIN.md", items: () => unionMembers("supabase/functions/_shared/domain/types.ts", "OrderStatus"), ok: (doc, n) => doc.includes(n) },
  { what: "env var", doc: "docs/SETUP.md", items: envKeys, ok: has },
  { what: "npm script", doc: "docs/DEVELOPMENT.md", items: npmScripts, ok: (doc, n) => doc.includes(`npm run ${n}`) || (n === "test" && doc.includes("npm test")) },
]

function brokenLinks() {
  const files = ["README.md", "CLAUDE.md", ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)]
  const problems = []
  for (const f of files) {
    if (!existsSync(join(root, f))) continue
    const text = read(f).replace(/```[\s\S]*?```/g, "")
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split("#")[0]
      if (!target || /^[a-z]+:/i.test(target)) continue
      if (!existsSync(resolve(join(root, dirname(f)), target))) problems.push(`${f} → ${m[1]}`)
    }
  }
  return problems
}

function coverageProblems() {
  const problems = []
  for (const c of CHECKS) {
    const doc = existsSync(join(root, c.doc)) ? read(c.doc) : ""
    const missing = c.items().filter((n) => !c.ok(doc, n))
    if (missing.length) problems.push(`${c.doc} doesn't mention ${missing.length} ${c.what}${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`)
  }
  const links = brokenLinks()
  if (links.length) problems.push(`Broken doc links:\n    ${links.join("\n    ")}`)
  return problems
}

// ---------------------------------------------------------------- staleness (hook mode)

// Which doc owns which code. Mirrors the table in docs/README.md.
const OWNERS = [
  [/^src\/api\/types\.ts$|^src\/api\/supabase\/|^supabase\/functions\/api\//, "docs/API.md"],
  [/^supabase\/functions\/_shared\/domain\//, "docs/DOMAIN.md"],
  [/^supabase\/migrations\/|^supabase\/cron\.sql$|^supabase\/seed\.sql$|^src\/data\//, "docs/DATABASE.md"],
  [/^src\/app\/|^src\/pages\/|^src\/components\/|^src\/lib\/|^src\/index\.css$/, "docs/FRONTEND.md, docs/FEATURES.md"],
  [/^src\/api\/demo\//, "docs/FRONTEND.md (demo mode), docs/API.md"],
  [/^supabase\/functions\/(jobs|paystack-webhook|auth-email)\/|^supabase\/functions\/_shared\/(commerce|notify|letters|paystack|email\/)/, "docs/OPERATIONS.md"],
  [/^supabase\/functions\/_shared\/(auth|http|team|ai)\.ts$|^worker\//, "docs/SECURITY.md, docs/ARCHITECTURE.md"],
  [/^e2e\/|\.test\.tsx?$|^\.github\/|^playwright\.config|^vitest\.config|^supabase\/tests\//, "docs/TESTING.md"],
  [/\.env\.example$|^wrangler\.jsonc$|^supabase\/config\.toml$/, "docs/SETUP.md"],
  [/^package\.json$|^scripts\/|^vite\.config/, "docs/DEVELOPMENT.md"],
]
const IGNORED = /^docs\/|\.md$|^dist\/|^test-results\/|^node_modules\/|^\.wrangler\/|^\.claude\/|^\.agents\/|^public\/|package-lock\.json$|worker-configuration\.d\.ts$|\.docx$/

function staleness() {
  let gitDir, status
  try {
    gitDir = execSync("git rev-parse --git-dir", { cwd: root, encoding: "utf8" }).trim()
    status = execSync("git status --porcelain --untracked-files=all", { cwd: root, encoding: "utf8" })
  } catch {
    return null
  }
  const ackFile = resolve(root, gitDir, "docs-check-ack")
  const mtime = (p) => { try { return statSync(join(root, p)).mtimeMs } catch { return 0 } }
  const docsTime = Math.max(...readdirSync(join(root, "docs")).map((f) => mtime(`docs/${f}`)), existsSync(ackFile) ? statSync(ackFile).mtimeMs : 0)
  const changed = status.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, "")).filter((p) => !IGNORED.test(p))
  const newer = changed.filter((p) => mtime(p) > docsTime)
  if (!newer.length) return null
  writeFileSync(ackFile, new Date().toISOString())
  const lines = newer.slice(0, 25).map((p) => `  - ${p}${OWNERS.find(([re]) => re.test(p)) ? `  → ${OWNERS.find(([re]) => re.test(p))[1]}` : ""}`)
  return `Code changed after the docs were last updated:\n${lines.join("\n")}${newer.length > 25 ? `\n  …and ${newer.length - 25} more` : ""}\n\nUpdate the docs these changes affect (see the map in docs/README.md) and add a line to docs/CHANGELOG.md under "Unreleased". If nothing user- or developer-visible changed, say so and stop; this reminder won't repeat for these edits.`
}

// ---------------------------------------------------------------- main

if (hook) {
  let input = ""
  try { input = readFileSync(0, "utf8") } catch { /* no stdin */ }
  let payload = {}
  try { payload = JSON.parse(input || "{}") } catch { /* not JSON */ }
  if (payload.stop_hook_active) process.exit(0)
  const problems = coverageProblems()
  const stale = staleness()
  if (!problems.length && !stale) process.exit(0)
  const parts = []
  if (problems.length) parts.push(`Docs coverage check failed (npm run docs:check):\n- ${problems.join("\n- ")}`)
  if (stale) parts.push(stale)
  process.stderr.write(parts.join("\n\n") + "\n")
  process.exit(2)
}

const problems = coverageProblems()
if (problems.length) {
  console.error(`Docs are out of date:\n- ${problems.join("\n- ")}\n\nUpdate the listed docs (map in docs/README.md), then run npm run docs:check again.`)
  process.exit(1)
}
console.log(`Docs cover the code (${CHECKS.length} checks + links).`)

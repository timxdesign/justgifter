// Visits every route as the relevant persona and reports runtime errors. Usage: node scripts/qa/crawl.mjs <outdir>
import { chromium } from "@playwright/test"
const out = process.argv[2]
const BASE = "http://127.0.0.1:5174"
const routes = {
  guest: ["/", "/shop", "/occasions/wedding", "/shop?q=roses", "/products/velvet-red-roses", "/assistant", "/vendors", "/occasion-pages", "/help", "/policies/returns", "/sell", "/cart", "/signin", "/orders/access", "/stores/bloom-and-bisi", "/stores/bloom-and-bisi/products/velvet-red-roses", "/stores/bisi-flowers", "/stores/ink-and-page", "/e/tolu-and-kunle", "/e/welcoming-chidera", "/nope"],
  usr_ada: ["/account", "/account/saved", "/account/settings", "/events", "/events/new", "/events/evt_baby_chidera/edit", "/vendor/apply"],
  usr_bisi: ["/vendor", "/vendor/orders", "/vendor/products", "/vendor/products/new", "/vendor/products/prd_velvet_roses", "/vendor/storefront", "/vendor/analytics", "/vendor/payouts", "/vendor/staff", "/vendor/settings"],
  usr_kelechi: ["/admin", "/admin/vendors", "/admin/listings", "/admin/storefronts", "/admin/orders", "/admin/refunds", "/admin/cases", "/admin/reconciliation", "/admin/reports", "/admin/templates", "/admin/jobs", "/admin/audit"],
}
const browser = await chromium.launch()
let failures = 0
for (const [persona, list] of Object.entries(routes)) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  await page.goto(BASE + "/"); await page.waitForTimeout(800)
  await page.evaluate((id) => { const db = JSON.parse(localStorage.getItem("jg-demo-db")); db.sessionUserId = id === "guest" ? null : id; localStorage.setItem("jg-demo-db", JSON.stringify(db)) }, persona)
  for (const r of list) {
    const errs = []
    const onErr = (e) => errs.push(e.message ?? e)
    const onCon = (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()) }
    page.on("pageerror", onErr); page.on("console", onCon)
    await page.goto(BASE + r, { waitUntil: "networkidle" }).catch((e) => errs.push(String(e)))
    await page.waitForTimeout(700)
    const h1 = await page.locator("h1").first().textContent({ timeout: 2000 }).catch(() => "(no h1)")
    const name = (persona + r).replace(/[^a-z0-9]+/gi, "_")
    if (out) await page.screenshot({ path: `${out}/${name}.png` })
    page.off("pageerror", onErr); page.off("console", onCon)
    if (errs.length) failures++
    console.log(`${errs.length ? "✗" : "✓"} [${persona}] ${r} — ${h1?.trim().slice(0, 50)}${errs.length ? "\n    " + errs.slice(0, 3).join("\n    ") : ""}`)
  }
  await page.close()
}
await browser.close()
console.log(failures ? `${failures} routes with errors` : "ALL ROUTES CLEAN")

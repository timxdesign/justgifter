// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [--full] [--dark] [--click=selector]... [--wait=ms] [--persona=id] [--eval=js]
import { chromium } from "@playwright/test"
const [, , url, out, w = "1440", h = "900", ...rest] = process.argv
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=") || true] }))
const clicks = rest.filter((a) => a.startsWith("--click=")).map((a) => a.slice(8))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: flags.dark ? "dark" : "light", reducedMotion: flags.reduced ? "reduce" : "no-preference" })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()) })
if (flags.persona) {
  await page.goto(new URL("/", url).toString(), { waitUntil: "networkidle" })
  await page.evaluate(async (id) => { const db = JSON.parse(localStorage.getItem("jg-demo-db")); db.sessionUserId = id === "guest" ? null : id; localStorage.setItem("jg-demo-db", JSON.stringify(db)) }, flags.persona)
}
await page.goto(url, { waitUntil: "networkidle" })
await page.waitForTimeout(+(flags.wait ?? 1200))
for (const c of clicks) { await page.click(c); await page.waitForTimeout(+(flags.after ?? 900)) }
if (flags.full) {
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } window.scrollTo(0, 0) })
  await page.waitForTimeout(800)
}
if (flags.eval) { console.log(await page.evaluate(flags.eval)) }
await page.screenshot({ path: out, fullPage: !!flags.full })
if (errors.length) console.log(errors.join("\n"))
await browser.close()

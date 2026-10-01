import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

// WCAG 2.2 AA automated checks on the main customer surfaces (PRD §16). Manual keyboard and
// screen-reader passes are still required before launch.
const PAGES = ["/", "/shop", "/products/velvet-red-roses", "/assistant", "/stores/bloom-and-bisi", "/occasion-pages", "/help", "/signin", "/cart"]

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(2500) // let entrance animations finish so contrast is measured on final colours
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([])
  })
}

test("occasion pages pass in every template", async ({ page }) => {
  for (const slug of ["tolu-and-kunle", "ada-turns-30"]) {
    await page.goto(`/e/${slug}`)
    await page.getByRole("button", { name: "Open without animation" }).click()
    await page.waitForTimeout(1500)
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    expect(serious.map((v) => `${slug} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([])
  }
})

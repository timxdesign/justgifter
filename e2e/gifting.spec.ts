import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
})

test("direct gift: product → checkout → verified payment → recipient opens reveal", async ({ page }) => {
  await page.goto("/products/the-celebration-box")
  await page.getByRole("button", { name: "Send as a gift" }).click()
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible()

  await page.getByLabel("Their name").fill("Tolu")
  await page.getByLabel("Their email or phone").fill("tolu.e2e@example.com")
  await page.getByRole("button", { name: "Continue to delivery" }).click()
  await page.getByLabel("Their phone, for the rider").fill("+234 803 555 0192")
  await page.getByLabel("Street address").fill("7 Bourdillon Road")
  await page.getByRole("combobox", { name: /^Area in/ }).click()
  await page.getByRole("option").first().click()
  await page.getByRole("button", { name: "Continue to gift message" }).click()
  await page.getByLabel("Your message").fill("Happy birthday!")
  await page.getByRole("button", { name: "Continue to your details" }).click()
  await page.getByLabel("Your name").fill("Ada Test")
  await page.getByLabel("Email for your receipt").fill("ada.e2e@example.com")
  await page.getByRole("button", { name: /^Pay ₦/ }).click()

  await expect(page.getByText("Sandbox — no money moves")).toBeVisible()
  await page.getByRole("button", { name: /^Pay ₦/ }).click()
  await expect(page.getByText("Payment confirmed", { exact: true })).toBeVisible({ timeout: 15_000 })

  const link = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("jg-demo-db")!)
    return db.outbox.find((m: { to: string; kind: string }) => m.to === "tolu.e2e@example.com" && m.kind === "gift_reveal")?.link.href
  })
  expect(link).toMatch(/^\/g\//)
  await page.goto(link)
  await expect(page.getByRole("heading", { name: /A gift for Tolu/ })).toBeVisible()
  await page.getByRole("button", { name: "Open without animation" }).click()
  await expect(page.getByText("Happy birthday!")).toBeVisible()
  await expect(page.getByText("₦")).toHaveCount(0) // price never shown to recipient
})

test("wishlist: guest buys from an occasion page without seeing the host's address", async ({ page }) => {
  await page.goto("/e/tolu-and-kunle")
  await page.getByRole("button", { name: "Open without animation" }).click()
  await expect(page.getByRole("heading", { name: "Wishlist" })).toBeVisible()
  await expect(page.getByText("Bourdillon")).toHaveCount(0)
  await page.getByRole("button", { name: "Give this gift" }).first().click()
  await expect(page.getByText("We're holding this for you")).toBeVisible()
  await expect(page.getByText(/Their address is private/)).toBeVisible()
  await page.getByRole("button", { name: "Continue to gift message" }).click()
  await page.getByLabel("Your message").fill("Congratulations!")
  await page.getByRole("button", { name: "Continue to your details" }).click()
  await page.getByLabel("Your name").fill("Guest Buyer")
  await page.getByLabel("Email for your receipt").fill("guest.e2e@example.com")
  await page.getByRole("button", { name: /^Pay ₦/ }).click()
  await page.getByRole("button", { name: /^Pay ₦/ }).click()
  await expect(page.getByText("Payment confirmed", { exact: true })).toBeVisible({ timeout: 15_000 })
})

test("storefront: self purchase needs no gift details and reaches the vendor with its source", async ({ page }) => {
  await page.goto("/stores/bloom-and-bisi/products/sunshine-sunflower-box?ref=instagram")
  await page.getByRole("button", { name: "Order for myself" }).click()
  await expect(page.getByText("Gift message")).toHaveCount(0)
  await page.getByLabel("Full name").fill("Self Buyer")
  await page.getByLabel("Phone for the rider").fill("+234 803 555 0100")
  await page.getByLabel("Street address").fill("5 Test Road")
  await page.getByRole("combobox", { name: /^Area in/ }).click()
  await page.getByRole("option").first().click()
  await page.getByRole("button", { name: "Continue to contact" }).click()
  await page.getByLabel("Email for your receipt").fill("self.e2e@example.com")
  await page.getByRole("button", { name: /^Pay ₦/ }).click()
  await page.getByRole("button", { name: /^Pay ₦/ }).click()
  await expect(page.getByText("Payment confirmed", { exact: true })).toBeVisible({ timeout: 15_000 })
  const order = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("jg-demo-db")!)
    return db.orders.find((o: { buyerEmail: string }) => o.buyerEmail === "self.e2e@example.com")
  })
  expect(order.source).toBe("storefront")
  expect(order.campaign).toBe("instagram")
  expect(order.purchaseType).toBe("self")
  expect(order.giftId).toBeNull()
})

import { expect, test, type Page } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
})

const demoDb = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("jg-demo-db")!))

test("letter only: the assistant hands over to the studio → draft → sign in → email it → recipient reads it", async ({ page }) => {
  await page.goto("/")
  // The demo starts signed in as a persona; sign out to exercise confirming the sender's email.
  await page.getByRole("button", { name: /^Account menu/ }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page.getByRole("button", { name: /^Account menu/ })).toHaveCount(0)
  await page.goto("/send")
  await page.getByRole("radio", { name: /Just a letter/ }).click()
  await expect(page).toHaveURL(/\/send\/letter$/)
  // The old page stays up while the studio's code loads; wait for the studio itself.
  await expect(page.getByRole("heading", { name: /Write a letter they'll open/ })).toBeVisible()

  // Cover: who it's for and how it looks. Nothing about budgets, products or delivery addresses.
  await page.getByLabel("Their name").fill("Ada")
  await page.getByLabel("Sign it as").fill("Tolu")
  await page.getByRole("button", { name: "Birthday", exact: true }).click()
  await page.getByRole("button", { name: "Next", exact: true }).click()

  // Moments: only the letter is required. Next without it goes straight to the letter.
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(page.getByText("Write the letter first. Everything else is optional.")).toBeVisible()
  await page.getByLabel("What do you want them to know or feel?").fill("how proud I am of everything you did this year")
  await page.getByRole("radio", { name: "Heartfelt" }).click()
  await page.getByRole("button", { name: "Write a draft" }).click()
  const body = page.getByLabel(/Your letter/)
  await expect(body).toHaveValue(/Dear Ada,/, { timeout: 10_000 })
  await expect(body).toHaveValue(/I want you to know how proud I am of everything you did this year\./)
  await page.getByRole("button", { name: "Next", exact: true }).click()

  // Send: by email, after confirming the sender's address.
  await page.getByRole("radio", { name: /Email it to them/ }).click()
  await page.getByLabel("Their email").fill("ada.letter@example.com")
  await page.getByLabel("Your email").fill("tolu.sender@example.com")
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.getByRole("button", { name: "Send code" }).click()
  await expect.poll(async () => (await demoDb(page)).otps.length).toBeGreaterThan(0)
  const code: string = (await demoDb(page)).otps.at(-1).code
  await page.getByLabel(/Enter the code/).fill(code)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page.getByRole("heading", { name: /Letter sent/ })).toBeVisible()

  const link = (await demoDb(page)).outbox.find((m: { to: string; kind: string }) => m.to === "ada.letter@example.com" && m.kind === "letter")?.link.href
  expect(link).toMatch(/^\/l\//)
  await page.goto(link)
  // Birthday letters open as a gift box.
  await page.getByRole("button", { name: "Pull the ribbon", exact: true }).click({ force: true })
  await expect(page.getByText(/proud I am of everything you did this year/)).toBeVisible()
})

test("letter by link: moments, a shareable link, and the recipient walks the table", async ({ page }) => {
  await page.goto("/send/letter")
  await page.getByLabel("Their name").fill("Ada")
  await page.getByLabel("Sign it as").fill("Tolu")
  await page.getByRole("button", { name: "Next", exact: true }).click()

  await page.getByRole("button", { name: /^The letter/ }).click()
  await page.getByLabel(/Your letter/).fill("Dear Ada,\n\nThank you for this year.")
  await page.getByRole("button", { name: /^Next: What I love/ }).click()
  await page.getByLabel("Add to reasons").fill("Your laugh")
  await page.keyboard.press("Enter")
  await page.getByRole("button", { name: "How safe I feel with you" }).click()
  await page.getByRole("button", { name: "All moments" }).click()
  await page.getByRole("button", { name: /^Our song/ }).click()
  await page.getByLabel("Song link").fill("https://example.com/not-a-song")
  await expect(page.getByText(/isn't from Spotify, YouTube, Apple Music or Audiomack/)).toBeVisible()
  await page.getByLabel("Song link").fill("https://youtu.be/dQw4w9WgXcQ")
  await expect(page.getByText("YouTube link. They'll press play to listen.")).toBeVisible()
  await page.getByRole("button", { name: "Next", exact: true }).click()

  // A link letter is the default; the link is shown once.
  await page.getByRole("button", { name: "Create link" }).click()
  await expect(page.getByRole("heading", { name: /Your letter is ready/ })).toBeVisible()
  const url = await page.locator("p.font-mono").first().textContent()
  expect(url).toMatch(/\/l\/[\w-]{20,}$/)

  await page.goto(url!)
  await page.getByRole("button", { name: "Open the letter" }).last().click({ force: true })
  await expect(page.getByText("Thank you for this year.")).toBeVisible()
  await page.getByRole("button", { name: /^Next/ }).click()
  await expect(page.getByRole("button", { name: "Reason 1" })).toBeVisible()
  // Read the reasons as a list: the same content, without waiting on the bouquet's animation.
  await page.getByRole("button", { name: "Read them all" }).click()
  await expect(page.getByText("Your laugh")).toBeVisible()
  await page.getByRole("button", { name: "See everything on the table" }).click()
  await expect(page.getByRole("heading", { name: "Everything on this table is yours" })).toBeVisible()
  await expect(page.getByRole("button", { name: "The letter (seen)" })).toBeVisible()
  await expect(page.getByRole("button", { name: "What I love (seen)" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Our song", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Write a letter" })).toBeVisible()
})

test("gift with a letter: described in words → ideas → letter → checkout → recipient opens the gift and its letter", async ({ page }) => {
  await page.goto("/send")
  await page.getByLabel("Describe the gift").fill("I need a birthday gift for my sister Ada under ₦50,000 in Lekki")
  await page.getByRole("button", { name: "Fill it in" }).click()
  await expect(page.getByText(/Got it — .*your sister.*birthday.*₦50,000/)).toBeVisible()
  await page.getByRole("radio", { name: /A gift with a letter/ }).click()
  await page.getByRole("button", { name: "Next", exact: true }).click()

  // Ideas follow the details already given, and refresh when one changes.
  await expect(page.getByRole("button", { name: "Up to ₦50,000" })).toHaveClass(/bg-primary/)
  const choose = page.getByRole("button", { name: "Choose this" })
  await expect(choose.first()).toBeVisible({ timeout: 15_000 })
  // Moving on without a gift points at the ideas instead.
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(page.getByText(/Choose a gift to continue/)).toBeVisible()
  await page.getByRole("button", { name: "Up to ₦100,000" }).click()
  await expect(choose.first()).toBeVisible({ timeout: 15_000 })
  await choose.first().click()
  await page.getByRole("button", { name: "Next", exact: true }).click()

  // The letter: signed, written, and given a look.
  await page.getByLabel("Sign it as").fill("Tolu")
  await page.getByLabel(/Your letter/).fill("Dear Ada,\n\nHappy birthday, big sister. Proud of you.")
  await page.getByRole("button", { name: /Hibiscus/ }).click()
  await page.getByRole("button", { name: "Next", exact: true }).click()

  await expect(page.getByRole("heading", { name: /Ready to send/ })).toBeVisible()
  await expect(page.getByText(/Proud of you/).first()).toBeVisible()
  await page.getByRole("button", { name: /Continue to checkout|Checkout/ }).click()

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible()
  await expect(page.getByLabel("Their name")).toHaveValue("Ada")
  await page.getByLabel("Their email or phone").fill("ada.studio@example.com")
  await page.getByRole("button", { name: "Continue to delivery" }).click()
  await page.getByLabel("Their phone, for the rider").fill("+234 803 555 0192")
  await page.getByLabel("Street address").fill("7 Admiralty Way")
  await page.getByRole("combobox", { name: /^Area in/ }).click()
  await page.getByRole("option").first().click()
  await page.getByRole("button", { name: "Continue to gift message" }).click()
  await expect(page.getByLabel("Your message")).toHaveValue(/Proud of you/)
  await page.getByRole("button", { name: "Continue to your details" }).click()
  await page.getByLabel("Your name").fill("Tolu Test")
  await page.getByLabel("Email for your receipt").fill("tolu.studio@example.com")
  await page.getByRole("button", { name: /^Pay ₦/ }).click()
  await page.getByRole("button", { name: /^Pay ₦/ }).click()
  await expect(page.getByText("Payment confirmed", { exact: true })).toBeVisible({ timeout: 15_000 })

  const link = (await demoDb(page)).outbox.find((m: { to: string; kind: string }) => m.to === "ada.studio@example.com" && m.kind === "gift_reveal")?.link.href
  expect(link).toMatch(/^\/g\//)
  await page.goto(link)
  await page.getByRole("button", { name: "Open without animation" }).click()
  // The letter waits on its table, sealed, below the gift.
  await page.getByRole("button", { name: "Pull the ribbon", exact: true }).click({ force: true })
  await expect(page.getByText(/Happy birthday, big sister/)).toBeVisible()
})

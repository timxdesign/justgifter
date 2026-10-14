import { expect, test, type Page } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
})

const composer = (page: Page) => page.getByLabel("Reply to the assistant")
const demoDb = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("jg-demo-db")!))

test("letter only: the assistant hands over to the studio → draft → sign in → email it → recipient reads it", async ({ page }) => {
  await page.goto("/send")
  // The demo starts signed in as a persona; sign out to exercise confirming the sender's email.
  await page.getByRole("button", { name: /^Account menu/ }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page.getByRole("button", { name: /^Account menu/ })).toHaveCount(0)
  await page.goto("/send")
  await page.getByRole("button", { name: /A digital letter/ }).click()
  await expect(page).toHaveURL(/\/send\/letter$/)

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
  await page.getByRole("button", { name: "Reason 1" }).click()
  await expect(page.getByText("Your laugh")).toBeVisible()
  await page.getByRole("button", { name: "See everything on the table" }).click()
  await expect(page.getByRole("heading", { name: "Everything on this table is yours" })).toBeVisible()
  await expect(page.getByRole("button", { name: "The letter (seen)" })).toBeVisible()
  await expect(page.getByRole("button", { name: "What I love (seen)" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Our song", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Write a letter" })).toBeVisible()
})

test("gift: a detailed first message is understood, answers can be changed, and checkout is pre-filled", async ({ page }) => {
  await page.goto("/send")
  await composer(page).fill("I need a birthday gift for my sister under ₦50,000")
  await composer(page).press("Enter")
  await expect(page.getByText("Got it — a gift, your sister, birthday and up to ₦50,000.")).toBeVisible()
  // Relationship, occasion and budget are not asked again; only whether delivery is included.
  await expect(page.getByText("Should ₦50,000 cover delivery too?")).toBeVisible()
  await page.getByRole("button", { name: "Yes, including delivery" }).click()

  await page.getByRole("button", { name: "I'm not sure" }).click() // interests
  await page.getByRole("button", { name: "Lekki & Ajah" }).click()
  await page.getByRole("button", { name: "No rush" }).click()

  await expect(page.getByText(/Here are a few ideas for your sister's birthday/)).toBeVisible({ timeout: 15_000 })
  const cards = page.getByRole("button", { name: "Choose this" })
  await expect(cards.first()).toBeVisible()

  // Change the budget without restarting: suggestions refresh, everything else stays.
  await page.getByRole("button", { name: "Change answer: What would you like to spend?" }).click()
  await page.getByRole("button", { name: "Up to ₦100,000" }).click()
  await expect(page.getByText(/Here are a few ideas/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Lekki & Ajah", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "More affordable" }).click()
  await expect(page.getByText(/Looking for gifts up to/)).toBeVisible()
  await expect(cards.first()).toBeVisible({ timeout: 15_000 })
  await cards.first().click()

  await expect(page.getByText(/Would you like to add a letter/)).toBeVisible()
  await page.getByRole("button", { name: "Yes, add a letter" }).click()
  // Relationship and occasion are reused; only the missing name is asked for.
  await page.getByLabel("Name in the greeting").fill("Sis")
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByText("How would you like to write it?")).toBeVisible()
  await page.getByRole("button", { name: /I'll write it myself/ }).click()
  await page.getByLabel("Your letter").fill("Happy birthday, sis! Proud of you.\n\nLove, Ada")
  await page.getByRole("button", { name: "Preview letter" }).click()
  await page.getByRole("button", { name: "Use this letter" }).click()

  await expect(page.getByText("Here's your gift and letter.")).toBeVisible()
  await expect(page.getByText("Nothing is charged until you confirm payment.")).toBeVisible()
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible()
})

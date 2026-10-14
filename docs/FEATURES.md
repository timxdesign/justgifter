# Product journeys

What JustGifter does, journey by journey, and where each part lives. The full product intent is in [`JustGifter_Product_Requirements.md`](../JustGifter_Product_Requirements.md) (PRD v1.3). This page describes what is **built**.

Every journey can be tried in demo mode (`npm run dev` → **DEMO** button). See [FRONTEND.md](FRONTEND.md#demo-mode).

## 1. Direct gift, address known

1. The sender finds a product (`/shop`, `/occasions/:occasion`, `/products/:slug`) and sees the earliest delivery for a zone.
2. They choose **Send as a gift** and fill in `/checkout`:
   - recipient name and contact
   - the address
   - delivery date (only feasible dates are offered)
   - message, display name or anonymous
   - reveal style (`envelope` or `wrapped_box`) and reveal time
3. `createCheckout` holds the stock for 10 minutes, creates the order, and sends the sender to Paystack (in the demo, `/pay/demo/:reference`).
4. Once the payment is verified, the order goes to the vendor for acceptance. At the reveal time the recipient gets an email with a private `/g/:token` link.
5. The recipient opens the reveal, sees fulfilment progress, and can send a thank-you.

The sender can preview the reveal (`/preview/gift/:token`), edit the message and reveal time while allowed, and follow the order at `/account/orders/:id`.

## 2. Direct gift, address unknown

The same as journey 1, with these differences:

- The sender picks a zone but leaves the address empty. This is allowed only for items that are safe to cancel: not perishable, not highly customised, and returnable.
- The recipient verifies with a code sent to the contact the sender used, then adds the address within **72 hours**. They get a reminder 24 hours before the deadline.
- An address outside the quoted zone waits for the sender's approval.
- If the recipient declines, or the window ends, the order is cancelled and the sender refunded automatically.

## 3. Occasion page and wishlist

1. A host creates an occasion at `/events/new`: birthday, wedding, anniversary, baby shower, graduation, housewarming, appreciation, remembrance, or something else. Remembrance is a sensitive type, so its design is always restrained.
2. They design it in `/events/:id/edit`:
   - template, palette, font, section order and motion
   - story, details and agenda
   - optionally the **AI designer** (`composeEvent`), whose output must pass template validation
3. They add wishlist items with quantities and priorities, and set a **private** delivery address.
4. They publish, choosing `public`, `unlisted` or `private` visibility (private uses an invite code), and share `/e/:slug`.
5. Guests open the page, which has an animated reveal with a "without animation" option, and buy a wish:
   - the item is **held** while they check out, so two guests can't buy the same item
   - the gift ships to the host's address without the guest ever seeing it
6. Co-hosts can be invited with permissions (`edit_content`, `manage_wishlist`, `publish`). **Surprise mode** hides gift details from the host until a reveal date.

## 4. Vendor storefront and direct ordering

- Each approved vendor can publish a branded storefront at `/stores/:slug`, with an accent colour, layout, collections and featured products.
- Old slugs redirect, and reserved slugs are blocked.
- Orders placed there carry `source: storefront`, the storefront id and an optional campaign, so analytics and payouts are attributed.
- Buyers can buy for themselves (no gift details), or as a gift.
- The cart holds **one bag per vendor**, and each bag is its own checkout.

## 5. Send a gift or a letter (`/send`, `/send/letter`)

Both are **studios**: steps on the left, and a live preview on the right showing exactly what the recipient will open, in a phone or desktop frame. The steps, preview and action bar come from `src/components/studio/`. On narrow screens the preview sits behind a **Preview** button.

- **Send a gift** (`/send`) has the steps **Who → Gift → (Letter) → Review**, then hands over to checkout. `/assistant` redirects here, and its `?q=` is read as free text.
  1. **Who:** choose a gift, a gift with a letter, or just a letter (which goes to `/send/letter`). "Tell us in your own words" fills in what it can, such as "a ₦30k birthday gift for my sister in Lekki by Friday". The recipient's name, relationship and occasion are all optional.
  2. **Gift:** set the budget (including delivery or not), interests, things to leave out (only for food and self-care) and the delivery area and date. Ideas update as you go and only include approved, in-stock gifts that can arrive in time. When nothing fits, the studio says what's limiting and offers the change most likely to help.
  3. **Letter** (gift with a letter only): the same writing help as letters on their own, a signature, and the same look (theme, flowers, light, details). After the gift box opens, the recipient finds it sealed in an envelope on that table, and it carries through checkout to `/g/:token`. Gift letters are text only, up to 2,000 characters.
  4. **Review:** the gift, letter, delivery and estimated cost, each with an edit link, then **Continue to checkout**. Checkout is pre-filled; nothing is charged until payment.
  The preview shows the closed gift box, opens to the chosen gift, and scrolls to the letter while it's being written.
- **A letter on its own** goes to the **letter studio** at `/send/letter`, carrying the name and occasion already given. It's free and has three steps, with a live phone or desktop preview beside them:
  1. **Cover:** their name, how it's signed, an optional occasion, and the look. There are three themes: *Flower table*, *Soft envelope* and *Celebration*, which isn't offered for sympathy or get-well. Each has five flowers, day or night light, and petals, butterflies and gold details.
  2. **Moments:** the letter is required (written by hand or with the assistant's help, with undo). The rest are optional: *What I love* (reasons), *Our story* (chapters), *Our photos* (up to 8), *Our day* (a date counted since or until), *Our places*, *Our wishes* and *Our song* (a Spotify, YouTube, Apple Music or Audiomack link). Any moment can be switched off without losing it.
  3. **Send:** share it by link (with WhatsApp and a QR code) or have it emailed. Either can be now or on a date up to 90 days ahead. The sender confirms their email first.
- The draft, including photos, stays on the device (localStorage and IndexedDB) until it's sent. "See an example" shows a filled-in letter.
- **Reading a letter** (`/l/:token`): the cover opens with an animation (an envelope's wax seal breaks, or a gift box's ribbon is pulled). Then each moment is its own interactive scene: pick flowers to read the reasons, turn the book's pages, swipe through the polaroids, turn the calendar page, follow the pins on the map, blow the dandelion, play the record. The table at the end lays everything out to revisit. Readers can swipe, use the arrow keys, pause the animations, and report the letter from any scene.
- A link letter sent for a later date shows a sealed envelope and a live countdown until then.
- Senders manage letters at `/account/letters`: cancel scheduled ones, or make a new link for a link letter (the old link stops working).
- The conversation's rules live in `src/lib/send-flow.ts` and the studio's in `src/lib/letter-studio.ts` (both UI-free and tested). The screens are in `src/components/send/` and `src/components/letter/`.

## 6. Guest buyers

Guests can check out without an account. They can see their orders later by email code at `/orders/access`, or with the order-access token kept for the browser session.

## 7. Vendor operations (`/vendor`)

- **Onboarding:** `/sell` → `/vendor/apply` → reviewed by the team. If the team asks for more information, the owner replies from the workspace with documents (PDF, JPG or PNG up to 10 MB).
- **Orders:** accept or decline within 4 operating hours (otherwise the order is declined and refunded automatically), then prepare → ready → dispatch → deliver, or report an issue. Customer details are minimised until the order is accepted.
- **Catalogue:**
  - products with variants, stock, prep time, personalisation, wrapping and image upload
  - material edits go back to moderation
  - low-stock alerts
- **Storefront editor, analytics** (visits, views, checkout starts, conversion, sales by source) and **payouts** (balance, dispute window, bank change with re-authentication).
- **Staff** with scopes, and **settings**: hours, days, cut-off, capacity, blackout dates.

## 8. Platform operations (`/admin`)

Staff (support and admin, with MFA) handle:

- vendor review
- listing and storefront moderation
- orders and exceptions (cancel and refund, delivery issues, extend a claim)
- refunds (large ones need an admin)
- support cases and content reports
- payment reconciliation
- scheduled jobs (retry or run now)
- the template gallery

Admins also see the audit log and manage the **team**: invite by email with a role, revoke, change or remove access.

## Out of scope for the first release

Group contributions, cash funds, vouchers, multi-vendor checkout, RSVP and corporate gifting. See [DECISIONS.md](DECISIONS.md).

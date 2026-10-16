# Changelog

Notable changes for users, operators and developers. Newest first. Add a line under **Unreleased** with every change, and move the lines under a dated heading when you deploy.

## Unreleased

- **Letter photos accept HEIC** (iPhone photos), decoded natively in Safari and by `heic-to` (loaded on demand) elsewhere. Every photo is compressed in the browser to about 450 KB or less: up to 1600 px on the long side, with quality and then size stepped down until it fits. Safari, which can't encode WebP, uploads JPEG. The CSP gains `worker-src 'self' blob:` for the decoder's worker.

- **Send a gift studio (`/send`):** the gift conversation is now a studio, matching the letter studio.
  - Steps: Who → Gift → Letter (for a gift with a letter) → Review.
  - Ideas update live as you set budget, interests, area and date.
  - A phone or desktop preview shows the recipient's real gift page.
  - The old chat screens are gone. "Tell us in your own words" still fills the answers from free text.
- **Gift letters get the letter look:** a gift with a letter opens on the same envelope and flower table as a letter on its own, with the theme, flowers and light the sender chose. Migration `20261015090000_gift_letter_design.sql` adds `gifts.letter_design`, which `createCheckout` and `getGiftReveal` carry.
- **Studios share one frame** (`src/components/studio/`): a labelled stepper, sticky actions and the device preview. Both studios are full-bleed routes.
- The gift reveal now lays out by container width rather than screen width, so it previews correctly in a phone frame. The real gift page looks the same.

- **Letter studio (`/send/letter`):** a letter on its own is now built in a studio with a live phone or desktop preview, instead of the chat.
  - Three themes (Flower table, Soft envelope, Celebration), five flowers, day or night light, and petals, butterflies and gold details.
  - Optional moments: reasons, story chapters, up to 8 photos, a special date, places, wishes and a song (Spotify, YouTube, Apple Music or Audiomack).
  - Letters can be shared by link (with a QR code and WhatsApp), not only emailed. Link letters can be dated, and show a sealed countdown until then.
  - Recipients get an interactive, full-screen letter at `/l/:token`. Senders can make a new link from `/account/letters`.
  - Still free.
- **Developers:**
  - migration `20261014090000_letter_studio.sql` adds `letters.delivery`, `design` and `moments`, and the private `letter-media` bucket;
  - new API methods `uploadLetterPhoto` and `renewLetterLink`; `sendLetter` returns `LetterSent` with a one-time `link`;
  - the Worker CSP now allows the four music player frames;
  - the demo DB version is now 12, so existing demo data resets.

- **Brand colours:** the Figma Primary (coral `#FF624D`) and Secondary (violet `#634DFF`) palettes are now the colour system. Default buttons, progress bars, switches and focus rings use coral with dark text; the `secondary` button and badge variants use violet. Both scales are available as `primary-50…950` and `secondary-50…950` utilities.
- **Docs:** full documentation set in `docs/` (architecture, journeys, domain rules, API, database, frontend, operations, security, testing, configuration reference). `npm run docs:check` runs in CI, and a Claude Code Stop hook keeps the docs in step with the code.
- **Send a gift or a letter (`/send`):** a guided conversation replaces the one-shot assistant (`/assistant` redirects).
  - Senders can send digital letters on their own or with a gift: AI-drafted, their own, or improved, in five tones, sent now or scheduled up to 90 days ahead.
  - Recipients read letters at `/l/:token`. Senders manage them at `/account/letters`.
  - New `letters` table (migration `20261004090000_digital_letters.sql`), `letter_delivery` job kind, and API methods `composeLetter`, `sendLetter`, `listMyLetters`, `cancelLetter`, `openLetter` and `reportLetter`.
  - The gift message limit rises to 2,000 characters.

## 2026-10-02

- Vendors can reply to "needs information" requests with documents (private bucket, signed URLs for staff).
- Admins can invite and manage the operations team (`/admin/team`, `platform_invites`).
- Branded, context-aware emails for every one-time code (`auth-email` Send Email hook).
- Fixed sign-in failing on the live backend.
- E2E tests always run against the demo backend.
- Checkout redesigned as a guided step-by-step flow.
- Transactional email moved from Zoho Mail to ZeptoMail.
- Production builds use committed public config, so Cloudflare Workers Builds can deploy from Git.

## 2026-10-01

- First build from PRD v1.3: marketplace, checkout with Paystack, gift reveals (address known and unknown), occasion pages and wishlists, vendor storefronts and workspace, operations workspace, demo backend, Cloudflare Worker for SEO and security headers, CI.

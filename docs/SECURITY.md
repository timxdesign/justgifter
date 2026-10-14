# Security and privacy

The principles this codebase follows, with where each one is enforced. PRD requirement ids (SEC, TECH, AI, GFT, AC) are noted where the code references them.

## Identity and access

- **Passwordless.** Sign-in uses emailed 6-digit codes from Supabase Auth, delivered by the `auth-email` hook. The code expiry (`AUTH_CODE_SECONDS`, 600) must match the Auth OTP expiry.
- **MFA for privileged roles.** Vendor owners, support and admins must have a TOTP factor, so their JWT is `aal2`. `requireRole` in `_shared/auth.ts` rejects them otherwise, and the UI sends them to `/mfa`.
- **Roles are never client input.** `getCaller` reads roles and the vendor id from `profiles` and `vendor_staff`. Platform roles are granted only by accepting an admin's invite with a verified email, or by an admin changing someone's access (`_shared/team.ts`). Admins can't change their own access.
- **Every handler authorises itself.** UI route guards are for navigation only. Denied host access is written to `audit_events`.
- **Vendor staff scopes** (`catalogue`, `orders`, `support`) limit what staff can do. Owner-only actions include payouts, bank changes, storefront, staff and settings.
- **Re-authentication for sensitive changes.** A payout bank change needs a fresh emailed code (AC 14).

## Data minimisation

| Data | Who sees it |
|---|---|
| Recipient address (buyer-entered) | The buyer who entered it. The vendor sees it only once the order is accepted. |
| Host's event delivery address | The host. Never guests, and never in the public event view. Wishlist purchases ship there without exposing it. |
| Buyer identity (to a vendor) | First name plus masked contact (`maskContact`). |
| Recipient contact | Shown to the sender masked. Never shown on the gift or letter page. |
| Anonymous sender | Hidden from the recipient and from link previews. |
| Gift details in surprise mode | Hidden from the host until the reveal date. |

Addresses are kept in separate tables (`order_addresses`, `event_addresses`) that have no client policy.

## Tokens and links

- Gift links (`/g/`), letter links (`/l/`), preview links, order-access tokens and gift sessions are random 32-byte tokens. **Only their SHA-256 hash is stored**, and they are compared in constant time (`safeEqual`).
- Gift and letter tokens are minted when the message is sent, not when the order is made, so cancelled items never had a working link.
- Link letters are the exception: their token is minted when the sender creates them, and it's shown once. It's never stored, so a lost link can only be replaced (`renewLetterLink`), which stops the old one working. Cancelling clears the hash.
- Letter photos live in a private bucket under the sender's user id. `sendLetter` accepts only paths in the caller's own folder, and recipients get one-hour signed URLs. Draft photos stay on the sender's device until they press send, and every photo is re-encoded first, which strips location data.
- Music players load only after the reader presses play, so opening a letter contacts no third party.
- Address-unknown gifts need a second factor: a code sent to the contact the sender used, which creates a short-lived `gift_sessions` row.
- One-time codes are hashed, expire after 10 minutes, allow 5 attempts, and are limited to 3 per minute per key.
- The guest order-access token is kept in `sessionStorage` only.

## Transport, headers and caching

The Worker (`worker/index.ts`) sets the following on every response:

- `Content-Security-Policy`: self, the Supabase origin, Cloudflare Turnstile and the Paystack checkout frame. For "Our song" in letters, it also allows the Spotify, YouTube (no-cookie), Apple Music and Audiomack player frames, kept in step with `SONG_FRAME_ORIGINS` by a test. `frame-ancestors 'none'`.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera, mic, geolocation and payment off).

Private routes also get `Cache-Control: no-store, private`, `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`, so tokens can't leak to caches, crawlers or third parties.

The `api` function allows CORS only from `ALLOWED_ORIGINS` (never `*`) and answers with `no-store`.

## Payments

- Webhooks are checked with HMAC-SHA512 (`x-paystack-signature`), then **re-verified** with the Verify Transaction API before any state changes.
- Stock, holds and payment commits happen inside locking SQL functions. Replays are deduplicated through `webhook_events`.
- The ledger is append-only (enforced by a database trigger).
- Large refunds (above `adjustmentApprovalThreshold`) need an admin.
- The code never describes funds as escrow. The settlement model awaits legal review ([DECISIONS.md](DECISIONS.md)).

## Secrets

- `VITE_*` variables ship to browsers. **Only public values go there**: the Supabase URL and the publishable anon key.
- Service-role, Paystack, Anthropic, SMTP, cron and hook secrets are Edge Function secrets (`supabase secrets set`). They are never committed.
- Each environment has its own Supabase project and keys. Staging and previews never send real email (`SEND_REAL_EMAIL`).
- `wrangler.jsonc` contains only the public Supabase URL and anon key.

## Abuse controls

- Per-IP rate limits on abuse-prone API methods (see [API.md](API.md#rate-limits)).
- Recipients can report a gift or letter and choose **stop contact**. Their address goes into `blocked_contacts` and every future message to it is suppressed.
- Content reports and storefront moderation are handled at `/admin/reports` and `/admin/storefronts`.
- Reserved storefront slugs (`admin`, `api`, `checkout`, `paystack`, `official` and others) block impersonation.
- Cloudflare Turnstile is optional (`VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`).

## AI

Claude is used for the gift assistant, the letter composer and the occasion-page designer (`_shared/ai.ts`).

- **Minimal context.** Claude receives preferences, eligible product titles and summaries, and prices. It never receives addresses, contacts or payment data.
- **Untrusted input is fenced.** User text and listing text are wrapped as data, and the system prompt tells the model to ignore any instructions inside them.
- **Structured output only.** JSON schema, low effort, and an 8-second timeout with one retry. A refusal or truncation returns `null`.
- **Deterministic validation.** Product ids not in the eligible set are dropped. Preferences pass through `sanitisePreferences`, designs through `validateDesign`, and letters through `acceptComposedLetter`.
- **Always a fallback.** Without `ANTHROPIC_API_KEY`, or on any failure, rule-based logic runs instead. Browsing and templates never depend on AI.
- `PROMPT_VERSION` in `ai.ts` identifies the prompt set. Re-run the evaluation set before changing `AI_MODEL`.


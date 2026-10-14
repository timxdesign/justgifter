# API reference

The UI codes against one interface, `Api` in [`src/api/types.ts`](../src/api/types.ts). Two implementations exist:

- **Demo**: `src/api/demo/*`, which runs in the browser.
- **Production**: `src/api/supabase/index.ts`, which calls Supabase Auth and the `api` Edge Function.

This page lists every method, who can call it, and where it is implemented. For the types themselves, read `types.ts`. They are the source of truth and are commented.

## Transport (production)

```http
POST https://<project>.supabase.co/functions/v1/api
Authorization: Bearer <user access token | anon key>
apikey: <anon key>
Content-Type: application/json

{ "method": "listProducts", "args": { "q": { "occasion": "birthday" }, "accessTokens": [] } }
```

- A successful call returns `{ "data": <result> }`.
- A failed call returns `{ "error": { "code": "<code>", "message": "<user-facing text>" } }` with an HTTP status taken from the table below.
- `accessTokens` is added automatically by the adapter. It holds the guest order-access tokens kept in `sessionStorage`, which let a guest see orders without an account.
- The responses are always `Cache-Control: no-store`. CORS allows only `ALLOWED_ORIGINS`.

### Error codes

Defined in `supabase/functions/_shared/http.ts` and mirrored in `src/api/errors.ts`.

| Code | HTTP | Meaning |
|---|---|---|
| `validation` | 422 | Input failed a rule; the message says which. |
| `invalid_code` | 422 | A one-time code didn't match. |
| `unauthorised` | 401 | Sign-in or gift verification needed. |
| `forbidden` | 403 | Signed in, but not allowed. Also returned when MFA (`aal2`) is missing for a privileged role. |
| `not_found` | 404 | Doesn't exist, or the caller may not know it exists. |
| `conflict` | 409 | State changed underneath the caller (for example, stock taken). |
| `unavailable` | 409 | Temporarily can't be done (paused store, email failed to send). |
| `expired` | 410 | Code, hold or link expired. |
| `rate_limited` | 429 | Too many attempts. |
| `internal` | 500 | Unexpected; the message includes a correlation id that also appears in the function logs. |

### Rate limits

Rate limits are applied per Edge Function instance, keyed on method plus IP (or user):

- `recommend` and `composeLetter`: 20 per minute.
- `requestOrderAccess`, `verifyOrderAccess`, `sendGiftCode`, `verifyGiftCode`, `createCheckout`, `sendLetter`, `uploadLetterPhotoUrl`, `renewLetterLink`, `openLetter` and `reportLetter`: 10 per minute.

One-time codes have their own limit on top: 3 issued per minute per key, and 5 attempts per code.

## Access levels used below

| Level | Meaning |
|---|---|
| **public** | Anyone, including signed-out visitors. |
| **user** | Signed in (`requireUser`). |
| **buyer** | The order's buyer: their account, or a guest holding the order-access token or a verified email code (`canViewOrder`). |
| **recipient** | Holds the gift link token. Address-unknown gifts also need a verified gift session (emailed code). |
| **host** | The event's host, or an accepted co-host with the named permission (`hosted`). |
| **vendor** | A vendor owner, or vendor staff with the named scope (`vendorCtx`). Owners need MFA. |
| **owner** | Vendor owner only (`ownerCtx`). MFA required. |
| **staff** | Platform `support` or `admin`. MFA required. |
| **admin** | Platform `admin` only. MFA required. |
| **demo** | Demo backend only. In production these methods are no-ops or are rejected. |

## Methods

### Identity: `api-catalog.ts` (demo) and `catalog.ts` (server)

| Method | Access | Notes |
|---|---|---|
| `getSession` | public | Returns the current `SessionUser` or `null`. Also accepts a pending platform-team invite for a verified email (`_shared/team.ts`). |
| `signInWithEmail` | public | Sends a 6-digit email code through Supabase Auth. `next` tailors the email to where the person was heading. In the demo it returns `devCode`. |
| `verifyEmailCode` | public | Exchanges the code for a session. |
| `signOut` | user | |
| `listPersonas` | demo | The demo personas: Adaeze, Tunde, Bisi, Tomi, Kelechi and guest. |
| `switchPersona` | demo | |
| `resetDemo` | demo | Rebuilds the demo database from `seed-demo.ts`. |

### Catalogue: `api-catalog.ts` and `catalog.ts`

| Method | Access | Notes |
|---|---|---|
| `getHomeFeed` | public | Featured and trending products, vendors, gift guides, stats. |
| `listProducts` | public | Search with filters (occasion, category, budget, zone, deliver-by, vendor, collection), sorting, pagination and facets. |
| `getProduct` | public | Takes an id or slug. Returns per-variant sellable units after active holds, plus related products. |
| `getDeliveryQuote` | public | Feasibility, earliest date, fee, window and deliverable dates for a zone. |
| `listVendors` | public | Approved vendors only. |
| `getStorefront` | public | `found`, `redirect` (old slug), `unavailable` or `not_found`. |
| `recordStoreVisit` | public | Storefront analytics: visit, product view or checkout start. |
| `recommend` | public | Gift assistant. Claude extracts preferences and ranks candidates; deterministic rules filter them and act as the fallback. Results are always re-validated against live stock, zone, date and budget. |
| `recordRecommendationFeedback` | public | Helpful or not helpful, per pick. |

### Letters: `api-letters.ts` and `letters.ts`

| Method | Access | Notes |
|---|---|---|
| `composeLetter` | public | Drafts, polishes or revises a letter (Claude, with a rule-based fallback). Nothing is stored or sent. |
| `sendLetter` | user (confirmed email) | Emails it (`delivery: "email"`) or returns a `link` to share (`delivery: "link"`), now or up to `maxAdvanceDays` ahead. Carries `design` and `moments`, validated by `validateLetterSend`. Photo paths must be in the caller's own folder. Idempotent on `clientRef`; a retried link letter gets a fresh link because only the hash is stored. Limited to `LETTERS_PER_DAY` per sender. |
| `uploadLetterPhoto` | user (confirmed email) | Uploads a re-encoded photo to the private `letter-media` bucket through a signed upload URL (`uploadLetterPhotoUrl` on the server). Returns the storage path. |
| `listMyLetters` | user | The sender's letters, with delivery mode and design. |
| `cancelLetter` | user | Only while the letter is `scheduled`. A cancelled link letter's link stops working. |
| `renewLetterLink` | user | Link letters only. Issues a new link; the old one stops working. |
| `openLetter` | recipient | Uses the letter token from `/l/:token`. Marks the letter opened. A link letter before its time comes back `sealed`, with no body or moments. Photos come back as one-hour signed URLs, never storage paths. Returns `null` for an invalid link. Contacts are never returned. |
| `reportLetter` | recipient | Reports abuse. Can also block the sender from contacting the recipient again. |

### Checkout: `api-orders.ts` and `orders.ts`

| Method | Access | Notes |
|---|---|---|
| `previewCheckout` | public | Re-prices on the server and returns eligibility issues, pricing, delivery quote and hold expiry. |
| `createCheckout` | public | Creates holds, the order (`awaiting_payment`), the gift and the payment. Returns `paymentUrl` and a guest `orderAccessToken`. `gift.letterDesign` (from the send studio) is cleaned with `sanitiseLetterDesign` and kept only when there's a message. |
| `getPaymentStatus` | buyer | Polled by `/checkout/confirm/:reference`. In production it verifies with Paystack before trusting a success. |
| `simulatePayment` | demo | The sandbox "provider". It calls the same commit path the webhook uses. |

### Buyer orders: `api-orders.ts` and `orders.ts`

| Method | Access | Notes |
|---|---|---|
| `requestOrderAccess` | public | Emails a code so a guest can see orders placed with that email. |
| `verifyOrderAccess` | public | |
| `listMyOrders` | buyer | |
| `getOrder` | buyer | The address is shown only to the buyer who entered it. |
| `updateGift` | buyer | Message, display name or reveal time, while `editable`. |
| `respondToRevisedQuote` | buyer | Approves or declines a vendor's revised quote. |
| `cancelOrder` | buyer | Before dispatch. Restocks and refunds. |
| `requestRefund` | buyer | Creates a `requested` refund for staff review. |
| `openCase` | buyer | Opens a support case (damaged, missing, late, and so on). |

### Recipient: `api-orders.ts` and `gifts.ts`

| Method | Access | Notes |
|---|---|---|
| `getGiftEntry` | recipient | Landing state: `ready`, `scheduled`, `revoked`, `expired`, `declined` or `not_found`. Shows only the first name. |
| `sendGiftCode` | recipient | Emails a code to the contact the sender used. |
| `verifyGiftCode` | recipient | Returns a short-lived `GiftSession`. |
| `getGiftReveal` | recipient | The full reveal. Needs a session when verification is required. Includes `letterDesign` when the message is a designed letter. |
| `getGiftPreview` | buyer | The sender previews the reveal using a separate preview token. |
| `markGiftOpened` | recipient | Moves the reveal status to `opened`. |
| `submitGiftAddress` | recipient | For address-unknown gifts. An address outside the quoted zone becomes `needs_sender_approval`. |
| `declineGift` | recipient | Cancels and refunds the sender. |
| `sendThankYou` | recipient | |
| `reportGift` | recipient | Optionally stops all further contact (`blocked_contacts`). |

### Hosts (occasion pages): `api-events.ts` and `events.ts`

| Method | Access | Notes |
|---|---|---|
| `listMyEvents` | user | Events the caller hosts or co-hosts. |
| `createEvent` | user | Starts a draft with the template default for its type. |
| `getMyEvent` | host | Draft and published state, wishlist, private delivery address, share URL. |
| `saveEventDraft` | host (`edit_content`) | Content and design are validated against the template (`validateDesign`). |
| `publishEvent` | host (`publish`) | Returns validation errors instead of publishing a broken page. |
| `setEventStatus` | host (`publish`) | `draft`, `published`, `closed` or `archived`. Follows `EVENT_TRANSITIONS`. |
| `setEventVisibility` | host (`publish`) | `private` generates an invite code. |
| `setEventDeliveryAddress` | host | Private. Never shown to guests. |
| `setSurpriseMode` | host | Hides gift details from the host until the reveal date. |
| `addWishlistItem` | host (`manage_wishlist`) | |
| `updateWishlistItem` | host (`manage_wishlist`) | |
| `removeWishlistItem` | host (`manage_wishlist`) | Reports whether active orders exist for the item. |
| `composeEvent` | host (`edit_content`) | AI page designer. The output must pass template validation; rejected parts are listed. |
| `getEventGifts` | host | Respects surprise mode. |
| `inviteCoHost` | host | |
| `revokeCoHost` | host | |

### Occasion visitors: `api-events.ts` and `events.ts`

| Method | Access | Notes |
|---|---|---|
| `getPublicEvent` | public | `found`, `invite_required` or `unavailable`. Private events need `inviteCode`. |
| `holdWishlistItem` | public | Reserves the wishlist item and its stock for `holdMinutes`, so two guests can't buy the same wish. |
| `releaseHold` | public | |

### Vendor: `api-vendor.ts` and `vendor.ts`

| Method | Access | Notes |
|---|---|---|
| `submitVendorApplication` | user | Creates the vendor (`submitted`) and the application. |
| `getVendorWorkspace` | user | `null` when the caller has no vendor. |
| `uploadApplicationDocument` | owner | Only while the application is `needs_information`. PDF, JPG or PNG up to 10 MB, stored in the `private-evidence` bucket. In production it uses `applicationDocumentUploadUrl`. |
| `respondToApplication` | owner | Sends a message and documents, and moves the application back to `submitted`. |
| `getVendorDashboard` | vendor | |
| `listVendorOrders` | vendor (`orders`) | |
| `getVendorOrder` | vendor (`orders`) | Shows a first name and masked contact. The full address appears only once the order is accepted. |
| `vendorOrderAction` | vendor (`orders`) | `accept`, `decline`, `start_preparing`, `mark_ready`, `dispatch`, `deliver` or `report_issue`. Follows `ORDER_TRANSITIONS`. |
| `listVendorProducts` | vendor (`catalogue`) | |
| `saveVendorProduct` | vendor (`catalogue`) | Material changes send the listing back to `pending_review`. |
| `updateStock` | vendor (`catalogue`) | |
| `archiveProduct` | vendor (`catalogue`) | |
| `uploadMedia` | vendor (`catalogue`) | The client re-encodes the image first (`src/lib/images.ts` strips EXIF). In production it uses `uploadMediaUrl` (a signed upload). |
| `saveStorefront` | owner | Slug changes keep a redirect history. Reserved slugs are rejected. |
| `setStorefrontStatus` | owner | `published` or `paused`. |
| `getStorefrontAnalytics` | vendor | |
| `getPayoutStatement` | owner | Balance, payouts and per-order lines with dispute-window status. |
| `requestBankChange` | owner | Re-authentication: the first call emails a code and fails with `unauthorised`; the second call includes the code. The new account shows as a pending change. |
| `listStaff` | vendor | |
| `inviteStaff` | owner | Scopes: `catalogue`, `orders`, `support`. |
| `removeStaff` | owner | |
| `updateVendorSettings` | owner | Hours, days, cut-off, daily capacity, blackout dates. |

### Platform operations: `api-admin.ts` and `admin.ts`

| Method | Access | Notes |
|---|---|---|
| `getOpsOverview` | staff | Queue counts, GMV and successful-gift rate. |
| `listVendorsForReview` | staff | |
| `reviewVendor` | admin | `start_review`, `resume_review`, `approve`, `reject`, `needs_information`, `suspend` or `reinstate`. Follows `VENDOR_TRANSITIONS`. |
| `getApplicationDocumentUrl` | staff | A short-lived signed URL for a private document. |
| `listModerationQueue` | staff | Listings in `pending_review`. |
| `moderateListing` | staff | |
| `listAllOrders` | staff | Search, filter by status, or `exceptions`. |
| `getAdminOrder` | staff | Includes the ledger and gift token state. |
| `adminOrderAction` | staff | `cancel_and_refund`, `mark_delivery_issue`, `resolve_delivered` or `extend_claim`. |
| `listRefunds` | staff | |
| `refundAction` | staff | `approve`, `reject`, `submit`, `mark_completed` or `mark_failed`. Amounts above `adjustmentApprovalThreshold` need an admin. |
| `listCases` | staff | |
| `updateCase` | staff | |
| `listReconciliation` | admin | Unmatched and mismatched provider payments. |
| `listReports` | staff | Content reports. |
| `actionReport` | staff | |
| `listAuditLog` | admin | |
| `listJobs` | staff | |
| `retryJob` | staff | |
| `runDueJobs` | staff | Runs the scheduler now. It is the "System → Run jobs" button in the demo. |
| `listStorefrontsForModeration` | staff | |
| `setStorefrontModeration` | admin | `unpublish` or `restore`. |
| `listTeam` | admin | Members and pending invites. |
| `inviteTeamMember` | admin | The invite lasts 7 days and is accepted on the next session check once the email is verified. |
| `revokeTeamInvite` | admin | |
| `setTeamRole` | admin | `admin`, `support` or `none`. Admins can't remove their own access. |

## Adding or changing a method

1. Add or change the signature on `Api` in `src/api/types.ts`, with a doc comment if the behaviour isn't obvious.
2. Implement it in the matching `src/api/demo/api-*.ts` module.
3. Implement the server handler in `supabase/functions/api/<area>.ts`, with an explicit access check as the first line. If the method is abuse-prone, add it to `LIMITED` in `api/index.ts`.
4. Map it in `src/api/supabase/index.ts`. It's usually `call("<method>", { ... })`.
5. Put shared rules in `_shared/domain` and test them in `domain.test.ts`. Add an acceptance test in `src/api/demo/demo.test.ts`.
6. **Add the method to the right table on this page.** `npm run docs:check` fails until you do.

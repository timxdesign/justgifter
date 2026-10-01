# JustGifter Product Requirements

*Gifting marketplace  |  Occasion pages  |  Vendor storefronts*

Version 1.3  |  1 October 2026  |  Product definition and implementation baseline

JustGifter helps people celebrate others through thoughtful gifts, personalised occasion pages, shareable wishlists and memorable digital reveals. Approved vendors supply the products and sell through shareable storefronts; AI helps customers discover suitable gifts and helps hosts assemble pages from a controlled template library.

This document translates the founder’s brief into requirements for product design, engineering and operations. It defines the complete product direction, a focused first release, business rules, exceptional scenarios and acceptance criteria. Proposed commercial policies and launch assumptions are clearly labelled so they can be approved before implementation.

### Recommended product direction

Build JustGifter around reliable gifting first. A beautiful reveal matters, but the promise is only complete when the right item reaches the right person. Connect discovery, wishlist availability, payment, recipient consent and fulfilment in one traceable journey.

### Core experiences

- Send a gift directly, now or on a chosen date, with a message and a digital unwrapping experience.

- Create a birthday, wedding or other occasion page with a story, event details and a wishlist that guests can purchase from.

- Give vendors a shareable storefront, approve their listings, manage stock and fulfil marketplace and direct storefront orders through one dashboard.

- Use AI to recommend eligible products and personalise approved page templates without inventing products, prices or delivery promises.

## Contents

- [1  Product scope and launch assumptions](#1-product-scope-and-launch-assumptions)

- [2  Users and permissions](#2-users-and-permissions)

- [3  Primary journeys and use cases](#3-primary-journeys-and-use-cases)

- [4  Marketplace and gift discovery](#4-marketplace-and-gift-discovery)

- [5  Gift creation and recipient experience](#5-gift-creation-and-recipient-experience)

- [6  Occasion pages and event publishing](#6-occasion-pages-and-event-publishing)

- [7  Wishlists and purchase coordination](#7-wishlists-and-purchase-coordination)

- [8  Reveal design and motion requirements](#8-reveal-design-and-motion-requirements)

- [9  Vendor storefronts and operations](#9-vendor-storefronts-and-operations)

- [10  Checkout payments and financial records](#10-checkout-payments-and-financial-records)

- [11  Delivery returns and exceptions](#11-delivery-returns-and-exceptions)

- [12  AI capabilities and safeguards](#12-ai-capabilities-and-safeguards)

- [13  Information architecture and required screens](#13-information-architecture-and-required-screens)

- [14  Technology stack and architecture](#14-technology-stack-and-architecture)

- [15  Security privacy and platform trust](#15-security-privacy-and-platform-trust)

- [16  Quality performance and operational readiness](#16-quality-performance-and-operational-readiness)

- [17  Acceptance criteria and test scenarios](#17-acceptance-criteria-and-test-scenarios)

- [18  Implementation roadmap and release gates](#18-implementation-roadmap-and-release-gates)

- [19  Success measures and decisions to confirm](#19-success-measures-and-decisions-to-confirm)

- [20  Technical references](#20-technical-references)

## 1  Product scope and launch assumptions

The brief establishes a responsive web product serving gift buyers, recipients, occasion hosts and vendors. JustGifter is both a marketplace and a celebration platform; its first release must retain both identities.

### Confirmed requirements

- Occasion based gift discovery and purchasing for loved ones.

- Personal occasion landing pages for birthdays, weddings and other celebrations.

- Wishlists attached to occasion pages.

- Distinctive gift and event unveiling effects.

- Vendor onboarding, listing management, shareable storefronts, direct customer ordering and an operational dashboard.

- AI assisted recommendations and event designs based on existing templates.

### Working assumptions

For planning, launch in Nigeria, charge in NGN and operate within a small set of explicitly supported delivery zones. These are proposals, not confirmed founder decisions. Buyers may live elsewhere if the payment provider supports their method, but recipients must be inside a supported zone. Use Africa/Lagos as the launch timezone while storing timestamps in UTC.

Launch with physical gifts from approved vendors. Allow flowers, hampers, accessories, home items and personalised products only where operational capability exists. Experience vouchers, digital gift cards, cash gifts and pooled funding belong to later phases because they introduce redemption, custody and refund complexity.

### First release boundary

| Launch essential | Later expansion |
| --- | --- |
| Marketplace, search and guided AI discovery | Behavioural recommendation models and recurring gifting |
| Direct gifting and recipient address collection | Corporate bulk gifting and international delivery |
| Occasion pages and vendor backed wishlists | Group contributions, cash funds and experience vouchers |
| Curated templates and two polished reveal styles | Advanced scene editor and larger effects library |
| Vendor approval, storefronts, direct orders, stock and settlements | Vendor subscriptions and inventory integrations |
| Platform operations, disputes and refunds | Native mobile apps and loyalty programme |

Use one vendor per checkout at launch. Buyers may save products from multiple vendors, but each purchase has a separate payment and delivery charge. Design the data model for future parent orders with vendor suborders. Avoid calling a collection of independent orders one delivery.

## 2  Users and permissions

One person may be a buyer, recipient and host. Vendor access is a separate organisation membership; it must never follow from an ordinary customer account alone.

| Role | Permitted scope |
| --- | --- |
| Guest | Browse, view accessible pages, purchase with verified contact and open a secure gift link. |
| Customer | Manage own orders, recipients, messages, saved items and notification preferences. |
| Recipient | Access only gifts addressed to them; provide private delivery details and acknowledge receipt. |
| Host | Create and manage own occasion pages, wishlist and guest messages; view permitted gift activity. |
| Co host | Manage an invited occasion according to scoped permissions; no automatic payout or address access. |
| Vendor owner | Manage approved business, staff access, listings, fulfilment and settlement history. |
| Vendor staff | Only assigned catalogue, order or support functions; payout changes reserved for owner. |
| Platform support | View operational records needed for a case with sensitive fields masked by default. |
| Platform administrator | Approve vendors, moderate pages, manage catalogue rules and controlled financial actions. |

### Identity rules

- Guests can buy without a password. Verify access to later order management using a secure email link or OTP. Never disclose an order using only a guessable reference.

- Hosts must verify their email before publishing. Vendor owners and privileged platform staff require stronger authentication and MFA.

- Invite co hosts explicitly and record acceptance, permission changes and revocation. Wedding pages may have two hosts but one defined delivery contact.

- Do not force a recipient to create an account merely to accept a gift or supply an address.

## 3  Primary journeys and use cases

Every flow must produce an understandable status and a next action. Occasion browsing and gift purchasing should remain usable even when AI is unavailable.

### Direct gifting with a known address

Buyer selects occasion → filters products or asks the gift assistant → opens product → chooses variant and delivery date → adds recipient, message and reveal style → confirms total → pays → receives verified order confirmation → vendor fulfils → recipient receives reveal link at the scheduled time → delivery is tracked independently.

### Direct gifting without an address

Buyer chooses a product and approximate recipient delivery zone → sees provisional delivery cost and collection deadline → pays → recipient receives a private claim link → verifies the intended contact → supplies an address within the selected zone → the platform validates serviceability → vendor receives fulfilment instructions. The recipient can decline; an expired or declined claim triggers the published cancellation and refund policy.

For launch, constrain address collection to the quoted zone and prohibit extra recipient charges. If the final address is outside that zone, ask the sender to approve a revised order and explicit additional payment or cancel. Do not silently reduce the gift value or charge the recipient.

### Occasion page and wishlist

Host selects event type → enters date, story and privacy → chooses a template or asks AI for a design → adds approved catalogue items and quantities → supplies a private delivery address → previews desktop and mobile → publishes → shares link or QR code. A guest opens the event reveal → browses wishlist → selects an available item → pays → sees confirmation. Purchase state updates across guests without exposing the host’s address.

### Direct ordering from a vendor storefront

Vendor publishes an approved storefront → shares its link or QR code through social media, messaging or printed materials → customer browses that vendor’s collections → selects product and variant → adds items to the same vendor cart → chooses “Send as a gift” or “Order for myself” → confirms delivery and payment → receives order confirmation and tracking. The order enters the vendor’s existing fulfilment dashboard.

Customers can order without first visiting the JustGifter homepage or using the AI assistant. Gift purchases include the message and reveal options; self purchases use ordinary delivery checkout. Both routes use the same approved catalogue, stock, pricing, payment verification and support policies.

### Important additional scenarios

- Wedding guests purchase gifts for a household; quantities and variants help prevent duplicate appliances or wrong sizes.

- A buyer sends an anonymous gift. The recipient sees no sender name, but the platform retains buyer identity for support and abuse handling.

- A buyer shops at the last minute. Products that cannot meet the requested arrival date are excluded from deliverable results.

- A host wants a surprise event. A co host can prepare a private page, but publishing personal information requires appropriate host permission.

- A recipient does not respond, a vendor rejects an order, or stock disappears after payment. Operations uses explicit recovery and refund flows.

## 4  Marketplace and gift discovery

A customer should be able to find an appropriate, deliverable gift without knowing the catalogue or the recipient’s exact preferences.

### Catalogue requirements

- **CAT 01 — **Each listing has vendor, title, description, photographs, category, SKU, variants, current price, stock, occasion tags, optional interest tags, service zones, preparation time, delivery rules and return eligibility.

- **CAT 02 — **Product pages disclose what is included, dimensions or size where relevant, personalisation requirements, wrapping options, fees, expected delivery window and vendor identity.

- **CAT 03 — **Search and filters support occasion, budget, category, location, availability, delivery date, vendor and personalisation. Sort by relevance, price and earliest feasible arrival.

- **CAT 04 — **Product cards show truthful availability and a price basis. A “from” price must identify that variants may cost more. Sponsored placement must be labelled.

- **CAT 05 — **Validate delivery eligibility server side before payment. Cache results for discovery, but recheck price, variant and stock at checkout.

### Gift assistant inputs

Ask for occasion, relationship, budget, recipient interests, recipient city or zone and desired delivery date. Age band, style and gift preferences are optional; exact date of birth is unnecessary. Allow “I am not sure” and provide accessible conventional filters.

Recommendations explain relevance using supplied information, such as “Within your budget and available in Abuja before Friday.” Do not imply personal knowledge of the recipient or guaranteed enjoyment. Budget filtering should account for known delivery and wrapping fees; disclose uncertainty before an address is known.

### Merchandising

Administrators manage occasion collections, featured vendors and editorial gift guides. Moderation must prevent prohibited items, misleading medical claims, counterfeit goods and unavailable stock from being promoted. Listings remain subject to operational eligibility even when featured.

## 5  Gift creation and recipient experience

A gift consists of a commercial order, a recipient relationship and a digital presentation. Keep these records separate so opening a gift cannot be confused with receiving it.

### Sender requirements

- **GFT 01 — **Select product variant, quantity, optional approved customisation and wrapping. Require confirmation of personalisation text before checkout.

- **GFT 02 — **Add sender display name, recipient name and verified contact route. Allow a short text message at launch; photo, audio and video messages can follow with moderation and upload limits.

- **GFT 03 — **Choose immediate or scheduled reveal with explicit timezone. Preview the recipient experience and price before paying.

- **GFT 04 — **State whether the delivery address is known or will be supplied by the recipient. Explain that collecting an address may spoil a full surprise.

- **GFT 05 — **Permit message and schedule edits until the reveal is dispatched. Product, recipient and delivery changes after payment require controlled order amendments.

### Recipient requirements

- **GFT 06 — **Gift links use high entropy tokens and an additional contact check for sensitive details. Link previews must not expose the item, message, address or sender identity when anonymous.

- **GFT 07 — **Recipient can open the reveal, skip animation, replay it, see the message and provide an address if needed. Acknowledgement and a thank you note are optional.

- **GFT 08 — **Recipient can decline, report abuse or stop future contact. Operations may investigate without revealing the sender to the recipient.

- **GFT 09 — **Show fulfilment status separately from reveal status. “Your gift is on its way” appears only after verified dispatch, not after payment.

### Scheduling rules

Scheduled reveal jobs run from server time and carry idempotency keys. A failed notification is retried without duplicating the order or message. If payment has not been verified, never issue a paid gift reveal. A vendor cancellation before reveal suppresses promotional gift messaging and alerts the buyer. After reveal, explain the cancellation and resolution plainly.

Proposed launch claim window: 72 hours, shown before payment and in reminders. Gift arrival dates remain estimates until vendor acceptance. Do not accept address unknown orders for perishable, nonrefundable or highly customised items unless operations explicitly supports their cancellation risk.

## 6  Occasion pages and event publishing

Occasion pages should feel personal while remaining fast to create. Users edit content and select approved visual patterns; a freeform website builder is unnecessary for the first release.

### Event types and content

Support birthday, wedding, anniversary, baby shower, graduation, housewarming, appreciation and custom celebration. Condolence or sensitive occasions should use restrained templates with no default confetti. Event type guides content and effects but does not dictate gendered styling.

- **EVT 01 — **Required: page title, host display name, event type, date or “date to be confirmed”, timezone and visibility. Optional: cover, story, venue, agenda, dress code, RSVP and wishlist.

- **EVT 02 — **Let hosts hide venue and exact event time independently from the wishlist. A publicly shared page must never expose a delivery address.

- **EVT 03 — **Provide template selection, section reorder within safe boundaries, fonts and colours from approved sets, image cropping, undo and mobile preview.

- **EVT 04 — **Save drafts automatically. Publish an explicit version after validation; changes remain drafts until published. Warn before removing a wishlist item with active orders.

- **EVT 05 — **Provide share URL, social preview and QR code. Unlisted pages are accessible to anyone with the link; describe this accurately. Private pages require invited guest verification. Search indexing is enabled only for deliberately public pages.

- **EVT 06 — **Hosts can close, archive or unpublish pages. Existing orders remain available through private order access even if the event is removed.

### RSVP and guest engagement

Basic RSVP is a later enhancement unless required for the launch market. When introduced, collect attendance and optional guest count privately, set a capacity, prevent duplicate submissions and allow changes. Guest notes need approval or moderation before appearing publicly. Gift amounts and buyer identities remain private by default.

### Template library

Every template has an ID, version, supported event types, content schema, permitted design tokens, motion preset, accessibility fallback and preview. Store content separately from presentation. Hosts can change a template without losing event details or breaking purchased wishlist references.

## 7  Wishlists and purchase coordination

A wishlist expresses what the host wants and coordinates purchases. It must prevent accidental duplication without telling guests who bought what or revealing private recipient details.

### Launch rules

- **WIS 01 — **Add approved vendor products with specific variant, desired quantity, priority and optional note. Show current availability and price, not an immutable promise from creation time.

- **WIS 02 — **Host delivery address is securely stored and verified before enabling purchase. Guests see a delivery zone and charge, never the full address.

- **WIS 03 — **Quantity available equals desired quantity minus verified purchases minus active checkout holds. A transactional hold protects the final remaining unit across simultaneous buyers.

- **WIS 04 — **Proposed hold duration: 10 minutes. Align the payment session with this window. If a successful payment arrives after expiry and the item has been purchased by someone else, resolve through a funded alternative with buyer consent or a refund; never overbook silently.

- **WIS 05 — **Pending payment does not mark an item purchased. Failed or abandoned payments release the hold. Cancellation or completed refund restores quantity only if the host still wants the item and it remains eligible.

- **WIS 06 — **Host can see fulfilment progress. A surprise mode hides buyer identity and purchased item details until the configured date while still adjusting availability for other guests.

- **WIS 07 — **Removing a listing does not remove a historical purchase. If price or availability changes, mark the wishlist entry unavailable and offer host approved alternatives.

### External wishes and group funding

Later, allow external URLs as inspiration or manually managed wishes clearly labelled “Not sold by JustGifter”. Do not claim delivery or payment protection for off platform purchases. Any “I bought this elsewhere” reservation needs host confirmation and expiry to prevent abuse.

Group contributions require a separate funding ledger, target, deadline, contributor refunds, overfunding rules, price change policy and handling for vendor failure. Do not launch a balance or wallet simply by adding a progress bar. Cash gifts and funding models require payment provider and legal review before release.

## 8  Reveal design and motion requirements

The reveal is a deliberate emotional moment. It must work on ordinary phones, respect user control and never delay access to essential information.

### Gift reveal

Launch with an envelope opening and a wrapped gift opening. Each has a short anticipation scene, a clear tap or keyboard action, a product and message reveal, and an optional thank you action. Allow sender preview with placeholder recipient data. Keep product price hidden from the recipient by default.

### Event reveal

Provide a short curtain, card or invitation opening that introduces the host and occasion before revealing the page. A wedding can use restrained transitions; a birthday can use playful motion. The host chooses the tone, and AI selects only from eligible presets.

### Implementation contract

- **MOT 01 — **Use vetted motion assets or code controlled animations. Animation is decorative; the underlying event or gift content must exist in accessible HTML.

- **MOT 02 — **Respect reduced motion settings automatically. Provide “Open without animation” before playback and a visible skip control. No compulsory sound; audio requires an explicit user gesture.

- **MOT 03 — **No flashing effects, forced device movement or drag only controls. Keyboard and assistive technology users can complete the experience.

- **MOT 04 — **Target 3 to 6 seconds for default reveals. Load essential content first; lazy load larger effects. Network failure displays a static opening card and normal content.

- **MOT 05 — **Remember that the viewer has opened the reveal without preventing replay. Avoid forcing the full opening on every page visit.

- **MOT 06 — **Preview tokens are isolated from live links. Sharing a preview must not activate a recipient claim or count as an actual reveal.

### Content control

Templates and user uploads must be safe and licence appropriate. Do not execute arbitrary HTML, JavaScript or AI generated code in an event page. Separate a public event intro from a private gift reveal so public links cannot expose orders.

## 9  Vendor storefronts and operations

JustGifter relies on dependable vendors. Registration creates an application, not permission to sell. Approval and listing review are operational controls that need an administrator interface from day one.

### Onboarding

- **VEN 01 — **Collect business name, business type, owner contact, address, service zones, fulfilment hours, product categories, preparation times, pickup or courier model and payout details.

- **VEN 02 — **Collect verification documents only when required for the launch model and provider. Store them privately with restricted staff access and a retention policy.

- **VEN 03 — **Application states: draft, submitted, under review, needs information, approved, rejected and suspended. Record reviewer, reason and timestamps; notify the applicant.

- **VEN 04 — **Require acceptance of catalogue, delivery, return and marketplace terms. Vendor owners can invite scoped staff after approval.

### Catalogue and stock

- **VEN 05 — **Vendors create draft listings; new listings and material changes enter moderation. Suspended vendors cannot receive new orders, but operations must resolve existing commitments.

- **VEN 06 — **Track stock per variant, outstanding reservations and committed orders. Personalised products define required inputs and lead time. Vendors cannot change historical order prices.

- **VEN 07 — **Sellers define blackout dates, capacity and cutoffs. The platform restricts promises to supported delivery windows.

### Order management

Dashboard shows actionable orders, accept by deadline, preparation requirements, customisation, packaging and fulfilment milestones. Show only delivery information needed for the order. Buyers’ private budgets, AI conversations and unrelated event guest lists are inaccessible.

Proposed vendor acceptance target: within four operating hours. The exact target is configurable by category. Rejection or timeout opens a buyer resolution flow. Automatic substitution is prohibited. If stock accuracy is poor, temporarily suppress the listing or vendor from recommendations.

### Vendor storefronts and direct ordering

- **STF 01 — **Every approved vendor can publish a mobile friendly storefront at a unique platform URL, such as /stores/vendor-slug. Provide a copy link action and downloadable QR code for direct customer sharing. Reserve platform names and prevent impersonation through slug validation.

- **STF 02 — **Show business name, logo, cover image, introduction, approved products, collections, operating hours, delivery zones, preparation times and applicable delivery and return policies. Show verification labels only when backed by the platform review process.

- **STF 03 — **Vendors can edit permitted branding, organise collections, feature products and preview before publishing. Use approved layouts and design tokens. Custom domains and unrestricted page building are later enhancements.

- **STF 04 — **Customers can search and filter within the vendor catalogue, open product details, select variants and quantities, add items to a cart and complete checkout directly from the storefront. No account is required before browsing; guest checkout follows the platform contact verification rules.

- **STF 05 — **Offer “Send as a gift” and “Order for myself”. Gifting supports recipient details, message, optional reveal and eligible scheduling. Self purchase does not require an occasion, gift message or reveal. Both options remain visible and understandable.

- **STF 06 — **Storefront listings and marketplace listings reference the same product, price and variant stock records. A sale through either channel immediately affects shared availability. Reject checkout when stock, vendor status or delivery eligibility has changed.

- **STF 07 — **Keep one vendor per cart at launch. When a customer adds an item from another vendor, explain that it needs a separate checkout and delivery charge; preserve the original cart rather than silently clearing it.

- **STF 08 — **Record order source as marketplace, occasion wishlist or vendor storefront, with a validated storefront ID and optional campaign reference. The server derives attribution from the purchase context. Attribution does not override approved pricing, fees or vendor ownership.

- **STF 09 — **Display direct orders in the same order dashboard with a source filter and order type of gift or self purchase. Customer confirmation, tracking, cancellations, refunds and dispute access work independently of whether the storefront remains published.

- **STF 10 — **Vendors can save drafts, publish and pause storefront ordering. Only approved vendors with eligible listings can accept payment. During a pause, show a clear unavailable state. Suspension removes new purchase access across marketplace and storefront channels while retaining existing order support.

- **STF 11 — **Provide share previews using approved business and product media. Redirect an old slug after an authorised change where feasible; never reassign an old slug in a way that misdirects customers. Private order or customer data must not appear in public metadata.

- **STF 12 — **Show storefront visits, product views, checkout starts, verified paid orders, conversion and net sales by date. Exclude vendor previews and staff tests; minimise tracking data and respect consent requirements.

### Storefront payment and service rules

A shared store link is a direct sales entry point into JustGifter checkout. It does not create a separate payment balance or bypass platform fees, moderation, fulfilment rules or buyer support. Apply the same disclosed fee schedule initially; any future channel specific pricing requires an explicit commercial decision and visible checkout totals.

### Commercial visibility

Show gross item revenue, discounts, commission, applicable charges, refunds, net payable and payout status per order. Provide downloadable statements and support cases. Bank detail changes require owner reauthentication, notification and a controlled review before payout.

## 10  Checkout payments and financial records

Financial records must reconcile what the buyer paid, what is owed to each party and what has been refunded. A browser success screen is insufficient evidence of payment.

### Pricing and payment

- **PAY 01 — **For marketplace, wishlist and storefront checkout, show item subtotal, wrapping, personalisation, delivery, discounts, platform fee if any, applicable tax and total before authorisation. No recipient payment at launch.

- **PAY 02 — **Create the payable order server side using current validated prices. Store a price snapshot and integer minor units. Currency is explicit on every payment and ledger record.

- **PAY 03 — **Use hosted or tokenised provider checkout; do not store card credentials. Paystack is the recommended launch provider, subject to account approval and confirmation of the marketplace settlement model.

- **PAY 04 — **Verify signed webhooks and reconcile payment status with the provider. Deduplicate webhook events and charge attempts. Never generate multiple gifts from a repeated callback.

- **PAY 05 — **Support pending, successful, failed and expired attempts; refunds have their own lifecycle. A client return URL displays “Confirming payment” until authoritative verification completes.

### Ledger and settlement

Maintain append only financial entries for charges, fees, vendor payable, refunds, reversals and payouts. Corrections use compensating entries. Reconcile provider transactions daily and expose unmatched payments to operations. An order status is not a financial ledger.

Proposed settlement policy: payout becomes eligible after recorded delivery and a defined dispute window, subject to the payment provider’s supported marketplace structure. The duration, reserves, fees and merchant of record must be agreed before launch. Do not describe funds as escrow or implement stored value without approved arrangements.

### Refunds and disputes

Record item and fee refund eligibility separately, including pre acceptance cancellation, recipient decline, missed claim deadline, damaged goods and personalisation errors. Show the applicable terms before checkout. A platform failure should not leave the buyer paying unexplained fees. A refund request, approval and provider completed refund are distinct states.

Chargebacks require evidence, a case owner and reversal handling. Avoid paying vendors again when refund or payout webhooks repeat. Admin financial adjustments require a reason and approval separation above a configurable amount.

## 11  Delivery returns and exceptions

Digital delight cannot substitute for physical reliability. JustGifter needs a named fulfilment model, delivery ownership and escalation process before accepting live orders.

### Fulfilment requirements

- **FUL 01 — **Choose approved vendor delivery or an integrated courier by zone. Disclose the responsible party and quote basis at checkout.

- **FUL 02 — **Delivery promise combines stock, preparation time, cutoff, operating calendar, capacity and courier coverage. Distinguish requested date, estimated window and confirmed window.

- **FUL 03 — **Track preparation, ready for dispatch, dispatched, attempted delivery and delivered. Delivery evidence may include courier confirmation or a recipient code; avoid public proof photos.

- **FUL 04 — **Support incorrect address, unreachable recipient, failed attempt, late delivery and damaged or missing item. Notify affected people with a concrete next action and revised estimate.

- **FUL 05 — **Do not allow unsupervised changes to recipient, item or address after dispatch. Restrict edits to audited support actions where the courier permits them.

### Exception handling matrix

| Scenario | Required resolution |
| --- | --- |
| No stock after payment | Freeze fulfilment; buyer chooses an eligible alternative or refund. |
| Recipient declines or claim expires | Cancel before irreversible preparation; initiate disclosed refund flow. |
| Address outside service zone | Sender approves revised quote or cancels; no charge to recipient. |
| Event cancelled after orders exist | Close new purchases; preserve existing orders and apply cancellation terms individually. |
| Delivery missed the occasion | Notify buyer promptly; offer agreed remedy through support. |
| Personalised item has vendor error | Collect evidence and offer remake or refund under approved policy. |
| Recipient reports harassment | Block repeat contact, restrict links and investigate privately. |
| Vendor suspended with open orders | Operations retains order access and resolves delivery or refunds. |

For perishable goods, specify failed delivery disposal and refund rules before launch. Recipient codes should not expose the gift prematurely. Retain necessary evidence for dispute handling without collecting excessive personal data.

## 12  AI capabilities and safeguards

AI should reduce decision effort and page creation time. Commerce eligibility, payments and permissions remain deterministic server rules.

### Gift recommendations

AI 01 — Convert conversation into structured preferences: occasion, relationship, budget, interests, zone and date. Retrieve from approved active listings only. Hard filter stock, delivery feasibility, budget and product restrictions before semantic ranking. Return product IDs, short explanations and optional follow up questions.

AI 02 — Validate every suggested ID and current price before rendering. Recheck again at checkout. If nothing qualifies, explain which constraint is limiting and ask whether the customer wants to change it. Never fabricate a product or force an unsuitable recommendation.

AI 03 — Use editorial relevance and semantic matching for the initial release. Behavioural personalisation follows only after sufficient consented interaction data. Avoid claiming a proprietary trained model before one exists.

### Event composition

AI 04 — Accept event type, tone, preferred colours and host supplied content. Return a validated JSON configuration containing template ID, section order, design tokens, motion preset and draft copy. The renderer accepts only allowlisted values and schema compatible content.

AI 05 — Host previews, edits and explicitly publishes the result. AI cannot change event privacy, send invitations, order gifts or publish autonomously. Never invent a venue, date, personal story or relationship detail; leave missing details as prompts.

### Optional assistance

Later add message drafting, vendor description assistance and wishlist balance suggestions across price ranges. Vendor generated copy still needs seller confirmation and moderation. These tools cannot invent materials, certification, stock or product capabilities.

### Privacy and abuse

- Treat listing descriptions, uploads and user prompts as untrusted data. Embedded instructions cannot alter permissions or tool behaviour.

- Minimise model context. Recipient contacts, exact addresses, payment data and verification documents are not needed for recommendations.

- Record model version, prompt version, retrieved IDs and validation results without logging sensitive full prompts unnecessarily. Set retention and deletion rules.

- Apply rate limits, per session cost budgets, moderation and timeouts. AI failure falls back to filters and manual template selection.

### Evaluation

Before launch, evaluate a curated set covering low budgets, no stock, unsupported cities, tight deadlines, custom events, malicious listing text and sensitive occasions. Proposed release gates: 100 percent of displayed recommendations have valid catalogue IDs; no ineligible product passes final server validation; no private address reaches model prompts; at least 80 percent of evaluated recommendation sessions earn an acceptable relevance rating from human reviewers. These are targets to validate, not achieved results.

## 13  Information architecture and required screens

Design the public, personal, vendor and platform surfaces as related products with clear access boundaries. Every screen needs loading, empty, error, offline or retry states appropriate to its task.

| Surface | Required screens |
| --- | --- |
| Public website | Home; occasion collections; catalogue; search results; product; gift assistant; vendor storefront; storefront collection; store search; help; policies. |
| Purchase | Same vendor cart or buy now; gift or self purchase choice; recipient or buyer details; address route; message and reveal; delivery; order review; payment pending; confirmation; failure. |
| Recipient | Secure gift entry; contact verification; reveal; private address form; decline; delivery tracking; thank you; report. |
| Customer account | Orders; order detail; sent gifts; saved items; recipient preferences; notification settings; support cases. |
| Host | Event list; setup; template chooser; content editor; wishlist editor; privacy; preview; publish; gifts received; archive. |
| Occasion visitor | Event reveal; event page; wishlist; item selection; guest checkout; purchase confirmation. |
| Vendor | Application; verification status; dashboard; products; stock; storefront editor; storefront preview and publish; share link and QR; store analytics; orders with source filters; fulfilment; staff; payouts; support; settings. |
| Platform operations | Vendor review; listing moderation; orders; storefront moderation; payment reconciliation; refunds; disputes; delivery exceptions; content reports; templates; audit logs. |

### Home page content flow

Explain the value → offer “Send a gift” and “Create an occasion page” → show gifts by occasion and budget → demonstrate the recipient reveal → explain wishlists → introduce trusted vendors → answer delivery and payment questions → offer vendor application. Avoid leading with an abstract AI pitch before customers understand the gifting service.

### UX writing rules

Use plain distinctions: “Payment confirmed”, “Vendor preparing your gift”, “Gift opened” and “Delivered”. Never label all four “Completed”. Show a clear action on failed states. Before claiming a gift, explain that the delivery address is private and who can access it. Do not pressure recipients to publicly thank a sender.

## 14  Technology stack and architecture

Use a modular web application with a relational transactional database, private object storage and background workers. The confirmed core stack is Supabase for the database and backend, Vite for the frontend build system and Cloudflare for deployment. The supporting libraries and external providers below are recommendations.

### Confirmed core stack

Supabase is the system of record and application backend. Vite builds the web interface, with React recommended as the UI library and TypeScript recommended for maintainable application code. TypeScript compiles to JavaScript and remains compatible with the selected Vite stack. Cloudflare hosts the application and provides edge delivery. Vite itself is a build tool, not the backend or database.

Deploy the Vite application using Cloudflare Workers with Static Assets and the Cloudflare Vite plugin. Keep payments, privileged order changes and AI orchestration in Supabase Edge Functions. Use a small Cloudflare Worker only where needed for public page rendering, metadata and routing; do not duplicate commerce logic in two runtimes. [S1–S2]

### Frontend libraries

- React with TypeScript — Build the public website, host workspace, vendor dashboard and admin interfaces with shared typed components. Pin compatible stable dependency versions at implementation.

- React Router — Define public, customer, vendor and admin routes. Route guards improve navigation, while Supabase policies and backend checks enforce actual permissions.

- TanStack Query — Manage server data fetching, cache invalidation and retries. A successful client mutation must refresh relevant cart, wishlist, stock and order views. [S3]

- Tailwind CSS with an accessible component system such as shadcn/ui — Establish reusable form, dialog, table and navigation patterns. Verify keyboard and screen reader behaviour rather than assuming a library guarantees accessibility.

- React Hook Form with Zod — Manage complex checkout and event forms and validate typed schemas. Repeat all critical validation on the server; browser validation is only a usability layer. [S4]

- Motion for React — Implement interface transitions and the initial gift reveals with reduced motion support. Add Rive later only for bespoke interactive scenes that justify another runtime and larger assets. [S5]

- Solar Icons — Use @solar-icons/react as the product icon library across the website, storefronts and dashboards. Standardise size, colour and style through the design system; prefer explicit per icon imports where practical. Decorative icons should not duplicate accessible text, and icon only controls require clear labels. [S15]

Install the icon package in the frontend project:

```bash
npm install @solar-icons/react
```

### Developer skills setup

Before UI implementation, install the requested Jakub Krehel and shadcn/ui skills in the development project using the commands below. These are developer tooling requirements; they are not dependencies shipped in the customer application. [S16–S17]

```bash
npx skills add jakubkrehel/skills
```

```bash
npx skills add shadcn/ui
```

Use the installed guidance when building components and reviewing interface quality. Record the selected skills and source revision in the repository setup notes so other contributors can reproduce the environment. Run the installer in project scope and review its available skill choices before selection.

### Supabase backend responsibilities

- Postgres — Store catalogue, storefronts, events, orders, reservations and ledger records. Use SQL transactions and constrained database functions for stock and wishlist allocation; Realtime notifications are not locks.

- Auth and row level security — Manage customer identities, vendor memberships and platform roles. Enforce isolation per user and organisation. Keep publishable client credentials separate from privileged server credentials.

- Edge Functions — Verify payment webhooks, create checkout sessions, call external providers, validate AI output and process controlled order operations. Store provider secrets only in server environments.

- Storage — Keep product and approved cover media public where appropriate. Use private buckets and signed access for recipient messages, identity documents and delivery evidence. Start here instead of maintaining multiple media storage providers.

- Realtime — Update order statuses and wishlist availability after committed changes. Reconnect by refetching authoritative records; do not assume every live event reaches the browser.

- Cron and Queues — Schedule due reveals, claim reminders, reservation expiry, notification retries and reconciliation. Persist jobs in the database and process them in bounded Edge Function batches. Consumers must be idempotent, with retry counts and a failed job view. Do not use browser timers or depend on a long running request. [S6–S7]

- Search — Start with Postgres text search and structured filters. Introduce pgvector for catalogue similarity when the recommendation evaluation shows value. Keep stock, budget and service zone filters deterministic. A separate search cluster is unnecessary for the initial catalogue. [S8]

### Recommended launch integrations

- Paystack for payments — Use server initiated checkout, verified transaction status, signed webhooks and traceable refunds. Subaccounts or splits are an option for distributing marketplace revenue. A split payment is not evidence of escrow or permission to hold funds until delivery; settle the commercial model with the provider before implementing delayed payouts. [S9–S10]

- Zoho Mail for email — Use Zoho Mail for JustGifter business mailboxes and application email. Configure Supabase Auth with Zoho Mail custom SMTP using the account’s exact datacentre settings and authorised sender. Send receipts, reveal links, claim reminders and vendor notifications through a server side email adapter. Keep credentials out of the browser and confirm account sending permissions, limits and runtime compatibility before launch. [S11, S14]

- Claude API as an initial AI candidate — Evaluate it for gift preference extraction, catalogue grounded explanations and template configuration. Keep a provider adapter so a different model can be substituted after quality, latency and cost tests. Select a specific model through the evaluation suite rather than hardcoding a premium model for every request. AI calls run in Supabase Edge Functions. [S12]

- Cloudflare Turnstile for abuse reduction — Protect exposed signup, claim and contact flows where abuse warrants a challenge. Validate every token server side and retain rate limits. Client widget completion alone is insufficient. [S13]

- Sentry for application error monitoring — Recommended for frontend and backend exception reporting. Scrub contact details, reveal tokens, addresses and message contents; include safe correlation IDs for support.

- GitHub with CI checks — Store application code, database migrations, template schemas and deployment configuration. Run type checking, linting, unit tests and checkout integration checks before production deployment.

### Zoho Mail delivery requirements

Configure SPF, DKIM and DMARC for the sending domain through its DNS settings. Use the Zoho Mail SMTP host and authentication method shown in the actual account rather than assuming one global hostname. Keep support replies routed to a monitored mailbox. Supabase authentication messages and application notifications need separate templates and controlled rate limits. [S11, S14]

The notification queue must record provider acceptance, failed attempts and retries without labelling acceptance as confirmed inbox delivery. Handle delivery failures using the reporting available in the selected Zoho account; do not assume webhook parity with another provider. Test signup, password recovery, gift reveals and order receipts end to end in staging. Validate expected event traffic against the account’s allowed sending capacity.

### Integrations to add when justified

SMS and WhatsApp: shortlist a provider such as Termii or Twilio after testing local delivery, sender registration, template rules and cost. Use an adapter and message status callbacks. Sharing a storefront link manually must work without a WhatsApp API integration. Automated WhatsApp delivery requires the provider’s approved business messaging setup.

Logistics and addresses: begin with approved vendor delivery and explicit service zones. Add one courier partner only after confirming coverage, rates, failed delivery handling and tracking quality in pilot cities. Add address autocomplete or a map pin later; always permit manual addresses and landmarks, and validate serviceability independently of geocoding.

Analytics and media: start with privacy safe business events in Supabase and operational dashboards. Consider PostHog for product analytics only when its additional analysis is needed; disable sensitive session recording by default. Consider Cloudinary for advanced transformations or video when Supabase Storage and basic image optimisation no longer meet measured needs.

Testing tools: recommend Vitest with React Testing Library for application tests, Playwright for buyer, host and vendor journeys, and axe based checks for accessibility. Test real devices and manual keyboard use alongside automation.

### Public rendering and search visibility

Vendor stores, product pages and deliberately public occasion pages need indexable HTML, canonical URLs and correct social preview metadata. A client only SPA shell is insufficient for reliable link previews. Add server rendering through the Cloudflare Worker or a compatible Vite based rendering approach, and validate the rendered response for each route. Dashboards can remain client rendered. [S1]

Keep private event pages and gift claim routes out of public caches, sitemaps and preview metadata. Apply no store caching to sensitive responses. A public event becomes nonpublic immediately when unpublished; invalidate cached pages and return an appropriate unavailable response.

### Deployment and integration requirements

- **TECH 01 — **Separate development, staging and production Supabase projects, payment credentials and deployment environments. Preview builds must never connect to production payment secrets or send real gift notifications.

- **TECH 02 — **Only public configuration may use VITE prefixed environment variables because these values are included in browser assets. Service role keys, payment secrets, AI keys and signing credentials must remain server side.

- **TECH 03 — **Version database changes in migrations and test them in staging. Apply compatible schema changes before frontend release; document application rollback and data recovery separately.

- **TECH 04 — **Configure permitted origins and authentication redirect URLs explicitly. Public Supabase endpoints still require their own authentication, RLS, validation and rate limits; Cloudflare hosting alone does not protect requests sent directly to Supabase.

- **TECH 05 — **All integrations need sandbox credentials, timeouts, signed webhook validation where provided, event deduplication, failure logging and an operational retry or reconciliation path.

- **TECH 06 — **Record plan limits and monthly budgets for database compute, storage, egress, functions, messages, monitoring and AI. Provider pricing is variable and is not fixed by this document.

- **TECH 07 — **Before release, verify storefront deep links and social previews, invitation redirects, upload access, payment callbacks, scheduled jobs and webhook retries on the deployed Cloudflare domain.

### Core entities

| Domain | Entities and relationships |
| --- | --- |
| Identity | User; verified contact; organisation; membership; role; invitation. |
| Catalogue | Vendor; verification; storefront; storefront version; slug history; collection; product; variant; stock reservation; service zone; operating calendar. |
| Occasions | Event; co host; published version; template version; wishlist; wishlist item; visibility rule. |
| Gifts | Gift; recipient; private address; message; reveal configuration; claim token; reveal event. |
| Commerce | Order with source and purchase type; order line; payment attempt; refund; ledger entry; settlement; payout. |
| Operations | Shipment; delivery attempt; support case; dispute; moderation report; audit event. |
| AI and messaging | Recommendation session; retrieved product reference; approved page configuration; notification; scheduled job. |

### Relationship and consistency rules

An order line references its vendor, product and variant while retaining immutable commercial snapshots. A gift references an order and optional wishlist item. An event may have many gifts; deleting a page must not cascade delete orders. Store private addresses separately from publishable event content.

Enforce stock and wishlist holds within database transactions or equivalent atomic operations. Use idempotency keys for payment initiation, webhooks, refund creation, payout requests and scheduled notifications. An outbox pattern should enqueue downstream work after a committed business transaction. Failed jobs retry with bounded backoff and enter a visible exception queue.

Each vendor has one canonical storefront at launch. Collections reference existing product IDs. Orders retain vendor ID, source channel, optional storefront ID and purchase type. Gift records are optional for self purchases. Store publication cannot override vendor approval, and cached pages must still revalidate eligibility before payment.

### Service boundaries

- Public rendering service serves catalogue, vendor storefronts and published event content with cache control suited to page privacy.

- Commerce service owns eligibility, reservations, price snapshots, order transitions and financial integration.

- AI service can retrieve eligible catalogue data and propose validated configuration; it cannot mutate orders or permissions.

- Worker service handles reveal schedules, notifications, reservation expiry and reconciliation independently from browser sessions.

- Storage separates public product media from private messages, documents and delivery evidence. Use signed short lived access for private assets.

### State models

Order: awaiting payment → paid → awaiting recipient details when needed → awaiting vendor acceptance → accepted → preparing → dispatched → delivered. Declined, cancelled, delivery issue and dispute are explicit branches. Refund lifecycle is independent: requested → approved → submitted → completed or failed.

Gift reveal: draft → scheduled → available → opened; revoked or expired are access states. Event: draft → published → closed → archived. Publication may be revoked without cancelling existing commercial records.

## 15  Security privacy and platform trust

The system must protect personal celebrations and delivery details as carefully as commercial records. These are product requirements, not a claim of legal compliance; jurisdiction specific review is a launch dependency.

- **SEC 01 — **Enforce access checks on the server and database for every private record. Vendor organisation IDs and event ownership cannot be trusted from client input.

- **SEC 02 — **Encrypt transport and use managed encryption for stored data. Keep credentials server side; rotate secrets and restrict service privileges.

- **SEC 03 — **Gift tokens must be unpredictable, revocable, expiry aware and stored as hashes where appropriate. Use contact verification to reduce forwarded link exposure. Rate limit OTPs and prevent user enumeration.

- **SEC 04 — **Apply upload type and size validation, malware scanning where appropriate, metadata removal and content moderation. Reject executable uploads and sanitise rendered text.

- **SEC 05 — **Mask addresses and contacts in logs, analytics and support lists. Full access requires a task related role and an audit trail. Reveal links must not leak through third party analytics or referrers.

- **SEC 06 — **Keep event privacy, sender anonymity and notification preferences independent. Marketing consent is separate from transactional communication.

- **SEC 07 — **Provide data export, deletion requests and retention controls. Preserve legally or financially required transaction records under defined retention rather than promising total immediate deletion.

- **SEC 08 — **Report fraudulent vendors, abusive messages and impersonated hosts. Provide escalation, takedown and appeals with recorded decisions.

- **SEC 09 — **For launch, require adult account holders and adult recipients or guardian managed gifting. Do not create searchable children’s profiles or collect unnecessary birth dates.

- **SEC 10 — **Backup and restore procedures must be tested. Audit privileged actions, payout changes, moderation, order amendments and financial adjustments.

### Policy work required

Before accepting live payments, approve marketplace terms, vendor agreement, privacy notice, content rules, returns and cancellations, delivery responsibility and settlement structure. Confirm consumer protection, tax and data protection obligations with qualified local advisers. Nothing in this document assumes that a chosen payment provider authorises custody or pooled funding.

## 16  Quality performance and operational readiness

The following are proposed engineering targets to measure in preproduction and pilot traffic. Capacity must be revisited when expected traffic, catalogue size and event sharing patterns are known.

| Area | Proposed requirement |
| --- | --- |
| Accessibility | Target WCAG 2.2 AA; keyboard operation, labelled forms, focus visibility, contrast and reduced motion. |
| Public performance | Target LCP at most 2.5 seconds, INP at most 200 ms and CLS at most 0.1 at the 75th percentile on representative mobile traffic. |
| Reveal assets | Initial decorative assets target below 1 MB; larger media load after essential content and never block access. |
| AI response | Show progress immediately; target useful results within 8 seconds, with a manual fallback after a bounded timeout. |
| Availability | Initial monthly target 99.9 percent for core browsing and order management, excluding clearly measured provider outages. |
| Recovery | Proposed RPO at most 1 hour and RTO at most 4 hours; validate cost and demonstrate restore before launch. |
| Scheduling | Target reveal job execution within 60 seconds of scheduled time; external message delivery is monitored separately. |
| Compatibility | Test current major mobile and desktop browsers on low bandwidth and modest phones; no mandatory WebGL. |
| Observability | Alerts for failed payment verification, overselling, payout failures, delivery issues, worker backlog and AI cost spikes. |

### Operational readiness

Define support hours, case severity, refund authority and vendor escalation contacts. Publish realistic response expectations. Test payment provider outages, worker restart, duplicate events and backup restoration. Prepare dashboards showing paid orders without vendor acceptance, unresolved recipient claims and refunds stuck with the provider.

Offer a controlled fallback when a service fails: browsing and manual templates without AI; a static reveal without motion; payment pending without false confirmation; support assisted tracking without invented courier updates.

## 17  Acceptance criteria and test scenarios

These criteria define observable behaviour for launch sign off. Test commerce, privacy and concurrency in addition to visual presentation.

| ID | Scenario and expected result |
| --- | --- |
| AC 01 | Given an unsupported zone or impossible date, checkout blocks payment and explains the constraint. |
| AC 02 | Given two guests purchasing the final wishlist quantity, only one acquires the active hold; the other sees updated availability. |
| AC 03 | Given repeated success webhooks, exactly one paid order, stock commitment and gift record are created. |
| AC 04 | Given a browser success return without verified payment, the UI remains pending and no paid reveal is dispatched. |
| AC 05 | Given a late verified payment after hold expiry, operations resolves the conflict without overselling or losing the funds. |
| AC 06 | Given an unknown address gift, recipient contact verification and supported address submission are required before fulfilment. |
| AC 07 | Given an anonymous gift, the recipient cannot infer sender identity from UI, links, media metadata or notifications. |
| AC 08 | Given an unlisted event, crawlers are discouraged but anyone with its link can view it; private events require verified invitation. |
| AC 09 | Given reduced motion or an animation error, all gift and event content remains accessible without the effect. |
| AC 10 | Given an AI suggestion with an invalid product or template ID, validation rejects it and presents a safe fallback. |
| AC 11 | Given vendor A attempts access to vendor B orders or addresses, access is denied and logged. |
| AC 12 | Given an event is unpublished after a paid gift, buyer order access and support records remain available. |
| AC 13 | Given recipient decline or claim expiry, the correct cancellation and refund lifecycle runs once. |
| AC 14 | Given a bank detail change, privileged verification occurs and pending payout handling follows the approved review rule. |
| AC 15 | Given a damaged or missing gift, a support case links to order, vendor, evidence and a tracked resolution. |
| AC 16 | Given a scheduled reveal across timezone boundaries or worker restarts, the correct UTC schedule is respected and notification is deduplicated. |
| AC 17 | Given a shared vendor link, a guest can browse that vendor’s products and place a paid order without visiting the marketplace homepage. |
| AC 18 | Given a storefront self purchase, checkout does not require a gift message or reveal; a gift purchase exposes the recipient and reveal options. |
| AC 19 | Given simultaneous marketplace and storefront purchases of the final stock unit, only one checkout can commit it; the other gets an accurate availability message. |
| AC 20 | Given a storefront is paused or its vendor suspended, new checkout is blocked while existing customers retain tracking and support access. |
| AC 21 | Given a verified storefront order, the vendor sees its source and purchase type, correct fees and one stock commitment; replayed callbacks create no duplicate sales. |
| AC 22 | Given a product from a second vendor is added, the customer sees the separate checkout requirement and the first vendor cart is preserved. |

### Test programme

Run automated unit tests for eligibility, fee calculation and state transitions; integration tests for reservations, payment webhooks and access control; end to end tests for direct gifting and wishlist purchasing. Use sandbox payments and seeded vendors. Conduct accessibility, real device, load and moderated usability tests. Reconcile every pilot charge, refund and vendor payable against provider records.

## 18  Implementation roadmap and release gates

Sequence implementation around a complete gift transaction. Do not launch decorative pages while the payment and fulfilment path remains an operational gap. Timing estimates require an agreed team and design scope.

### Phase 0  Define the operating model

Confirm launch zones, categories, vendors, payment structure, commission, delivery ownership and refund rules. Create service blueprints, data flows and the interface prototype. Exit gate: one approved commerce flow, one event flow and signed off business policies.

### Phase 1  Establish the transaction foundation

Implement identity, vendor organisations, approvals, catalogue, shareable storefronts, direct gift and self purchase checkout, stock reservations, verified payments, ledger, fulfilment and platform operations. Exit gate: marketplace and storefront orders can be purchased, delivered, reconciled and refunded without manual database editing; shared stock remains consistent across channels.

### Phase 2  Connect occasions and emotional presentation

Implement occasion drafts and publishing, two or three templates, wishlist coordination, private delivery addresses, gift messages and two reveal styles. Exit gate: a host publishes a page and a guest purchases a wishlist item with correct privacy and stock behaviour.

### Phase 3  Add constrained AI

Implement preference extraction, eligible product retrieval, explanations, template configuration and copy drafting. Add validation, evaluations, cost limits and fallback. Exit gate: evaluation suite passes and conventional browsing remains fully functional.

### Phase 4  Run a limited pilot

Recruit a small approved vendor cohort in chosen zones. Test real fulfilment with controlled customer traffic. Review missed dates, refund reasons, gift relevance and event creation friction. Exit gate: commerce records reconcile, serious defects are resolved and support can handle exceptions.

### Phase 5  Expand based on evidence

Add co hosting, RSVP, additional reveals, richer messages and additional delivery zones. Only then consider multi vendor checkout, pooled funding, digital vouchers and corporate gifts, each with its own business rules and acceptance tests.

### Team responsibilities

Product owner approves scope and policies. Designer owns journeys, templates and accessible motion. Engineers own commerce, data consistency, integrations and rendering. Operations owns vendor quality, fulfilment and support. QA owns scenario coverage and release verification. Finance and legal advisers validate the commercial structure before payment launch.

## 19  Success measures and decisions to confirm

Measure whether JustGifter helps people complete meaningful, dependable gifting. Revenue and page sharing matter, but failed deliveries and confusing purchases must remain visible.

### Metrics

| Outcome | Definition |
| --- | --- |
| Successful gift rate | Delivered and not refunded gift orders divided by verified paid gift orders, measured by purchase cohort. |
| On time delivery | Orders delivered inside the confirmed delivery window divided by delivered orders with a window. |
| Checkout conversion | Verified paid orders divided by eligible checkout starts; segment marketplace gifts, wishlist gifts and storefront gift or self purchases. |
| Event activation | Published pages with at least one wishlist item and one non host visitor divided by started event drafts. |
| Wishlist conversion | Verified wishlist purchases divided by wishlist visitor sessions, excluding host previews. |
| Recommendation usefulness | Product clicks, purchases and explicit relevance feedback after an AI session; compare with conventional discovery. |
| Recipient engagement | Unique opened reveals and optional thank you actions; do not equate opening with delivery. |
| Vendor reliability | Acceptance time, cancellations, stock conflicts, late delivery and dispute rate by vendor. |
| Financial integrity | Unmatched payments, unresolved refund amounts and payout reconciliation differences. |

Instrument key events with privacy safe IDs: discovery started, recommendation shown, storefront viewed, storefront shared, product viewed, hold created, checkout started, payment verified, event published, reveal opened, address submitted, vendor accepted, dispatched, delivered, refund completed and dispute resolved. Exclude host previews and staff testing from customer reporting.

Storefront reporting must attribute orders to the entry channel without counting the same payment twice. Track vendor activation as approved vendors with a published storefront and at least one purchasable listing. Compare storefront visits to verified orders to understand direct sales conversion.

### Decisions required before build estimates

- Launch country, currency, recipient cities and supported gift categories.

- Payment provider, merchant of record, permitted marketplace settlement model, fee structure and refund ownership.

- Vendor delivery versus courier integration, delivery pricing and responsibility for failed delivery.

- Whether unknown address gifting is essential at launch and whether the proposed 72 hour claim window is acceptable.

- Event privacy defaults, guest visibility of purchased wishes and anonymous gifting boundaries.

- Commission, premium template pricing and whether event creation remains free.

- Vendor verification requirements, prohibited categories, support hours and acceptance deadlines.

- Cloudflare and Supabase plan sizing, expected traffic, recovery budget and model provider data handling terms.

### Recommended commercial model

Start with free basic occasion pages and a transparent commission on fulfilled marketplace and direct storefront purchases. Consider paid premium designs or corporate services once customers demonstrate demand. Keep sponsored products visibly labelled and separate from recommendation relevance. Fee rates and prices remain open decisions; this document does not invent them.

### Definition of launch readiness

Launch requires verified payment, private recipient access, accessible reveals and accountable delivery. Hosts must publish pages and coordinate gifts without duplicates. Vendors must fulfil and reconcile orders. Staff must resolve failures through audited tools. Every essential requirement needs an owner and acceptance evidence.

## 20  Technical references

Official documentation reviewed on 1 October 2026. References support service capabilities; product architecture, scope and provider recommendations are JustGifter design decisions. Recheck provider limits and account eligibility during implementation.

### S1  Cloudflare React and Vite deployment

<https://developers.cloudflare.com/workers/framework-guides/web-apps/react/>

### S2  Supabase platform services

<https://supabase.com/>

### S3  TanStack Query overview

<https://tanstack.com/query/latest/docs/framework/react/overview>

### S4  Zod schema validation

<https://zod.dev/>

### S5  Motion reduced motion support

<https://motion.dev/docs/react-use-reduced-motion>

### S6  Supabase scheduled functions

<https://supabase.com/docs/guides/functions/schedule-functions>

### S7  Supabase durable queues

<https://supabase.com/docs/guides/queues>

### S8  Supabase embeddings pipeline

<https://supabase.com/docs/guides/ai/automatic-embeddings>

### S9  Paystack split payments

<https://paystack.com/docs/payments/split-payments/>

### S10  Paystack webhooks

<https://paystack.com/docs/payments/webhooks/>

### S11  Zoho Mail SMTP configuration

<https://www.zoho.com/mail/help/zoho-smtp.html>

### S12  Claude API overview

<https://platform.claude.com/docs/en/intro>

### S13  Cloudflare Turnstile validation

<https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>

### S14  Supabase custom SMTP

<https://supabase.com/docs/guides/auth/auth-smtp>

### S15  Solar Icons React package

<https://solar-icons.vercel.app/docs/v2/packages/react>

### S16  Jakub Krehel skills

<https://github.com/jakubkrehel/skills>

### S17  shadcn UI skills

<https://ui.shadcn.com/docs/skills>

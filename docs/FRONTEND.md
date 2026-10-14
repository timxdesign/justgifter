# Frontend

Vite 8, React 19 and TypeScript, styled with Tailwind v4 and shadcn/ui (Radix). Routing uses React Router 8, server state uses TanStack Query, forms use React Hook Form with Zod, and animation uses Motion. Icons are Solar Icons, re-exported from `src/components/icons.ts`.

## Layout of `src/`

| Path | Contents |
|---|---|
| `main.tsx` | Mounts the providers: theme, TanStack Query (20 s stale time, no retries on API errors), session, icons, tooltips, router, toaster. |
| `app/router.tsx` | Every route (table below). Pages are lazy-loaded. |
| `app/layouts/` | `RootLayout` (scroll restoration, demo panel), `PublicLayout` (marketplace header and footer), `WorkspaceLayout` (vendor and admin sidebar shell). |
| `app/guards.tsx` | `RequireAuth`, `RequireRole` (also sends privileged roles without MFA to `/mfa`). **These guards are for navigation only; the server enforces access.** |
| `app/demo-panel.tsx` | DEMO button: persona switcher, simulated email inbox, run-jobs and reset. Shown only in demo mode. |
| `api/` | The `Api` contract and its two implementations (see [API.md](API.md)). |
| `components/ui/` | shadcn/ui primitives. Add new ones with `npx shadcn add <name>`; don't hand-roll primitives. |
| `components/` | App components: `commerce.tsx` (prices, status badges, cart bits), `product-view.tsx`, `store-chrome.tsx`, `workspace.tsx`, `charts.tsx`, `share.tsx`, `otp-verify.tsx`, `common.tsx` (skeletons, empty states). |
| `components/reveal/` | Gift reveal experience (envelope or wrapped box, confetti, reduced-motion fallback), plus the home-page demo. Laid out with container queries, so it renders correctly inside the studio's phone preview. A designed gift letter (`gift-letter.tsx`, loaded lazily) reuses the letter experience in `embedded` mode. |
| `components/event/` | Occasion-page renderer and event reveal, driven by `EventDesign` and template tokens. |
| `components/studio/` | The studio frame shared by `/send` and `/send/letter`: `studio-layout.tsx` (labelled stepper, form column, sticky action bar, preview column) and `device-preview.tsx` (phone and desktop frames scaled to fit, replay, full screen). |
| `components/send/` | The send-a-gift studio: `studio/who-step.tsx`, `gift-step.tsx` (preferences and live ideas), `letter-step.tsx`, `review-step.tsx` and `gift-preview.tsx` (the recipient's gift page in the preview). `parts.tsx` has the shared chips. |
| `components/letter/` | The letter experience and studio. `experience.tsx` is the reader (cover, one scene per moment, the table) and is reused unchanged as the studio's live preview. `moments.tsx` holds the scenes, `scene.tsx` the theme colours and backdrop, and `art.tsx` the hand-built SVG flowers, seal and objects. `letter.css` has the typefaces and ambient motion, all off under reduced motion. `studio/` holds the cover, moments and send steps and the preview pane. |
| `lib/api-hooks.ts` | `useApiQuery`, `useApiMutation` (invalidation lists, toast errors) and `qk`, the query-key factory. |
| `lib/session.tsx` | Session context: `user`, `hasRole`, sign in and out. |
| `lib/cart.ts` | One bag per vendor, stored in localStorage. Prices are display snapshots. |
| `lib/send-flow.ts` | The send draft (`SendState`) and free-text understanding (`interpret`), shared by the send studio (tested in `send-flow.test.ts`). |
| `lib/gift-studio.ts` | Send studio steps, per-step checks, the recipient preview and the checkout hand-over (tested in `gift-studio.test.ts`). |
| `lib/letter-studio.ts` | Letter studio draft, moment metadata, per-step checks and the `sendLetter` payload (tested in `letter-studio.test.ts`). `lib/letter-photos.ts` keeps draft photos in IndexedDB until sending. |
| `lib/images.ts` | Client-side re-encode (EXIF strip, resize) before upload. |
| `lib/seo.ts` | Per-page `<title>` and meta tags for client navigation. The Worker handles the first load. |
| `lib/format.ts`, `lib/theme.tsx`, `lib/env.ts`, `lib/utils.ts` | Formatting, light and dark theme, public env, `cn()`. |
| `data/seed-catalog.ts` | Starter vendors and products, shared by the demo and `supabase/seed.sql`. |
| `pages/` | One file per screen, grouped by area. |
| `index.css` | Design tokens (oklch, contrast-checked) and Tailwind theme mapping. |

## Routes

Access is what the route guard enforces in the browser. The API re-checks every call.

### Public marketplace (`PublicLayout`)

| Route | Page | Access |
|---|---|---|
| `/` | `home.tsx` | public |
| `/shop` | `shop.tsx` | public |
| `/occasions/:occasion` | `shop.tsx` (pre-filtered) | public |
| `/products/:slug` | `product.tsx` | public |
| `/assistant` | redirects to `/send`, keeping `?q=` | public |
| `/vendors` | `vendors.tsx` | public |
| `/occasion-pages` | `occasion-pages.tsx`: landing page for hosts | public |
| `/help` | `help.tsx` | public |
| `/policies/:policy` | `help.tsx` | public |
| `/cart` | `cart.tsx` | public |
| `/checkout/confirm/:reference` | `payment-confirm.tsx`: polls payment status | public |
| `/signin` | `auth/signin.tsx`: email code | public |
| `/orders/access` | `auth/order-access.tsx`: guest order lookup by email code | public |
| `/sell` | `sell.tsx`: vendor landing page | public |
| `/account` | `account/orders.tsx` | signed in, or guest with order access |
| `/account/orders/:id` | `account/order-detail.tsx` | buyer |
| `/account/saved` | `account/saved.tsx` | public (local) |
| `/account/letters` | `account/letters.tsx` | signed in |
| `/account/settings` | `account/settings.tsx` | signed in |
| `/events` | `host/events.tsx` | signed in |
| `/events/new` | `host/event-new.tsx` | signed in |
| `/vendor/apply` | `vendor/apply.tsx` | signed in |
| `*` | `not-found.tsx` | public |

### Full-bleed experiences (no marketplace chrome)

| Route | Page | Access |
|---|---|---|
| `/checkout` | `checkout.tsx` | public |
| `/events/:id/edit` | `host/event-editor.tsx` | signed in (host or co-host) |
| `/e/:slug` | `event-public.tsx`: public occasion page and wishlist | public, or invite code |
| `/g/:token` | `gift.tsx`: recipient reveal | gift token |
| `/send` | `send.tsx`: the send-a-gift studio (full-bleed, live preview). Accepts `?intent=gift\|both\|letter` and `?q=`. Choosing a letter on its own moves to `/send/letter`. | public |
| `/send/letter` | `letter-studio.tsx`: the letter studio (full-bleed, live preview). Accepts `?to=` and `?occasion=`. | public (sending needs a confirmed email) |
| `/l/:token` | `letter.tsx`: recipient opens and reads a letter, full screen | letter token |
| `/preview/gift/:token` | `gift-preview.tsx`: the sender previews the reveal | preview token |
| `/mfa` | `auth/mfa.tsx`: TOTP enrol or verify | signed in |
| `/pay/demo/:reference` | `pay-demo.tsx`: sandbox payment page | demo mode |
| `/stores/:slug` | `storefront.tsx` | public |
| `/stores/:slug/products/:productSlug` | `storefront-product.tsx` | public |
| `/orders` | redirects to `/account` | — |

### Vendor workspace (`/vendor`, roles `vendor_owner` or `vendor_staff`, MFA for owners)

| Route | Page |
|---|---|
| `/vendor` | `vendor/dashboard.tsx` |
| `/vendor/orders` | `vendor/orders.tsx` |
| `/vendor/orders/:id` | `vendor/order-detail.tsx` |
| `/vendor/products` | `vendor/products.tsx` |
| `/vendor/products/new` | `vendor/product-editor.tsx` |
| `/vendor/products/:id` | `vendor/product-editor.tsx` |
| `/vendor/storefront` | `vendor/storefront-editor.tsx` |
| `/vendor/analytics` | `vendor/analytics.tsx` |
| `/vendor/payouts` | `vendor/payouts.tsx` |
| `/vendor/staff` | `vendor/staff.tsx` |
| `/vendor/settings` | `vendor/settings.tsx` |

Signed-out visitors and non-vendors are sent to `/sell`.

### Platform operations (`/admin`, roles `admin` or `support`, MFA required)

| Route | Page | Notes |
|---|---|---|
| `/admin` | `admin/overview.tsx` | Queue counts and KPIs |
| `/admin/vendors` | `admin/vendors.tsx` | Applications and review |
| `/admin/listings` | `admin/listings.tsx` | Listing moderation |
| `/admin/storefronts` | `admin/storefronts.tsx` | Storefront moderation |
| `/admin/orders` | `admin/orders.tsx` | |
| `/admin/orders/:id` | `admin/order-detail.tsx` | Ledger, gift and actions |
| `/admin/refunds` | `admin/refunds.tsx` | |
| `/admin/cases` | `admin/cases.tsx` | Support cases |
| `/admin/reconciliation` | `admin/reconciliation.tsx` | Admin only (API) |
| `/admin/reports` | `admin/reports.tsx` | Content reports (abuse, impersonation, prohibited items) |
| `/admin/templates` | `admin/templates.tsx` | Occasion-page template gallery |
| `/admin/jobs` | `admin/jobs.tsx` | Scheduled jobs and retries |
| `/admin/audit` | `admin/audit.tsx` | Admin only (API) |
| `/admin/team` | `admin/team.tsx` | Admin only (API) |

## Data fetching pattern

```tsx
const { data, isPending } = useApiQuery(qk.products(q), (api) => api.listProducts(q))

const save = useApiMutation((api, input: ProductDraftInput) => api.saveVendorProduct(input), {
  invalidate: [qk.vendorProducts, qk.vendorDashboard],
  success: "Product saved",
})
```

- Every mutation lists the query keys it makes stale. Stock, carts, wishlists and orders must never show stale state after an action.
- Errors carry a user-facing message from the server (`errorMessage`). Show it as written; it's already plain language.

## Styling and UX conventions

- **Tokens only.** Use semantic colour roles from `index.css` (`bg-background`, `text-muted-foreground`, `bg-primary`, and so on). The contrast pairs are documented in the file header.
- **Brand palettes.** `index.css` defines the Figma Primary (coral) and Secondary (violet) scales as `primary-50…950` and `secondary-50…950`, with Figma's BASE at `500`. The semantic roles point at these steps: `primary` and `brand` are `primary-500` (`primary-400` in dark mode), `brand-text` is `primary-700`, `brand-soft` is `primary-50`, and `secondary` is `secondary-500`. Prefer the roles, and reach for a raw step only in illustrations such as the gift box.
- **Text on colour.** White text on coral fails contrast, so `primary` and `brand` fills carry `primary-950` text. Coral is too light for body text. Use `text-brand-text` for coloured text and links, not `text-primary`. Violet fills carry white text in light mode.
- **Fonts.** Geist for UI, Fraunces for headings and display text. Both are self-hosted through Fontsource.
- **Motion.** Every animation needs a reduced-motion path, and must never be the only signal of a state change. Reveals fall back to a static card.
- **Copy.** Plain language, with distinct wording for payment, preparation, opening and delivery (see the labels in `states.ts`). Error messages say what to do next.
- **Accessibility.** The axe checks in `e2e/a11y.spec.ts` must pass on every key page and every occasion template.
- The repo has design and UX skills (`.claude/skills/better-*`, `shadcn`). See [DEVELOPMENT.md](DEVELOPMENT.md#developer-skills).

## Demo mode

When no Supabase env is set, `getApi()` loads `src/api/demo`:

- `Store` (`store.ts`) is a localStorage-backed in-memory database. Responses are deep-cloned, so the UI can't mutate "server" state.
- `seed-demo.ts` builds the starting data from `src/data/seed-catalog.ts`, plus orders, events and the personas.
- Emails go to an in-app **Inbox** instead of SMTP. Gift and letter links there open the real recipient pages.
- Letter photos are stored in the demo database as data URLs (`letterMedia`), standing in for the private `letter-media` bucket. A link letter's link only opens in the same browser, because the demo data lives there.
- **System → Run jobs** calls `runDueJobs()`, so you can trigger reveals, claim expiries and timeouts without waiting.

| Persona | Roles | Use it to try |
|---|---|---|
| Adaeze Okafor | customer, host | Buying, occasion pages, wishlists |
| Tunde Bakare | customer | A second buyer (wishlist races) |
| Bisi Adeyemi | vendor owner (Bloom & Bisi) | Vendor workspace, storefront, payouts |
| Tomi Lawal | vendor staff (orders scope) | Scoped staff access |
| Kelechi Obi | admin, support | Operations workspace |
| Guest | — | Signed-out journeys |

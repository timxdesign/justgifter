# Decisions to confirm before launch

The PRD (§19) lists decisions that must be made by the founder and advisers. The build uses clearly marked placeholders so everything works end to end; change them in one place when decided.

| Decision | Current placeholder | Where to change it |
|---|---|---|
| Launch country, currency, timezone | Nigeria, NGN, Africa/Lagos | `supabase/functions/_shared/domain/catalog.ts` |
| Delivery zones | Lagos Island, Lagos Mainland, Lekki & Ajah, Abuja Central, Port Harcourt | `ZONES` in `catalog.ts` |
| Commission on fulfilled orders | 10% of item value (`commissionBps: 1000`) | `platform_settings` row / `DEFAULT_SETTINGS` |
| Buyer service fee | None (`buyerFeeBps: 0`) | same |
| Tax presentation | Prices VAT-inclusive, no separate tax line | same (`taxIncludedInPrices`) |
| Wishlist/checkout hold | 10 minutes | same (`holdMinutes`) |
| Address-unknown claim window | 72 hours | same (`claimWindowHours`) |
| Vendor acceptance target | 4 operating hours | same (`acceptanceHours`) |
| Payout eligibility | After delivery + 7-day dispute window | `DISPUTE_WINDOW_DAYS` in vendor modules |
| Refund approval threshold | ₦50,000 (above needs an administrator) | `adjustmentApprovalThreshold` |
| Default delivery fee for new vendors | ₦3,000 per zone until edited | `submitVendorApplication` |
| Event creation | Free | — |
| Policy wording | Plain-language drafts | `src/pages/help.tsx` |
| Merchant of record & settlement | Ledger records vendor payables; no escrow claims | Paystack + legal review |

Out of scope for the first release, as the PRD recommends: group contributions, cash funds, vouchers, multi-vendor checkout, RSVP, corporate gifting. The data model keeps room for them (orders carry vendor and source; a parent order can be added later).

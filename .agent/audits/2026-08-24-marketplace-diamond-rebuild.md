# 2026-08-24 — Club Arena Marketplace: Diamond Funding Rebuild

**Directive (Dan, verbatim):** "THIS IS FULLY FUNDED BY DIAMONDS, NEVER CHIPS. ...
MAKE SURE THE FIRST LETTER OF EVERY WORD ON EVERY PAGE IS CAPITALIZED, THAT WE
USE SMARTER.POKER COLOR SCHEMA ONLY (REMOVE ALL YELLOW AND BROWN). ... EVERY
IMAGE, FEATURE AND DETAIL IS A CUSTOM DYNAMIC HD IMAGE, WITH DEPTH AND 3D LOOK
AND FEEL TO IT. ... MAKE SURE THESE PAGES ARE FULLY CONNECTED TO PLAYERS
WALLETS AND DIAMONDS."

## What changed

### Database (migration `marketplace_diamond_funding`, APPLIED to production)
- `club_shop_purchases.currency` text NOT NULL DEFAULT 'chips',
  CHECK IN ('chips','diamonds'). Legacy rows backfilled as 'chips'.
- `fn_refund_shop_purchase` is now currency-aware: diamond purchases refund via
  `add_diamonds_to_balance(buyer, amount, 'refund', reason,
  'ca-shop-refund-<purchase_id>')` (reference_id makes a raced double refund
  credit exactly once); legacy chip purchases keep refunding via
  `fn_credit_chips`. Returns `currency` in its payload.
- Migration file: `supabase/migrations/20260823_marketplace_diamond_funding.sql`.

## World Hub API
- `marketplace-purchase.js` — payment is now a DIAMOND debit on the buyer's
  global wallet (`add_diamonds_to_balance` with negative amount, type
  'purchase', unique `ca-shop-<uuid>` reference). Chip RPCs removed from the
  route. Every failure path after the charge refunds diamonds
  (`<ref>-rollback`, type 'refund', duplicate-tolerant). Purchase rows insert
  `currency: 'diamonds'`. `newBalance` comes from the debit RPC (row-locked),
  no post-purchase re-read.
- `marketplace-items.js` — `balance` is now `profiles.diamonds`; membership is
  still verified but only for role. Purchases carry `currency`.
- `shop-purchases.js` / `refund-purchase.js` — pass `currency` through.
- `store-catalog.js` — VIP plan display copy Title-Cased (prices untouched, so
  the `verify()` drift check is unaffected).

## Club Arena frontend (`src/pages/MarketplacePage.tsx` + `src/pages/marketplace/`)
- Header shows ONE wallet: Diamonds (chips pill removed). Store tab prices,
  buy modal, insufficient-funds notice (now with a "Get Diamonds" jump to the
  Diamonds tab), Manage stats/labels, ledger, analytics — all in diamonds.
  Legacy chip purchases label their rows "Chips" via the new `currency` field
  (inventory rows inherit it through `purchase_id`).
- NEW `ItemArt.tsx` — procedural HD SVG art system: per-category 3D scenes
  (hourglass, poker table, projectile, emote bubble, avatar bust, trophy,
  crate) with lit stage, floor shadow, specular highlights, deterministic
  platform-accent hue per item id. Plus `DiamondArt` (faceted gem scaled by
  package tier) and `VipArt` (shield/crown per plan). Store cards always render
  art (admin image layers over it, broken URLs degrade gracefully), buy modal,
  empty states, inventory thumbnails, diamond packages and VIP plans all use it.
- CSS: every yellow/brown/gold removed (#f7c52a, #ffd700, #b8860b, #f7931a) —
  replaced with the platform cyan/blue scheme (#00d4ff, #4599ff, #1877f2) with
  glows, bevels and depth shadows. New art-container classes with hover
  parallax (reduced-motion safe).
- Title Case sweep across every tab, placeholder, dialog, toast, label.
- `tests/marketplace.test.ts` updated in the same change for the Title-Case
  grant strings (28/28 green). `npx tsc --noEmit` clean. Vite build clean.

## Economics note
Diamonds debited for club shop purchases are removed from circulation (ledger
row in `diamond_transactions`, no counter-credit) — same sink semantics the
chip debit had. Refunds restore the buyer exactly once.

## Deferred / follow-ups
- Club owners do not receive a revenue share of shop sales; if that is wanted,
  it needs a product decision (e.g. 75% owner / 25% burn per the diamond-arena
  marketplace spec) and a new credit path in `marketplace-purchase.js`.
- `shop-analytics.js` numbers are currency-agnostic sums of `price_paid`;
  clubs with pre-2026-08-23 chip sales will see mixed-unit totals until the
  legacy rows age out of the 90d window.

## 2026-09-19 Page 1 Marketplace Visual Correction

### Current owner direction and finite scope

This continuation corrects only the public Diamond Marketplace landing page at
`/hub/marketplace` (same-surface redirect to `/hub/diamond-store`). The owner
approved the following acceptance contract:

- return to the cleaner prior page structure while retaining the photorealistic
  Diamond hero and all current commerce wiring;
- use dimensional chrome/blue accents only around major sections;
- remove empty ornamental slots and oversized console product housings;
- render every Diamond offer with artwork, quantity, bonus, price and one clear
  primary checkout action;
- retain one section navigation and one non-obstructive, in-flow footer;
- restore readable typography, spacing and responsive behavior;
- preserve current pricing authority, same-page navigation, checkout flow and
  account-ownership protections.

Exclusions: no other Marketplace page visual redesign, no product/pricing or
payment-policy change, no database/engine change, no real purchase, no new art,
no Printful work, and no alteration to Diamond/VIP/Club Shop economics. Club
related sales remain 100% Smarter.Poker revenue with no club commission. The
historical deferred revenue-share note above is superseded by this correction.

### Ownership and policy receipt

- Operation owner: this Page 1 correction task only.
- Owned worktree:
  `/Volumes/SmarterWork/agent-work/world-hub-marketplace-catalog-20260918-0719`
- Owned branch: `agent/codex/marketplace-page1-restraint-20260919`
- Starting revision: `5a3003c15c12916cb2a3ba2240655f994f0002a7`
- Fresh protected base observed before final integration:
  `d374f703ff9c95b961ed0aeb1bf5e142a4a1736b`
- Integrated source candidate before this receipt update:
  `4ff632c02ecb17a4bad4d11fd65ade8bd376d7b3`
- Delivery class: World Hub client-only. No engine activation or database
  installation is required.

Canonical and portable policy were re-read at `2026-09-19T15:08Z`, policy
version 2.9. Receipt:

- manifest `7663cc909626f7e9966931d27166ad8774addc801f7ad1898a2d7564bc13c378`
- owner `76228d75677eb76ca9dcfbf65fd68ddb7aac3941f61154acc456ae8230a9a4fa`
- operating `a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5`
- hardening `d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e`
- index `adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555`
- reader `d5e6189878846064ac60269a41dfc4e6d9a7bda54610110ddc5813230198f36e`
- reader test `6fa4010b3e02e35fca064cb6fb945861a69869a25fad32e4e773951431fc05ef`

Repository `AGENTS.md`, `CLAUDE.md`, `AGENT-PLAYBOOK.md`, `PUBLISHING.md`,
this checkpoint and applicable Marketplace/Next.js references were also read.
Portable policy copies byte-match the canonical files.

### Implemented source correction

- `SmarterStoreShowcase` keeps the existing hero, package data, analytics,
  keyboard rail and `onBuy(pkg)` wiring, while changing the rejected ornamental
  layout into two compact starter offers and six readable commerce cards.
- Stable card anatomy hooks now cover image, quantity, bonus, price and primary
  action for all eight offers.
- Page-1-scoped CSS removes the empty wallet/bay decorations, restores normal
  content flow, preserves the existing photorealistic hero/package sprites and
  provides 3/2/horizontal responsive card layouts without document overflow.
- Buttons, selected tabs and major section frames use restrained machined
  blue/chrome accents. No green palette, new gradient, em dash, hover-only
  behavior or unscoped change to the other Marketplace page treatments was
  introduced.
- The exact Diamond route suppresses the fixed global illustrated footer and
  renders one in-flow Marketplace commerce footer. Other Marketplace routes
  keep their existing global footer and visual treatment.

The following commerce invariants remain unchanged in
`pages/hub/diamond-store.js`: strict live-catalog refresh, verified offer
confirmation, committed/active account checks, durable checkout request
identity, server-owned package ID request, authorization immediately before
navigation, same-tab `window.location.assign`, processing/error analytics,
toasts and cleanup. No real purchase or settlement was executed.

### Candidate verification completed before final integration

- Focused Page 1 and copy-policy regression set: 24/24 passed.
- Marketplace pretest: 31/31 passed.
- Canonical Marketplace suite: 481/481 passed.
- Exact integrated-candidate repository lint: 4,381 files passed.
- Independent final blocker review: GO, with no release-blocking finding.
- Portable policy/canonical consistency and exact-candidate delivery planning
  passed; delivery is classified as client/tooling/documentation/verification
  with no engine activation required.
- Exact integrated-candidate Chromium browser contracts: 3/3 passed without
  the credential-dependent setup project. Deterministic mocked account/catalog
  state verified all eight offer anatomies, responsive starter geometry,
  variable-catalog completeness, one in-flow footer, retained Marketplace copy
  policy, one deduplicated checkout request and same-tab navigation.
- Full repository production build, including its prebuild suites, Marketplace
  suite, static generation of 386 pages and postbuild performance budget,
  passed on integrated candidate `a3995c6aae2f`.
- Responsive browser matrix passed at 1280x1000, 900x1000, 640x900, 390x844
  and 375x812: no horizontal document overflow, one Store Sections nav, one
  in-flow footer, zero fixed footer overlays, eight complete offers, visible
  keyboard focus and vertical page scrolling from the horizontal package rail.
- VIP, Merch, Rewards and Club Shop retained their existing painted shared
  navigation treatment in the local cross-route check.

The local development environment did not have database configuration, so its
catalog truthfully rendered `Current Pricing Unavailable`. Live production
catalog verification, enabled checkout-action verification, protected PR/CI,
merge, Vercel READY identity and final production screenshots remain pending
until the final integrated candidate is delivered. This checkpoint must be
updated with those actual results before completion is claimed.

## 2026-09-30 Marketplace Route Restoration

### Policy Receipt And Candidate Boundary

The current canonical policy set was emitted and read at
`2026-09-30T23:24:14.375Z`. Policy version 2.9 receipt:

- manifest `a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b`
- owner `b9478d0331314413d8e12c41210b63479cdcabc1f86ed3fdcb3251efa36e6349`
- operating `a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5`
- hardening `d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e`
- index `adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555`
- reader `d5e6189878846064ac60269a41dfc4e6d9a7bda54610110ddc5813230198f36e`
- reader test `6fa4010b3e02e35fca064cb6fb945861a69869a25fad32e4e773951431fc05ef`

The restoration candidate is in
`/Volumes/SmarterWork/agent-work/marketplace-restoration-20260930-1120/world-hub`
on branch `agent/codex/marketplace-restoration-20260930-1120`, based on
`028669e901c3a6b5d6bedaaf040ad6b1043a557b`. This section records the
local candidate and its verification only.

### Locked Page 1 And Restored Routes

Page 1 remains the locked reference. `/hub/marketplace` and
`/hub/diamond-store`, plus `pages/hub/diamond-store.js`,
`SmarterStoreShowcase.jsx`, `SmarterStoreShowcase.module.css` and
`diamondStoreStyles.js`, were not changed by this route restoration.

The restrained content hierarchy was restored across:

- `/hub/vip-membership`, `/hub/vip-membership/compare` and
  `/hub/vip-membership/manage`;
- `/hub/merch-store`, `/hub/merch-store/[productId]` and
  `/hub/merch-store/fulfillment`;
- `/hub/smarter-rewards` and `/hub/smarter-rewards/[rewardId]`;
- `/hub/club-shop` and `/hub/club-shop/[itemId]`;
- `/hub/diamond-store/cart`, `/hub/diamond-store/orders`,
  `/hub/diamond-store/orders/[orderId]` and
  `/hub/diamond-store/wishlist`;
- the shared Marketplace navigation, detail, checkout-status, purchase
  dialog, cart, toast and account presentation used by those routes.

### Source Constraints Preserved

- Existing route data, catalog authority, prices, checkout handlers,
  same-tab navigation and signed-in account ownership remain authoritative.
- No commerce API, database, engine, settlement, authentication,
  idempotency, payment, refund, order or entitlement behavior was changed.
- Major sections keep restrained chrome and blue depth while compact cards,
  readable typography and content-driven panels replace empty ornamental
  slots and oversized painted console housings.
- The approved gold VIP card artwork remains in place without floating icon
  overlays. Throwables remain the single All Throwables Pack with composite
  gameplay artwork rather than separate tomato, egg or other item purchases.
- Controls retain accessible focus, disabled and reduced-motion states,
  minimum touch targets, Title Case copy, the no-long-bar contract and no
  green Marketplace accent treatment.
- Each restored surface keeps one non-obstructive in-flow commerce footer.
  The tested layouts do not add fixed footer overlays or horizontal page
  overflow.
- Printful connectivity and the proposed Lifetime VIP monthly 2,000-Diamond
  grant with 90-day expiry are not part of this visual restoration.

### Final Local Verification

- Marketplace pretest gate: **69/69 passed**.
- Canonical Marketplace suite: **609/609 passed**.
- Local after screenshots are retained at
  `/Volumes/SmarterArchives/agent-evidence/marketplace-restoration-20260930/after-screenshots`.
- The evidence set covers VIP, Merch, Smarter Rewards and Club Shop main
  routes at desktop and mobile sizes, plus the tested detail, fulfillment,
  cart, wishlist, order history and receipt surfaces.
- No horizontal document overflow was found on the tested main desktop and
  mobile routes.

### Delivery State

At documentation time this candidate has not been protected-merged or
published to production. Vercel READY identity, `/api/health` identity and
live affected-route proof therefore remain pending. Local tests and
screenshots must not be represented as merge or live-publication evidence.

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

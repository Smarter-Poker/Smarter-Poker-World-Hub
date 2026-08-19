# 2026-08-19 — Club Arena Marketplace full rebuild

## TL;DR

`/hub/club-arena/marketplace` looked wired but was mostly non-functional: the
store showed a single placeholder "Test Item", the admin Manage tab wrote to
`club_shop_items` with the anon key (silently blocked by the 2026-05-01 RLS
lockdown), and none of the platform's diamond/VIP commerce was reachable from
Club Arena. Rebuilt the page into a six-tab storefront wired to the existing
server-authoritative APIs, seeded a starter catalog for every club, and shipped
new arena assets.

## Context

Dan reported the Cashier/Marketplace page "has zero functionality or real ness
to it" and asked for it to include the membership and diamond purchases already
in the smarter.poker marketplace store.

Investigation findings:

- Backend was already there: `/api/club-arena/marketplace-items`,
  `marketplace-purchase`, `manage-shop`, `shop-items`, `purchase-chips`, and
  the whole `/api/store/*` Stripe stack (`create-checkout-session`,
  `purchase-daily-vip`, `purchase-vip-with-diamonds`) + `/api/vip/check-status`.
- The page only used `marketplace-items` + `marketplace-purchase`. No club-arena
  bundle called any `/api/store/*` endpoint.
- Manage tab CRUD used the browser anon key -> blocked by RLS since 2026-05-01,
  so Create/Toggle/Delete never worked (this is why the shop stayed empty).
- `club_shop_items` had 5 rows total across 3 clubs; the demo club
  (`fade0000-...0001`, Midway Union) had only "Test Item".
- Legacy `marketplace_items`/`marketplace_purchases` tables (CA repo migration
  `20260320_marketplace_full_buildout.sql`) are an orphaned schema; live tables
  are `club_shop_*`. Do not build against the orphans.
- Working-tree drift: `Smarter-Poker-Club-Arena` checkout was missing
  `src/utils/mediaBase.ts` although `HomePage.tsx` (uncommitted WIP) imports
  it — `tsc --noEmit` and fresh builds were broken. Restored the file.

## Resolution

Club Arena source (`Smarter-Poker-Club-Arena` repo):

- `src/pages/MarketplacePage.tsx` rewritten as a container; tab components in
  `src/pages/marketplace/`: `StoreTab`, `ChipsTab` (diamonds->chips via
  `purchase-chips`), `DiamondsTab` (Stripe checkout, same 8 packages as the
  Diamond Store), `MembershipTab` (VIP daily pass 150 diamonds / monthly /
  annual via Stripe or diamonds), `MyItemsTab` (inventory + redemption),
  `ManageTab` (admin CRUD now via `/api/club-arena/manage-shop` — RLS-safe).
- `marketplaceShared.ts` holds display copies of the package/plan catalogs;
  all prices remain server-authoritative — the client sends only ids.
- Header shows club chip balance, diamond balance, and VIP badge
  (via `/api/vip/check-status`). Stripe returns land back on the marketplace
  (`?purchase=success|canceled`) with wallet refresh.
- `?club=` now goes through `resolveClubUUID` (legacy numeric ids no longer 400).
- Removed emoji from the rewritten sources per repo rules; removed inert
  `postgres_changes` subscriptions (client realtime is disabled).

Database (data-only migration `20260819_seed_club_shop_starter_catalog.sql`,
applied via Supabase MCP as `seed_club_shop_starter_catalog`):

- Deactivated the "Test Item" placeholder.
- Seeded a 12-item starter catalog (Time Banks, Table Skins, Throwables,
  Emotes, Avatars, Exclusive) for every club missing those names; assertion
  block verifies every club has active items. All 3 clubs now have 12+.

Deploy: built with Vite (tsc clean), overlay-synced `index.html` + new hashed
assets into `public/hub/club-arena/` following `sync-club-arena.sh` semantics
(no deletion of old chunks, maps stripped).

## Forward checks

- If the Manage tab "does nothing" again, suspect anon-key writes creeping
  back in — CRUD must go through `/api/club-arena/manage-shop`.
- Stripe return URLs only work on the production origin; on other origins the
  server falls back to `/hub/diamond-store`.
- The two Club Arena checkouts (`club-arena` vs `Smarter-Poker-Club-Arena`)
  can drift; `mediaBase.ts` was the first casualty. Keep them mirrored.

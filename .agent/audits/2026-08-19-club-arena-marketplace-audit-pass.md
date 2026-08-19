# 2026-08-19 — Club Arena Marketplace: post-rebuild audit pass

## TL;DR

Line-by-line audit of the morning's marketplace rebuild found 6 real defects
(2 server, 4 client) plus several gaps. All fixed and shipped same day, with
product artwork and an admin item editor added.

## Defects found and fixed

1. **Consumables were lifetime one-shots** (server). `marketplace-purchase`
   rejected any repeat purchase by checking club_shop_purchases (permanent
   history). A redeemed Time Bank / Throwable could never be re-bought.
   Fixed: "already owned" now means an UNREDEEMED `club_shop_inventory` row
   (status='owned'); redeeming re-enables purchase. Note the old check also
   used `.maybeSingle()` on a query that could return multiple rows.
2. **Sold-item delete erased history** (server). `club_shop_purchases.item_id`
   is ON DELETE CASCADE, so `manage-shop action:delete` on a sold item wiped
   its purchase records and revenue stats. Fixed: server refuses (`hasSales`)
   and the client disables Delete for items with sales — hide instead.
3. **Club switch in place was ignored** (client). The same-day club quick
   links feature navigates to `/marketplace?club=X` without remounting; the
   page only read `?club=` on mount. Fixed: init effect keyed on the param,
   club-scoped state resets on switch; `?tab=` is also synced.
4. **Misleading chip bonus labels** (client). Badges claimed +10/20/30/50%;
   real value vs the 100 chips/diamond base rate is +11/25/43/67%.
5. **Blank page on non-admin ?tab=manage deep link** (client). Now a notice.
6. **My Items badge counted purchase history**, not current inventory.

## Also shipped

- manage-shop: category allowlist validation, item_type set from category
  (create + update), length caps, empty-update guard.
- Inline item editor in Manage (server 'update' existed; UI never exposed it).
- Collapsible purchase history in My Items.
- Product artwork: 12 SVG covers under public/hub/club-arena/images/shop/,
  attached via data migration `club_shop_item_images_and_types` (also
  backfilled item_type). 36 items across 3 clubs now have art.
- Ownership state client-side now derives from unredeemed inventory and
  loads eagerly; VIP tab links to subscription management.

## Verified before/while fixing

- club_shop_inventory table + trg_deliver_shop_purchase + fn_redeem_shop_item
  all live in prod; authenticated CAN execute the redeem fn (post-revoke sweep).
- RLS: csi_select_own on inventory; items/purchases world-readable; writes
  service-role only. NEXT_PUBLIC_BASE_URL = https://smarter.poker so Stripe
  return URLs to /hub/club-arena/marketplace pass the origin check.
- purchase-daily-vip EXTENDS an active expiry and never downgrades tier.

## Ops notes for future agents

- Uncommitted edits in the Mac working trees are destroyed within minutes by
  the Antigravity reset loop (observed live twice during this session). Do all
  WH/CA edits in a /tmp clone (token available in WH .git/config
  branch.main.remote) and push immediately.
- WH pre-push TS gate can block asset-only pushes on pre-existing type errors
  in untouched files (src/components/memory/MemoryCampaignView.tsx,
  src/lib/liveHelp/contextCollector.ts) — those 4 errors predate today.

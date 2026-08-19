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

---

## Addendum — live end-to-end test found a 7th defect (chips went to the wrong wallet)

Ran the real flow against production with the test account
(`daniel@bekavactrading.com`) rather than trusting code reading. Results:

| Step | Result |
|---|---|
| `GET marketplace-items` | 200 — 12 items, all with artwork, role `owner`, balance 1000 |
| `GET vip/check-status` | 200 — diamonds + `vipTier: lifetime` |
| Buy with insufficient chips | 400, exact message + `available`/`price` (correct) |
| `POST purchase-chips {small}` | 200 — 10 diamonds charged, `chipsCredited: 1000` |
| Re-read club balance | **still 1000 — the chips never arrived** |

**Root cause.** `fn_purchase_chips` credits the GLOBAL player wallet
(`credit_player_wallet` -> `wallets.balance` WHERE `wallet_type='PLAYER'`),
but the shop, buy-ins and the cashier all spend `club_members.chip_balance`
(`fn_debit_chips` takes `p_club_id`). Chips are per-club; that wallet is not.
So "Get Chips" was a money sink from the marketplace's point of view — pay
diamonds, still can't buy anything. This pre-dates the rebuild (the old
`ChipPurchaseModal` had the same behaviour) but the rebuild put the button
directly next to the store, making it a user-visible dead end.

**Fix.** New RPC `fn_purchase_club_chips(user, club, amount, diamonds, ref)` —
deducts diamonds and credits `club_members.chip_balance` in one transaction, so
a failed credit rolls back the diamond charge. Requires existing membership (no
silent club joins) and treats a replayed `reference_id` as idempotent without
double-crediting. `EXECUTE` revoked from anon/authenticated, asserted in the
migration. `/api/club-arena/purchase-chips` now accepts an optional `clubId`
and routes to it; omitting `clubId` keeps the legacy global-wallet path so
existing callers are unaffected. `ChipsTab` sends the active club and disables
buying with a clear message when none is selected.

**Testing note for future agents:** the sandbox CAN reach Supabase auth and
production APIs. Get a JWT with
`POST https://<ref>.supabase.co/auth/v1/token?grant_type=password` using the
publishable key and `TEST_USER_*` from `.env.local`, then call the live
endpoints directly. Code review alone would not have caught this one.

## Addendum 2 — 8th defect: a DB constraint made the re-buy fix unreachable

Re-running the live chain after deploying the ownership fix, the re-buy after
redemption returned 500. Cause: `club_shop_purchases` carried
`uq_shop_purchase_per_buyer UNIQUE (club_id, buyer_id, item_id)` — the table
was a SET, not a LEDGER, so one purchase per item per buyer FOREVER. The
API-level fix could never take effect.

Silver lining: the failure exercised the rollback path for real — chips were
debited, the insert failed, `fn_credit_chips` refunded, and the balance was
intact (5500) afterwards. That compensation logic is now proven, not assumed.

Dropped the constraint (migration
`20260819_club_shop_purchases_allow_repeat_buys.sql`) and added the two
lookup indexes the unique index had been providing. Duplicate protection now
rests on idempotency keys + the unredeemed-inventory rule + rate limits, and
`club_shop_inventory.purchase_id` stays UNIQUE so delivery remains 1:1.

### Final production verification (test account, live endpoints)

| # | Check | Result |
|---|---|---|
| A | storefront read | 12 items, all with artwork, role owner |
| B | buy chips WITH clubId | 10 diamonds -> club balance 1000 -> 2000 |
| C | insufficient-chips purchase | 400 with exact amounts |
| D | buy item | 200, chips debited, `item_type` returned |
| E | delivery trigger | inventory row created with `item_id` |
| F | re-buy while owned | 400 `alreadyOwned` |
| G | redeem (user JWT RPC) | `{"success": true}` |
| H | re-buy after redeem | **200 — the fix works** |
| I | re-buy again while owned | 400 `alreadyOwned` |
| J | idempotency (same key x2) | 2nd call `idempotent: true`, chips 0 |
| K | non-member club | 400 "Not a member of this club" |
| L | malformed clubId | 400 "Invalid clubId format" |
| M | admin create | item_type derived from category |
| N | admin create, bad category | coerced to Time Banks |
| O | admin update | 200; invalid category -> 400 |
| P | admin toggle | 200, is_active flipped |
| Q | delete unsold item | 200 |
| R | delete SOLD item | 400 `hasSales`, history preserved |

Ledger after testing: 2 purchases, 2 inventory rows (1 owned, 1 redeemed),
12 catalog items, no test leftovers.

---

# Audit pass 2 (same day) — the shop was selling receipts

## Headline: redeeming granted nothing

`fn_redeem_shop_item` set `status='redeemed'` and returned. It touched no
entitlement table. Every one of the 12 catalog items was decorative. The real
systems were already live and untouched by the shop:

| Item type | Real system | Read by |
|---|---|---|
| Time Banks | `feature_purchases(feature='time_bank_seconds')` | `fn_time_bank_allowance` — **20s per remaining use** |
| Throwables | none existed for purchased packs | `fn_use_throwable` charged 1 diamond/throw for non-VIP |
| Emotes | `feature_purchases(feature='emoji_pack')` | VIPService |
| Table Skins | `feature_purchases(feature='theme_unlock')` | VIPService |
| Avatars | `avatar_unlocks` | avatar picker |

Fixed by `20260819_club_shop_grant_spec_and_real_redemption.sql`:
`club_shop_items.grant_spec jsonb` (CHECK-constrained) describes the grant;
`fn_redeem_shop_item` applies it atomically with the status flip and returns
what was granted; `fn_use_throwable` now spends a purchased pack credit before
charging diamonds, with the VIP free monthly allowance still taking precedence.

Because allowance is 20s/use, "+30s" was not expressible — the seeded items
were renamed to **Time Bank +60s** (3 uses) and **Time Bank Bundle (+100s)**.

### Verified live (test account, production)

    redeem Snowball Pack -> {"granted":{"type":"throwable","uses":10}}
    feature_purchases     -> throwable / per_use / uses_remaining = 10
    throw as VIP          -> free monthly path, pack untouched (498 free left)
    throw as non-VIP      -> {"from_pack":true,"pack_remaining":9} then 8,
                             diamond balance unchanged at 499542

(The non-VIP check required briefly clearing `is_vip` on the test account; the
exact prior state — `is_vip=true, vip_tier='lifetime', vip_expires_at=NULL` —
was captured first and restored immediately after.)

## Client defects found by line-by-line re-read

1. **Post-Stripe wallet re-check never ran.** The 4s `setTimeout` lived in an
   effect keyed on `searchParams`; the very next line replaced the URL, which
   changed the dep, ran cleanup and cleared the timer. Buyers returned from
   Stripe to a stale balance. Now a separate effect polls at 1.5s/5s/12s.
2. **Club-switch race.** `loadShop` had no request token and every caller
   force-cleared the `loadingRef` guard, so an older in-flight load could win
   and paint another club's balance and `role` (which gates the Manage tab).
   Replaced with a monotonic request token; the guard is gone.
3. **`setItems`/`setBalance`/... called inside a `setClubId` updater** — impure,
   double-invoked under React 19 StrictMode. Moved out.
4. **Two contradictory "owned" definitions** (`status==='owned'` in the Store vs
   `status!=='redeemed'` in My Items). Any third status value would have let a
   member re-buy something they held. One shared `isOwnedRow` now.
5. **Inventory errors were swallowed** — supabase-js resolves rather than
   rejects, and `error` was never destructured, so a failure was indistinguishable
   from "you own nothing".
6. **Wallet failure asserted "You have 0 diamonds"** and disabled every purchase
   button with no explanation. Now an explicit error + Retry banner, and the
   tabs say the balance is unavailable instead of claiming zero.
7. **Manage tab stuck on "Loading items..."** on any failure (`setLoaded(true)`
   was inside the `try`), and briefly rendered the *previous* club's items,
   where Edit/Delete would POST club B's id with club A's item.
8. **Revenue was `purchase_count * current price`** — editing a price rewrote
   history. Now summed server-side from `price_paid`.
9. Silent failures on every `silent=true` refresh path (no toast, no Sentry).
10. `searchParams` mutated in place (React Router memoizes it per location).
11. `clubId` interpolated into the API URL unencoded and never UUID-validated.
12. `crypto.randomUUID()` with no fallback (fails on http origins / older Safari).
13. Toggle/Delete had no in-flight guard; double-tap fired two writes.
14. a11y: purchase modal had no dialog role, Escape, focus or scroll lock; tab
    strip had no tablist semantics; inputs had no labels; several tap targets
    were 25-28px against a 44px minimum; admin rows did not wrap at 375px.

## Drift elimination

Chip/diamond/VIP tables were hardcoded in the client. Not an authorization hole
(the client only ever sends ids) but a truth-in-advertising one: change a price
server-side and the marketplace would keep rendering the old one while charging
the new. Added `GET /api/club-arena/store-catalog` as the single source of
truth, with the bundled tables demoted to an offline fallback. It also
self-checks VIP prices against `src/data/diamondStoreData.js` and reports drift
in a `warnings` array.

## Also added

- Store cards and the buy modal advertise the grant ("+60s table time",
  "10 free throws"); the redeem toast reports what was actually granted.
- Manage: choose how much a category grants, per-item earned totals, retry on
  load failure, https-only image validation (client + server).

# Club shop: admin purchase ledger + money-RPC envelope paydown

Date: 2026-08-19 (UTC 2026-08-20)
Repos: Smarter-Poker-World-Hub, Smarter-Poker-Club-Arena
Deployed: production `smarter.poker` served SHA `08816d8c` (verified via
`/api/health`), CA source at `4ff10c3`.

## 1. The refund feature was unreachable for its own use case

`refund-purchase.js` has always gated on club role (owner/admin) and
`fn_refund_shop_purchase` credits `v_purchase.buyer_id`, not the caller — so
refunding another member's purchase was *implemented*. But the only surface
listing purchases was `marketplace-items.js`, which filters
`.eq('buyer_id', user.id)`. An admin could therefore only ever see, and so only
ever refund, their own purchases. The scenario the feature exists for — "a
member bought the wrong item" — had no path through the UI.

`pages/api/club-arena/shop-purchases.js` is the club-wide ledger that closes
this: owner/admin only, paginated (default 50, max 200), searchable, and it
computes `refundable` per row from delivery state (`!refunded && !redeemed &&
inventory.status === 'owned'`). `PurchaseLedger.tsx` renders it with a per-row
Refund button; non-refundable rows show why.

**Live gap found after deploy:** every row rendered as "Member". All 327
`club_members` rows in the seed club have NULL `nickname` AND NULL
`display_name`; the names live in `profiles`. A ledger that cannot name the
buyer cannot serve its purpose. Fixed by falling back
club nickname -> club display_name -> profile display_name -> profile username.
Names only; no email reaches the client. Verified live: rows now read
"Dan Bekavac".

**Not verified end-to-end:** refunding a *foreign* member's purchase. No other
member has an outstanding purchase in the club, and creating one would have
required writing to the chip ledger directly. Confirmed by reading instead:
the route gates on role alone (never buyer_id) and the function credits
`v_purchase.buyer_id`. Worth an explicit live test the first time a real member
purchase exists.

## 2. Money RPCs: {success:false} is not an error (42 -> 30)

Every `fn_*` money function RETURNS `jsonb {success, error?, new_balance?}` on
a business refusal rather than RAISING. `const { error } = await supabase.rpc()`
is therefore **null on a refused debit**, and any code branching only on `error`
books a rejected money movement as a completed one. Confirmed against
`pg_get_functiondef` for all four functions touched — each has an explicit
`'success', true` happy path, so the check is safe.

This is the same shape as the free-item exploit fixed earlier today in
`marketplace-purchase`. Twelve further sites paid down:

| Site | Consequence of the old code |
|---|---|
| `ClubLedger.debit` | The `error.message.includes('Insufficient')` branch could never fire — `error` was null. An over-draw reached `_recordTransaction` as a real debit. This is the choke point every engine chip movement passes through. |
| `ClubLedger.credit` | Refused credit reported success; `newBalance` returned the jsonb envelope where the JSDoc promised a number. |
| `ClubLedger.processRake` | Refused treasury credit still wrote a RAKE audit row claiming rake the treasury never received. Now the row is still written (the rake WAS taken from the pot) but flagged `treasury_credit_failed`. |
| `ClubLedger.debitOverlay` | Insufficient treasury is the exact case the function exists to handle, and it arrived as `{success:false}` — the overlay was booked as funded. |
| `rakeback.js` claim (x3) | An unfunded `fn_debit_treasury` still credited the player: chips from nothing, the precise failure BUG #152 was fixed to prevent. The compensating re-credit was equally silent. |
| `leave-club.js` (x3) | A refused player debit fell through to the treasury credit, minting chips the player still holds. A refused held-cashout credit still cancelled the request, stranding the chips. |
| `promo-wallet.js` mint | `mint_club_promo` is a deliberate tombstone that ALWAYS returns `{success:false}` ("promo derives from the BBJ"), but the route replied HTTP 200 with the amount echoed back — the UI reported a mint that never happened. |
| `GameController` tournament-refund fallback | Refused credits counted as refunded, with a `chip_transactions` row saying so. |

`scripts/check-unchecked-money-rpc.mjs` BASELINE lowered 42 -> 30 in the same
commit, which is what makes a ratchet tighten rather than drift. Added `--list`
so the next agent paying this down can see the outstanding sites without
re-deriving them. The 30 remaining are diamond routes
(`add_diamonds_to_balance`, `deduct_diamonds`, `award_diamonds_v2`) plus
`manage-agent.js` and `settle-period.js` — same shape, different owners.

`tests/club-ledger-rpc-envelope.test.mjs` pins the contract at the ledger
boundary. Proven real: 5 of its 7 cases fail against the previous ClubLedger
(measured by stashing the change and re-running, not assumed).

## 3. Disaster recovery

`supabase/migrations/20260819_club_shop_function_bodies.sql` captures six shop
functions that existed only in production, so a replay from migrations would
have failed at the later migration that asserts they exist. Bodies read out
with `pg_get_functiondef`, not retyped; re-applying is a no-op (md5
`2136f2a6bb4d3cb48a9783cbb9193138` before and after). Registered in the
migration ledger as `club_shop_function_bodies_repo_parity`.

## 4. Incidental

Main was red for ~6 consecutive deployments on a stray `});` left in
`store-catalog.js` by the diamonds-to-chips deletion. Another agent pushed the
repair (`0fb8aea`) while this work was in flight; noted here because the
symptom — my own commit showing ERROR in Vercel — was not caused by my commit,
and the next agent to see that pattern should read the build log before
reverting anything.

## Open items

- 30 unchecked money-RPC sites remain; ratchet holds the line at 30.
- Foreign-buyer refund needs one live confirmation once a real member purchase
  exists.
- The arena sync leaves orphaned `.map` files behind in
  `public/hub/club-arena/assets/` when a bundle hash changes.

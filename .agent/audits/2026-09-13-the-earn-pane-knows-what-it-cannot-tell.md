# The Earn pane knows what it cannot tell, and the headline is summed in SQL

**Date:** 2026-09-13
**Branch:** `agent/cw-hubwallet2/fix/the-earn-pane-knows-what-it-cannot-tell`
**Companion:** Club Arena `agent/cw-wallet2/audit/the-wallet-line-by-line`
(migration `20260913171905_the_diamond_ledger_sums_itself`, applied 17:20 UTC)

## 1. `/api/rewards/progress` reports the claim state it already knew

`loadLoginStreak` computed `days.has(today)` and threw it away, so the Club
Arena wallet's Earn pane enabled "Claim Daily Diamonds" for a player who had
already claimed; only the click told them. The route now returns

- `loginClaimedToday`: `true` / `false` / `null` (= the read failed; never
  coerced into "not claimed" - 10.86),
- `nextLoginReward`: the next claim's payout from the catalog's own
  `REWARDS.daily_login.scaling` (`min(base + (day-1)*increment, max)`), so it
  cannot drift from what `award_diamonds_v2` resolves.

The streak arithmetic moved into `src/lib/rewards/loginStreak.mjs`
(`streakFromRows`, `nextLoginReward`, `chicagoDate`, `shiftDay`): pure, no I/O,
importable by a plain `node --test`. The route only does the read.
`/api/rewards/daily-login` keeps its own walk (keyed on the server-written
`reference_id` date; a money path) - not touched.

Test: `__tests__/the-earn-pane-knows-what-it-cannot-tell.test.mjs` - claimed
today, unclaimed with a live run, broken run, empty ledger, null on failure,
the Chicago day boundary, and the catalog cap. 7/7.

## 2. `/api/store/diamond-transactions` headline from the whole ledger

The Stats tab's lifetime earned/spent came from a 5,000-row window summed in
JavaScript. The route now also calls `fn_diamond_lifetime_totals` (service
role; same RPC the Club Arena wallet reads) and uses its answer for
`lifetime.earned` / `lifetime.spent`, marking `lifetime.exact: true`. If the
RPC cannot answer the window sum stands and `exact` is false. The
week/month/gift breakdowns still need the rows and keep the window;
`lifetime.truncated` now describes only them. Modal comment updated to match.

## Verified

`node --check` on both routes; 48 tests across the modal's pinned suites plus
the new one; `next build` (see push log).

## 3. Escape backs out one layer of the wallet, not all of them

With the Confirm Transfer dialog or a gate popup open, Escape closed the whole
wallet, so a keyboard user backing out of "Send 500 Diamonds?" lost the modal,
the recipient and the amount together. The innermost surface is what Escape
dismisses now; the wallet closes on the next press. Pinned in the same test.

## Read on production, for the record

`send_wallet_diamond_transfer` refuses only `p_amount <= 0` and requires a
`p_reference_id` matching `^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$`; the route
refuses a request without `X-Idempotency-Key`. The Club Arena wallet had never
sent one (fixed in its companion branch), and carried an invented floor of 10.

## 4. The three diamond figures reach the Send panel (phase 2, 2026-09-14)

`/api/store/diamond-transactions` returns `summary` on its first page -
on_hand, sendable, collateral, in_arena, arenaOpen - from
`fn_diamond_wallet_summary` (Club Arena migration 20260914015457, service
role), null when the read failed. The Send panel prints "Sendable: N", explains
refund-window collateral, and checks the amount against it before the round
trip; without the figure it keeps the balance check and says nothing it does
not know. THE DIAMOND ARENA IS DIAMONDS ONLY: nothing in this read is a chip.
The modal's existing "In Play" figure (`fn_poker_diamond_custody_balance`) is
the same arithmetic as the summary's `in_arena`; verified on the definition.

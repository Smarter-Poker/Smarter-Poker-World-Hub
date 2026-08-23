# 2026-08-23 — Union wallet audit: BBJ conservation, split drift, and a live diamond mint

**Trigger:** operator reported the union wallet "math ain't mathing" — 800,000+ in
rake against ~42k of BBJ — and separately noticed diamonds reappearing in his
wallet unprompted.

**Outcome:** five findings. Three fixed and shipped, one held as an operator
decision, one a documented expectation mismatch. One of them was actively minting
currency at the moment of the audit.

---

## 1. Rake and BBJ were never connected (no defect — expectation mismatch)

`rake_distribution_legs` has exactly three legs, lifetime:

| leg | amount | share |
|---|---:|---:|
| club_accumulator | 3,045,049.84 | 48.6% |
| union_rake | 1,753,539.78 | 28.0% |
| chip_treasury | 1,461,385.08 | 23.3% |

**There is no BBJ leg.** The bad-beat drop is taken off the pot separately and
never touches rake. An 800k rake wallet and a 23k jackpot are unrelated numbers;
no ratio between them is meaningful. Recorded here because the question will be
asked again.

## 2. ACTIVE DIAMOND MINT — `/api/cron/trivia-pvp-cleanup` (FIXED)

**14,240 diamonds minted from nothing over 10 days, still running when found.**

The handler lives in `smarter-poker-workers` (deleted from this repo in 2B.3
commit `36667c7f15`). It refunds every player in an abandoned PvP match, then:

```js
await supabase.from('trivia_pvp_matches')
    .update({ status: 'abandoned' }).eq('id', match.id);
```

`trivia_pvp_matches_status_check` allowed only
`pending | active | complete | completed | cancelled | expired`. **`'abandoned'`
was not in the list.** The UPDATE failed with 23514, the return value was never
destructured, so the failure was invisible — the money had already moved and the
match stayed `active`. Next tick, same four matches, refunded again.

The refund was written with `p_reference_id: null`, so `add_diamonds_to_balance`'s
dedup — which only fires when a reference is present — could not catch the replay
either. Two independent safety nets, both defeated by the same handler.

**Signature:** 4 stuck matches x 2 players = 8 rows, 260 diamonds, every 4 hours,
unbroken from 2026-08-13 04:00. 488 rows total.

Only **3 stakes were ever charged** (120 diamonds, all to `kingfish`). Every
`pvp_refund` row in the database was one of these replays; there were no
legitimate ones. Overpayment = 14,240 − 120 = **14,120**.

**Fixed** by `20260823_pvp_refund_mint_leak.sql` (Tier 3):

- widened the status CHECK to accept `abandoned` and `settling` (`pvp-settle.js`
  uses `settling` as its mutex state and would have hit the same wall)
- closed the 4 stuck matches
- **fail-closed guard** in `add_diamonds_to_balance`: a positive credit of type
  `pvp_refund` / `pvp_win` / `pvp_tie_refund` with a NULL `reference_id` is now
  refused outright. A settlement credit that cannot be deduplicated cannot be
  retried safely, so it must not be payable. This holds even if the worker is
  redeployed unchanged.
- clawed back the overpayment, netted per player against stakes actually paid:

| player | clawed back | balance after |
|---|---:|---:|
| kingfish | 7,000 | 493,114 |
| kylefromomaha | 5,200 | 300 |
| atlas | 640 | 300 |
| vegasgrinder85 | 640 | 300 |
| diamond dan | 640 | 300 |

**Still open:** the worker source in `smarter-poker-workers` is unchanged. The DB
guard now blocks it, so it can no longer mint, but it will log refusals until the
handler is corrected to pass `pvp_refund_<matchId>_<userId>` — the reference the
correct engine (`pages/api/trivia/pvp-settle-match.js`) has always used.

## 3. Triple Bank split drifting to backup (FIXED)

Spec is 50 main / 25 backup / 25 promo. Live pool measured **50.08 / 25.80 / 24.12**.

Not a config error — cent rounding applied per hand, always in the same direction.
240,004 of the pool's hands drop exactly 0.50. Half of 0.50 is 0.25; a quarter is
0.125, which does not exist in cents. Main and backup each round up, promo takes
the remainder and eats the loss every single time:

```
0.50  ->  main 0.25 (50%)   backup 0.13 (26%)   promo 0.12 (24%)
```

Deterministic, so it never averages out. Measured on 165,648.68 of contributions:
main **+129.48**, backup **+1,326.82**, promo **−1,456.30**.

**Fixed** by `20260823_bbj_split_residual_carry.sql` (Tier 3): round the
*cumulative* allocation, not the individual hand. `bbj_pools.alloc_cum_amount`
carries the running allocated total; each hand's portions are the difference
between two cumulative roundings, so cumulative main stays within half a cent of
50% and main+backup within half a cent of 75% forever, at any drop size.

`bbj_record_contribution` no longer trusts caller-supplied portions — the engine
that supplies them is in another repo on another deploy cadence, and the split is
a house rule the house should own. The parameters remain but are advisory.

The 1,456.30 was moved back to promo from the two banks that gained it.

**Verified live** — 34 fresh hands after the migration: **49.966 / 25.052 /
24.983** (within one cent on a 14.53 sample), against the old path's persistent
50.08 / 25.80 / 24.12.

## 4. BBJ conservation gap re-baselined honestly (PARTIALLY FIXED)

`fn_bbj_conservation_check()` returned `healthy: false`, gap 59,200.80, against a
frozen baseline of 59,510.86 whose note cited "the known one-time 47,607.05"
manual promo sweep. **That figure appears in no ledger** — not
`union_wallet_transactions`, not `chip_transactions`. The baseline was frozen on
a narrative, which is worse than an open gap because it makes the check look
answered.

The gap decomposes exactly:

| component | amount |
|---|---:|
| (a) residual erased when pool `0867a7fd` was merged | 56,938.27 |
| (b) accumulated variance on the live pool | 2,572.59 |
| (c) checkpoint measurement bug (not real) | 310.06 |

**(a)** `0867a7fd` contributed 159,981.85, paid out 74,301.10, swept 28,742.48 to
promo — leaving 56,938.27 that was zeroed when the pool was merged into
`f9806a7f` **without the destination being credited**. There is no merge function
in the database; `merged_into_pool_id` was set by hand and a hand-run
consolidation leaves no ledger row. 41,096.65 of that residual is the
pre-Triple-Bank contributions from 2026-03-03..07 (all three portion columns NULL
because the columns did not exist until `2026031101_bbj_triple_bank.sql`).

**(c)** `20260818222557_bbj_repair_backdates_to_hand_time` inserted repair rows
dated to the original hand time. The `bbj_contributions_inflow` checkpoint had
already advanced past those timestamps and `fn_bbj_contributions_total` only
scans the tail (`created_at >= as_of`), so those rows were invisible to it
permanently.

**Fixed** by `20260823_bbj_conservation_honest_baseline.sql` (Tier 2): recomputed
the checkpoint from a full scan (which alone moved the measured gap to 59,510.86
— the pre-existing baseline to the cent, confirming (c) was measurement and not
money), shipped `fn_bbj_gap_decomposition()` so the number is explainable on
demand, and re-baselined with a note that cites arithmetic instead of narrative.

```
{ "healthy": true, "measured_gap": 59510.86, "drift_from_baseline": 0.00,
  "explained": { "merged_pool_residual_erased": 56938.27,
                 "of_which_pre_triple_bank": 41096.65 },
  "remainder_unexplained": 2572.59 }
```

**HELD FOR THE OPERATOR:** restoring the 56,938.27 to the live pool. Players
funded it out of real pots and it was erased by a manual merge, so the case for
restoring it is strong — but it raises jackpot liability by 56,938.27 and RULE 0
keeps financial decisions with the human. Paste-ready SQL is in the footer of
that migration.

## 5. Spin treasury was invisible (FIXED)

`union_wallets.spin_reserve_wallet` reads **0**, but the union's Spin pool holds
**24,932.54**. The 20,000 that seeded it on 2026-08-20 was debited straight out of
`promo_wallet` into the pool row and never sat in the column the API reads, so the
union appeared to have no Spin capital at all.

The spin ledger itself reconciles perfectly: 285,975.54 contributions + 20,000
seed − 281,043.00 draws = 24,932.54.

**Fixed** in `pages/api/club-arena/union-wallet.js`: `get_balances` now returns a
`spin_treasury` block (`unallocated` / `deployed` / `total` / per-pool detail) and
`wallets.total` includes the deployed balance. Additive to the response; no
request contract change. The Club Arena client still needs a row wired to
`spin_treasury.total`.

---

## Left alone deliberately

- **rake_wallet 757.18 drift** — ledger says 801,060.55, wallet says 800,303.37.
  Under 0.1%.
- **promo_wallet 10.17 drift** — credits less debits says 20,948.74, wallet says
  20,938.57. Under 0.1%.

Both surfaced to the operator and explicitly deferred by him.

## Follow-ups

1. **`smarter-poker-workers`**: correct `trivia-pvp-cleanup` to pass a real
   `reference_id`. Blocked at the DB today, but it should stop trying.
2. **No pool merge function exists.** Consolidation is manual and leaves no
   ledger row — which is how 56,938.27 vanished. Any future merge must move
   balances and write a ledger entry, or this recurs.
3. **`fn_bbj_reseed_main_from_backup` moves the entire backup balance to main**
   and zeros it. Backup is not a reserve tier under that behaviour, it is a full
   transfer on drain. Worth confirming that is intended.
4. **Audit the other cron handlers deleted in 2B.3** for the same
   unchecked-error-after-money-moved shape. This one ran for ten days undetected.

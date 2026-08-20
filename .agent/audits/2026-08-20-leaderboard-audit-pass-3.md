# 2026-08-20 — Leaderboard audit pass 3

Four defects, three of them introduced by my own earlier passes. Each measured
before and after.

## D1 — "Your Rank" contradicted the board it sits under
`fn_user_rank_period` / `fn_user_rank_global_period` still carried the ORIGINAL
scoring while the boards moved on: no `bb100` case (so bb/100 silently ranked by
**profit**), `hands_played` instead of `hands_dealt`, and no volume qualifier.

Measured on the Club JAQK bb/100 board:

| board rank | card said |
|---|---|
| 1 | 4 |
| 2 | 1 |
| 3 | 7 |
| 5 | 11 |

and on Hands Played, board 436 vs card 341, board 191 vs card 64.

Fixed by DERIVING both from the same function that renders the board, rather
than restating the scoring a third time — which is precisely how they drifted.
Agreement is now structural. **15/15 match** across profit, bb100, roi,
hands_played, tournaments_won.

## D2 — Ties were ordered by uuid
Boards ranked with `row_number()`, forcing a total order. The Tournaments Won
board returns 200 rows with only **28 distinct values** — 172 tied rows — so two
players each on 3 wins could render as #12 and #47, ordered by their uuid.

`rank()` now sets the displayed rank (1, 2, 2, 4); `row_number()` is retained
only for ordering and LIMIT/OFFSET so pagination stays stable. `rank_change` is
rank-to-rank, so a tie group moving together reads 0 instead of shuffling.

Verified: rank 22 holds 4 players on 14 wins, rank 34 holds 7 on 11; ranks skip
by group size; three pages of 40 → 120 rows / 120 distinct users.

## D3 — The hands counter differed by metric
The direct-query fallback (vpip/pfr) still selected the rakeback-owned
`hands_played`. Switching to VPIP changed the per-row hand count by ~3x —
**3,497 shown where every other metric showed 10,503** for the same player. One
`handsOf()` helper now decides which counter is authoritative, and the fallback
selects and orders by `hands_dealt`.

## D4 — `loadMore` had no request guard
Changing metric/period/scope mid-request merged rows scored by the OLD filter
into the NEW list, and the offset came from `entries.length`, which may already
have been replaced. It now shares the main load's request token and re-checks
the list length before appending.

## Method note
D1 and D2 were both found by asking "does this number agree with that number?"
rather than by reading code. The tie bug in particular is invisible in the
source — `row_number()` looks perfectly reasonable until you count distinct
values in the column you are ranking.

The tie fix was applied by rewriting the LIVE function definitions with asserted
substitutions rather than restating ~13KB of SQL. Those assertions earned their
keep immediately: they caught the union function's differing whitespace, and
then that it returns no `rank` column at all.

## Known remaining
- `fn_union_leaderboard_period_v2` predates the pagination work and returns
  neither `rank`, `total_ranked` nor `baseline_date`. Unreferenced by the client;
  align the shape before anything calls it.
- `ROI_MIN_HANDS` (20) is stated in both the client and `v_min_hands` in SQL.
  They agree today; nothing enforces that they stay in step.
- `total_ranked` counts every player_stats row for the club, including players
  with no activity in the selected period, so "50 of 575" is the club population
  rather than the active population.
- `club_member_daily_stats.profit` still does not reconcile — unchanged, and
  owned by another agent. See the 2026-08-20 handoff.

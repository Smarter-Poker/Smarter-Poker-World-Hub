# Handoff — club_member_daily_stats.profit does not reconcile

**For:** whoever owns the club dashboard / club-stats rebuild
**Raised by:** leaderboard real-profit work, 2026-08-19/20
**Why a handoff and not a fix:** the table is being rewritten continuously by
that feature's rebuild (measured 80,193 rows in one hour, last write 0.75s
before I checked). Writing corrected values underneath an in-flight rebuild
would either be overwritten or corrupt it. Everything needed to make the fix is
already in production; only the write is left, and it belongs to the owner.

## The defect
`club_member_daily_stats.profit` is a stack delta (`stack - last_stack`) counted
only when an "attributable" heuristic passes; when it fails **the row is
dropped**. A rebuy looks like a gain, so failures skew toward dropped LOSSES and
the aggregate drifts positive.

Invariant: for any club-day, `SUM(player profit) + (rake + bbj) = 0`. Players
collectively cannot be up while paying rake. Measured against that feature's own
`club_hand_daily` rollup:

| club | date | dashboard drift | exact drift |
|---|---|---|---|
| Club JAQK | 2026-08-18 | 83,345.86 | **13.34** |
| Club JAQK | 2026-08-19 | 190,617.83 | **-417.97** |
| Midway Union | 2026-08-19 | 567,769.70 | **2,611.25** |
| SHARK CLUB | 2026-08-18 | 90,667.66 | **14.75** |

It also correlates with the leaderboard's per-player profit at r = 0.0036 (459
of 461 players disagree by more than one chip) — not a scale error, unrelated
numbers.

## The correct value, already available
The leaderboard ledger is exact by construction: winnings from
`hand_history.winners`, losses from the engine's own per-player contributions
(`promo_apply_playthrough`), so `profit = SUM(won - invested)` and
`Σlosses - Σwinnings` reconciles to rake + bbj (measured 100.05% / 99.9999%).

    SELECT * FROM fn_club_member_daily_profit_exact(:club_id, :date);
    -- returns (user_id, exact_profit, basis)

    SELECT fn_club_profit_drift(:club_id, :date);
    -- returns dashboard vs exact vs house cut, and both drifts

Both are live in production and granted to authenticated + service_role.

## Suggested repair
For a COMPLETED day, overwrite `profit` from `fn_club_member_daily_profit_exact`,
distributing each user's exact total across their per-table rows in proportion
to `hands_played` (last row absorbs the rounding remainder so the per-user total
is exact).

The proportional split is safe: both consumers of this column aggregate profit
per USER — `ca_club_top_players` never references `table_id`, and
`ca_club_members` groups by user — so the split is never read, while the
per-user total becomes exact.

Constraints:
- Only for dates **>= 2026-08-20**. Earlier snapshots had winnings/losses
  backfilled from RAKED hands only and carry that partial basis; reconciling
  across them moves one approximation onto another.
- Needs snapshots for both `date` and `date + 1` to exist. Check with
  `fn_snapshot_health()` — there is a known gap at 2026-08-09.
- Intraday should stay the live trigger estimate; only completed days become
  exact.
- Make it idempotent (recompute from source, do not accumulate).

## Alternative, if you would rather fix the source
The heuristic drops unattributable deltas instead of correcting them. You
already record `topup_total`; `true_delta = stack - last_stack - topups_since_last_hand`
is exact whenever top-ups are known, and would preserve conservation without a
reconciliation pass. That is the better long-term shape, but it is a change to
the trigger's core and belongs to whoever owns it.

## Do not
Do not "fix" this by pointing the dashboard at `player_stats` directly — that is
cumulative per (user, club) with no table dimension, and the dashboard's daily
and per-table structure would be lost.

# 2026-08-19 — Leaderboard: bb/100, pagination, honest windows, remaining risks

## Shipped (live, verified on smarter.poker)
- **bb/100 win rate.** Chip profit is not comparable across stakes; a losing
  15/30 player could outrank a winning 1/2 grinder. `player_stats.sum_big_blind`
  accumulates one `big_blind` per seated player per cash hand, in the same
  trigger statement as `hands_dealt` (no extra cost), and
  `bb/100 = 100 * (winnings - losses) / sum_big_blind`. Exact for a single
  stake, stake-weighted when mixed. Backfilled and reconciled at **100.000%**
  (20,079,332 staged vs 20,079,296 true big blinds).
  Live: 141.94 / 120.92 / 117.60, strictly descending, real hand counts.
- **Pagination.** `p_offset` on both RPCs, plus `rank` and `total_ranked` in the
  payload. `rank` previously came from the array index, which is only correct on
  page 1 - page 2 restarted at 1. Verified: offset 50 returns rank 51, 52.
- **Honest period windows.** RPCs return `baseline_date`; the UI shows the span
  actually measured and switches to "Nd window" when it exceeds the label.
- **`fn_leaderboard_snapshot_gaps(days)`** makes a missed snapshot detectable.
- **Counter documentation.** COMMENTs distinguish `hands_dealt` (true, per seat,
  what the leaderboard uses) from the rakeback-owned `hands_played` (13.4% of
  reality). `update_player_hand_stats` is annotated in-body as the stub it is.

## The snapshot job is the single point of failure worth watching
Period boards are snapshot deltas. `snapshot-player-stats` (pg_cron, 00:05 UTC)
has **21 runs, 1 failure** - 2026-08-09, which is exactly the day missing from
`player_stats_snapshots`. On a miss the RPCs fall back to an older snapshot and
the window silently widens. That is now visible in the UI and queryable via
`fn_leaderboard_snapshot_gaps()`, but it is still not *alerted* and a missed day
cannot be reconstructed after the fact (a snapshot is a point-in-time capture).
If this matters more later, the fix is a second same-day run that fills only
when the day is absent - deliberately not added here because CLAUDE.md 11 routes
new scheduled jobs through Open Claw, not pg_cron.

## Backfill lesson worth keeping
A batch that timed out CLIENT-side had already committed on the server. Re-running
an overlapping window double-added and produced 113% of truth. Rebuilt with
`ON CONFLICT DO UPDATE SET x = EXCLUDED.x` (replace, not add) so a re-run is
idempotent. For any MCP-driven backfill: **a timeout is not proof the statement
did not run** - verify before retrying, and prefer replace over accumulate.

## Sync race, third occurrence
Three arena syncs today published a bundle built from a tree that predated the CA
commit named in their message. Two were manual `chore(ca):` syncs; CI writes
`chore(club-arena):`. I built from a clean clone of CA origin/main to correct it,
then found upstream had *already* published a newer build containing my work plus
more, and aborted rather than regress it - which is the same mistake in the other
direction. Verifying "did my code ship" still requires grepping the built chunk.
The guard remains worth adding: refuse to publish when local HEAD != origin/main,
and stamp the built CA sha into the bundle.

## Still open (deliberately not done)
- **club_member_daily_stats.profit does not reconcile.** Stack-delta based; sum
  of player profit should equal -(rake + bbj) for the day and is off by +139,681
  (08-18) and +123,756 (08-19), correlating with the leaderboard's profit at
  r=0.0036. Two surfaces show contradictory profit for the same player. Left
  alone because another agent owns that file and was actively editing it.
- **Board caching.** Global board is ~209ms, recomputed per filter change and per
  30s poll per viewer. Fine now (1,398 rows); worth materialising as the player
  base grows.
- **All Time is bounded** by the backfill window (rake_records from April;
  hand_history has 90-day retention). Labelled "since 2026-05-21" rather than
  implying true lifetime.

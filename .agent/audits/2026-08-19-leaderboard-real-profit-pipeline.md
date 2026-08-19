# 2026-08-19 — Club Arena Leaderboard: real-profit pipeline

## Symptom
https://smarter.poker/hub/club-arena/leaderboard rendered but every profit
value was 0 (slashed-zero glyph), Global toggle did nothing, rank-change
indicators were hardcoded fake. Reported as "page has zero functionality".

## Root cause (verified in production DB)
Nothing ever wrote player_stats.total_winnings / total_losses:
- update_player_hand_stats is a stub — bumps profiles.total_hands_played only,
  ignores p_profit entirely.
- RakebackSettlerService increments only hands_played and total_rake.
- The engine computes exact per-player contributions every hand
  (currentHandContributions) and discards them at persistence time.
Result: profit (default metric) = 0.00 for all 1,398 player_stats rows,
while hands/rake kept growing. Snapshot-delta RPCs were fine — deltas of a
constant zero are zero.

Secondary: LeaderboardPage ignored the scope toggle (Global no-op) and
entry.change was always 0.

## Fix (no engine deploy needed)
Migration `leaderboard_real_profit_pipeline` (prod 2026-08-19 16:07:23 UTC,
mirrored as CA repo supabase/migrations/20260819g_...):
1. WINNINGS: AFTER INSERT trigger on hand_history (hand_history_fold_stats)
   folds NEW.winners into total_winnings. Cash hands only, club via
   tables.club_id, exception-safe, SECURITY DEFINER. hand_history INSERT is
   service_role-only per RLS, so no client spoof vector.
2. LOSSES: promo_apply_playthrough — ALREADY called by the deployed engine
   once per contributing player per cash hand with the exact contribution
   (ServerTableEngineSettlement STEP 12b, no rake gate) — now also
   accumulates total_losses. Gated to service_role callers because
   authenticated retains EXECUTE on this function.
   Profit = W - L = SUM(won - invested) = exact net. ROI = (W-L)/L.
3. New RPCs: fn_club_leaderboard_period_v2 (adds real rank_change vs
   yesterday snapshot; handles all_time), fn_global_leaderboard_period,
   fn_user_rank_global_period.
4. Stale July-backfill values zeroed inside the migration (atomic with
   trigger creation) so the new backfill starts from a uniform definition.

## Backfill
Source: rake_records.player_contributions x hand_history.winners, non-tournament,
2026-05-21 (hand_history 90-day retention floor) .. T0=16:07:23. Raked hands
only (~36% of hands carry a rake record) — wins AND losses taken from the same
hand set so profit stays internally consistent. Unraked-hand history is
unrecoverable (contributions were never persisted for them before today).
Totals: win 117,795,525.84 / loss 120,881,813.72; difference 3,086,287.88 =
house rake+bbj. Chips conserve.
player_stats_snapshots recomputed per snapshot_date (cumulative day < D) so
daily/weekly/monthly deltas are correct; boundary approximation is midnight
UTC vs actual snapshot capture time (minutes) — cosmetic for a leaderboard.
Staging table _lb_backfill_daily retained pending a verification window; drop
via a small follow-up migration.

## Frontend (CA commit b9315ee)
LeaderboardPage.tsx rebuilt: Global scope wired (fn_global_leaderboard_period +
fn_user_rank_global_period), real rank-change badges, tournament tab
club-scoped, vpip hidden in global scope (per-club ratio), no emoji in source.
LeaderboardService.ts: v2/global RPC wiring with direct-query fallback.
Deployed via CA build-for-world-hub.yml -> WH public/hub/club-arena -> Vercel.

## Verification
- fn_club_leaderboard_period_v2(JAQK, profit, weekly): real ranked profits
  (top 13,507.41), nonzero rank_change.
- fn_global_leaderboard_period(profit, weekly): cross-club leaderboard works.
- Live accrual: player_stats winnings +691.94 / losses +711.35 in a 20s
  window (delta = rake) with ~700 hands per 3 min.

## Residual / follow-ups
- update_player_hand_stats remains a stub (kept for profiles hand counter).
- Boundary hands during the migration commit (~seconds) may be half-counted
  once; immaterial.
- horse_hand_results has no repo-visible writer and only partial coverage —
  do not build on it.
- Drop _lb_backfill_daily after a verification window.

## Security follow-up (same day) — gate made fail-closed
`promo_apply_playthrough` is EXECUTE-able by `authenticated` (pre-existing
grant), so adding a player_stats write inside it needed a caller gate. The
first version (20260819g) allowed the write when
`auth.role()='service_role' OR session_user='postgres'`. Safe in production —
PostgREST connects as `authenticator`, never `postgres` — but the DENY path
could not be proven from an admin SQL session, where session_user IS postgres.
A control that cannot be tested is a control nobody can trust.

Migration 20260819h re-gates solely on the caller's JWT role:
allow `auth.role()='service_role'`, or `auth.role() IS NULL AND current_user IN
(postgres, supabase_admin)` for migrations/backfill; deny authenticated, anon,
everything else. Now directly testable, and tested:

- Attack sim: `SET LOCAL ROLE authenticated` + authenticated JWT claims,
  `promo_apply_playthrough(club, self, 999999999)` -> total_losses delta 0.00
  (assertion would have raised).
- Engine unaffected: winnings +4,313.27 / losses +4,409.31 over a 25s window,
  difference = rake.
- Promo money logic (FOR UPDATE lock, release credit, zeroing, chip_transactions
  row, wagered accrual) confirmed byte-identical to the prior version.

## Production verification (final)
- smarter.poker serves `LeaderboardService-Df-P0Q6--v6.js` containing all three
  new RPC names, and `LeaderboardPage-DfHIpT43-v6.js` containing
  getGlobalLeaderboard / getGlobalUserRank / globalSupported / rank-change-anim.
  No emoji in the shipped chunk.
- All 16 metric x period combinations (profit, hands_played, tournaments_won,
  roi) x (daily, weekly, monthly, all_time) return full 50-row result sets for
  both club and global scope.
- Club weekly profit: 50/50 rows nonzero, 50 distinct values, 50 with a real
  rank_change (including negatives). Global all-time: 50/50 nonzero, 46 with
  rank_change.
- fn_user_rank_period -> rank 1 of 575 for the top JAQK player, matching the
  "1st / out of 575 players" bar; fn_user_rank_global_period -> 3 of 577.

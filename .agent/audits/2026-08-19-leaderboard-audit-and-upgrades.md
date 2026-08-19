# 2026-08-19 — Club Arena Leaderboard: audit pass over the same-day rebuild

Line-by-line audit of the pipeline shipped earlier today (20260819g). Every
claim below was measured against production, before and after.

## Confirmed defects (6) — all fixed

| # | Defect | Measured before | After |
|---|--------|-----------------|-------|
| D1 | ROI board sorted by PROFIT, not ROI | displayed ROI 25.94, 18.87, 17.88, 21.49, 18.06, 10.01, 14.78, 24.04, 9.33, 7.88 — not descending | 25.94, 24.04, 21.49, 21.04, 18.87, 18.06, 17.88, 15.96 — strictly descending |
| D2 | `hands_played` a fraction of reality | 144,956 booked vs 1,083,942 true seat-hands on 08-18 = **13.4%** | 1,083,930 / 1,083,942 = **100.0%** |
| D3 | `rank_change` noise on the daily board | avg abs change 287 positions (vs 28 monthly); every previous value collapsed to 0, ranking was an arbitrary uid tiebreak | previous window = same length ending yesterday; 527 distinct previous values across 575 players, 0 nulls |
| D4 | VPIP/PFR rendered 100x too high | stored range 0.55..100 (mean 40.4) multiplied by 100 → a 40% VPIP displayed as **4040%** | displays 92.31% for raw 92.31 |
| D5 | In-flight load caused the next to be DROPPED | `if (loadingRef.current) return` — changing filters mid-fetch left the previous filter's data on screen with nothing scheduled to fix it | monotonic request token supersedes; stale responses discarded |
| D6 | Realtime channel bound to the wrong table | subscribed to `promotion_leaderboards`, which this view never reads — could not fire | removed; 30s poll + debounced HAND_COMPLETED. A channel on player_stats is deliberately avoided (~1.1M writes/day would flood the client) |

D1 and D4 were inherited from the pre-rebuild page and carried forward in the
rebuild — worth stating plainly rather than filing as new.

### Root causes worth remembering
- **D2**: `hands_played` is owned by `RakebackSettlerService`, which only walks
  *raked* hands (113k of 314k hands/day) and books one increment per settled
  row, not per seat. It was never a hands-played counter; the leaderboard just
  treated it as one. Fixed by adding `player_stats.hands_dealt`, counted by the
  `hand_history` trigger for every seated player of every cash hand. The
  settler's column is untouched — rakeback accounting still owns it.
- **D3**: for `daily`, baseline date and comparison date resolved to the same
  snapshot, so `old_value = snapshot - snapshot = 0` for everyone.

## Hardening
- Winner folding was a single multi-row INSERT: one winner id missing from
  `profiles` would have aborted the whole hand's stats. Now filtered per row
  (latent — 0 bad ids observed across 331 distinct winner ids).
- `idx_pss_date` added; `idx_pss_club_date` leads with club_id and cannot serve
  the global board's date-only filter.

## Checked and cleared (NOT defects)
- **Loss writes are not dropping** despite being fire-and-forget from the
  engine. Reconciled over the 5 hours since cutover: losses 100.05% of
  expected, wins 99.9999%. An earlier 45-second window showed a 0.62% deficit;
  that was a boundary artifact (the promo RPC fires just after the
  `hand_history` insert), not lost writes.
- **`useVisibilityRefresh` has no stale-closure bug** — it reassigns
  `refreshFnRef.current` on every render.
- Data hygiene: 37,294 cash hands since cutover with 0 null/malformed winners,
  0 orphan tables, 0 clubless tables, 0 non-UUID winner ids.
- Performance is fine at current scale (global RPC 158ms over 1,398 player rows
  + 24,680 snapshot rows); indexes are adequate.

## Upgrades shipped
- Per-row hand counts as context for rate metrics (an ROI without volume is
  not a ranking).
- ROI volume qualifier (20 hands). Unqualified rows are marked "unranked" and
  sort last via NULLS LAST rather than being dropped, so a small club never
  sees an empty board.
- Sticky rank card now shows the user's own value and says when they are not in
  the visible top N.
- Rows are keyboard-operable (`role=button`, `tabIndex`, Enter/Space) with
  focus rings; numbered podium places (2nd and 3rd previously shared a glyph).

## Verification (production)
- Served bundle `LeaderboardService-DsY_4k4v-v6.js` has `vpip||0)*100` (was
  `*10000`), `qualified` wired, and all three RPCs. Page chunk
  `LeaderboardPage-5g3yUXbQ-v6.js` carries entry-subline / rank-own-value /
  rank-offlist / unranked. `/api/health` = `55f8ce8a`.
- Exercised through a real authenticated session (test account JWT), not just
  as postgres.

## Notes / residual
- A concurrent agent's Club Arena sync (built from an older CA commit)
  overwrote the arena assets in World Hub after mine — last-writer-wins between
  two `build-for-world-hub` runs. Self-corrected on the next build from CA main
  (which contained both commits), but the race is real: a sync job publishes
  whatever commit it was built from, with no check that it is a descendant of
  what is already in World Hub.
- Staging tables `_lb_backfill_daily` and `_lb_hands_daily` dropped after
  reconciliation. Temporary `_lb_dump_defs()` helper dropped.
- `update_player_hand_stats` remains a stub (kept for the profiles hand
  counter). `horse_hand_results` still has no repo-visible writer and partial
  coverage — do not build on it.

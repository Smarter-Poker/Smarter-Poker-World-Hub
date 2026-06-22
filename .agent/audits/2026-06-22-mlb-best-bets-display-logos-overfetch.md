# MLB Best Bets - always-show-all-games, reliable logos, over-fetch scoping + follow-up resolutions

**Date:** 2026-06-22
**Shipped:** PR #546 (squash `9dfdb8ce`), live on production (`ef032b0e` is a descendant; verified via /api/health + /api/mlb/best-bets).
**Files:** `pages/hub/MLB-ANALYTICS/best-bets.tsx`, `pages/api/mlb/best-bets.ts`.
**Method:** heavy read-only audits delegated to subagents; decisions + edits in the main thread; live-API verification.

## Context
The live `/hub/MLB-ANALYTICS/best-bets` page is the HUB Pages-Router page (renders UniversalHeader/MlbSubNav/BottomNavBar/MlbPremiumGate). No engine proxy is active for it (vercel.json only proxies `commander.*`; middleware only marks MLB-ANALYTICS public). The earlier-session GameBox version was replaced by a categorized layout (Most Likely to Win / Best Money Lines / Run Lines / Over Unders / props).

## Primary ask - page must always display ALL games + logos (DONE, verified live)
1. **"AWAITING MODEL" empty slots removed.** `CategoryCarousel` hard-padded every category to 3 slots (`while (paddedBets.length < 3) push({isStub:true})`) and rendered an "AWAITING MODEL" stub per empty slot. Removed the pad + stub branch; the section now renders only real `BetCard`s (grid flows N cards). The `bets.length===0 -> return null` guard is kept as the graceful empty state.
2. **Per-category caps lifted.** `.slice(0,3)` on Money Lines / Run Lines / Totals / F5 removed so every game in each category renders; "Most Likely to Win" raised to 8; props groups to 12.
3. **Reliable team logos.** Root cause: the engine writes line bets with no `team`/`team_id` (only `matchup` + `selection` home/away), so the API back-filled `team_id` by fragile `matchup` string parsing. Fix: `fact_games` (100% populated `home_team_id`/`away_team_id`) is now selected and scoped to the slate; the team-bet branch sets `team_id` by `game_pk` + `selection` (home/away) ID-based, with the name-parse kept only as a fallback. Verified live: 6/6 team-side bets logo-ready; totals correctly have no team_id (game-level, target icon).

## Over-fetch scoping (#10, DONE)
`enrichBets` previously fetched the full pools every cycle. Scoped the two biggest offenders: `fact_games` from all ~10,355 rows to the slate's `game_pk`s (`.in('game_pk', gamePks)`), and `agg_pitcher` from paging up to 20,000 historical `fg_season` rows to a 7-day `as_of` window (`.gte('as_of', now-7d)`). The name-keyed `v_hitter_profile`/`v_pitcher_profile` pools are left as-is (name matching needs them; 60s CDN cache mitigates). `tsc`: 0 errors.

## #12 agg_pitcher index - NOT added (evidence-based)
The over-fetch scoping makes the enrichment query small and `as_of`-bounded, and the engine's own queries already pin `(as_of, window_kind)` (served by the existing `idx_agg_pitcher_as_of_wk`). A `(window_kind, as_of DESC)` index would be unused/marginal - adding it would be cargo-culting. Deliberately skipped.

## #11 portfolio-csv auth - NO change (assessed)
`/api/mlb/portfolio-csv` exports `sim_bets` - the model's PUBLIC simulated track record - and the portfolio page is NOT VIP-gated (MLB-ANALYTICS is public; no MlbPremiumGate in portfolio.tsx). It is not user PII. Adding auth would break a working public export. The earlier "security hole" framing was incorrect.

## #13 CLV - premise corrected; refinement handed off
CLV is NOT non-functional. `raw_odds` is a bi-temporal time-series (closing line = last pre-first-pitch tick); `evaluate.grade_games()` computes `clv_pts`+`closing_prob`, `compute_prop_clv.py` does props, `recompute_reliability.py` rolls into `bet_type_reliability.avg_clv` (populated, non-zero for props). Two real refinements remain, in the engine grading pipeline: (a) game-market CLV is anchored to the earliest market no-vig prob (line-drift) rather than the bet's entry `best_price` (true CLV); (b) `run_line` CLV is NULL (no closing branch). These change a reported model metric and require an engine-side backfill + verification, so they are delivered as a reviewed, ready-to-apply patch - see `.agent/handoffs/2026-06-22-mlb-clv-engine-refinement.md` - rather than blind-shipped from a sandbox that cannot run/verify the engine grader.

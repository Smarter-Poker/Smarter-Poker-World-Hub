# MLB Engine — Graded-predictions accuracy audit (2026-07-06)

Dan asked for a full accuracy review of graded predictions and whether history should be
deleted now that the surface is complete. Everything below verified against production.

## Method

Independent re-grade: recomputed results for every graded `pred_market_output` row from
`fact_games` final scores (and F5 scores) using `evaluate.grade_market`, compared to the
stored result. NRFI re-verified from the MLB linescore. Props spot-checked against
`raw_player_gamelog` actuals with side-aware expectations.

## Results

| Market | Independently re-checked | Mismatches |
|---|---|---|
| run_line | 572 | 0 |
| total | 562 | 0 |
| f5_moneyline | 675 | 0 |
| h2h | 450 | 0 |
| f5_team_total | 430 | 0 |
| f5_total | 96 | 0 |
| team_total | 178 | 0 |
| pnl consistency (all) | 3,280 | 0 |

**One real defect found and FIXED: 61 historical `yrfi` rows carried the complement of
the correct result.** The 2026-07-05 yrfi-flip fix corrected the grader but never
re-graded history. All 317 graded nrfi-market rows were recomputed from the linescore;
61 corrected (result + pnl); post-fix sample re-check 14/14 clean.

**Props: grading is CORRECT (side-aware).** A naive over-side audit flagged 14/20
"mismatches", but every one resolves once the rec side is read: 'LEAN UNDER' rows grade
the under side (e.g. TB line 2.5, actual 0 -> under wins -> result 'win' is right).
Verified across hits / total_bases / home_run / pitcher_strikeouts cases.

## Verdict on "delete all previous graded bets, keep only the last two days"

**Recommend NO deletion.** Three reasons:

1. **The graded history is the engine's fuel, not a display artifact.** auto_gate's
   market floors run on it (h2h open at min_edge 2.0 BECAUSE of 880 graded bets at
   +14.8% ROI; run_line/total likewise). Deleting it reverts every market to UNPROVEN ->
   the card goes dark for weeks while evidence re-accrues. The self-learning system
   loses its memory.
2. **The staleness concern is already engineered for.** auto_gate uses sample windows,
   reliability/tune_score weight recent performance, and markets that were broken
   historically are exactly the ones the prohibitive floors currently suppress. Old
   evidence cannot make a bad market bettable; it can only keep good markets open.
3. **Display accuracy is a filter problem, not a deletion problem.** The pages already
   support day-window filters (validation ?days=, model-intel windows). If the public
   page should reflect only the rebuilt engine, set a DISPLAY era cutoff
   (e.g. default since=2026-07-05, labeled "engine v2 era") -- reversible, honest, and
   the gate keeps its memory. Offered to Dan as a default-filter change; not shipped
   without his call since it changes what the public page claims.

## Also verified this session (overnight production runs)

f5_run_line emitting market-anchored (NO BET, gate holding); f5_team_total
market-anchored (32 rows); all F5 markets grading; sgp_suggestions refreshing each card
cycle (Hetzner current through f3a048d16b); 60 orphaned 7/5 team_total rows
backfill-graded. Engine commit f64ef70f0d (F5 closing/CLV capture) awaiting Hetzner pull.

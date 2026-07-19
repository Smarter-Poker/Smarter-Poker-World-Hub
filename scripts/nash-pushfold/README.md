# Nash Push/Fold Chart Generator (2026-07-19 training audit, phase 2)

Replaces the 48 hand-authored heuristic rows in `memory_charts_gold` with
computed jam/fold Nash equilibria. Production was loaded on 2026-07-19
(240 rows) — see migration `20260719_memory_charts_gold_nash_pushfold.sql`.

## Method
1. `eqmatrix.py` — 169x169 preflop hand-class equity matrix via eval7
   (C Monte Carlo, 200k boards per pair, representative-combo suits;
   verified anchors: AKs vs QQ 0.4602 [true 0.4605], 72o vs AA 0.1175
   [true 0.1160]). Also computes exact blocker-adjusted villain combo
   counts per hero class.
2. `solver.py` — fictitious play (best-response averaging, 400 iters) on
   the jam/fold game: 6-max chipEV, no antes, effective stacks 2-25bb,
   single-overcall approximation (industry standard for push/fold charts).
   Positions UTG/MP/CO/BTN/SB first-in shove vs Nash callers behind, plus
   the BB call-vs-SB-jam range from the SB solve.

## Validation
Converged ranges match published HU Nash references: SB 10bb jam = 58.3%
of combos (canonical ~58%), BB call = 37.3% (~37-40%); SB 10bb jams any
ace, K2s+, K5o+, Q9o+, J8s+, 54s+; ranges are monotone in depth and
position. `nash_charts.json` is the exact dataset loaded to production.

## DB layout
`memory_charts_gold`: villain_action='fold_to_hero' → first-in jam charts
(hand_matrix {hand: {push, fold}}), villain_action='sb_push' → BB call
charts ({hand: {call, fold}}). game_type Cash and Tournament rows are
identical (chipEV; no ICM layer yet). Consumer:
`pages/api/training/preflop-ranges.js` scenario=push_fold (nearest-depth
selection).

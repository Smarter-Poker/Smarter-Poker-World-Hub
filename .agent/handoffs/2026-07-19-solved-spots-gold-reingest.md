# HANDOFF: Re-ingest solved_spots_gold from original PIO exports

Priority: HIGH (data quality). Requires: the machine holding the original
PioSOLVER exports (tree_file paths like C:\PioSOLVER\hu_cash_BB_100bb_7c8s5c.cfr
indicate a Windows box) or the intermediate CSV/JSON dumps used by the
original ingest.

## What is wrong (verified live 2026-07-19)

strategy_matrix.frequencies in solved_spots_gold is scale-corrupted across
ALL families (hu_cash, 6max/9max_cash, mtt_*, sng_*, spin_*,
postflop_complete — not just the known-raw 'cash'/'spin' families):

- Per hand, 'c' and 'b16' values are 0-1 and often (87/169 hands in the
  probe row) sum to ~1 — these look like real root-node frequencies.
- 'f' values run 0-523 (mean ~257 over postflop_complete) and 'b45' 0-105.
  They are NOT frequencies under any per-row linear scale (AA "folds 475"
  while checking 0.93). tree_lines shows the root node has only [b16, c] —
  'f'/'b45' belong to DEEPER tree nodes and appear to have been flattened/
  accumulated into the same per-hand map by the original ingest.
- 0 of 200 sampled postflop_complete rows have per-hand action sums ≈ 1.
- hand_evs values are 0-1 and look equity-like, not chip EVs; ev_ip/ev_oop
  exist per row and are unused.
- Duplicate hashes exist (~1% of rows; 3.4M of 7.95M rows are river spots).

Consequence: only ~2 actions per spot are trustworthy, so the trainer's
question space collapses to Check-vs-Bet16. The serving engine now guards
this (credible-distribution extraction, see
src/engines/DeterministicGTOEngine.js buildQuestionFromScenario 2026-07-19),
but the data itself remains impoverished until re-ingest.

## What to do

1. Locate the original ingest script (search the Mac + the Windows solver box
   for the writer of solved_spots_gold; tree_file column names the .cfr files)
   and the raw exports.
2. Re-extract per-node strategies CORRECTLY: for the ROOT decision node of
   each saved spot, per-hand action frequencies must sum to 1 across the
   node's actual actions (PIO "show_strategy" output). Store per-action
   per-hand EVs if available ("calc_ev") — the trainer currently has no real
   per-action EV and fabricates EV-loss numbers.
3. Write to a NEW column or versioned rows (strategy_matrix_v2) rather than
   overwriting, then flip the reader
   (DeterministicGTOEngine.buildQuestionFromScenario + browse-solutions/
   tree-navigate/spot-drill normalizers) and regenerate
   training_question_cache with the fixed engine.
4. Delete/merge duplicate scenario_hash rows during re-ingest.
5. Acceptance: >=95% of sampled rows have per-hand action sums in [0.98,1.02]
   across ALL actions incl. fold; spot-check 20 spots against PioViewer.

## Context for the executing agent
- Serving-side guards (already live): credible-distribution extraction,
  street=null query fix, answer-class balancing, multi-street forced-hand.
- Cache repair migrations already applied: answer-key reconcile (5,174 rows),
  explanation regen, hand-relabel repair (2,193 rows).
- Audits: .agent/audits/2026-07-19-training-engine-*.md

# 2026-07-19 — Phase 3: Deterministic Engine Correctness Audit

Dan's directive: "insure the deterministic engine is actually correct and
100% functional, that we are sourcing and using the solved hands from the
PIO solver correctly, extracting the real GTO data correctly, and deriving
correct questions and unbiased answers."

Two-agent swarm (deep code audit + 180-question live fidelity sweep with
per-question DB cross-checks) plus direct data forensics.

## Ground truth discovered (changes everything)

solved_spots_gold's per-hand frequencies are SCALE-CORRUPTED at ingest across
ALL families, not just 'cash'/'spin': 'c'/'b16' are credible 0-1 root-node
frequencies (often summing to ~1 per hand), while 'f' (0-523, mean ~257) and
'b45' (0-105) are NOT frequencies — tree_lines shows the root node only has
[b16, c]; f/b45 belong to deeper nodes and were flattened into the same map.
0/200 sampled postflop_complete rows have per-hand sums ~= 1. hand_evs look
equity-like (0-1), not chip EVs. The original .cfr exports live on a Windows
box (tree_file paths) — full recovery needs re-ingest: see
.agent/handoffs/2026-07-19-solved-spots-gold-reingest.md.

## Delivery note
DeterministicGTOEngine.js (967KB) cannot transit the current agent push path,
so all engine fixes ship as RUNTIME PATCHES on the exported singleton in
src/engines/deterministicEnginePatches.js (applied at import time by
batch-preload / get-question / next-street). Merge them into the class and
delete the patch module the next time a git-credentialed session edits the
monolith. Patched fetchSolverPool also sanitizes matrices at the source, so
downstream difficulty gating (getMaxFrequency) sees clean 0-1 data.

## Confirmed defects -> fixed this commit

1. street=null query bug: getStreetForLevel returns null ("all streets") but
   fetchSolverPool fed it into .eq('street', null) -> ZERO rows -> the live
   deterministic generation path was dead by default. Now filters street only
   when set (patched fetchSolverPool).
2. Corrupted-scale discard inverted answers: the old >1 filter silently
   dropped corrupted actions and took argmax over the remainder. Replaced
   with credible-distribution extraction: serve a hand only when its in-range
   values form a real distribution (sum~1) or a pure strategy (>=0.98);
   renormalize; SKIP non-credible hands instead of fabricating.
3. Answer-class bias ("always Check" scored 73% in live sampling): engine now
   alternates preferred answer class across questionIndex; batch-preload
   interleaves aggressive/passive-answer questions from the cache pool.
4. Cache hand-relabel corruption: 2,193 rows displayed "AA" (text, cards,
   scenario, EV) while frequencies/answer belonged to the id-embedded hand.
   DB repair applied (migration 20260719_training_cache_hand_relabel_repair):
   hand labels/cards/text/EV restored; 0 mismatches, 0 board collisions after.
5. Repeat loop: batch-preload limited the cache query to questionCount BEFORE
   shuffling -> identical 15 questions per level forever. Now over-fetches
   (>=100) then shuffles then slices.
6. Psychology games dead: batch-preload called generateBatch positionally but
   it destructures an options object -> gameConfig undefined -> [] for all 20
   PSYCHOLOGY games. Fixed call shape (+await).
7. Multi-street wrong hand: queryNextStreet ignored the user's hand — a
   player holding QJo could get the turn graded for Q6s, or a hand with
   all-zero frequencies. Now: hand normalized to its 169-class, FORCED
   through buildQuestionFromScenario (returns null cleanly when the hand has
   no credible data -> client stays single-street), exact child preferred via
   suffix match, approximate boards flagged isApproximateBoard.
8. Difficulty gating (getMaxFrequency) previously saw corrupted >1 values —
   matrices are now sanitized before any downstream use.

## Verified sound
- Routing: all pioGameType targets exist in the DB; no game routed to a
  missing family. Stack depths resolve to real rows.
- scenario_hash board/position parsing handles all three hash layouts.
- EV fields (heroHandEV/handEVs) faithfully copied from DB (180/180 in live
  sweep) — though the DB values themselves are equity-like.
- No positional bias in options; options built from real solver actions;
  Fisher-Yates shuffle sound.
- Provenance is real: 180/180 sampled questions' hashes resolve to real PIO
  spots; 96.1% answer keys already matched DB argmax pre-fix.

## Known remaining limitations (data-bound, not code-bound)
- Until re-ingest, questions are limited to the credible action subset
  (mostly Check/Bet16 nodes) — the handoff unlocks the full action space.
- EV-loss feedback on wrong picks is a labeled heuristic (no real per-action
  EVs exist in the data).
- Partial-board multi-street matches use nearest-texture solver data (now
  flagged isApproximateBoard).

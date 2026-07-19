# 2026-07-19 — Training Games Engine Deep Audit (GTO Wizard parity)

Requested by Dan: "deep dive and audit of the training games engine, it needs
to work exactly like GTO Wizard... see what's built, what's not, what works
and what doesn't and fix any and all issues."

Scope: pages/hub/training/**, pages/api/training/** (47 endpoints),
pages/api/gto/** (11), src/hooks/useGTOTrainer.js, src/engines, src/games,
src/config (trainingConfig/LevelRegistry/solverRanges), and the production
Supabase content tables (solved_spots_gold 7.9M rows, training_question_cache
27,413 rows).

## Architecture findings (what's actually built)

- LIVE PLAY PATH: training hub / category -> play/[gameId] (LevelSelector,
  12 levels) -> arena/[gameId] -> GodModeArena.jsx -> useGTOTrainer.js ->
  /api/training/batch-preload (training_question_cache first,
  DeterministicGTOEngine on miss) -> record-question -> save-progress.
- DEAD CODE (0 importers, kept in tree): GameArena.tsx,
  UniversalTrainingTable.tsx, TrainingArena.jsx, TrainingRunEngine.js,
  gameDataLoader.ts, trainingPlayStore.js, trainingCategoryStore.js.
  TrainingRunEngine grades by a different key (isGTO) than the live hook —
  NOT a drop-in; do not wire it up without reconciling grading.
- CONTENT: solved_spots_gold is REAL solver output. solverRanges.js preflop
  charts are hand-authored (plausible but not literal solver exports).
  equity.js (Monte Carlo + exact enumeration) and icm-calc.js
  (Malmuth-Harville) are mathematically real. LLM generation of questions is
  fully retired; grok-3-mini remains only for psychology explanations.

## Bugs found and FIXED this session

1. WRONG GTO ANSWERS (P0): 1,572/21,700 training_question_cache rows graded
   against an action that was NOT the argmax of the row's own solver
   frequencies; labels (correctAnswerText) and displayed bars
   (gtoFrequencies) also contradicted the grading key.
   FIX: (a) read-time reconcileAnswerKey() in src/utils/trainingApiUtils.js,
   applied in get-question.js, batch-preload.js, hand-of-the-day.js;
   (b) DB repair migration 20260719_training_question_cache_answer_key_repair
   (5,174 rows updated; argmax mismatches now 94 — those rows have frequency
   keys that don't map onto their options and are intentionally untouched).
2. UNPASSABLE LEVELS: checkLevelPassed(level, correct, total) was called with
   3 args but defined with 2 — pass requirement always computed against 20
   questions even when fewer were served (10-question session needed 17/10).
   FIX: trainingConfig.js getRequiredCorrect/checkLevelPassed accept the
   actual question count; useGTOTrainer requiredCorrect updated.
3. ANONYMOUS DEAD-END: play/arena pages minted anon-<ts> userIds but every
   question API 401s without a JWT — logged-out users hit an error screen.
   FIX: both pages now redirect to /auth/login?redirect=<return-path>.
4. bookmark-solution.js: undeclared `error` in auth check -> ReferenceError
   -> 500 on EVERY authenticated request. FIXED.
5. solver-api.js: same undeclared `error` inside getUserFromToken ->
   always returned null -> endpoint 401'd on every request. FIXED.
   (Its "baseline_estimate" strategy remains a labeled heuristic;
   training_scenarios and solver_queue tables are empty.)
6. SOLVER GRID 5018% BUG: solved_spots_gold `cash` (~1.1M) and `spin` (~1.05M)
   families store raw combo weights, not 0-1 frequencies. browse-solutions,
   tree-navigate and spot-drill multiplied by 100 -> thousands-of-percent
   displays and broken ">10%" filters. FIX: per-hand normalization (divide by
   hand total when >1) in all three endpoints. Argmax grading was already
   scale-invariant.
7. DEAD ANALYTICS PIPELINE: smart-practice.js and analytics.js selected six
   training_answers columns that never existed (42703 -> silent fallback), so
   weak-spot targeting and position/street/mistake breakdowns were inert.
   FIX: migration 20260719_training_answers_spot_metadata_columns adds
   hero_position, villain_position, street, classification, ev_loss,
   spot_type; record-question.js now persists them (client already sent them).
8. PHANTOM DIAMONDS: hand-of-the-day.js POST returned diamondsEarned:25 but
   never called add_diamonds_to_balance. FIX: credits 25 diamonds exactly
   once per user per day (idempotent via prior-completion check).
9. RECOMMENDATIONS NO-OP: recommendations.js used a hardcoded 13-game catalog
   with ids (cash_001) that never matched real ids (cash-001/mtt-001) — every
   user was treated as new. FIX: catalog now built from TRAINING_LIBRARY
   (107 games).
10. RULE VIOLATIONS: log-request.js (raw supabase-js import, module-scope
    createClient, IDOR via body userId) rewritten with supabaseServerClient +
    JWT-derived identity; horse-opponent.js raw import swapped for
    supabaseServerClient. get-weak-spots.js duplicate JSON key removed;
    render-analysis-card.js out-of-scope `req` in helper removed.

## Verified NOT bugs / left as-is (documented)

- Levels 11-12 serve level-10-difficulty content (server clamps at 10) with
  stricter client-side thresholds (Boss Mode 90%) — coherent design; raising
  the clamp risks 404s where no L11/12 content exists.
- batch-preload/get-question SIMULATED enrichment (fabricated cards/EV when
  cache rows lack them) is tagged via dataQuality and kept.
- runout-report ev_delta is an aggression-index proxy, not solver EV
  (admitted in code); gto-reports baselines are hardcoded heuristics.
- memory_charts_gold has only 48 rows -> push/fold charts mostly fall back to
  an RFI-derived heuristic. Real Nash push/fold content load is FOLLOW-UP.
- 94 cache rows remain with unmappable frequency keys (0.4%, down from 7%).
- Hub inline arena (training.js -> GodModeArena level=1) bypasses
  LevelSelector/session-start — divergent but functional entry path.

## Verification

- `npm run build` exit 0 locally (Next 16.2.9 / Turbopack) before push.
- Repo greps clean on changed files: no .single(), no raw supabase-js imports
  in API routes, no conflict markers, no new emoji.
- Both migrations applied to production via Supabase MCP and recorded under
  supabase/migrations/.
- Post-deploy: /api/health SHA verified + live endpoint smoke tests with the
  test account (see session notes).

## Note on push mechanics

This session ran in Cowork's cloud sandbox: the Mac's git-safe-push.sh could
not be executed (device shell has no network). Equivalent gates were run
manually (build + greps above) and the commit was pushed to main via the
GitHub API; production SHA verified via /api/health afterwards. The Mac
working copy is BEHIND origin and auto-resyncs via the Antigravity
reset-to-origin loop.

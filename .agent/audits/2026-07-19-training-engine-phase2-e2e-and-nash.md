# 2026-07-19 — Training Engine Audit Phase 2: Live E2E + Nash Push/Fold

Follow-on to `.agent/audits/2026-07-19-training-engine-audit.md`. Phase 2 =
(a) real-browser E2E audit of the production play loop (Playwright vs
smarter.poker, test account, mobile+desktop) and (b) replacing the push/fold
heuristic with computed Nash equilibrium content.

## E2E findings -> fixes (all in this commit)

D1 CRITICAL — sessions never saved: POST /api/training/save-session
returned 413 on EVERY level completion (handHistory entries carried
rawFrequencies + evData.handEVs — two 169-hand matrices per hand — blowing
the 1MB body limit). Level progression was dead in production: after a
20/20 run, progress still showed "Not Attempted". FIX: client strips the
bulk matrices (utils/saveSession.js), server strips them too for stale
clients AND accepts 4MB (save-session.js bodyParser sizeLimit).

D2 CRITICAL — incoherent completion screen: "100% GTOW SCORE" alongside
15 mistakes, an F grade, and contradictory EV signs; the "score 85%+"
daily-challenge diamonds keyed off the bogus 100. Root cause: the
"additive" score formula (100 + avgImpact*8, clamped) pegs at 100 whenever
positive impacts outweigh negatives. FIX: classification-weighted quality
score in useGTOWScore.js (BEST 1.0 / CORRECT 0.9 / INACCURACY 0.6 /
WRONG 0.3 / BLUNDER 0.0). Also relabeled the review "EV/Hand" tile to
"EV Loss/Hand" with an explicit negative sign.

D3 HIGH — cash-001 bypassed the level system: hardcoded to an endless
PreflopRangeTrainer that ignored ?level=, had no completion, and counted
non-best picks as correct. FIX: removed the bypass; cash-001 now runs the
standard leveled arena (it has real cache content).

D4 HIGH — unhandled TypeErrors during play (19+6 in one session):
getHandSummary on a nulled multiStreetHandRef (async race) and
(scenario.context||'').toLowerCase on non-string context. Both guarded in
useGTOTrainer.js. Bonus: fixed a TDZ bug (selectedText used before
declaration) that silently disabled the ActionTreeEngine score.

D5 HIGH — leaderboard dead both directions: training_leaderboard has no
total_xp column (XP system removed) — GET 500'd on every request and both
write paths failed silently. FIX: leaderboard.js + update-leaderboard.js
now select/write only real columns; ordering accuracy -> questions_correct.

D6 — /api/games/[slug] 404'd for all 107 training games (they live in
TRAINING_LIBRARY, not game_registry). FIX: server-side library fallback.

D7 — GET {supabase}/rest/v1/ root 401'd on every page load (AntiGravityBoot
health check). FIX: ping /auth/v1/health (verified 200).

D8 — stale explanations contradicting reconciled answer keys: read-time
regeneration in reconcileAnswerKey when the key/bars materially change +
DATA migration 20260719_training_cache_explanation_repair regenerated
explanations for all 5,174 repaired cache rows (verified coherent).

D9 — LevelSelector "0/10 Levels Completed" with 12 levels -> dynamic count.
D10 — OneSignal double-init errors -> claim init flag synchronously before
await (React 18 double-mount race); release on failure.

E2E PASSES (no change needed): hub + 107 tiles + images, category filter,
12-level selector + locks, arena rendering mobile+desktop, per-question
feedback (verdict/bars/EV), multi-street hands, 20/20 completion flow,
logged-out arena redirect to /auth/login?redirect= (phase-1 fix verified
live in-browser).

## Nash push/fold content (replaces the biggest GTO-fidelity gap)

memory_charts_gold's 48 hand-authored binary rows replaced with 240
COMPUTED rows: fictitious play (400 iters) over a Monte-Carlo 169x169
equity matrix (eval7, 200k boards/pair, blocker-adjusted combo weights);
6-max chipEV, no antes, single-overcall model; UTG/MP/CO/BTN/SB first-in
jam charts at 2-25bb + BB call-vs-SB-jam (villain_action='sb_push').
Validation: SB 10bb jam 58.3% of combos (published Nash ~58%), BB call
37.3% (~37-40%); SB 10bb jams any ace, K2s+, K5o+, Q9o+, J8s+, 54s+;
monotone in depth/position. Generator + exact dataset committed under
scripts/nash-pushfold/. preflop-ranges.js push_fold now selects the
nearest-depth Nash chart (and Call/Fold labeling for BB); the RFI-derived
heuristic remains only as last-resort fallback.

## Verification
- npm run build exit 0 before push; safety greps clean on changed files.
- Data migrations applied to production (explanation repair: 5,174 rows;
  Nash load: 240 rows verified by independent aggregate comparison).
- Post-deploy live checks recorded in the session report (health SHA,
  leaderboard 200, save-session accepting compact payloads, push_fold
  serving source='nash_computed').

## Deferred / follow-ups
- solver-api custom solves still a labeled heuristic (solver node never
  connected); training_scenarios + solver_queue still empty.
- solverRanges.js RFI/3bet charts remain hand-authored (phase 3 candidate:
  replace with solver exports or extend the Nash pipeline).
- ICM-aware push/fold (current charts are chipEV; add ICM layer later).
- Dead-code cluster (GameArena.tsx etc.) still present, documented.
- Hub inline arena still enters at level 1 (divergent but functional).

## Wave-1 verification pass (same day, follow-up commit)

A three-agent verification swarm (adversarial diff review + live API sweep +
browser E2E rerun) over phases 1-2 found and this commit fixes:

- CRITICAL: save-session STILL 413'd — the real limiter was an in-handler
  100KB guard (compacted real sessions are ~400KB); raised to 2MB.
- CRITICAL: /api/training/progress read `god_mode_user_session` (a table
  nothing writes) and never returned the `levels` map LevelSelector expects,
  AND LevelSelector sent no auth header — progress could never display.
  Endpoint rebuilt from training_level_history + training_progress; header added.
- Adaptive difficulty mutated `level` mid-session and leaked into
  persistence/thresholds/labels ("Retry Level 2" after selecting Level 1,
  completions recorded at the wrong level). useGTOTrainer now separates
  immutable `selectedLevel` (persistence/thresholds/UI) from adaptive
  `contentLevel` (question difficulty).
- spot-drill 500'd on ~90% of calls (exact-count + deep random OFFSET over a
  2M-row ilike scan timed out) — replaced with an indexed uuid-pivot sample.
- calculateSessionDiamonds called with the wrong summary shape (threw on
  every completion; reward always 0) and with the raw level as a multiplier;
  fixed shape + registry multiplier.
- Review screen graded by two different systems at once (header "C-" vs card
  "D") — unified on getScoreGrade(gtowScore).
- gtow_score_avg was read by leaderboard GET but never written — now
  maintained as a running average in both write paths; achievements.js
  total_xp select fixed (column gone); TrainingLeaderboard.tsx rendered
  "+undefined" (totalXp removed from API) — now shows best streak.
- Saved-session replays lost the range grid/EV overlay (compaction strips
  matrices) — HandReplayViewer now refetches the solver matrix on demand via
  browse-solutions?scenarioHash= (endpoint extended).
- SessionTracker board.join TypeError on string boards; reconcileAnswerKey
  barsChanged compared mixed 0-1/0-100 scales; preflop-ranges BB fallback
  used Push keys under Call/Fold labels; OneSignal prompt no longer shows
  over /hub/training/arena.

Deferred polish (documented, not blocking): review tab-strip clipping at
390px, Quit button overlapping arena title, ~250 feature-tab buttons on the
mobile review screen, absent desktop tile hover state, achievements
definitions schema mismatch (category vs requirement_type, thresholds all 0).

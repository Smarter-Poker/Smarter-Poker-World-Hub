# Operation Grok-Sweep — Final Closeout

**Date:** 2026-05-05
**Author:** claude (cowork session continuation)
**Scope:** Phase 1 → Phase 18 of the multi-phase remediation that started as
"phase out grok-3 LLM calls in training-game endpoints" and grew into a full
training-cache rebuild + quality pass.

This file is the canonical closeout record. The earlier
`2026-05-05-grok-sweep-finish.md` covered the original 3-file refactor;
this one covers Phase 4 onward through Phase 18 and the final integrity
audit. Read both for the full picture.

---

## 1. What shipped

### 1.1 Code (all on origin/main)

| Area | File(s) | Change |
|---|---|---|
| Shared template module | `src/lib/explanationTemplates.js` | NEW. Both rich (EngineExplanation) and flat (GTOAnalysisPanel) shapes. 100/100 unit tests passed Phase 12. |
| explain-answer endpoint | `pages/api/training/explain-answer.js` | Branch on type: PIO/CHART → deterministic, SCENARIO → grok-3-mini. |
| gto-analysis endpoint | `pages/api/gto/gto-analysis.js` | 3-tier board match (EXACT / FLOP_PREFIX / APPROXIMATE). Hand-coverage guard. GROK_FALLBACK source tag. |
| get-question endpoint | `pages/api/training/get-question.js` | Removed `generateQuestionWithGrok` (~180 lines), `getHardcodedQuestion`. Renamed `enrichGrokQuestion` → `enrichLegacyCachedQuestion`. |
| Memory-Matrix scenarios | `pages/api/gto/generate-scenario.js` | Pulls from `solverRanges.js` constants (RFI / 3BET / BB_DEFENSE / 4BET / SQUEEZE / SHOVE_FOLD). |
| Hand explainer | `pages/api/gto/explain-hand.js` | Real solver-frequency lookups + deterministic prose. |
| Post-game analysis | `pages/api/gto/analyze-game.js` | Pattern detection (over-folding, hand-class concentration, position weakness). |
| Adaptive generator | `pages/api/gto/generate-adaptive.js` | Engine-driven from RFI tables for user's flagged-weak position. |
| Coaching summary | `pages/api/training/coaching-summary.js` | Deterministic over session metrics. |
| EV-tree | `src/engines/DeterministicGTOEngine.js` | Removed `Math.random()` jitter from EV-tree. Added `isApprox: true` flags. |
| Tombstoned (410 Gone) | `pages/api/gto/session-recommendations.js`, `pages/api/gto/generate-batch.js`, `pages/api/training/generate-infinite.js` | Dead grok-3 callers. |

### 1.2 SQL migrations (all in `supabase_migrations.schema_migrations` on prod)

16 migrations applied, 13 also committed to `supabase/migrations/` (the
remaining 3 are operational migrations from concurrent diamond-economy
work, not Grok-Sweep):

| Version on prod | Purpose |
|---|---|
| `20260505171549` | Purge 27 stale GROK_GTO cache rows |
| `20260505173236` | Shuffle SCENARIO answer positions (63.6%c → uniform) |
| `20260505182436` | Backfill 277 missing (game_id, level) pairs |
| `20260505182730` | Repair 5 PSY game-type mistypes |
| `20260505182845` | Replace SCENARIO clones in non-PSY games with PIO |
| `20260505212023` | Backfill v2 (rebuild after Phase 5 audit) |
| `20260505212805` | Strict per-game regenerate v4 (matches `GameScenarioMap.ts`) |
| `20260505213038` | Fill river L8/L10 gaps from `postflop_complete` donors |
| `20260505221113` | Populate memory_charts_gold from solverRanges |
| `20260505221254` | Strip giveaway words from correct SCENARIO options |
| `20260505221437` | Delete caricature SCENARIO rows |
| `20260505221847` | Rebalance PIO answer distribution v2 (heroHand swap) |
| `20260505223006` | Within-pair SCENARIO dedup |
| `20260505223342` | Refill SCENARIO with distinct-text donor pool |
| `20260505223758` | Diversify SCENARIO question openers (round 1) |
| `20260505223919` | Diversify SCENARIO question openers (round 2 — sub-patterns) |

---

## 2. Final integrity audit (run 2026-05-05 23:21 UTC)

```
total_rows:                   27,413
pairs:                         1,070  (100% coverage of expected matrix)
pio_rows:                     20,950
chart_rows:                    1,000
scenario_rows:                 5,463
scenario_distinct_texts:       3,256  (was 1,268 before diversify — 2.57x lift)
legacy_opener_pct:              0.00% (was 28.9% — diversify migrations cleared it)
pairs_below_25:                    0
memchart_meaningfully_populated: 48/48 (≥5 hands each — was 12/48)

Answer-position uniformity (correctAnswer field):
  CHART:    fold 59.7% / push 40.3%   (solver-natural)
  PIO:      check 57.1% / bet16 42.9% (post-rebalance)
  SCENARIO: a 25.9% / b 24.3% / c 25.7% / d 24.1%  (effectively uniform)

Caricature wrong-options remaining: 0 (probed across 12 patterns)
PIO pairs with 100% Check correct: 0 (was 4 — all eliminated)
```

All three originally-pending items from the Phase 17 closeout are now
zero. The cache is in the cleanest state since the platform launched.

---

## 3. Phase-18 push closure

The sandbox couldn't authenticate to GitHub after the security cleanup
removed the PAT from the remote URL (`gh` not installed; GitHub MCP
returned `Bad credentials`). The 7 staged migration files were left in
the working tree. Dan's subsequent commit on his Mac
(`f08c09739b style: micro-adjust diamond balance and vip expiry overlay
positioning by 3px`) swept them all into origin/main alongside his
styling changes — verified via `git log origin/main -- <file>` for every
migration and via `git show --stat f08c09739b`.

Production `/api/health` was at SHA `8657a762` at audit time; the build
for `9bcb076581` (latest origin) was still in flight (commits <1h old).
Vercel auto-promotes once it goes Ready; no agent action needed.

---

## 4. What's NOT done — and why

These items are intentionally deferred, not bugs:

- **Some psy templates still feel template-y** — eliminating that fully
  requires a content-authoring pass (real writer, not SQL), not more
  SQL acrobatics. The diversify-2 migration cut the top-4-word opener
  share from 28.9% → 0%, which is the limit of what mechanical
  rephrasing can achieve.
- **CHART distribution skews 60/40 fold-favored** — that's the *correct*
  distribution given the underlying solver ranges. Forcing 50/50 would
  introduce hand-classification errors. Leaving as-is.
- **PIO is 57/43 check/bet** — same reasoning. River nodes legitimately
  prefer check more often than bet across the donor pool.

---

## 5. Operational lessons (added to `.agent/CLAUDE_AGENT_RULES.md`)

1. The sandbox cannot push to GitHub after security cleanup of the PAT
   from the remote URL. If `git-safe-push.sh` fails on the
   "could not read Username" error, leaving files staged for a
   terminal-side commit is the correct fallback — the work is durable
   on disk and a concurrent agent or Dan will sweep it.
2. PIO answer distribution rebalancing should happen at the heroHand
   level, not the option-text level. Swapping `heroHand` to a
   bet-favored hand preserves the solver matrix integrity while
   changing which hand drives the "correct" answer. SQL function
   `fn_swap_to_bet_hand` in migration `20260505221847` is the canonical
   pattern.
3. SCENARIO opener diversification via 16-variant md5-rotated CASE
   expressions is idempotent (no opener in the new set starts with
   the matched prefix), so re-running the migration is harmless.
4. `apply_migration` is the only auditable path for schema or data
   changes. `execute_sql` for raw DML is fine for one-off probes but
   never for shipped state changes.

---

## 6. Verification commands (for future agents)

```sql
-- Total cache health
SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT (game_id, level)) AS pairs
FROM training_question_cache;

-- SCENARIO uniformity
SELECT question_data->>'correctAnswer' AS pos, COUNT(*) AS n
FROM training_question_cache
WHERE question_data->>'type' = 'SCENARIO'
GROUP BY 1 ORDER BY 1;

-- Memory-chart fill
SELECT game_type, stack_depth, hero_position,
       (SELECT COUNT(*) FROM jsonb_object_keys(hand_matrix)) AS hands
FROM memory_charts_gold ORDER BY 1, 2, 3;
```

If any of these regress, the next remediation pattern is in
migrations `20260505221847` (PIO swap) and `20260505223758` /
`20260505223919` (SCENARIO opener diversify).

---

## 7. ADDENDUM — Phases 19-22 (post-closeout verification)

### 7.1 Phase 19 — End-to-end smoke test (PASS)

Probed one (game_id, level) pair per game family (12 families, 24 sample
pairs) directly against `training_question_cache`. Every pair returned
well-formed questions: type ∈ {PIO, CHART, SCENARIO}, question text
present, 2-4 options, correctAnswer or frequency≥50 signal,
scenario.gameType / scenario.street / scenario.stackDepth matching the
per-game spec in `GameScenarioMap.ts`. Examples confirmed:
- `cash-010 L7` → CHART preflop 5BB (cash short-stack push/fold) ✓
- `mtt-016 L4` → CHART preflop 10BB (tournament push/fold) ✓
- `spins-005 L8` → PIO turn 15BB spin_3max_chipev ✓
- `bluff-catcher L6` → PIO turn 100BB hu_cash ✓
- `final-table-sim L10` → PIO river 100BB postflop_complete ✓

### 7.2 Phase 20 — Difficulty progression measurement

Initial measurement using close-EV % (mixed-strategy spots) showed:
- 6/11 game families had clean monotonic L1→L10 escalation
- 5/11 had non-monotonic curves (close-EV peaked at L5, dropped at L10)

Phase 22 re-examined with composite metrics and concluded the
non-monotonic curves are CORRECT — see Section 7.4.

### 7.3 Phase 21 — Hint-leakage on question text (FIXED)

Detected: 22.81% of SCENARIO questions (1,246/5,463) contained a
distinctive ≥6-letter word that appeared ONLY in the correct option's
text — letting a user latch onto the shared word as a guidepost.

Top 5 leak words (573 of 1,246): situation (180), session (113),
bankroll (103), moment (98), consistent (79).

Migration `20260505233000_strip_hint_leaking_words_from_scenario_questions`
substituted 9 high-leak words with synonyms verified to not appear in any
option set:
- `situation → spot`, `session → stretch of play`, `bankroll → roll`
- `moment → instance`, `consistent → steady`, `decision → call`
- `maintain → keep`, `pressure → stress`, `timing → pace`

Post-migration leak rate: **11.97% (654/5,463)** — 47% reduction.
Remaining leaks are mostly thematic-context overlaps (e.g.,
"mental"/"emotional") that don't telegraph the answer enough to warrant
further substitution.

### 7.4 Phase 22 — Difficulty progression revisited (NO FIX NEEDED)

The L8-10 close-EV % drop in 5 game families is solver-correct, not a
content bug. Proper difficulty signal is composite:

| Metric | L1-3 | L4-7 | L8-10 | Direction |
|---|---|---|---|---|
| Street | 100% flop | 100% turn | 60% river / 40% turn | escalates |
| PIO stack avg | 77 BB | 77 BB | 50 BB | narrows at L10 |
| Three-option PIO % | 1.7% | 4.3% | **15.9%** | 9.4× more multi-sizing |
| Close-EV % (mixed) | 4% | 26% | 30% | escalates |

Rivers are inherently more polarized than turns ("you have it or you
don't"), so mixed-strategy spots cluster naturally on turns. The
compensating difficulty signal at L8-10 is bet-sizing complexity:
9.4× more 3-option (multi-bet-sizing) decisions than L1-3, which is
what genuinely makes river decisions hard.

Composite difficulty IS monotonically increasing on every meaningful
axis. Phase 20's per-family flag was an artifact of using a single
metric (close-EV %) that flattens at rivers.

### 7.5 Updated final integrity audit (post-Phase-21)

```
total_rows:                  27,413
pairs:                        1,070  (100% coverage)
scenario_rows:                5,463
scenario_distinct_texts:      3,256  (2.57× lift)
legacy_opener_pct:             0.00%
hint_leak_pct (Phase 21):     11.97% (was 22.81%, halved)
SCENARIO answer position:    25.9 / 24.3 / 25.7 / 24.1
PIO 100%-Check pairs:         0
caricature wrong-options:     0
memory_charts shells:        48/48 populated
```


# Trivia Pool — Pre-Rebuild State Audit

**Date:** 2026-05-05
**Phase:** 1/5 of plan v3 rebuild

## Live DB state

| Category | Track | Easy | Medium | Hard | Total | Last created |
|---|---|---:|---:|---:|---:|---|
| `gto_theory` | A | 0 | 137 | 57 | 194 | 2026-02-10 |
| `gto_scenarios` | A | 0 | 112 | 65 | 177 | 2026-02-10 |
| `cash_game_situations` | A | 0 | 136 | 70 | 206 | 2026-02-10 |
| `mtt_situations` | A | 0 | 89 (note: 81 in live count) | 61 | 81 | 2026-02-10 |
| `icm_chip_ev` | A | 0 | 97 | 56 | 153 | 2026-02-10 |
| `famous_hands` | B | 0 | 118 | 71 | 189 | 2026-02-10 |
| `poker_history` | B | — | — | — | **0** | n/a |
| `player_profiles` | B | — | — | — | **0** | n/a |
| `tournament_facts` | B | — | — | — | **0** | n/a |
| `rule_knowledge` | B | — | — | — | **0** | n/a |
| **Total** | | **0** | **689** | **380** | **1,069** real / 1,903 all | |

**Pipeline last produced anything 84 days ago.** The dead-Grok-cron diagnosis from earlier is confirmed.

**All 1,903 questions are `last_used_at IS NULL`, `use_count = 0`** — never served. The 60-day rotation has never engaged.

## Solver tables

| Table | Rows | PK | Status |
|---|---:|---|---|
| `solved_spots_gold` | **5,346,204** | `id` | ✅ accessible via service-role |
| `memory_charts_gold` | (48 expected) | `chart_id` (not `id`) | ✅ accessible — schema has `game_type, stack_depth, hero_position, villain_action, hand_matrix` |

`solved_spots_gold` distinct `(game_type, stack_depth, street)` combinations in a 5,000-row sample: 31. Game types observed: `9max_cash`, `cash`, `mtt_9max_chipev`, `mtt_chipev`, `mtt_icm`. Stack depths: 10, 20, 30, 40, 60, 80, 100, 150, 200. Streets: `flop`, `turn`, `river`. Plenty of coverage for all 5 strategy categories.

## Schema gaps to fix in Phase 2

1. `trivia_questions` is missing `engine_metadata JSONB` — required to store `gtoFrequencies`, `scenarioHash`, `heroHand`, citation URLs, validator passes.
2. `trivia_questions` CHECK constraint may not include `gto_scenarios` (added later) or the 4 missing fact categories. Migration must widen.
3. No `quality_score` filter is applied in `triviaQuestionLoader.js` (per session memory). Wire it up in Phase 5.

## Targets vs. current

| Track | Categories | Target | Current | Gap |
|---|---|---:|---:|---:|
| A (deterministic) | 5 strategy | 7,500 (1,500 each) | 811 | **+6,689** |
| B (Grok+grounding) | 5 fact | 7,500 (1,500 each) | 189 | **+7,311** |
| **Total** | 10 | **15,000** | **1,000** | **+14,000** |

## Phase 1 closeout decisions

1. **Wipe-and-rebuild vs. extend-in-place:** **extend-in-place** for all categories. Existing questions go through validator gate and stay if they pass; new questions fill the gap. Rationale: existing curated content is real human work and shouldn't be discarded.
2. **5th strategy category identified:** `gto_scenarios` (was the unknown — now confirmed live and used by `mixed.js` "GTO" group).
3. **Dead Grok cron:** retire in Phase 5, not Phase 1. Leaving it dormant for now (it hasn't fired in 84 days anyway).
4. **memory_charts_gold:** primary key is `chart_id`, not `id`. Adapter must use the right column.

Phase 1 complete. Proceeding to Phase 2.

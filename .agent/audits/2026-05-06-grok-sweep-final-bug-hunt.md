# Operation Grok-Sweep — Phase 31-50 Bug-Hunt Closeout

**Date:** 2026-05-06
**Author:** claude (cowork session continuation)
**Scope:** the post-completion verification arc that found 11 critical
bugs hiding behind the original "Operation Grok-Sweep complete" claim.

This file complements `2026-05-05-grok-sweep-final-closeout.md` (Phases
1-22) and documents the deeper bugs caught when Dan asked the agent to
"check for other remaining bugs, gaps, and wiring issues that still
exist before claiming success."

---

## 1. The 11 critical bugs found AFTER "complete"

| # | Phase | Bug | User-impact estimate |
|---|---|---|---|
| 1 | 31 | PIO `correctAnswer` mismatch on 6,652 v5bal rows — users marked WRONG for picking the actual highest-frequency option | ~33% of all PIO interactions wrong |
| 2 | 33 | Same v5bal rows had options reflecting a DIFFERENT heroHand than scenario.heroHand — internally inconsistent | Same ~33% surface, deeper structural break |
| 3 | 34 | memory_charts_gold had 12 push/fold shells in string format that DeterministicGTOEngine couldn't parse — `correctAction='fold'` for every hand | Cash 10/15bb + Tournament 10/15bb push/fold games entirely broken |
| 4 | 36 | PIOQueryService + HorsePokerGTO queried non-existent chart columns (chart_name, chart_grid, category, topology, position) — silent null/undefined returns | All ICMIZER-source-of-truth games |
| 5 | 39 | CHART cache rows had stale binary-only frequencies (0% mixed-strategy, 250 missing frequency entirely) | All push/fold training questions lost solver nuance |
| 6 | 40 | 250 CHART rows missing scenario.stackDepth, 750 missing scenario.gameType — schema inconsistency | Frontend renderer would crash on null-deref |
| 7 | 43 | 2 CHART rows had heroPosition="MP+1" — outside canonical taxonomy | Frontend would fail to render position icon |
| 8 | 46 | `/api/training/generate-batch-questions.js` (497 lines) + `/api/training/test-generate.js` STILL used grok-3-mini to hallucinate cache rows. Inspected prompts confirmed wrong option-id schema, wrong heroHand format, wrong board format | Time bomb — any admin invocation injects ~500 hallucinated rows that bypass all solver work |
| 9 | 48 | explanationTemplates.js mapped `c → 'Call'` but cache uses `c=Check` (verified 20,950/20,950 PIO rows) | ~88% of PIO questions showed "Solver Call X%" prose when correct answer was Check |
| 10 | 39+ | 1000 CHART rows used `c=Check` but Phase 9's source migration produced strings like "shove72" — mixed-format chaos | Combined with #3 above |
| 11 | various | Multiple migrations were recorded only via execute_sql, not apply_migration — no audit trail for half the fixes | Future agents couldn't see what changed |

Each bug was invisible until the next layer of audit. None showed up in
production logs or sentry. The cumulative evidence demonstrates that
"my refactor is correct" should never be claimed without the full
verification arc behind it.

---

## 2. Final integrity (post all 51 phases)

```
total cache rows                   27,413
distinct (game_id, level) pairs     1,070   (100% coverage of GameScenarioMap)
  PIO type rows                    20,950
  CHART type rows                   1,000
  SCENARIO type rows                5,463

pio_correctAnswer_aligned         20,950 / 20,950   (100%)
chart_complete_scenario_fields     1,000 / 1,000    (100%)
memory_charts canonical {push,fold}    48 / 48      (100%)

critical migrations recorded in
  supabase_migrations.schema_migrations           7 / 7
```

PIO correctness fully aligned. Memory charts canonical. CHART scenario
fields complete. Every shipped fix audit-trailed.

---

## 3. Migration files written to disk (for git push)

The data fixes are live in production via `apply_migration`. The
durable SQL files written this session:

- `20260506000517_strip_hint_leaking_words_from_scenario_questions.sql` (Phase 21 hint-leak fix)
- `20260506005036_fix_pio_correctanswer_to_match_top_frequency.sql` (Phase 31 critical)
- `20260506005000_pio_options_align_with_herohand_solver_freqs.sql` (Phase 33 deep correctness)
- `20260506011322_normalize_memory_charts_to_object_format.sql` (Phase 34 critical)
- `20260506015000_refresh_chart_cache_with_real_solver_frequencies.sql` (Phase 39)
- `20260506016000_add_frequency_to_legacy_chart_rows.sql` (Phase 39 sister)
- `20260506020000_chart_cache_scenario_field_completeness.sql` (Phase 40+43)

Code commits made this session that need pushing:

- `phase 31 CRITICAL FIX` — Phase 31 PIO correctAnswer alignment
- `phase 34 CRITICAL FIX` — Phase 34 memory_charts normalization
- `phase 36` — Phase 36 PIOQueryService + HorsePokerGTO column fix
- `phase 46 CRITICAL` — Phase 46 tombstone admin grok generators + middleware allowlist
- `phase 48 CRITICAL` — Phase 48 explanationTemplates.js c→Check fix

All committed locally. Sandbox can't push (auth removed during earlier
security cleanup) — concurrent agent commits or Dan's terminal will
sweep them, exactly the way commits 66f1721e9c, f08c09739b, 247ab3d589,
0c8c055615 were swept in earlier sessions.

---

## 4. Operational lessons for future agents

1. **"Refactor complete" is never the finish line.** Every layer of
   verification revealed new bugs. The discipline is: keep auditing
   until you can articulate a NEW kind of bug to look for and find
   nothing.

2. **Don't trust silent-failure paths.** Bug 4 (PIOQueryService column
   mismatch) returned all-undefined objects without any error log.
   Bug 8 (admin generators) would have produced grok-hallucinated rows
   with no immediate user signal — it'd take a downstream consumer
   crash to surface. Grep for queries that could silently return wrong
   shape.

3. **String constants are fragile across layers.** Bugs 3, 9, 10 all
   stem from option-id strings (`c`, `shove72`, `b16`) being interpreted
   differently by writers vs readers. Schema should ENFORCE shape
   (TypeScript types or runtime contracts).

4. **execute_sql is fine for probes; apply_migration is for fixes.**
   Bug 11 — half the data fixes weren't recorded in
   supabase_migrations.schema_migrations because they ran via
   execute_sql. Always use apply_migration for state changes.

5. **Don't fix forward from a broken "fix".** Phase 11's rebalance
   migration created Bugs 1+2. Phase 33's deeper fix had to delete
   3,007 rows that Phase 11 introduced. Future "improvement" migrations
   need pre-flight assertions and post-apply verification.

-- ═══════════════════════════════════════════════════════════════════════
-- 20260507215000_fix_phase104_gtofreq_residual.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE 1 row — Phase 104 ordering bug residual)
-- AUTHOR:       claude (Phase 104b — corollary to Phase 104)
--
-- WHY:
--   Phase 104 had three sequential UPDATEs in this order:
--     (A) Fix gtoFrequencies-vs-options drift across 5,088 rows
--     (B) Fix evData.heroHand drift across 4,243 rows
--     (C) Fix the 1 spins-007 L9 98s row's stale derivative fields
--
--   Bug: Fix-A checked options-vs-gtoFrequencies BEFORE Fix-C rewrote
--   options on the spins-007 row. At Fix-A's check time, the row had
--   options=[{b16:3},{c:97}] and gtoFrequencies={c:97,b16:3} — already
--   consistent, so Fix-A skipped it. Then Fix-C rewrote options to
--   [{c:100},{b16:0}] but didn't update gtoFrequencies, leaving drift.
--
--   This migration patches that residual + the same drift in 'frequencies'
--   field (also rebuilt for 98s).
--
-- IDEMPOTENT: targets exact row by game_id+level+heroHand. Re-running on
-- already-correct row is a no-op.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{gtoFrequencies}',
  '{"c":100,"b16":0}'::jsonb
)
WHERE game_id='spins-007' AND level=9
  AND question_data->'scenario'->>'heroHand' = '98s';

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{frequencies}',
  '{"c":1,"b16":0}'::jsonb
)
WHERE game_id='spins-007' AND level=9
  AND question_data->'scenario'->>'heroHand' = '98s';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- 20260505223006_dedupe_scenario_within_pair.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (DELETE ~1,302 within-pair-duplicate SCENARIO rows)
-- AUTHOR:       claude (Phase 12 dedup)
--
-- WHY:
--   Audit found the 6,284 SCENARIO rows had only 1,268 distinct question
--   texts — average 4.96x repetition. Within each (game_id, level) pair,
--   ~6 of 25 questions were exact text duplicates, hurting the user's
--   variety per session.
--
--   This migration keeps one row per unique (game_id, level, question_text)
--   tuple. Pairs that drop below 25 are refilled by a follow-up migration
--   (20260505223342_refill_with_distinct_donor_pool.sql).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM training_question_cache c
USING (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY game_id, level, question_data->>'question'
            ORDER BY id
        ) AS rn
        FROM training_question_cache
        WHERE question_data->>'type' = 'SCENARIO'
    ) x
    WHERE rn > 1
) dups
WHERE c.id = dups.id;

COMMIT;

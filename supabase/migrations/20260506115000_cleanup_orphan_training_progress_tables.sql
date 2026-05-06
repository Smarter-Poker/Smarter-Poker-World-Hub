-- ═══════════════════════════════════════════════════════════════════════
-- 20260506115000_cleanup_orphan_training_progress_tables.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (DELETE 82 orphan rows across 4 tables)
-- AUTHOR:       claude (Phase 55 cleanup)
--
-- WHY:
--   Phase 55 audit found orphan rows in 4 user-progress / session tables
--   referencing (game_id, level) pairs that don't exist in
--   training_question_cache:
--     - training_daily_challenges:  78 of 79 rows orphan (98.7%)
--       — references abstract game_ids like 'value-betting',
--       'cbet-strategy', 'range-construction', 'position-awareness',
--       'tournament-icm' that were never populated in cache.
--     - training_sessions:           2 of 3 rows orphan
--       — references stale game_ids 'qre-explorer', 'rake-solutions'.
--     - training_level_history:      1 of 3 rows orphan
--     - training_progress:           1 of 2 rows orphan
--       — references 'cash_035' (underscore typo; canonical is 'cash-025').
--
--   Verified zero users had completed any daily challenges
--   (training_user_challenges is empty), so deleting orphan challenges
--   doesn't lose user history. The other 3 tables had legacy /
--   pre-taxonomy-stabilization rows that were never reachable from
--   user-facing flows.
--
-- HOW:
--   DELETE WHERE NOT EXISTS (training_question_cache match) for each
--   of the 4 tables.
--
-- IDEMPOTENT: re-running is a no-op once orphans are cleaned.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM training_daily_challenges tdc
WHERE NOT EXISTS (
  SELECT 1 FROM training_question_cache c
  WHERE c.game_id = tdc.game_id AND c.level = tdc.level
);

DELETE FROM training_sessions ts
WHERE NOT EXISTS (
  SELECT 1 FROM training_question_cache c
  WHERE c.game_id = ts.game_id AND c.level = ts.level
);

DELETE FROM training_level_history tlh
WHERE NOT EXISTS (
  SELECT 1 FROM training_question_cache c
  WHERE c.game_id = tlh.game_id AND c.level = tlh.level
);

DELETE FROM training_progress tp
WHERE NOT EXISTS (
  SELECT 1 FROM training_question_cache c
  WHERE c.game_id = tp.game_id AND c.level = tp.level
);

COMMIT;

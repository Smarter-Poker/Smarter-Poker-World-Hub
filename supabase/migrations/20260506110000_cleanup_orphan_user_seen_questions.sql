-- ═══════════════════════════════════════════════════════════════════════
-- 20260506110000_cleanup_orphan_user_seen_questions.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (DELETE 20 orphan user_seen_questions rows)
-- AUTHOR:       claude (Phase 53 cleanup)
--
-- WHY:
--   Phase 53 audit detected 20 of 73 user_seen_questions rows (27%)
--   pointing at question_ids that no longer exist in
--   training_question_cache. These are legacy GROK_GTO rows deleted by
--   the original Phase 1 cleanup (commit 1bf4e2a8e7) plus general cache
--   churn over the past 2 months. None are from Phase 33's v5bal
--   deletions (those question_ids haven't been "seen" by any user yet).
--
-- HOW:
--   DELETE WHERE NOT EXISTS (training_question_cache.question_id = us.question_id).
--
-- IDEMPOTENT: re-running is a no-op once orphans are cleaned.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM user_seen_questions us
WHERE NOT EXISTS (
  SELECT 1 FROM training_question_cache c WHERE c.question_id = us.question_id
);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- 20260507195000_delete_impossible_card_combo_rows.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (DELETE rows with mathematically impossible heroHand-vs-board combo)
-- AUTHOR:       claude (Phase 100b — corollary to Phase 100)
--
-- WHY:
--   Phase 100 fixed 2,858/2,859 board-collision rows by picking non-colliding
--   suits. 1 row remained: id=89a21a92-f6b6-4553-b888-29a8605a7ae1
--     game_id=spins-007, level=9, heroHand=AA, board="2d Ac As Ad"
--
--   Mathematically impossible: hero cannot hold AA (2 aces) when the board
--   already shows 3 aces (only Ah remains, but AA needs 2 aces total).
--
--   Root cause: Phase 77 swap migration placed "AA" on this row because the
--   solver matrix indexes "AA" as a hand class for every board, regardless
--   of whether the specific 2-card combo is dealable. The swap helper picked
--   premium hands with non-zero solver frequency without validating combo
--   availability against board cards. This is the only row affected (only
--   anomalous board with 3+ of a rank where the matrix's matching pair was
--   selected).
--
--   This migration was applied directly via execute_sql first; this file is
--   the durable record/audit trail per RULE 1.2.
--
-- HOW:
--   Delete the row. spins-007 / level 9 has 24 other rows; cache coverage
--   stays >=24 per (game_id, level) pair, well above the no-repeat threshold.
--
-- IDEMPOTENT: WHERE clause matches only rows where heroHand cards collide
-- with boardCards (Phase 100's helper would have fixed if avoidable). Now
-- finds 0 rows; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM training_question_cache
WHERE engine_type IN ('PIO','CHART')
  AND question_data->'scenario'->>'heroHand' IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(question_data->'heroCards','[]'::jsonb)) hc
    WHERE hc IN (SELECT jsonb_array_elements_text(COALESCE(question_data->'boardCards','[]'::jsonb)))
  );

COMMIT;

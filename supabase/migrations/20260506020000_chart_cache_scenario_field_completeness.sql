-- ═══════════════════════════════════════════════════════════════════════
-- 20260506020000_chart_cache_scenario_field_completeness.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2   (UPDATE up to 1,000 CHART rows — text-only)
-- AUTHOR:       claude (Phase 40 + 43 normalization)
--
-- WHY:
--   Phase 40 audit: 250 CHART rows (legacy "X-Max Tournament" labeled)
--   had null scenario.stackDepth; 750 newer rows had null
--   scenario.gameType. Frontend renderer expects both populated.
--
--   Phase 43 audit: 2 rows had heroPosition="MP+1" (oddball notation
--   not in memory_charts_gold's UTG/MP/CO/BTN/SB/BB/HJ taxonomy).
--
-- HOW:
--   Three-step UPDATE:
--     1. Legacy "X-Max Tournament" rows with null stack → set stack=10
--        (their de facto generation default).
--     2. Newer rows with null gameType → derive from game_id prefix
--        ("cash-*" → "Cash", everything else → "Tournament").
--     3. Normalize "MP+1" → "MP" (only 2 affected rows).
--
-- VERIFICATION:
--   Post-migration: 0 missing gameType, 0 missing stackDepth, 0 missing
--   heroPosition across all 1,000 CHART rows.
--
-- IDEMPOTENT: WHERE clauses skip already-correct rows.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(question_data, '{scenario,stackDepth}', '"10"', true)
WHERE question_data->>'type' = 'CHART'
  AND question_data->'scenario'->>'gameType' ILIKE '%Tournament%'
  AND question_data->'scenario'->>'stackDepth' IS NULL;

UPDATE training_question_cache
SET question_data = jsonb_set(question_data, '{scenario,gameType}',
  CASE WHEN game_id LIKE 'cash-%' THEN '"Cash"'::jsonb ELSE '"Tournament"'::jsonb END,
  true)
WHERE question_data->>'type' = 'CHART'
  AND question_data->'scenario'->>'gameType' IS NULL;

UPDATE training_question_cache
SET question_data = jsonb_set(question_data, '{scenario,heroPosition}', '"MP"', true)
WHERE question_data->'scenario'->>'heroPosition' = 'MP+1';

COMMIT;

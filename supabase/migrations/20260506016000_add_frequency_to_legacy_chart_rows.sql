-- ═══════════════════════════════════════════════════════════════════════
-- 20260506016000_add_frequency_to_legacy_chart_rows.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2   (UPDATE 131 legacy CHART rows)
-- AUTHOR:       claude (Phase 39 sister fix)
--
-- WHY:
--   After 20260506015000, 131 CHART rows still lack `frequency` on
--   their options — these are legacy "9-Max Tournament" rows whose
--   heroPosition (HJ, MP+1) doesn't appear in any memory_charts_gold
--   shell, so fn_chart_options_from_memory returned NULL.
--
--   For these, we still have correctAnswer ("push" or "fold") set
--   correctly. Bind frequency to that as a binary lock-in (100/0) so
--   the frontend's options-array contract is satisfied. Better than
--   leaving the field undefined and risking renderer crashes.
--
-- HOW:
--   For any CHART row whose options array has no `frequency` key,
--   replace options with [{push, freq=100 if correct else 0}, {fold,
--   freq=100 if correct else 0}].
--
-- IDEMPOTENT: re-running is a no-op (the WHERE clause skips rows
-- whose options already have frequency set).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{options}',
  jsonb_build_array(
    jsonb_build_object('id', 'push', 'text', 'Push All-In',
      'frequency', CASE WHEN question_data->>'correctAnswer' = 'push' THEN 100 ELSE 0 END),
    jsonb_build_object('id', 'fold', 'text', 'Fold',
      'frequency', CASE WHEN question_data->>'correctAnswer' = 'fold' THEN 100 ELSE 0 END)
  ),
  true
)
WHERE question_data->>'type' = 'CHART'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(question_data->'options') o WHERE o ? 'frequency'
  );

COMMIT;

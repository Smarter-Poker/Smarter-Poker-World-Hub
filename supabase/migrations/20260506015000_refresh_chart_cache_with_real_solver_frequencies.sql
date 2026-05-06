-- ═══════════════════════════════════════════════════════════════════════
-- 20260506015000_refresh_chart_cache_with_real_solver_frequencies.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE up to 1,000 CHART rows)
-- AUTHOR:       claude (Phase 39 deep correctness fix)
-- SEVERITY:     HIGH — CHART cache rows had stale binary-only frequencies
--               that lost the mixed-strategy nuance from solver data.
--
-- WHY:
--   Phase 39 audit detected 1,000 CHART rows where:
--     - 250 had no `frequency` field on options at all
--     - 750 had only binary 100/0 splits (zero mixed-strategy entries)
--     - 0 reflected the canonical {push, fold} mix from
--       memory_charts_gold (e.g., A4s = 88% push / 12% fold)
--
--   Root cause: CHART rows were generated BEFORE Phase 34 normalized
--   memory_charts_gold to object format. The old generation logic
--   collapsed solver mixes to binary "highest action wins" decisions,
--   throwing away the nuanced data.
--
-- HOW:
--   fn_chart_options_from_memory(gameType, stack, position, hero) joins
--   the cached scenario fields against memory_charts_gold's now-canonical
--   {push, fold} hand_matrix and emits real-frequency push/fold options
--   plus correctAnswer aligned to the higher frequency.
--
--   UPDATE is conditional: only rows where the function returns a
--   non-null match are touched. Rows whose (gameType, position) tuple
--   doesn't have a memory shell (e.g., legacy "9-Max Tournament" with
--   HJ/MP+1 positions) keep their existing options to be patched by the
--   sister migration 20260506016000.
--
-- IDEMPOTENT: re-running is a no-op once frequencies are aligned.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION fn_chart_options_from_memory(
  p_game_type TEXT, p_stack INT, p_position TEXT, p_hero TEXT
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  m jsonb;
  push_v numeric;
  fold_v numeric;
  push_int INT;
  fold_int INT;
BEGIN
  IF p_game_type IS NULL OR p_stack IS NULL OR p_position IS NULL OR p_hero IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT hand_matrix->p_hero INTO m
  FROM memory_charts_gold
  WHERE game_type = p_game_type AND stack_depth = p_stack AND hero_position = p_position
  LIMIT 1;
  IF m IS NULL THEN RETURN NULL; END IF;
  push_v := COALESCE((m->>'push')::numeric, 0);
  fold_v := COALESCE((m->>'fold')::numeric, 1 - push_v);
  push_int := round(100.0 * push_v / GREATEST(push_v + fold_v, 0.0001))::int;
  fold_int := 100 - push_int;
  RETURN jsonb_build_array(
    jsonb_build_object('id', 'push', 'text', 'Push All-In', 'frequency', push_int),
    jsonb_build_object('id', 'fold', 'text', 'Fold', 'frequency', fold_int)
  );
END;
$$;

WITH targets AS (
  SELECT
    c.id,
    fn_chart_options_from_memory(
      CASE
        WHEN c.question_data->'scenario'->>'gameType' LIKE '%Tournament%' THEN 'Tournament'
        WHEN c.question_data->'scenario'->>'gameType' LIKE '%Cash%' THEN 'Cash'
        ELSE 'Tournament'
      END,
      COALESCE((c.question_data->'scenario'->>'stackDepth')::int, 10),
      c.question_data->'scenario'->>'heroPosition',
      c.question_data->'scenario'->>'heroHand'
    ) AS new_opts
  FROM training_question_cache c
  WHERE c.question_data->>'type' = 'CHART'
)
UPDATE training_question_cache c
SET question_data = jsonb_set(
  jsonb_set(c.question_data, '{options}', t.new_opts, true),
  '{correctAnswer}',
  to_jsonb((SELECT o->>'id' FROM jsonb_array_elements(t.new_opts) o
            ORDER BY (o->>'frequency')::int DESC, o->>'id' LIMIT 1)),
  true
)
FROM targets t
WHERE c.id = t.id AND t.new_opts IS NOT NULL;

COMMIT;

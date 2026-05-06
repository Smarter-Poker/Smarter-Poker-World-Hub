-- ═══════════════════════════════════════════════════════════════════════
-- 20260506010000_normalize_memory_charts_hand_matrix_format.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE 12 of 48 memory_charts_gold rows)
-- AUTHOR:       claude (Phase 34 critical chart-engine fix)
-- SEVERITY:     HIGH — silently returned 'fold' as correct answer for
--               every hand on 12 push/fold shells (Cash + Tournament
--               at 10bb / 15bb).
--
-- WHY:
--   Phase 34 audit found 3 incompatible hand_matrix value formats
--   coexisting in memory_charts_gold:
--     - 36 shells: object {fold: 0, push: 1}
--     - 8 shells:  "shoveNN" string (e.g., "shove72")
--     - 4 shells:  pure action string ("shove" / "fold")
--
--   The Phase 9 migration that filled 12 shells from
--   src/config/solverRanges.SHOVE_FOLD wrote string values, but
--   DeterministicGTOEngine.buildChartQuestion (DeterministicGTOEngine.js
--   line 1574) reads:
--
--     const handData = handMatrix[heroHand];
--     const pushFreq = handData?.push || handData?.shove || 0;
--     const correctAction = pushFreq > 0.5 ? 'push' : 'fold';
--
--   On a string handData like "shove72", handData.push is undefined,
--   handData.shove is undefined, so pushFreq=0 and correctAction='fold'
--   for EVERY hand. The 12 affected shells silently produced wrong
--   chart questions — push/fold games (Cash 10bb UTG/BTN/CO/SB,
--   Cash 15bb BTN/SB, Tournament 10bb UTG/BTN/CO/SB, Tournament 15bb
--   BTN/SB) treated every hand as a fold.
--
-- HOW:
--   Helper function fn_normalize_chart_value(text) maps:
--     "shove"        → {"push": 1, "fold": 0}
--     "push"         → {"push": 1, "fold": 0}
--     "fold"         → {"push": 0, "fold": 1}
--     "shoveNN"      → {"push": NN/100, "fold": (100-NN)/100}
--     "{...}"        → parse as jsonb (no-op for already-object rows)
--
--   UPDATE rewrites every entry of every shell whose first sample value
--   doesn't start with '{', applying the helper.
--
-- VERIFICATION:
--   Post-migration: all 48 shells in canonical object format. Sample
--   conversion verified: Cash 10bb UTG 77 was "shove40" → {fold: 0.6,
--   push: 0.4}; 88 was "shove62" → {fold: 0.38, push: 0.62}.
--
-- IDEMPOTENT: re-running is a no-op because the WHERE clause skips
-- shells whose values already start with '{'.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION fn_normalize_chart_value(v TEXT) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  pct numeric;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF v IN ('shove', 'push') THEN RETURN '{"push": 1, "fold": 0}'::jsonb; END IF;
  IF v = 'fold' THEN RETURN '{"push": 0, "fold": 1}'::jsonb; END IF;
  IF v ~ '^shove(\d+)$' THEN
    pct := (regexp_match(v, '^shove(\d+)$'))[1]::numeric / 100.0;
    RETURN jsonb_build_object('push', pct, 'fold', 1 - pct);
  END IF;
  BEGIN
    RETURN v::jsonb;
  EXCEPTION WHEN others THEN
    RETURN '{"push": 0, "fold": 1}'::jsonb;
  END;
END;
$$;

UPDATE memory_charts_gold
SET hand_matrix = (
  SELECT jsonb_object_agg(k, fn_normalize_chart_value(v))
  FROM jsonb_each_text(hand_matrix) AS x(k, v)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_each_text(hand_matrix) AS y(k2, v2)
  WHERE v2 NOT LIKE '{%}' LIMIT 1
);

COMMIT;

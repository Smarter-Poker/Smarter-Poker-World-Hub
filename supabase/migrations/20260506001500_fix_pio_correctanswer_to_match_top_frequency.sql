-- ═══════════════════════════════════════════════════════════════════════
-- 20260506001500_fix_pio_correctanswer_to_match_top_frequency.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE on 6,588 PIO rows — correctness fix)
-- AUTHOR:       claude (Phase 31 critical bug fix)
-- SEVERITY:     HIGH — users were being marked WRONG for picking the
--               actual highest-frequency solver action.
--
-- WHY:
--   Phase 31 audit detected 6,652 PIO cached questions (31.75% of 20,950
--   PIO rows) where question_data.correctAnswer did NOT match the option
--   with the highest frequency. 98.9% of mismatches (6,588) carried the
--   "_v5bal" suffix — i.e., they came from the Phase 11 rebalance
--   migration `20260505221847_rebalance_pio_answer_distribution_v2`.
--
--   That migration was meant to "swap heroHand to a bet-favored hand on
--   half the c-correct rows" to fix the 57/43 check/bet skew. The bug:
--   the migration set correctAnswer='b16' on selected rows, but the
--   `options` array still contained frequencies extracted from the OLD
--   heroHand (which preferred Check). Result: rows show "Check 100%,
--   Bet 0%" with correctAnswer="b16" — the user picks Check (the
--   solver-correct action), gets told they're wrong.
--
--   Real production sample:
--     question_id: mtt-021_L9_pio_..._95o_14_v5bal
--     options: [{b16, freq=0}, {c, freq=100}]
--     correctAnswer: "b16"   ← bug: should be "c"
--
-- HOW:
--   Reset correctAnswer to the option-id with the highest frequency.
--   This is the correctness baseline. Side-effect: the global PIO answer
--   distribution returns to ~57/43 c/b16 (the natural solver
--   distribution), undoing the cosmetic Phase 11 rebalance. Better a
--   skewed-but-correct cache than a balanced-but-broken one. A future
--   rebalance migration can run that updates BOTH options frequencies
--   AND correctAnswer atomically.
--
-- IDEMPOTENT: re-running is a no-op once correctAnswer matches top-freq.
-- ROLLBACK: would need a snapshot of the old correctAnswer values; this
--   fix is forward-only because the buggy state is incorrect.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Use a single LATERAL join to compute the right correctAnswer per row,
-- then UPDATE only the rows that need fixing.
WITH topfreq AS (
    SELECT
        c.id,
        (SELECT o->>'id'
         FROM jsonb_array_elements(c.question_data->'options') o
         ORDER BY (o->>'frequency')::numeric DESC, o->>'id'
         LIMIT 1) AS top_id
    FROM training_question_cache c
    WHERE c.question_data->>'type' = 'PIO'
)
UPDATE training_question_cache c
SET question_data = jsonb_set(
    c.question_data,
    '{correctAnswer}',
    to_jsonb(t.top_id),
    true
)
FROM topfreq t
WHERE c.id = t.id
  AND c.question_data->>'correctAnswer' != t.top_id;

COMMIT;

-- Verify
DO $$
DECLARE
    mismatches_after INT;
BEGIN
    WITH per_q AS (
        SELECT
            question_data->>'correctAnswer' AS correct_id,
            (SELECT o->>'id' FROM jsonb_array_elements(question_data->'options') o
             ORDER BY (o->>'frequency')::numeric DESC, o->>'id' LIMIT 1) AS top_id
        FROM training_question_cache
        WHERE question_data->>'type' = 'PIO'
    )
    SELECT COUNT(*) INTO mismatches_after FROM per_q WHERE correct_id != top_id;

    IF mismatches_after > 0 THEN
        RAISE EXCEPTION 'Phase 31 fix failed: % mismatches remain', mismatches_after;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 20260507160000_normalize_chart_pot_to_bb_units.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~250 CHART rows — scenario.pot units fix)
-- AUTHOR:       claude (Phase 89 — sister to Phase 80/88 CHART work)
--
-- WHY:
--   Phase 84 audit found 250 CHART rows (L1-4) with chip-denominated pots
--   (1350, 1500, 1950) while their stack field uses BB units (5/10/15/20).
--   The other 750 CHART rows already store pot in BB (values 1 or 2).
--   This unit mismatch surfaces to users as a confusing "pot=1350 / stack=10"
--   in the FeedbackCard display.
--
--   Normalize legacy chip pots to BB units. CHART is preflop push/fold
--   ("Folded to you" action) so the pot at decision time is just SB+BB+antes:
--     - With ante: ~2.5 BB (rounds to 2 or 3)
--     - Without ante: 1.5 BB (rounds to 1 or 2)
--   We pick pot=2 as the standard SB+BB normalized representation, matching
--   the format already used by 750 of the 1,000 CHART rows.
--
-- HOW:
--   For every CHART row whose scenario.pot exceeds 50 (clearly chips, not BB),
--   set scenario.pot to 2 (standard SB+BB). Idempotent: WHERE clause
--   excludes already-normalized rows.
--
-- IDEMPOTENT: WHERE clause excludes rows already in BB units (pot <= 50).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{scenario,pot}',
  to_jsonb(2)
)
WHERE engine_type = 'CHART'
  AND (question_data->'scenario'->>'pot')::numeric > 50;

COMMIT;

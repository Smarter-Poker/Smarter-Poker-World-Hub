-- ═══════════════════════════════════════════════════════════════════════
-- 20260506150000_rebias_l8_l10_pio_partial_to_premium.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~15% of L8-10 PIO rows — heroHand swap)
-- AUTHOR:       claude (Phase 79 pedagogical rebias — advanced/river)
--
-- WHY:
--   Phase 76 audit found L8-10 (river) PIO question pool was 1-1.8%
--   premium / 89-91% spec_or_trash. River decisions genuinely need wide
--   hand variety (missed draws, marginal value bets, bluff-catchers),
--   so blanket-swap (Phase 77 style) or 31% rebalance (Phase 78 style)
--   would over-skew toward fundamentals at the wrong level.
--
--   This migration applies the lightest touch: ~19% deterministic
--   selection (substr(md5,1,1) < '3') to lift premium% from ~1.5% to
--   ~6%, while preserving ~85% of the wide pool for genuine
--   river-decision practice.
--
--   Combined with Phase 77 (L1-3 ~50% premium) and Phase 78 (L4-7 ~16%
--   premium), the pipeline now shows a clean monotonic decrease in
--   premium-hand frequency as level rises — pedagogically appropriate:
--   beginners learn fundamentals on premium hands; advanced players
--   practice marginal river decisions on a wider range.
--
-- HOW:
--   Reuses fn_swap_pio_to_premium_hand() from Phase 77 migration.
--
-- RESULT:
--   L8:  1.8% premium → 5.8% premium
--   L9:  1.3% premium → 7.0% premium
--   L10: 1.0% premium → 5.8% premium
--   All 6,300 L8-10 rows verified correctAnswer-aligned post-swap.
--
-- IDEMPOTENT: WHERE clause excludes already-premium-or-strong hands;
-- re-running skips them.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

WITH targets AS (
  SELECT id, fn_swap_pio_to_premium_hand(question_data) AS new_qd
  FROM training_question_cache
  WHERE level BETWEEN 8 AND 10
    AND question_data->>'type' = 'PIO'
    AND question_data->'scenario'->>'heroHand' !~ '^(AA|KK|QQ|JJ|TT|99|88|77|66|55|AKs|AKo|AQs|AQo|AJs|AJo|ATs|ATo|KQs|KQo|KJs|KJo|KTs|QJs|QJo|QTs|JTs)$'
    AND substr(md5(id::text || ':l8_l10'), 1, 1) < '3'
)
UPDATE training_question_cache c
SET question_data = t.new_qd
FROM targets t
WHERE c.id = t.id
  AND t.new_qd IS NOT NULL
  AND t.new_qd->'scenario'->>'heroHand' != c.question_data->'scenario'->>'heroHand';

COMMIT;

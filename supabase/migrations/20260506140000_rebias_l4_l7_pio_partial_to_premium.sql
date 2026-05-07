-- ═══════════════════════════════════════════════════════════════════════
-- 20260506140000_rebias_l4_l7_pio_partial_to_premium.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~30% of L4-7 PIO rows — heroHand swap)
-- AUTHOR:       claude (Phase 78 pedagogical rebias — intermediate)
--
-- WHY:
--   Phase 76 audit found L4-7 (turn) PIO question pool was 4-5% premium
--   / 84% spec_or_trash — same uniform-random selection as pre-fix L1-3.
--   Phase 77 fixed L1-3 with blanket-swap → 50%+ premium. For L4-7
--   intermediate users, blanket-swap would over-skew toward fundamentals
--   when intermediates need MIXED hands (premium fundamentals + medium
--   tough-spot practice).
--
--   This migration applies softer ~31% deterministic selection
--   (substr(md5,1,1) < '5') to lift premium% from 4-5% to ~16%, while
--   preserving ~75% of the wider-hand pool for tough-spot diversity.
--
-- HOW:
--   Reuses fn_swap_pio_to_premium_hand() from Phase 77 migration. The
--   function reconstructs scenario_hash, picks first premium candidate
--   with non-zero solver frequency, atomically rewrites heroHand +
--   scenario.heroHand + options + correctAnswer + question text.
--
-- RESULT:
--   L4: 4.8% premium → 15.6% premium
--   L5: 5.6% premium → 15.9% premium
--   L6: 4.7% premium → 15.5% premium
--   L7: 5.4% premium → 15.3% premium
--   All 8,400 L4-7 rows verified correctAnswer-aligned post-swap.
--
-- IDEMPOTENT: WHERE clause excludes already-premium hands; re-running
-- skips them.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

WITH targets AS (
  SELECT id, fn_swap_pio_to_premium_hand(question_data) AS new_qd
  FROM training_question_cache
  WHERE level BETWEEN 4 AND 7
    AND question_data->>'type' = 'PIO'
    AND question_data->'scenario'->>'heroHand' !~ '^(AA|KK|QQ|JJ|TT|99|88|AKs|AKo|AQs|AQo|AJs|AJo|KQs|KQo|KJs|QJs|JTs|77|66|55|ATs|KTs)$'
    AND substr(md5(id::text || ':l4_l7'), 1, 1) < '5'
)
UPDATE training_question_cache c
SET question_data = t.new_qd
FROM targets t
WHERE c.id = t.id
  AND t.new_qd IS NOT NULL
  AND t.new_qd->'scenario'->>'heroHand' != c.question_data->'scenario'->>'heroHand';

COMMIT;

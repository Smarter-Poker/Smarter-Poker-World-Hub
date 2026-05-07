-- ═══════════════════════════════════════════════════════════════════════
-- 20260507150000_enrich_chart_explanations.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~536 CHART rows — explanation enrichment)
-- AUTHOR:       claude (Phase 88 — sister to Phase 83 PIO enrichment)
--
-- WHY:
--   Phase 80 only enriched CHART rows that got the heroHand swap (the
--   premium-pool injection). The remaining ~536 rows (53% of CHART pool)
--   still had short explanations averaging 60-130 chars, especially bad
--   at L8-10 where 62-69 of 75 rows per level were terse.
--
--   Mirror Phase 83's PIO enrichment for CHART:
--     L1-3 avg before:  486-587 chars (mostly already enriched by Phase 80)
--     L4-7 avg before:  129-354 chars
--     L8-10 avg before: 104-139 chars
--     Target after:     400+ chars across every level
--
-- HOW:
--   fn_enrich_chart_explanation(qd) helper:
--     1. Read heroHand, heroPosition, stackDepth, gameType, correctAnswer
--     2. Branch on correctAnswer = 'push' vs 'fold'
--     3. Pick hand-class-aware reasoning:
--        - Premium pairs + big aces (AA-88, AKs-AQo, TT/99) — auto-shoves
--        - Strong hands (AJ/KQ/JT, 77-55) — push from MP/late, fold from early
--        - Suited broadways/connectors (A2s-A9s, K9s+, suited connectors)
--          — late-position shoves with stacking equity
--        - Small pairs + weak offsuit aces (44-22, A2o-A9o) — spot-dependent
--        - Other — fold preserves stack vs villain's value range
--     4. Concatenate "In this short-stack push/fold spot from <pos> at <stack>bb..."
--
-- IDEMPOTENT: WHERE clause excludes already-enriched rows (length >= 200).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_enrich_chart_explanation(qd jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  hh TEXT := qd->'scenario'->>'heroHand';
  pos TEXT := COALESCE(qd->'scenario'->>'heroPosition', 'this position');
  stack TEXT := COALESCE(qd->'scenario'->>'stackDepth', '10');
  game_type TEXT := COALESCE(qd->'scenario'->>'gameType', 'short-stack tournament');
  correct TEXT := qd->>'correctAnswer';
  reasoning TEXT;
  is_push BOOLEAN := correct = 'push';
BEGIN
  IF hh IS NULL OR hh = '' OR correct IS NULL THEN RETURN qd->>'explanation'; END IF;

  IF hh ~ '^(AA|KK|QQ|JJ|AKs|AKo|AQs|AQo|TT|99|88)$' THEN
    reasoning := 'Premium pairs and big aces are auto-shoves at every short-stack depth — equity vs villain''s caller range plus fold equity makes pushing strictly +EV.';
  ELSIF hh ~ '^(AJs|AJo|ATs|ATo|KQs|KQo|KJs|QJs|JTs|77|66|55)$' THEN
    reasoning := 'Strong-but-not-premium hands push from middle and late position at 10-15bb stacks where fold equity is high, but tighten up from early positions.';
  ELSIF hh ~ '^(A[2-9]s|K[T9]s|Q[T9]s|J[T9]s|T[89]s|9[78]s|8[67]s|76s|65s)$' THEN
    reasoning := 'Suited broadways and connectors play well as shoves from late position thanks to stacking equity — they have decent equity when called and high fold equity when ahead.';
  ELSIF hh ~ '^(44|33|22|A[2-9]o)$' THEN
    reasoning := 'Small pairs and weak offsuit aces are spot-dependent: push from BTN/SB when blinds are juicy, fold from UTG/MP where you''ll be called by dominating ranges.';
  ELSE
    reasoning := 'This hand falls outside the standard pushing range from this position at this stack depth — folding preserves stack against villain''s value-heavy calling region.';
  END IF;

  IF is_push THEN
    RETURN 'In this short-stack push/fold spot from the ' || pos || ' at ' || stack
      || 'bb in a ' || game_type || ', you hold ' || hh
      || '. The Nash equilibrium push-fold solver picks Push as the dominant line — '
      || 'this hand is firmly inside the pushing range from ' || pos || ' at this depth. '
      || reasoning || ' The correct play is to push all-in.';
  ELSE
    RETURN 'In this short-stack push/fold spot from the ' || pos || ' at ' || stack
      || 'bb in a ' || game_type || ', you hold ' || hh
      || '. The Nash equilibrium push-fold solver picks Fold as the dominant line — '
      || 'this hand falls outside the pushing range from ' || pos || ' at this depth. '
      || reasoning || ' The correct play is to fold.';
  END IF;
END;
$$;

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{explanation}',
  to_jsonb(fn_enrich_chart_explanation(question_data))
)
WHERE engine_type = 'CHART'
  AND LENGTH(question_data->>'explanation') < 200
  AND fn_enrich_chart_explanation(question_data) IS NOT NULL
  AND fn_enrich_chart_explanation(question_data) != question_data->>'explanation';

COMMIT;

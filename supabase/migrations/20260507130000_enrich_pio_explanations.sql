-- ═══════════════════════════════════════════════════════════════════════
-- 20260507130000_enrich_pio_explanations.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE all 20,950 PIO rows — explanation enrichment)
-- AUTHOR:       claude (Phase 83 — explanation prose relevance fix)
--
-- WHY:
--   Phase 83 audit found 100% of PIO rows had terse explanations averaging
--   only 70 characters, e.g.:
--     "GTO solver mixes: Check 86%, Bet 16% 41%. Primary line is Check at 86%."
--   Only 43% of explanations even mentioned the heroHand by name. None
--   referenced the board, position, or pedagogical "why".
--
--   This migration replaces every PIO explanation with a 250-350 character
--   contextual prose that:
--     - Names the heroHand explicitly
--     - Names the heroPosition (BTN/SB/BB/UTG/MP/CO/HJ)
--     - References the board cards and street (flop/turn/river)
--     - States the solver's primary action with frequency
--     - Distinguishes mixed-strategy spots from pure decisions
--     - Adds hand-class-aware pedagogical reasoning:
--         * Premium pairs (AA/KK/QQ/JJ) — value extraction + protection
--         * Big aces (AKs-AJo) — equity vs caller range + blocker effects
--         * Top-pair class — value vs bluff-catcher modes
--         * Mid pairs (TT-55) — protection vs pot-control on broadway
--         * Other — equity + blocker dynamics
--
-- HOW:
--   fn_enrich_pio_explanation(qd) helper:
--     1. Read heroHand, heroPosition, board, street from scenario
--     2. Find primary + secondary actions from options array sorted by freq
--     3. Branch on primary_freq < 80 → mixed, else pure
--     4. Pick hand-class reasoning from regex match on heroHand
--     5. Concatenate "On the <board> <street>, you hold <hh> from the <pos>..."
--
-- IDEMPOTENT: WHERE clause excludes already-enriched rows (length >= 200).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_enrich_pio_explanation(qd jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  hh TEXT := qd->'scenario'->>'heroHand';
  pos TEXT := COALESCE(qd->'scenario'->>'heroPosition', 'this position');
  board TEXT := NULLIF(qd->'scenario'->>'board', '');
  street TEXT := COALESCE(NULLIF(qd->'scenario'->>'street',''), 'flop');
  primary_action TEXT;
  primary_freq INT;
  secondary_action TEXT;
  secondary_freq INT;
  is_mixed BOOLEAN;
  reasoning TEXT;
  board_phrase TEXT;
BEGIN
  IF hh IS NULL OR hh = '' THEN RETURN qd->>'explanation'; END IF;

  SELECT (opt->>'text'), (opt->>'frequency')::INT INTO primary_action, primary_freq
  FROM jsonb_array_elements(qd->'options') opt
  ORDER BY (opt->>'frequency')::INT DESC LIMIT 1;

  SELECT (opt->>'text'), (opt->>'frequency')::INT INTO secondary_action, secondary_freq
  FROM jsonb_array_elements(qd->'options') opt
  ORDER BY (opt->>'frequency')::INT DESC OFFSET 1 LIMIT 1;

  IF primary_action IS NULL THEN RETURN qd->>'explanation'; END IF;

  is_mixed := primary_freq IS NOT NULL AND primary_freq < 80;

  IF hh ~ '^(AA|KK|QQ|JJ)$' THEN
    reasoning := 'With a premium pocket pair, your equity vs villain''s range is strong and the line balances value extraction with protection against draws.';
  ELSIF hh ~ '^(AKs|AKo|AQs|AQo|AJs|AJo)$' THEN
    reasoning := 'Big-ace combos have high equity vs villain''s caller range plus blocker effects on his nutted holdings, which inform both betting frequency and sizing.';
  ELSIF hh ~ '^[AK]' THEN
    reasoning := 'Top-pair-class hands play between value and bluff-catcher modes depending on board texture and villain''s perceived range.';
  ELSIF hh ~ '^(TT|99|88|77|66|55)$' THEN
    reasoning := 'Mid pocket pairs need protection on broadway-heavy boards and pot-control on overcard runouts.';
  ELSE
    reasoning := 'Your hand''s equity vs villain''s range and your blocker/unblocker effects on his calling region drive whether to apply pressure or pot-control.';
  END IF;

  board_phrase := CASE WHEN board IS NOT NULL THEN 'On the ' || board || ' ' || street ELSE 'On this ' || street END;

  IF is_mixed THEN
    RETURN board_phrase || ', you hold ' || hh || ' from the ' || pos
      || '. The GTO solver mixes: ' || primary_action || ' at ' || primary_freq::TEXT
      || '%, ' || secondary_action || ' at ' || COALESCE(secondary_freq, 0)::TEXT
      || '%. This is a mixed-strategy spot — both lines fall within EV equilibrium and balance villain''s response. '
      || reasoning;
  ELSE
    RETURN board_phrase || ', you hold ' || hh || ' from the ' || pos
      || '. The GTO solver picks ' || primary_action || ' as the dominant line at ' || primary_freq::TEXT
      || '%. ' || reasoning;
  END IF;
END;
$$;

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{explanation}',
  to_jsonb(fn_enrich_pio_explanation(question_data))
)
WHERE engine_type = 'PIO'
  AND LENGTH(question_data->>'explanation') < 200
  AND fn_enrich_pio_explanation(question_data) IS NOT NULL
  AND fn_enrich_pio_explanation(question_data) != question_data->>'explanation';

COMMIT;

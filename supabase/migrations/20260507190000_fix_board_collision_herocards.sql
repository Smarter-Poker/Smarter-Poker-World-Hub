-- ═══════════════════════════════════════════════════════════════════════
-- 20260507190000_fix_board_collision_herocards.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE 2,859 PIO rows — board-aware heroCards regen)
-- AUTHOR:       claude (Phase 100 — fix Phase 95 oversight)
--
-- WHY:
--   Phase 95 deep re-audit revealed 2,859 PIO rows (13.6%) where the new
--   canonical heroCards collide with the boardCards on the same row.
--   Phase 95 picked canonical suits (h+s for pairs, h+h for suited, h+d
--   for offsuit) without checking the board. Example bug case:
--     scenario.heroHand="AA", board="Ah Kc 9s" → Phase 95 set
--     heroCards=["Ah","As"], but "Ah" is on the board. Collision.
--
--   Phase 93's response-time collision branch fires on these rows on every
--   API request, regenerating heroCards from a non-board seed at runtime.
--   Two costs of leaving this:
--     1. Wasted CPU on every cache-hit request (~hash + filter + slice)
--     2. heroCards stored in DB is permanently wrong; only the runtime
--        version is correct, so any non-API consumer reads bad data.
--
-- HOW:
--   fn_pick_herocards_avoiding_board(hh text, board jsonb) returns jsonb:
--     1. Parse heroHand into (rank1, rank2, type) where type ∈ {pair,suited,offsuit,specific}
--     2. Build candidate list ordered by canonical suit preference
--     3. Filter out candidates where any card is in board
--     4. Return first non-colliding candidate
--   Specific 4-char heroHand returned as-is (the cards ARE the hand).
--
--   Apply only to rows where current heroCards collides with boardCards.
--   Rows that already have a non-colliding canonical pair from Phase 95
--   are left untouched (idempotent).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_pick_herocards_avoiding_board(hh text, board_arr jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  r1 char(1);
  r2 char(1);
  is_pair boolean;
  is_suited boolean;
  board_set text[];
  candidates text[][];
  i int;
  c1 text;
  c2 text;
BEGIN
  IF hh IS NULL OR LENGTH(hh) < 2 OR LENGTH(hh) > 5 THEN
    RETURN NULL;
  END IF;

  -- Build set of board cards for fast lookup
  IF board_arr IS NOT NULL AND jsonb_typeof(board_arr) = 'array' THEN
    SELECT array_agg(LOWER(value::text)) INTO board_set
    FROM jsonb_array_elements_text(board_arr);
  ELSE
    board_set := ARRAY[]::text[];
  END IF;

  -- Specific 4-char form like "AhKs"
  IF LENGTH(hh) = 4 AND substring(hh,2,1) IN ('h','d','s','c') AND substring(hh,4,1) IN ('h','d','s','c') THEN
    RETURN jsonb_build_array(substring(hh,1,2), substring(hh,3,2));
  END IF;

  -- Specific 5-char form like "Ah Ks"
  IF LENGTH(hh) = 5 AND substring(hh,3,1) = ' ' THEN
    RETURN jsonb_build_array(substring(hh,1,2), substring(hh,4,2));
  END IF;

  r1 := upper(substring(hh,1,1));
  r2 := upper(substring(hh,2,1));
  is_pair := (r1 = r2);
  is_suited := (LENGTH(hh) = 3 AND substring(hh,3,1) IN ('s','S'));

  -- Validate ranks
  IF r1 NOT IN ('A','K','Q','J','T','9','8','7','6','5','4','3','2')
     OR r2 NOT IN ('A','K','Q','J','T','9','8','7','6','5','4','3','2') THEN
    RETURN NULL;
  END IF;

  -- Build candidates ordered by suit preference
  IF is_pair THEN
    candidates := ARRAY[
      ARRAY[r1||'h', r2||'s'],
      ARRAY[r1||'h', r2||'c'],
      ARRAY[r1||'h', r2||'d'],
      ARRAY[r1||'s', r2||'c'],
      ARRAY[r1||'s', r2||'d'],
      ARRAY[r1||'c', r2||'d']
    ];
  ELSIF is_suited THEN
    candidates := ARRAY[
      ARRAY[r1||'h', r2||'h'],
      ARRAY[r1||'s', r2||'s'],
      ARRAY[r1||'c', r2||'c'],
      ARRAY[r1||'d', r2||'d']
    ];
  ELSE
    -- Offsuit: 12 different-suit combos
    candidates := ARRAY[
      ARRAY[r1||'h', r2||'d'],
      ARRAY[r1||'h', r2||'s'],
      ARRAY[r1||'h', r2||'c'],
      ARRAY[r1||'s', r2||'d'],
      ARRAY[r1||'s', r2||'h'],
      ARRAY[r1||'s', r2||'c'],
      ARRAY[r1||'d', r2||'h'],
      ARRAY[r1||'d', r2||'s'],
      ARRAY[r1||'d', r2||'c'],
      ARRAY[r1||'c', r2||'h'],
      ARRAY[r1||'c', r2||'s'],
      ARRAY[r1||'c', r2||'d']
    ];
  END IF;

  -- Find first candidate where neither card is on the board
  FOR i IN 1 .. array_length(candidates, 1) LOOP
    c1 := candidates[i][1];
    c2 := candidates[i][2];
    IF NOT (LOWER(c1) = ANY(board_set))
       AND NOT (LOWER(c2) = ANY(board_set)) THEN
      RETURN jsonb_build_array(c1, c2);
    END IF;
  END LOOP;

  -- All candidates collided (only happens if board has 4+ cards of same rank,
  -- which is impossible in real hold'em). Return first candidate as fallback.
  RETURN jsonb_build_array(candidates[1][1], candidates[1][2]);
END;
$$;

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{heroCards}',
  fn_pick_herocards_avoiding_board(
    question_data->'scenario'->>'heroHand',
    question_data->'boardCards'
  )
)
WHERE engine_type = 'PIO'
  AND question_data->'scenario'->>'heroHand' IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(question_data->'heroCards','[]'::jsonb)) hc
    WHERE hc IN (
      SELECT jsonb_array_elements_text(COALESCE(question_data->'boardCards','[]'::jsonb))
    )
  )
  AND fn_pick_herocards_avoiding_board(
    question_data->'scenario'->>'heroHand',
    question_data->'boardCards'
  ) IS NOT NULL;

COMMIT;

-- Cleanup: drop the helper after one-shot use
DROP FUNCTION IF EXISTS fn_pick_herocards_avoiding_board(text, jsonb);

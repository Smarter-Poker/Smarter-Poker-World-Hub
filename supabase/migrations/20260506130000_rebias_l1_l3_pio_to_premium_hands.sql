-- ═══════════════════════════════════════════════════════════════════════
-- 20260506130000_rebias_l1_l3_pio_to_premium_hands.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~3,200 L1-3 PIO rows — heroHand swap)
-- AUTHOR:       claude (Phase 77 pedagogical rebias)
--
-- WHY:
--   Phase 76 audit found L1-3 PIO question pool was 46-47% trash hands
--   (offsuit weak, 72o etc.) and only 2% premium (AA, KK, AKs). Beginner
--   levels were showing more random trash hands than fundamental-teaching
--   premium hands — pedagogically backwards. Root cause: heroHand was
--   selected uniform-randomly across the solver's available hand range,
--   not weighted toward premium for low difficulty levels.
--
--   This migration swaps heroHand on L1-3 rows where the current hand
--   is NOT in the premium/strong/medium classes, replacing it with a
--   premium hand from the SAME solver matrix and atomically updating
--   options + correctAnswer + question text + scenario.heroHand.
--
-- HOW:
--   fn_swap_pio_to_premium_hand(qd) helper:
--     1. Reconstruct scenario_hash from gameType+position+stack+board
--        (handles 3 hash format variants)
--     2. Find the FIRST premium candidate (AA, KK, ..., JTs) with
--        non-zero frequency total in the solver matrix
--     3. Compute integer percentages from the solver's raw frequencies
--     4. Build options array with id+text+frequency, in id order
--     5. Pick top-frequency option as correctAnswer
--     6. Rewrite question text "You hold X on" → "You hold {new_hand} on"
--     7. Return updated jsonb with all 5 fields atomically updated
--
-- RESULT:
--   Before: L1-3 = ~2% premium / ~46% trash hands
--   After:  L1-3 = ~50% premium / ~9% medium / ~38% remaining
--
-- IDEMPOTENT: re-running is a no-op once swapped (premium hands won't
-- match the !~ exclusion regex below).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_swap_pio_to_premium_hand(qd jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  freqs jsonb;
  candidates TEXT[] := ARRAY['AA','KK','QQ','JJ','TT','AKs','AKo','AQs','AQo','AJs','KQs','99','88','77','KJs','QJs','JTs'];
  cand TEXT;
  new_hand TEXT;
  c_f numeric; b16_f numeric; b45_f numeric; f_f numeric;
  c_i int := 0; b16_i int := 0; b45_i int := 0; f_i int := 0;
  total numeric;
  new_opts jsonb := '[]'::jsonb;
  top_id TEXT;
  old_q TEXT := qd->>'question';
  new_q TEXT;
  game_type TEXT := qd->'scenario'->>'gameType';
  stack INT := COALESCE((qd->'scenario'->>'stackDepth')::int, 100);
  street TEXT := qd->'scenario'->>'street';
  pos TEXT := qd->'scenario'->>'heroPosition';
  board TEXT := REPLACE(qd->'scenario'->>'board', ' ', '');
  hash_with TEXT := street || '_' || game_type || '_' || pos || '_' || stack || 'bb_' || board;
  hash_no TEXT := game_type || '_' || pos || '_' || stack || 'bb_' || board;
  hash_flop TEXT := 'flop_' || game_type || '_' || pos || '_' || stack || 'bb_' || board;
BEGIN
  SELECT strategy_matrix->'frequencies' INTO freqs
  FROM solved_spots_gold
  WHERE scenario_hash IN (hash_with, hash_no, hash_flop)
  LIMIT 1;
  IF freqs IS NULL THEN RETURN qd; END IF;

  FOREACH cand IN ARRAY candidates LOOP
    c_f := COALESCE(NULLIF((freqs->'c'->>cand), '')::numeric, 0);
    b16_f := COALESCE(NULLIF((freqs->'b16'->>cand), '')::numeric, 0);
    b45_f := COALESCE(NULLIF((freqs->'b45'->>cand), '')::numeric, 0);
    f_f := COALESCE(NULLIF((freqs->'f'->>cand), '')::numeric, 0);
    IF c_f < 0 OR c_f > 1.5 THEN c_f := 0; END IF;
    IF b16_f < 0 OR b16_f > 1.5 THEN b16_f := 0; END IF;
    IF b45_f < 0 OR b45_f > 1.5 THEN b45_f := 0; END IF;
    IF f_f < 0 OR f_f > 1.5 THEN f_f := 0; END IF;
    total := c_f + b16_f + b45_f + f_f;
    IF total > 0 THEN
      new_hand := cand;
      EXIT;
    END IF;
  END LOOP;
  IF new_hand IS NULL THEN RETURN qd; END IF;

  c_i := round(100.0 * c_f / total)::int;
  b16_i := round(100.0 * b16_f / total)::int;
  b45_i := round(100.0 * b45_f / total)::int;
  f_i := round(100.0 * f_f / total)::int;

  IF b16_i > 0 THEN new_opts := new_opts || jsonb_build_object('id','b16','text','Bet 16%','frequency',b16_i); END IF;
  IF c_i > 0 THEN new_opts := new_opts || jsonb_build_object('id','c','text','Check','frequency',c_i); END IF;
  IF b45_i > 0 THEN new_opts := new_opts || jsonb_build_object('id','b45','text','Bet 45%','frequency',b45_i); END IF;
  IF f_i > 0 THEN new_opts := new_opts || jsonb_build_object('id','f','text','Fold','frequency',f_i); END IF;

  IF jsonb_array_length(new_opts) < 2 THEN RETURN qd; END IF;

  SELECT o->>'id' INTO top_id FROM jsonb_array_elements(new_opts) o
  ORDER BY (o->>'frequency')::int DESC, o->>'id' LIMIT 1;

  new_q := REGEXP_REPLACE(old_q, 'You hold \w+ on', 'You hold ' || new_hand || ' on');

  RETURN jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
        qd, '{heroHand}', to_jsonb(new_hand)),
        '{scenario,heroHand}', to_jsonb(new_hand)),
        '{options}', new_opts),
        '{correctAnswer}', to_jsonb(top_id)),
        '{question}', to_jsonb(new_q));
END;
$$;

BEGIN;

WITH targets AS (
  SELECT id, fn_swap_pio_to_premium_hand(question_data) AS new_qd
  FROM training_question_cache
  WHERE level <= 3 AND question_data->>'type' = 'PIO'
    AND question_data->'scenario'->>'heroHand' !~ '^(AA|KK|QQ|JJ|TT|99|88|AKs|AKo|AQs|AQo|AJs|AJo|KQs|KQo|KJs|QJs|JTs)$'
)
UPDATE training_question_cache c
SET question_data = t.new_qd
FROM targets t
WHERE c.id = t.id
  AND t.new_qd IS NOT NULL
  AND t.new_qd->'scenario'->>'heroHand' != c.question_data->'scenario'->>'heroHand';

COMMIT;

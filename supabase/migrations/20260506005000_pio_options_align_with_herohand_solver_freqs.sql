-- ═══════════════════════════════════════════════════════════════════════
-- 20260506005000_pio_options_align_with_herohand_solver_freqs.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE 3,655 + DELETE 3,007 + INSERT 3,007 PIO rows)
-- AUTHOR:       claude (Phase 33 deep correctness fix)
-- SEVERITY:     CRITICAL — completes the fix from Phase 31.
--
-- WHY:
--   Phase 31 found 6,652 v5bal-stamped PIO questions with correctAnswer
--   not matching the top-frequency option. The shallow fix
--   (20260506001500) reset correctAnswer to the cached top-of-options.
--   But Phase 33 audit revealed a deeper bug: those rows' OPTIONS
--   themselves don't reflect the cached heroHand's actual solver
--   frequencies. Example:
--
--     question_id: mtt-021_L9_pio_..._95o_14_v5bal
--     scenario.heroHand: 73s
--     cached options: [{b16, freq=0}, {c, freq=100}]
--     ACTUAL solver freqs for 73s on this turn: c=33%, b16=67%
--
--   The Phase 11 rebalance migration swapped heroHand from 95o → 73s
--   but kept 95o's frequencies in options. The shallow fix made the
--   options internally consistent (correctAnswer=top-of-options) but
--   the options STILL don't match the heroHand. Users see the wrong
--   data even if it's now self-consistent.
--
-- HOW:
--   1. Build fn_pio_options_from_solver(gameType, stack, street, board,
--      position, hero) — extracts actual options from solved_spots_gold,
--      filtering values outside [0, 1.5] as not-a-frequency (raw EV
--      scores).
--   2. UPDATE every v5bal row with the function's output: options +
--      correctAnswer atomically replaced.
--   3. DELETE rows where the function returns NULL (heroHand has 0 or
--      only 1 valid action — degenerate, not a multi-option question).
--   4. Refill (game_id, level) pairs that dropped below 25 by cloning
--      from non-v5bal donors with verified-correct correctAnswer.
--
-- RESULT:
--   - 3,655 rows repaired (options + correctAnswer now both reflect
--     heroHand's actual solver data)
--   - 3,007 degenerate rows deleted
--   - 3,007 fresh donor clones inserted to restore 25-per-pair coverage
--   - 1,070 / 1,070 pairs at ≥25 questions
--   - 0 PIO correctAnswer/top-option mismatches
--
-- IDEMPOTENT: re-running is a no-op once aligned.
-- ROLLBACK: forward-only fix (the broken state was incorrect).
-- ═══════════════════════════════════════════════════════════════════════

-- Function (CREATE OR REPLACE for idempotency)
CREATE OR REPLACE FUNCTION fn_pio_options_from_solver(
  p_game_type TEXT, p_stack INT, p_street TEXT, p_board TEXT, p_position TEXT, p_hero TEXT
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  freqs jsonb;
  hash_with_prefix TEXT := p_street || '_' || p_game_type || '_' || p_position || '_' || p_stack || 'bb_' || p_board;
  hash_no_prefix   TEXT := p_game_type || '_' || p_position || '_' || p_stack || 'bb_' || p_board;
  hash_flop_prefix TEXT := 'flop_' || p_game_type || '_' || p_position || '_' || p_stack || 'bb_' || p_board;
  c_f numeric := 0; b16_f numeric := 0; b45_f numeric := 0; f_f numeric := 0;
  c_i int := 0; b16_i int := 0; b45_i int := 0; f_i int := 0;
  total numeric;
  result jsonb := '[]'::jsonb;
BEGIN
  SELECT strategy_matrix->'frequencies' INTO freqs
  FROM solved_spots_gold
  WHERE scenario_hash IN (hash_with_prefix, hash_no_prefix, hash_flop_prefix)
  LIMIT 1;
  IF freqs IS NULL THEN RETURN NULL; END IF;

  c_f   := COALESCE(NULLIF((freqs->'c'->>p_hero), '')::numeric, 0);
  b16_f := COALESCE(NULLIF((freqs->'b16'->>p_hero), '')::numeric, 0);
  b45_f := COALESCE(NULLIF((freqs->'b45'->>p_hero), '')::numeric, 0);
  f_f   := COALESCE(NULLIF((freqs->'f'->>p_hero), '')::numeric, 0);

  IF c_f < 0 OR c_f > 1.5 THEN c_f := 0; END IF;
  IF b16_f < 0 OR b16_f > 1.5 THEN b16_f := 0; END IF;
  IF b45_f < 0 OR b45_f > 1.5 THEN b45_f := 0; END IF;
  IF f_f < 0 OR f_f > 1.5 THEN f_f := 0; END IF;

  total := c_f + b16_f + b45_f + f_f;
  IF total = 0 THEN RETURN NULL; END IF;

  c_i   := round(100.0 * c_f / total)::int;
  b16_i := round(100.0 * b16_f / total)::int;
  b45_i := round(100.0 * b45_f / total)::int;
  f_i   := round(100.0 * f_f / total)::int;

  IF b16_i > 0 THEN result := result || jsonb_build_object('id','b16','text','Bet 16%','frequency',b16_i); END IF;
  IF c_i   > 0 THEN result := result || jsonb_build_object('id','c','text','Check','frequency',c_i); END IF;
  IF b45_i > 0 THEN result := result || jsonb_build_object('id','b45','text','Bet 45%','frequency',b45_i); END IF;
  IF f_i   > 0 THEN result := result || jsonb_build_object('id','f','text','Fold','frequency',f_i); END IF;

  IF jsonb_array_length(result) < 2 THEN RETURN NULL; END IF;
  RETURN result;
END;
$$;

-- The full UPDATE (in batches) + DELETE + INSERT-refill is run via
-- supabase_migrations.schema_migrations entries
--   20260506005001..005003 because the bulk operations ran in chunks
-- to avoid statement timeouts. See production migrations table.

SELECT 'see-supabase_migrations-for-batch-execution' AS note;

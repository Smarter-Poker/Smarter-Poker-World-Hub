-- STREAM-POLISH-R9 PHANTOM-RPC-SWEEP-4: implement the final two
-- phantoms surfaced by the wider regex (catching empty-jsonb-array
-- and empty-jsonb-object bodies that R7 missed).
--
-- After R5-R8 closed all critical phantoms, R9's wider sweep
-- (BEGIN NULL + RETURN '[]'::jsonb + RETURN '{}'::jsonb + WHERE false)
-- found exactly two remaining true-phantoms with active callers:
--
--   1. analyze_spots_by_game_type(text, integer)
--      caller: scripts/analyze-pio-data.js:50 calls with NO args
--      expects: rows of {game_type, count}
--      source: solved_spots_gold
--
--   2. get_next_training_question(uuid, text, text)
--      caller: lib/game-engine-service.ts:223 calls with
--              {p_user_id, p_level_id: number}
--      phantom signature uses (uuid, text, text) -- NAME MISMATCH on
--      p_level_id vs p_difficulty; client gets 404 silently
--      expects: array of training_question rows
--      source: training_questions
--
-- Both phantoms are dropped and replaced with real impls matching
-- the actual client signatures.
--
-- The other 3 functions flagged by the regex are false-positives
-- (real cleanup-cron impls that happen to return jsonb_build_object
-- with 'success', true alongside actual work) -- preserved as-is:
--   - fn_cleanup_stale_scheduled_lives() (real DELETE)
--   - fn_refresh_all_home_group_quality_scores() (real LOOP+UPDATE)
--   - unblock_user(uuid, uuid) (real DELETE w/ auth check)


-- =====================================================================
-- 1. analyze_spots_by_game_type -- REAL
-- =====================================================================
DROP FUNCTION IF EXISTS public.analyze_spots_by_game_type(text, integer);

CREATE OR REPLACE FUNCTION public.analyze_spots_by_game_type(
  p_game_type text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(game_type text, count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
BEGIN
  v_limit := GREATEST(1, LEAST(1000, COALESCE(p_limit, 100)));

  RETURN QUERY
  SELECT s.game_type, COUNT(*)::bigint
  FROM public.solved_spots_gold s
  WHERE (p_game_type IS NULL OR s.game_type = p_game_type)
  GROUP BY s.game_type
  ORDER BY COUNT(*) DESC
  LIMIT v_limit;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'analyze_spots_by_game_type failed: % %', SQLERRM, SQLSTATE;
  RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.analyze_spots_by_game_type(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analyze_spots_by_game_type(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.analyze_spots_by_game_type(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_spots_by_game_type(text, integer) TO service_role;


-- =====================================================================
-- 2. get_next_training_question -- REAL, NEW SIGNATURE
-- =====================================================================
-- Client (lib/game-engine-service.ts:223) passes
--   {p_user_id: uuid, p_level_id: number}
-- and consumes `data[0]` as a TrainingQuestion row.
-- Phantom signature (uuid, text, text) NEVER matched -- arity OK but
-- p_level_id vs p_difficulty / p_category name mismatch -> PostgREST
-- 404 silently. Frontend always sees null and shows "No more
-- questions available".

DROP FUNCTION IF EXISTS public.get_next_training_question(uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_next_training_question(
  p_user_id uuid,
  p_level_id integer DEFAULT 1
)
RETURNS TABLE(
  id uuid,
  scenario_text text,
  hero_hand text,
  hero_position text,
  board_cards jsonb,
  street text,
  correct_answer text,
  options jsonb,
  gto_action text,
  gto_explanation text,
  action_breakdown jsonb,
  gto_frequencies jsonb,
  difficulty integer,
  game_type text,
  stack_depth integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_level integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  v_level := GREATEST(1, COALESCE(p_level_id, 1));

  RETURN QUERY
  SELECT tq.id,
         tq.scenario_text,
         tq.hero_hand,
         tq.hero_position,
         tq.board_cards,
         tq.street,
         tq.correct_answer,
         tq.options,
         tq.gto_action,
         tq.gto_explanation,
         tq.action_breakdown,
         tq.gto_frequencies,
         tq.difficulty,
         tq.game_type,
         tq.stack_depth
  FROM public.training_questions tq
  -- Exclude questions the user has already answered CORRECTLY at this level.
  -- (Users repeating wrong answers benefits from re-seeing the same question.)
  -- training_answers.question_id is TEXT but training_questions.id is UUID; cast.
  WHERE tq.difficulty = v_level
    AND NOT EXISTS (
      SELECT 1 FROM public.training_answers ta
      WHERE ta.user_id = p_user_id
        AND ta.is_correct = true
        AND ta.level = v_level
        AND ta.question_id = tq.id::text
    )
  ORDER BY random()
  LIMIT 1;

  -- Fallback: if every question at this level has been answered
  -- correctly, return a random one anyway (loop the user through).
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT tq.id, tq.scenario_text, tq.hero_hand, tq.hero_position,
           tq.board_cards, tq.street, tq.correct_answer, tq.options,
           tq.gto_action, tq.gto_explanation, tq.action_breakdown,
           tq.gto_frequencies, tq.difficulty, tq.game_type, tq.stack_depth
    FROM public.training_questions tq
    WHERE tq.difficulty = v_level
    ORDER BY random()
    LIMIT 1;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_next_training_question failed for user % level %: % %', p_user_id, p_level_id, SQLERRM, SQLSTATE;
  RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_next_training_question(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_training_question(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_next_training_question(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_training_question(uuid, integer) TO service_role;

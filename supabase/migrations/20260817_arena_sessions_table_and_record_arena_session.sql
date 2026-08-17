-- APPLIED TO PRODUCTION 2026-08-17 (Supabase version recorded as
-- arena_sessions_table_and_record_arena_session)
--
-- Arena Training was dead at the very first step.
--
-- ArenaTrainingController.ts references public.arena_sessions in FIVE places
-- (startSession, recordAnswer x2, getUnlockedLevel, getTrainingHistory) and the
-- table had never existed. So:
--
--   startSession()     INSERT fails -> throws "Failed to start training session".
--                      Nobody has ever been able to begin a session.
--   getUnlockedLevel() SELECT fails -> the error branch returns 1, so every user
--                      reads as "locked to level 1". It failed CLOSED and
--                      silently, which is why this looked like nobody had
--                      progressed rather than like a broken feature.
--   record_arena_session()  the RPC did not exist either (PGRST202).
--
-- DELIBERATELY NOT INCLUDED: the diamond payout. The call site says "for Diamond
-- rewards", but no reward schedule exists anywhere in the schema or the client,
-- and inventing per-level diamond amounts would be minting currency from a guess
-- -- the exact class section 20 of the audit says not to create.

CREATE TABLE IF NOT EXISTS public.arena_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id             uuid,
  level               integer NOT NULL CHECK (level BETWEEN 1 AND 10),
  status              text    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'complete', 'failed', 'abandoned')),
  questions_attempted integer NOT NULL DEFAULT 0 CHECK (questions_attempted >= 0),
  correct_answers     integer NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  score               integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  time_remaining      integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  CONSTRAINT arena_sessions_correct_lte_attempted CHECK (correct_answers <= questions_attempted)
);

CREATE INDEX IF NOT EXISTS idx_arena_sessions_user_created
  ON public.arena_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_sessions_unlock
  ON public.arena_sessions (user_id, status, score, level DESC);

ALTER TABLE public.arena_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS arena_sessions_own ON public.arena_sessions;
CREATE POLICY arena_sessions_own ON public.arena_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.arena_sessions IS
  'Arena Training sessions. Columns match exactly what ArenaTrainingController.ts selects.';

CREATE OR REPLACE FUNCTION public.record_arena_session(
  p_user_id           uuid,
  p_session_id        uuid,
  p_level             integer,
  p_mastery_rate      numeric,
  p_questions_correct integer,
  p_questions_total   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session   record;
  v_passed    boolean;
  v_unlocked  integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot record a training session for another user';
  END IF;

  SELECT * INTO v_session FROM public.arena_sessions
   WHERE id = p_session_id AND user_id = p_user_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Arena session % not found for this user', p_session_id;
  END IF;

  -- The outcome is derived from the STORED answer counts, never from the
  -- caller-supplied mastery rate. p_mastery_rate and the two question counts
  -- are accepted for call-site compatibility and echoed back only as a check.
  v_passed := v_session.questions_attempted > 0
              AND (v_session.correct_answers::numeric / v_session.questions_attempted) >= 0.85;

  UPDATE public.arena_sessions
     SET status       = CASE WHEN v_passed THEN 'complete' ELSE 'failed' END,
         score        = ROUND((v_session.correct_answers::numeric
                               / GREATEST(v_session.questions_attempted, 1)) * 100),
         completed_at = COALESCE(completed_at, now())
   WHERE id = p_session_id;

  SELECT LEAST(COALESCE(MAX(level), 0) + 1, 10) INTO v_unlocked
    FROM public.arena_sessions
   WHERE user_id = p_user_id AND status = 'complete' AND score >= 85;

  RETURN jsonb_build_object(
    'session_id',     p_session_id,
    'passed',         v_passed,
    'score',          ROUND((v_session.correct_answers::numeric
                             / GREATEST(v_session.questions_attempted, 1)) * 100),
    'unlocked_level', GREATEST(COALESCE(v_unlocked, 1), 1),
    'client_mastery', p_mastery_rate,
    'client_correct', p_questions_correct,
    'client_total',   p_questions_total,
    'reward_issued',  false,
    'reward_note',    'No reward schedule is defined for Arena Training. Recording only.'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_arena_session(uuid, uuid, integer, numeric, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_arena_session(uuid, uuid, integer, numeric, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.record_arena_session(uuid, uuid, integer, numeric, integer, integer) IS
  'Finalises an arena_sessions row. Pass/score are derived from the stored answer counts, not from the caller-supplied mastery rate. Issues no reward - no schedule exists.';

-- Verified after apply, in-migration: 18/20 -> passed, score 90, unlocked_level 2;
-- and a caller claiming mastery 0.99 over a stored 4/20 still fails.

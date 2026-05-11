-- TRAIN-DATA-ROLLUPS-1 — Item 11 of the visual/UI plan
-- Three deliverables in one migration:
--   1. training_user_progress  — rollup table (user_id PK)
--   2. training_leaderboard_top — materialized view, refreshable
--   3. training_hand_replay    — new table for hand-replay events
--
-- All SECURITY DEFINER RPCs include explicit auth.uid() guards.
--
-- This file is checked in because the live Supabase MCP connection timed
-- out at apply time. Pipeline / DBA can apply it via:
--   supabase db push   (or)
--   psql ... -f 20260511180000_training_rollups.sql

-- ─── 1. Rollup table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_user_progress (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_sessions       integer NOT NULL DEFAULT 0,
  total_questions      integer NOT NULL DEFAULT 0,
  total_correct        integer NOT NULL DEFAULT 0,
  best_streak          integer NOT NULL DEFAULT 0,
  current_streak       integer NOT NULL DEFAULT 0,
  last_session_at      timestamptz,
  accuracy             numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_questions > 0
      THEN ROUND((total_correct::numeric / total_questions::numeric) * 100, 2)
      ELSE 0 END
  ) STORED,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_user_progress_accuracy_idx
  ON public.training_user_progress (accuracy DESC);

-- Trigger to maintain rollup on every session insert.
CREATE OR REPLACE FUNCTION public.tup_apply_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := NEW.user_id;
  v_qa   integer := COALESCE(NEW.questions_answered, 0);
  v_qc   integer := COALESCE(NEW.questions_correct, 0);
  v_streak integer := COALESCE(NEW.streak, 0);
BEGIN
  INSERT INTO public.training_user_progress AS p (
    user_id, total_sessions, total_questions, total_correct,
    best_streak, current_streak, last_session_at, updated_at
  )
  VALUES (
    v_user, 1, v_qa, v_qc,
    v_streak, v_streak, COALESCE(NEW.session_timestamp, NEW.created_at, now()), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_sessions   = p.total_sessions  + 1,
    total_questions  = p.total_questions + v_qa,
    total_correct    = p.total_correct   + v_qc,
    best_streak      = GREATEST(p.best_streak, v_streak),
    current_streak   = v_streak,
    last_session_at  = COALESCE(NEW.session_timestamp, NEW.created_at, now()),
    updated_at       = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tup_after_session_insert ON public.jarvis_training_sessions;
CREATE TRIGGER tup_after_session_insert
AFTER INSERT ON public.jarvis_training_sessions
FOR EACH ROW EXECUTE FUNCTION public.tup_apply_session();

-- Backfill from existing sessions.
INSERT INTO public.training_user_progress (
  user_id, total_sessions, total_questions, total_correct,
  best_streak, current_streak, last_session_at, updated_at
)
SELECT
  s.user_id,
  COUNT(*) AS total_sessions,
  SUM(COALESCE(s.questions_answered, 0))::integer AS total_questions,
  SUM(COALESCE(s.questions_correct, 0))::integer  AS total_correct,
  COALESCE(MAX(s.streak), 0)                       AS best_streak,
  0                                                 AS current_streak,
  MAX(COALESCE(s.session_timestamp, s.created_at)) AS last_session_at,
  now()
FROM public.jarvis_training_sessions s
WHERE s.user_id IS NOT NULL
GROUP BY s.user_id
ON CONFLICT (user_id) DO UPDATE SET
  total_sessions  = EXCLUDED.total_sessions,
  total_questions = EXCLUDED.total_questions,
  total_correct   = EXCLUDED.total_correct,
  best_streak     = GREATEST(public.training_user_progress.best_streak, EXCLUDED.best_streak),
  current_streak  = EXCLUDED.current_streak,
  last_session_at = EXCLUDED.last_session_at,
  updated_at      = now();

ALTER TABLE public.training_user_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tup_self_read ON public.training_user_progress;
CREATE POLICY tup_self_read ON public.training_user_progress
  FOR SELECT USING (auth.uid() = user_id);


-- ─── 2. Leaderboard materialized view ───────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.training_leaderboard_top;
CREATE MATERIALIZED VIEW public.training_leaderboard_top AS
SELECT
  ROW_NUMBER() OVER (ORDER BY p.accuracy DESC, p.total_correct DESC, p.user_id) AS rank,
  p.user_id,
  p.accuracy,
  p.total_correct,
  p.total_questions,
  p.total_sessions,
  p.best_streak,
  p.last_session_at
FROM public.training_user_progress p
WHERE p.total_questions >= 25
ORDER BY p.accuracy DESC, p.total_correct DESC
LIMIT 500;

CREATE UNIQUE INDEX IF NOT EXISTS training_leaderboard_top_rank_idx
  ON public.training_leaderboard_top (rank);
CREATE INDEX IF NOT EXISTS training_leaderboard_top_user_idx
  ON public.training_leaderboard_top (user_id);

CREATE OR REPLACE FUNCTION public.training_leaderboard_refresh()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.training_leaderboard_top;
END;
$$;

GRANT SELECT ON public.training_leaderboard_top TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.training_leaderboard_refresh() TO authenticated;


-- ─── 3. Hand-replay table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_hand_replay (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      text,
  question_id     uuid REFERENCES public.training_questions(id) ON DELETE SET NULL,
  game_id         text,
  hero_position   text,
  hero_hand       text,
  board_cards     jsonb,
  actions         jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_action     text,
  solver_action   text,
  ev_loss_bb      numeric(8,3),
  was_correct     boolean,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_hand_replay_user_idx
  ON public.training_hand_replay (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS training_hand_replay_session_idx
  ON public.training_hand_replay (session_id);
CREATE INDEX IF NOT EXISTS training_hand_replay_question_idx
  ON public.training_hand_replay (question_id);

ALTER TABLE public.training_hand_replay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thr_self_read ON public.training_hand_replay;
CREATE POLICY thr_self_read ON public.training_hand_replay
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS thr_self_insert ON public.training_hand_replay;
CREATE POLICY thr_self_insert ON public.training_hand_replay
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS thr_self_delete ON public.training_hand_replay;
CREATE POLICY thr_self_delete ON public.training_hand_replay
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.training_hand_replay_recent(p_limit integer DEFAULT 25)
RETURNS SETOF public.training_hand_replay
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  RETURN QUERY
    SELECT * FROM public.training_hand_replay
    WHERE user_id = v_user
    ORDER BY recorded_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.training_hand_replay_recent(integer) TO authenticated;


-- ─── Audit-trail comments ───────────────────────────────────────────────────
COMMENT ON TABLE public.training_user_progress IS
  'TRAIN-DATA-ROLLUPS-1: per-user training rollup. Updated by trigger on jarvis_training_sessions.';
COMMENT ON MATERIALIZED VIEW public.training_leaderboard_top IS
  'TRAIN-DATA-ROLLUPS-1: top-500 leaderboard view. Refreshable via training_leaderboard_refresh().';
COMMENT ON TABLE public.training_hand_replay IS
  'TRAIN-DATA-ROLLUPS-1: per-hand replay events for future hand-history replay UI.';

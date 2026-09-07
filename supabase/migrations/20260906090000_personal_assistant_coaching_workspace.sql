-- ===========================================================================
-- 20260906090000_personal_assistant_coaching_workspace.sql
-- ===========================================================================
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     New coaching goals, feedback, preferences, RLS, and indexes
-- IRREVERSIBLE: no
--
-- WHY:
--   Phase 7 needs durable owner-private goals, coach feedback, and saved views.
--   Existing leak, decision, review, and hand data remains unchanged.
--
-- HOW:
--   Add three isolated tables, indexed owner paths, fail-closed RLS, narrow
--   authenticated reads, service-owned writes, and post-apply assertions.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pa_coaching_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leak_id text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  metric text NOT NULL CHECK (char_length(metric) BETWEEN 1 AND 80),
  target_value numeric NOT NULL,
  current_value numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pa_coaching_goals_owner_status
  ON public.pa_coaching_goals (user_id, status, due_at);

CREATE TABLE IF NOT EXISTS public.pa_coach_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leak_id text,
  decision_key text,
  feedback_type text NOT NULL CHECK (feedback_type IN ('confusing', 'incorrect', 'mismatched', 'helpful')),
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pa_coach_feedback_owner_recent
  ON public.pa_coach_feedback (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pa_coaching_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_view text NOT NULL DEFAULT 'coach' CHECK (saved_view IN ('coach', 'evidence', 'timeline', 'goals', 'report')),
  analysis_depth text NOT NULL DEFAULT 'guided' CHECK (analysis_depth IN ('guided', 'detailed', 'expert')),
  panel_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pa_coaching_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_coaching_goals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pa_coach_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_coach_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pa_coaching_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_coaching_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pa_coaching_goals_owner_read ON public.pa_coaching_goals;
CREATE POLICY pa_coaching_goals_owner_read ON public.pa_coaching_goals
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS pa_coach_feedback_owner_read ON public.pa_coach_feedback;
CREATE POLICY pa_coach_feedback_owner_read ON public.pa_coach_feedback
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS pa_coaching_preferences_owner_read ON public.pa_coaching_preferences;
CREATE POLICY pa_coaching_preferences_owner_read ON public.pa_coaching_preferences
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS pa_coaching_goals_service_manage ON public.pa_coaching_goals;
CREATE POLICY pa_coaching_goals_service_manage ON public.pa_coaching_goals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pa_coach_feedback_service_manage ON public.pa_coach_feedback;
CREATE POLICY pa_coach_feedback_service_manage ON public.pa_coach_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pa_coaching_preferences_service_manage ON public.pa_coaching_preferences;
CREATE POLICY pa_coaching_preferences_service_manage ON public.pa_coaching_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.pa_coaching_goals FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.pa_coach_feedback FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.pa_coaching_preferences FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.pa_coaching_goals TO authenticated;
GRANT SELECT ON TABLE public.pa_coach_feedback TO authenticated;
GRANT SELECT ON TABLE public.pa_coaching_preferences TO authenticated;
GRANT ALL ON TABLE public.pa_coaching_goals TO service_role;
GRANT ALL ON TABLE public.pa_coach_feedback TO service_role;
GRANT ALL ON TABLE public.pa_coaching_preferences TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pa_coaching_goals WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'pa_coaching_goals contains an ownerless row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pa_coach_feedback WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'pa_coach_feedback contains an ownerless row';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pa_coaching_goals'
      AND policyname = 'pa_coaching_goals_owner_read'
  ) THEN
    RAISE EXCEPTION 'pa_coaching_goals owner policy is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pa_coach_feedback'
      AND policyname = 'pa_coach_feedback_owner_read'
  ) THEN
    RAISE EXCEPTION 'pa_coach_feedback owner policy is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pa_coaching_preferences'
      AND policyname = 'pa_coaching_preferences_owner_read'
  ) THEN
    RAISE EXCEPTION 'pa_coaching_preferences owner policy is missing';
  END IF;
END
$$;

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.pa_coaching_preferences;
-- DROP TABLE IF EXISTS public.pa_coach_feedback;
-- DROP TABLE IF EXISTS public.pa_coaching_goals;

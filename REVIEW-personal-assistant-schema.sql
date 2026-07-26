-- ============================================================================
-- Personal Assistant swarm audit — supporting schema
-- Generated 2026-07-26. NOT EXECUTED. Review before running.
--
-- IMPORTANT: none of this is required for the deployed code to work. Every
-- handler degrades gracefully when a table/column/index is absent (missing
-- relation -> empty result, missing unique index -> per-row upsert fallback).
-- Run in the order below; SECTION A is the only part with real behavioural
-- impact, SECTION B is performance, SECTION C is optional hardening.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SECTION A — recommended (makes upserts atomic + persists AI fix suggestions)
-- ---------------------------------------------------------------------------

-- Conflict target for POST /api/assistant/leaks and detect.js batch upsert.
-- Without it the code falls back to select-then-update (works, not atomic).
CREATE UNIQUE INDEX IF NOT EXISTS user_leaks_user_id_leak_type_key
  ON user_leaks (user_id, leak_type);

-- Conflict target for the batch hand-example upsert in detect.js.
CREATE UNIQUE INDEX IF NOT EXISTS leak_hand_examples_leak_hand_key
  ON leak_hand_examples (leak_id, hand_history_id);

-- Persists the Grok-generated fix suggestions (otherwise they are returned in
-- the API response but not stored, and a console warning is emitted).
ALTER TABLE user_leaks ADD COLUMN IF NOT EXISTS suggested_fix text;

-- Allowed by the PATCH whitelist.
ALTER TABLE user_leaks ADD COLUMN IF NOT EXISTS notes text;

-- Backing table for GET /api/sandbox/sessions (cloud session log sync).
CREATE TABLE IF NOT EXISTS sandbox_sessions (
  id                bigserial PRIMARY KEY,
  user_id           uuid NOT NULL,
  hand              text,
  position          text,
  street            text,
  board             text,
  equity            numeric,
  optimal_action    text,
  user_pick         text,
  is_correct        boolean,
  ev_delta          numeric,
  ev_delta_estimated boolean NOT NULL DEFAULT false,
  created_at        timestamptz DEFAULT now()
);

-- Shared sandbox scenarios: written by /api/sandbox/create-share, read by /sandbox/[id].
CREATE TABLE IF NOT EXISTS sandbox_shared_scenarios (
  id         text PRIMARY KEY,
  creator_id uuid,
  state_json jsonb NOT NULL,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sandbox_shared_scenarios
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_share_view(share_id text) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE sandbox_shared_scenarios SET view_count = view_count + 1 WHERE id = share_id;
$$;

-- Lets coach-accuracy exclude heuristic (non-solver) EV deltas from stats.
ALTER TABLE sandbox_coach_results
  ADD COLUMN IF NOT EXISTS ev_delta_estimated boolean NOT NULL DEFAULT false;

-- Lets the dashboard read EV loss directly instead of parsing full_analysis JSON.
ALTER TABLE public.sandbox_results ADD COLUMN IF NOT EXISTS ev_loss_bb numeric;

-- Precomputed average for the stats endpoint (falls back to live aggregation).
ALTER TABLE user_assistant_stats ADD COLUMN IF NOT EXISTS avg_ev_loss numeric;

-- Presentation order for DB-backed archetypes (falls back to canonical order).
ALTER TABLE villain_archetypes ADD COLUMN IF NOT EXISTS sort_order integer;


-- ---------------------------------------------------------------------------
-- SECTION B — performance only (indexes for the per-user, time-ordered scans)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_user_created
  ON public.sandbox_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_coach_results_user_created
  ON public.sandbox_coach_results (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_coach_results_created
  ON public.sandbox_coach_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_analytics_user_created
  ON public.sandbox_analytics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_saved_hands_user_created
  ON public.sandbox_saved_hands (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_quiz_results_created_at
  ON public.sandbox_quiz_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_quiz_results_user_created
  ON public.sandbox_quiz_results (user_id, created_at DESC);

-- Optional: single-round-trip weekly leaderboard. If created, leaderboard.js
-- can be switched from its client-side .range() paging loop to:
--   supabase.rpc('sandbox_weekly_leaderboard', { week_start: weekStart })
CREATE OR REPLACE FUNCTION public.sandbox_weekly_leaderboard(week_start timestamptz)
RETURNS TABLE (user_id uuid, total_hands bigint, correct_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.user_id,
         count(*)                             AS total_hands,
         count(*) FILTER (WHERE r.is_correct) AS correct_count
  FROM public.sandbox_coach_results r
  WHERE r.created_at >= week_start
  GROUP BY r.user_id
  HAVING count(*) >= 20;
$$;


-- ---------------------------------------------------------------------------
-- SECTION C — optional RLS hardening.
-- REVIEW CAREFULLY: enabling RLS on a table that currently has none will hide
-- rows from any client path that is not already going through the service-role
-- key. The quiz leaderboard is now aggregated server-side, so the browser no
-- longer needs to read other users' rows — but confirm nothing else does first.
-- ---------------------------------------------------------------------------

-- ALTER TABLE public.sandbox_quiz_results ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS sandbox_quiz_results_select_own ON public.sandbox_quiz_results;
-- CREATE POLICY sandbox_quiz_results_select_own
--   ON public.sandbox_quiz_results FOR SELECT USING (auth.uid() = user_id);
-- DROP POLICY IF EXISTS sandbox_quiz_results_insert_own ON public.sandbox_quiz_results;
-- CREATE POLICY sandbox_quiz_results_insert_own
--   ON public.sandbox_quiz_results FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ALTER TABLE public.sandbox_results ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS sandbox_results_select_own ON public.sandbox_results;
-- CREATE POLICY sandbox_results_select_own
--   ON public.sandbox_results FOR SELECT USING (EXISTS (
--     SELECT 1 FROM public.sandbox_sessions s
--     WHERE s.id = sandbox_results.session_id AND s.user_id = auth.uid()));

-- Optional storage bucket for ShareHandModal image upload (code degrades to a
-- text-only post when absent):
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('social-media', 'social-media', true) ON CONFLICT (id) DO NOTHING;
-- CREATE POLICY "authenticated users can upload sandbox hand images"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'social-media' AND (storage.foldername(name))[1] = 'sandbox');
-- CREATE POLICY "public read of social media images"
--   ON storage.objects FOR SELECT TO public USING (bucket_id = 'social-media');
-- ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

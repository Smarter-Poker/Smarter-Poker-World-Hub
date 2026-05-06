-- ============================================================
-- SECURITY FIX 1: RLS on spatial_ref_sys + SECURITY DEFINER views
-- Addresses: rls_disabled_in_public (1 table), security_definer_view (5 views)
-- Date: 2026-05-06
-- ============================================================

-- ── FIX 1A: spatial_ref_sys ────────────────────────────────────────
-- NOTE: spatial_ref_sys is owned by the PostGIS extension and cannot
-- have RLS enabled by the project role. This is a known Supabase advisor
-- false positive for PostGIS installations. No action possible.

-- ── FIX 1B: Remove SECURITY DEFINER from views ─────────────────────
-- Recreate each view with SECURITY INVOKER so caller RLS applies.

-- 1. share_streaks
DROP VIEW IF EXISTS public.share_streaks;
CREATE OR REPLACE VIEW public.share_streaks
  WITH (security_invoker = true)
AS
WITH daily_shares AS (
  SELECT share_events.user_id,
    date_trunc('day'::text, (share_events.created_at AT TIME ZONE 'UTC'::text)) AS share_day
   FROM share_events
  GROUP BY share_events.user_id, (date_trunc('day'::text, (share_events.created_at AT TIME ZONE 'UTC'::text)))
), numbered AS (
  SELECT daily_shares.user_id,
    daily_shares.share_day,
    (daily_shares.share_day - ((row_number() OVER (PARTITION BY daily_shares.user_id ORDER BY daily_shares.share_day))::double precision * '1 day'::interval)) AS grp
   FROM daily_shares
), streaks AS (
  SELECT numbered.user_id,
    numbered.grp,
    min(numbered.share_day) AS streak_start,
    max(numbered.share_day) AS streak_end,
    count(*) AS streak_days
   FROM numbered
  GROUP BY numbered.user_id, numbered.grp
)
SELECT user_id, streak_days, streak_start, streak_end,
  (streak_end >= (date_trunc('day'::text, (now() AT TIME ZONE 'UTC'::text)) - '1 day'::interval)) AS is_active
FROM streaks
WHERE (streak_days > 1)
ORDER BY streak_days DESC;

-- 2. auth_health_view
DROP VIEW IF EXISTS public.auth_health_view;
CREATE OR REPLACE VIEW public.auth_health_view
  WITH (security_invoker = true)
AS
WITH probe_counts AS (
  SELECT probe_heartbeats.probe_name,
    count(*) FILTER (WHERE (probe_heartbeats.occurred_at > (now() - '00:15:00'::interval))) AS runs_15m,
    count(*) FILTER (WHERE (probe_heartbeats.occurred_at > (now() - '01:00:00'::interval))) AS runs_1h,
    count(*) FILTER (WHERE (probe_heartbeats.occurred_at > (now() - '24:00:00'::interval))) AS runs_24h,
    count(*) FILTER (WHERE ((probe_heartbeats.occurred_at > (now() - '00:15:00'::interval)) AND (probe_heartbeats.status = 'ok'::text))) AS ok_15m,
    count(*) FILTER (WHERE ((probe_heartbeats.occurred_at > (now() - '01:00:00'::interval)) AND (probe_heartbeats.status = 'failed'::text))) AS failed_1h,
    max(probe_heartbeats.occurred_at) AS last_run_at
   FROM probe_heartbeats
  GROUP BY probe_heartbeats.probe_name
)
SELECT
  COALESCE((SELECT probe_counts.runs_15m FROM probe_counts WHERE (probe_counts.probe_name = 'signup-probe'::text)), (0)::bigint) AS signup_runs_15m,
  COALESCE((SELECT probe_counts.ok_15m FROM probe_counts WHERE (probe_counts.probe_name = 'signup-probe'::text)), (0)::bigint) AS signup_ok_15m,
  COALESCE((SELECT probe_counts.failed_1h FROM probe_counts WHERE (probe_counts.probe_name = 'signup-probe'::text)), (0)::bigint) AS signup_failed_1h,
  (SELECT probe_counts.last_run_at FROM probe_counts WHERE (probe_counts.probe_name = 'signup-probe'::text)) AS signup_last_run,
  COALESCE((SELECT probe_counts.runs_15m FROM probe_counts WHERE (probe_counts.probe_name = 'login-probe'::text)), (0)::bigint) AS login_runs_15m,
  COALESCE((SELECT probe_counts.ok_15m FROM probe_counts WHERE (probe_counts.probe_name = 'login-probe'::text)), (0)::bigint) AS login_ok_15m,
  COALESCE((SELECT probe_counts.failed_1h FROM probe_counts WHERE (probe_counts.probe_name = 'login-probe'::text)), (0)::bigint) AS login_failed_1h,
  (SELECT probe_counts.last_run_at FROM probe_counts WHERE (probe_counts.probe_name = 'login-probe'::text)) AS login_last_run,
  COALESCE((SELECT probe_counts.runs_15m FROM probe_counts WHERE (probe_counts.probe_name = 'recovery-probe'::text)), (0)::bigint) AS recovery_runs_15m,
  COALESCE((SELECT probe_counts.ok_15m FROM probe_counts WHERE (probe_counts.probe_name = 'recovery-probe'::text)), (0)::bigint) AS recovery_ok_15m,
  COALESCE((SELECT probe_counts.failed_1h FROM probe_counts WHERE (probe_counts.probe_name = 'recovery-probe'::text)), (0)::bigint) AS recovery_failed_1h,
  (SELECT probe_counts.last_run_at FROM probe_counts WHERE (probe_counts.probe_name = 'recovery-probe'::text)) AS recovery_last_run,
  COALESCE((SELECT probe_counts.runs_24h FROM probe_counts WHERE (probe_counts.probe_name = 'auth-integrity-audit'::text)), (0)::bigint) AS integrity_runs_24h,
  COALESCE((SELECT probe_counts.failed_1h FROM probe_counts WHERE (probe_counts.probe_name = 'auth-integrity-audit'::text)), (0)::bigint) AS integrity_failed_1h,
  (SELECT probe_counts.last_run_at FROM probe_counts WHERE (probe_counts.probe_name = 'auth-integrity-audit'::text)) AS integrity_last_run,
  COALESCE((SELECT probe_counts.runs_24h FROM probe_counts WHERE (probe_counts.probe_name = 'email-deliverability'::text)), (0)::bigint) AS email_runs_24h,
  COALESCE((SELECT probe_counts.failed_1h FROM probe_counts WHERE (probe_counts.probe_name = 'email-deliverability'::text)), (0)::bigint) AS email_failed_1h,
  (SELECT probe_counts.last_run_at FROM probe_counts WHERE (probe_counts.probe_name = 'email-deliverability'::text)) AS email_last_run,
  (SELECT signup_health_view.new_users_24h FROM signup_health_view) AS real_signups_24h,
  (SELECT signup_health_view.new_users_1h FROM signup_health_view) AS real_signups_1h,
  (SELECT signup_health_view.errors_1h FROM signup_health_view) AS trigger_errors_1h,
  now() AS computed_at;

-- 3. trivia_question_player_stats
DROP VIEW IF EXISTS public.trivia_question_player_stats;
CREATE OR REPLACE VIEW public.trivia_question_player_stats
  WITH (security_invoker = true)
AS
SELECT id, category, difficulty, times_shown, times_correct, skipped_count,
  CASE
    WHEN (times_shown >= 30) THEN round((((times_correct)::numeric / (times_shown)::numeric) * (100)::numeric), 1)
    ELSE NULL::numeric
  END AS success_rate_pct,
  CASE
    WHEN ((times_shown >= 30) AND (difficulty = 'easy'::text) AND (((times_correct)::numeric / (times_shown)::numeric) < 0.40)) THEN 'too-hard-or-wrong'::text
    WHEN ((times_shown >= 30) AND (difficulty = 'hard'::text) AND (((times_correct)::numeric / (times_shown)::numeric) > 0.95)) THEN 'mislabeled-easy'::text
    WHEN ((times_shown >= 30) AND (difficulty = 'medium'::text) AND (((times_correct)::numeric / (times_shown)::numeric) < 0.30)) THEN 'suspect-bad'::text
    WHEN ((times_shown >= 30) AND (((skipped_count)::numeric / (times_shown)::numeric) > 0.20)) THEN 'high-skip'::text
    ELSE 'ok'::text
  END AS player_signal,
  quality_score
FROM trivia_questions;

-- 4. v_yt_pipeline_health
DROP VIEW IF EXISTS public.v_yt_pipeline_health;
CREATE OR REPLACE VIEW public.v_yt_pipeline_health
  WITH (security_invoker = true)
AS
SELECT source_type, media_status, count(*) AS reel_count
FROM social_reels
WHERE (source_type IS NOT NULL)
GROUP BY source_type, media_status
ORDER BY source_type, media_status;

-- 5. v_yt_jobs_health
DROP VIEW IF EXISTS public.v_yt_jobs_health;
CREATE OR REPLACE VIEW public.v_yt_jobs_health
  WITH (security_invoker = true)
AS
SELECT status, worker_id, count(*) AS job_count,
  min(created_at) AS oldest_created_at,
  max(completed_at) AS latest_completed_at
FROM video_transcode_jobs
WHERE (source_type = 'youtube'::text)
GROUP BY status, worker_id
ORDER BY status, worker_id NULLS FIRST;

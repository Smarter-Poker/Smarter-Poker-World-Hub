-- ═══════════════════════════════════════════════════════════════════════════
-- 20260507120000_training_dashboard_rpcs.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- TIER:    2  (new RPCs, additive — no destructive ops)
-- AUTHOR:  redesign / hub training page UX overhaul (PR #239)
--
-- WHY:
--   The redesigned /hub/training page (PR #239) presents real-time coached
--   training stats above the fold: current GTO grade with progression to
--   next grade, weekly hands / accuracy / EV-saved with WoW trend, current
--   training-day streak with personal best. The existing /api/training/*
--   surface returns per-session rows (get-sessions.js) and per-game progress
--   (get-progress.js) but no rolled-up "weekly dashboard" payload, so the
--   client would otherwise have to fetch hundreds of rows and reduce them in
--   the browser. This RPC consolidates the aggregation server-side so the
--   page paints with one ~1KB JSON response.
--
-- WHAT:
--   1. rpc_training_weekly_stats(p_user_id uuid) RETURNS jsonb
--      Single aggregated payload for the training landing surface.
--      Reads training_sessions only (no writes).
--      Window = ISO week (date_trunc('week', now())).
--      Streak computation uses distinct UTC days of session activity, so it
--      degrades gracefully on environments where training_streaks is sparse
--      or absent.
--      Grade thresholds match coaching-summary.js:computeGrade() so the
--      dashboard letter and the post-session letter agree.
--
-- IDEMPOTENT:
--   CREATE OR REPLACE FUNCTION — safe to re-run.
--
-- AUTH MODEL:
--   SECURITY DEFINER + auth.uid() check. When called via service role (e.g.
--   the API endpoint on a Vercel serverless function), auth.uid() is null
--   and the check passes through; the API itself enforces JWT auth before
--   calling. When called directly from the client via supabase.rpc(), the
--   auth.uid() must equal p_user_id.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_training_weekly_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- windows ----------------------------------------------------------------
  this_week_start  timestamptz := date_trunc('week', now());
  last_week_start  timestamptz := date_trunc('week', now()) - interval '7 days';
  last_week_end    timestamptz := date_trunc('week', now());
  rolling_30_start timestamptz := now() - interval '30 days';

  -- weekly aggregates ------------------------------------------------------
  this_hands_played  int := 0;
  this_correct_count int := 0;
  this_total_answers int := 0;
  this_ev_loss       numeric := 0;

  last_hands_played  int := 0;
  last_correct_count int := 0;
  last_total_answers int := 0;
  last_ev_loss       numeric := 0;

  -- streak computation -----------------------------------------------------
  cur_streak_days   int := 0;
  best_streak_days  int := 0;

  -- rolling 30-day grade ---------------------------------------------------
  rolling_correct   int := 0;
  rolling_total     int := 0;
  rolling_accuracy  numeric := 0;
  cur_grade         text;
  next_grade        text;
  next_grade_floor  numeric;
  delta_correct     int;

  result jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;

  -- AUTHZ: when called from a JWT-bearing client, must be the same user.
  -- When called via service-role (auth.uid() IS NULL), pass through — the
  -- caller (API endpoint) is responsible for auth.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- ── This week ──────────────────────────────────────────────────────────
  SELECT
    coalesce(sum(hands_played), 0)::int,
    coalesce(sum(correct_count), 0)::int,
    coalesce(sum(hands_played), 0)::int,
    coalesce(sum(total_ev_loss), 0)::numeric
  INTO this_hands_played, this_correct_count, this_total_answers, this_ev_loss
  FROM training_sessions
  WHERE user_id = p_user_id
    AND created_at >= this_week_start;

  -- ── Last week (Mon..Sun previous) ──────────────────────────────────────
  SELECT
    coalesce(sum(hands_played), 0)::int,
    coalesce(sum(correct_count), 0)::int,
    coalesce(sum(hands_played), 0)::int,
    coalesce(sum(total_ev_loss), 0)::numeric
  INTO last_hands_played, last_correct_count, last_total_answers, last_ev_loss
  FROM training_sessions
  WHERE user_id = p_user_id
    AND created_at >= last_week_start
    AND created_at <  last_week_end;

  -- ── Streak (current run + personal best) ───────────────────────────────
  -- Compute from distinct UTC days of training_sessions activity. Robust
  -- across deployments where training_streaks is partially populated.
  WITH play_days AS (
    SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date AS d
    FROM training_sessions
    WHERE user_id = p_user_id
  ),
  ranked AS (
    SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp
    FROM play_days
  ),
  runs AS (
    SELECT min(d) AS run_start, max(d) AS run_end, count(*)::int AS run_len
    FROM ranked
    GROUP BY grp
  )
  SELECT
    coalesce(max(CASE WHEN run_end IN (current_date, current_date - 1) THEN run_len END), 0),
    coalesce(max(run_len), 0)
  INTO cur_streak_days, best_streak_days
  FROM runs;

  -- ── Rolling 30-day accuracy → grade ────────────────────────────────────
  SELECT
    coalesce(sum(correct_count), 0)::int,
    coalesce(sum(hands_played),  0)::int
  INTO rolling_correct, rolling_total
  FROM training_sessions
  WHERE user_id = p_user_id
    AND created_at >= rolling_30_start;

  rolling_accuracy := CASE
    WHEN rolling_total > 0 THEN (rolling_correct::numeric / rolling_total) * 100.0
    ELSE 0
  END;

  -- Grade brackets — must match coaching-summary.js:computeGrade()
  cur_grade := CASE
    WHEN rolling_accuracy >= 95 THEN 'A+'
    WHEN rolling_accuracy >= 90 THEN 'A'
    WHEN rolling_accuracy >= 85 THEN 'B+'
    WHEN rolling_accuracy >= 80 THEN 'B'
    WHEN rolling_accuracy >= 75 THEN 'C+'
    WHEN rolling_accuracy >= 70 THEN 'C'
    WHEN rolling_accuracy >= 65 THEN 'D+'
    WHEN rolling_accuracy >= 60 THEN 'D'
    ELSE 'F'
  END;

  next_grade := CASE
    WHEN rolling_accuracy >= 95 THEN NULL
    WHEN rolling_accuracy >= 90 THEN 'A+'
    WHEN rolling_accuracy >= 85 THEN 'A'
    WHEN rolling_accuracy >= 80 THEN 'B+'
    WHEN rolling_accuracy >= 75 THEN 'B'
    WHEN rolling_accuracy >= 70 THEN 'C+'
    WHEN rolling_accuracy >= 65 THEN 'C'
    WHEN rolling_accuracy >= 60 THEN 'D+'
    ELSE 'D'
  END;

  next_grade_floor := CASE
    WHEN rolling_accuracy >= 95 THEN NULL
    WHEN rolling_accuracy >= 90 THEN 95
    WHEN rolling_accuracy >= 85 THEN 90
    WHEN rolling_accuracy >= 80 THEN 85
    WHEN rolling_accuracy >= 75 THEN 80
    WHEN rolling_accuracy >= 70 THEN 75
    WHEN rolling_accuracy >= 65 THEN 70
    WHEN rolling_accuracy >= 60 THEN 65
    ELSE 60
  END;

  -- delta_correct: how many more *consecutive* correct hands needed to
  -- cross the next grade floor, holding rolling_total constant. Returns
  -- NULL once the user is at the top bucket (A+) or has zero history.
  delta_correct := CASE
    WHEN next_grade_floor IS NULL THEN NULL
    WHEN rolling_total <= 0 THEN NULL
    ELSE GREATEST(
      ceil((next_grade_floor / 100.0) * rolling_total - rolling_correct)::int,
      1
    )
  END;

  result := jsonb_build_object(
    -- this week
    'hands_this_week',         this_hands_played,
    'correct_this_week',       this_correct_count,
    'total_this_week',         this_total_answers,
    'ev_loss_this_week',       this_ev_loss,
    'accuracy_this_week_pct',  CASE WHEN this_total_answers > 0
                                    THEN round(this_correct_count::numeric / this_total_answers * 100, 1)
                                    ELSE 0 END,
    'ev_saved_this_week_bb',   round(-this_ev_loss, 1),
    -- last week (for trend)
    'hands_last_week',         last_hands_played,
    'correct_last_week',       last_correct_count,
    'total_last_week',         last_total_answers,
    'ev_loss_last_week',       last_ev_loss,
    'accuracy_last_week_pct',  CASE WHEN last_total_answers > 0
                                    THEN round(last_correct_count::numeric / last_total_answers * 100, 1)
                                    ELSE 0 END,
    'ev_saved_last_week_bb',   round(-last_ev_loss, 1),
    -- streak
    'current_streak_days',     cur_streak_days,
    'personal_best_streak_days', best_streak_days,
    -- rolling 30-day grade
    'rolling_accuracy_pct',    round(rolling_accuracy, 1),
    'rolling_correct',         rolling_correct,
    'rolling_total',           rolling_total,
    'current_grade',           cur_grade,
    'next_grade',              next_grade,
    'delta_correct_to_next',   delta_correct,
    -- meta
    'window_this_week_start',  this_week_start,
    'window_last_week_start',  last_week_start,
    'computed_at',             now()
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.rpc_training_weekly_stats(uuid) IS
  'Aggregated training dashboard payload (this/last week + rolling 30-day grade + streak). Read-only. Used by /api/training/weekly-stats. PR #239.';

GRANT EXECUTE ON FUNCTION public.rpc_training_weekly_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_training_weekly_stats(uuid) TO service_role;

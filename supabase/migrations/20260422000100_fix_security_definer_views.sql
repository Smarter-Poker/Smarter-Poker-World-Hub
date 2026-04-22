-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: Security Definer Views → Security Invoker
-- Supabase Security Advisor flagged 3 views with SECURITY DEFINER.
--
-- SECURITY DEFINER views execute with the VIEW OWNER's privileges, not the
-- calling user's. This means any RLS policies on underlying tables are
-- bypassed for all callers — a significant privilege escalation risk.
--
-- Fix: Recreate all 3 views with SECURITY INVOKER (the safe default).
-- With SECURITY INVOKER, the view runs with the CALLER's privileges,
-- so RLS and grants on underlying tables are fully respected.
--
-- Views fixed:
--   1. public.v_system_health_cron       (cron job health monitoring)
--   2. public.autofix_attempts_summary   (autofix hourly rollup)
--   3. public.unified_events_calendar    (unified tournament calendar)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. v_system_health_cron ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_system_health_cron
  WITH (security_invoker = true)
AS
SELECT
    jobid,
    jobname,
    schedule,
    active,
    ( SELECT d.status
           FROM cron.job_run_details d
          WHERE d.jobid = j.jobid
          ORDER BY d.start_time DESC
         LIMIT 1) AS last_status,
    ( SELECT d.start_time
           FROM cron.job_run_details d
          WHERE d.jobid = j.jobid
          ORDER BY d.start_time DESC
         LIMIT 1) AS last_run_at,
    ( SELECT (d.end_time - d.start_time)
           FROM cron.job_run_details d
          WHERE d.jobid = j.jobid
          ORDER BY d.start_time DESC
         LIMIT 1) AS last_run_duration,
    ( SELECT count(*)
           FROM cron.job_run_details d
          WHERE d.jobid = j.jobid
            AND d.start_time > (now() - '24:00:00'::interval)
            AND d.status = 'failed') AS failures_24h
FROM cron.job j
WHERE (jobname LIKE 'home%'
    OR jobname LIKE 'pnm%'
    OR jobname LIKE 'flag-garbage%');

COMMENT ON VIEW public.v_system_health_cron IS
  'Cron job health snapshot. Recreated 2026-04-22 as SECURITY INVOKER — '
  'callers see only what their own privileges allow on cron.job and '
  'cron.job_run_details. Previously had SECURITY DEFINER (privilege escalation risk).';

-- ── 2. autofix_attempts_summary ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.autofix_attempts_summary
  WITH (security_invoker = true)
AS
SELECT
    date_trunc('hour', created_at) AS hour,
    sentry_project_slug             AS project,
    status,
    count(*)                        AS attempts,
    sum(claude_tokens_in)           AS tokens_in,
    sum(claude_tokens_out)          AS tokens_out
FROM public.autofix_attempts
GROUP BY date_trunc('hour', created_at), sentry_project_slug, status
ORDER BY date_trunc('hour', created_at) DESC, sentry_project_slug, status;

COMMENT ON VIEW public.autofix_attempts_summary IS
  'Hourly autofix attempt rollup. Recreated 2026-04-22 as SECURITY INVOKER — '
  'RLS on autofix_attempts is now fully enforced for all callers.';

-- ── 3. unified_events_calendar ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.unified_events_calendar
  WITH (security_invoker = true)
AS
-- Daily recurring tournaments
SELECT
    'daily'::text                       AS source,
    vdt.id::text                        AS native_id,
    vdt.venue_name,
    vdt.venue_id::text                  AS venue_id,
    NULL::text                          AS series_id,
    NULL::text                          AS tour_event_id,
    NULL::text                          AS tour_code,
    vdt.tournament_name                 AS event_name,
    vdt.start_time,
    vdt.buy_in::numeric                 AS buy_in,
    vdt.game_type,
    vdt.guaranteed::numeric             AS guaranteed,
    vdt.format,
    vdt.starting_stack::text            AS starting_stack,
    vdt.day_of_week,
    vdt.event_date::text                AS specific_date,
    vdt.is_recurring,
    vdt.is_suppressed,
    vdt.is_active,
    v.city,
    v.state,
    v.latitude::numeric                 AS latitude,
    v.longitude::numeric                AS longitude,
    NULL::text                          AS logo_url
FROM public.venue_daily_tournaments vdt
LEFT JOIN public.poker_venues v ON v.id = vdt.venue_id

UNION ALL

-- Poker series events
SELECT
    'series'::text                      AS source,
    ps.id::text                         AS native_id,
    ps.venue_name,
    ps.venue_id::text                   AS venue_id,
    ps.id::text                         AS series_id,
    NULL::text                          AS tour_event_id,
    ps.tour_code,
    COALESCE(ps.series_name, ps.short_name) AS event_name,
    NULL::text                          AS start_time,
    COALESCE(ps.main_event_buyin, ps.buy_in_min)::numeric AS buy_in,
    COALESCE(ps.series_type, 'NLH')    AS game_type,
    COALESCE(ps.total_guaranteed, ps.main_event_guaranteed)::numeric AS guaranteed,
    NULL::text                          AS format,
    NULL::text                          AS starting_stack,
    NULL::text                          AS day_of_week,
    ps.start_date::text                 AS specific_date,
    false                               AS is_recurring,
    ps.is_suppressed,
    true                                AS is_active,
    COALESCE(ps.city, v.city)           AS city,
    COALESCE(ps.state, v.state)         AS state,
    v.latitude::numeric                 AS latitude,
    v.longitude::numeric                AS longitude,
    ps.logo_url
FROM public.poker_series ps
LEFT JOIN public.poker_venues v ON v.id = ps.venue_id

UNION ALL

-- Traveling tour stop events
SELECT
    'tour'::text                        AS source,
    tse.id::text                        AS native_id,
    tse.stop_venue                      AS venue_name,
    NULL::text                          AS venue_id,
    NULL::text                          AS series_id,
    tse.id::text                        AS tour_event_id,
    tse.tour_code,
    COALESCE(tse.event_name, tse.stop_name) AS event_name,
    tse.start_time,
    tse.buy_in::numeric                 AS buy_in,
    tse.game_type,
    tse.guarantee::numeric              AS guaranteed,
    NULL::text                          AS format,
    NULL::text                          AS starting_stack,
    NULL::text                          AS day_of_week,
    tse.start_date::text                AS specific_date,
    false                               AS is_recurring,
    false                               AS is_suppressed,
    true                                AS is_active,
    tse.stop_city                       AS city,
    tse.stop_state                      AS state,
    NULL::numeric                       AS latitude,
    NULL::numeric                       AS longitude,
    NULL::text                          AS logo_url
FROM public.tour_stop_events tse;

COMMENT ON VIEW public.unified_events_calendar IS
  'Unified calendar: daily tournaments + series + tour stops. '
  'Recreated 2026-04-22 as SECURITY INVOKER — RLS on all source tables '
  'is now enforced per-caller. Previously had SECURITY DEFINER (risk).';

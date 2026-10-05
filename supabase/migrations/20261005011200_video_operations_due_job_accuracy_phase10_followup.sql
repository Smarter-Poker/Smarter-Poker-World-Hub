-- 20261005011200_video_operations_due_job_accuracy_phase10_followup.sql
-- TIER: 2 — replace the privacy-safe read-only operations snapshot function.
-- WHY: The Phase 10 job table displayed old available_at values as due for
-- running, succeeded, and dead-letter jobs. Only queued/retry jobs are claimable.
-- HOW: Preserve the snapshot contract and count due work only in claimable
-- states; do not alter queue rows or worker behavior.
BEGIN;

DO $preflight$
DECLARE v_overloads integer;
BEGIN
  IF to_regprocedure('public.fn_video_operations_snapshot(integer)') IS NULL THEN
    RAISE EXCEPTION 'preflight: Phase 10 snapshot function is missing';
  END IF;
  SELECT count(*) INTO v_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_video_operations_snapshot';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'preflight: unexpected snapshot function overload count: %', v_overloads;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fn_video_operations_snapshot(p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_hours integer := least(greatest(coalesce(p_window_hours, 24), 1), 168);
  v_since timestamptz;
  v_sources jsonb;
  v_ingestion jsonb;
  v_quota jsonb;
  v_candidates jsonb;
  v_rights jsonb;
  v_cases jsonb;
  v_controls jsonb;
  v_control_history jsonb;
  v_jobs jsonb;
  v_costs jsonb;
  v_delivery jsonb;
  v_learning jsonb;
  v_duplicates jsonb;
  v_topic_leaks bigint;
  v_organic_sessions bigint;
BEGIN
  v_since := clock_timestamp() - make_interval(hours => v_hours);

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.topic, x.lifecycle_status), '[]'::jsonb)
  INTO v_sources FROM (
    SELECT ingest_topic AS topic, lifecycle_status,
      count(*)::bigint AS sources,
      count(*) FILTER (WHERE is_active AND lifecycle_status = 'active')::bigint AS active,
      count(*) FILTER (WHERE is_active AND lifecycle_status = 'active'
        AND coalesce(last_success_at, last_checked_at, created_at)
          < clock_timestamp() - make_interval(mins => greatest(cadence_minutes, 60) * 3))::bigint AS overdue
    FROM public.content_sources
    WHERE kind = 'youtube_channel' AND provider = 'youtube'
    GROUP BY ingest_topic, lifecycle_status
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.topic, x.status, x.failure_class), '[]'::jsonb)
  INTO v_ingestion FROM (
    SELECT topic, status,
      CASE WHEN failure_code IS NULL THEN 'none'
        WHEN failure_code ILIKE '%quota%' THEN 'quota'
        WHEN failure_code ILIKE '%type_check%' OR failure_code ILIKE '%constraint%' THEN 'data_contract'
        WHEN failure_code ILIKE '%youtube_http_404%' OR failure_code ILIKE '%not_found%' THEN 'source_unavailable'
        WHEN failure_code ILIKE '%timeout%' OR failure_code ILIKE '%transport%' THEN 'provider_transport'
        ELSE 'other' END AS failure_class,
      count(*)::bigint AS runs,
      sum(candidates)::bigint AS candidates,
      sum(qualified)::bigint AS qualified,
      sum(inserted)::bigint AS inserted,
      sum(duplicates)::bigint AS duplicates,
      sum(rejected)::bigint AS rejected,
      sum(quota_units)::bigint AS quota_units
    FROM public.video_source_ingestion_runs
    WHERE started_at >= v_since
    GROUP BY topic, status, failure_class
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.usage_date DESC), '[]'::jsonb)
  INTO v_quota FROM (
    SELECT usage_date, units_used, daily_budget,
      greatest(daily_budget - units_used, 0) AS remaining
    FROM public.video_source_quota_usage
    WHERE usage_date >= (v_since AT TIME ZONE 'UTC')::date
    ORDER BY usage_date DESC LIMIT 8
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.topic, x.status), '[]'::jsonb)
  INTO v_candidates FROM (
    SELECT coalesce(topic, 'unknown') AS topic, status, count(*)::bigint AS count,
      count(*) FILTER (WHERE status='published' AND published_at >= v_since)::bigint AS published_in_window,
      count(*) FILTER (WHERE status IN ('proposed','rate_limited')
        AND proposed_at < v_since)::bigint AS stale
    FROM public.video_reel_candidates
    GROUP BY coalesce(topic, 'unknown'), status
  ) x;

  SELECT count(*)::bigint INTO v_topic_leaks
  FROM public.video_reel_candidates c
  JOIN public.video_library_videos v ON v.id = c.video_id
  WHERE (c.topic = 'sports' AND v.type <> 'sports')
     OR (c.topic = 'casino-slots' AND v.type <> 'slots')
     OR (c.topic = 'poker' AND v.type NOT IN ('cash','tournament'));

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.lifecycle_status), '[]'::jsonb)
  INTO v_rights FROM (
    SELECT lifecycle_status, rights_status, count(*)::bigint AS count,
      count(*) FILTER (WHERE revoked_at IS NOT NULL)::bigint AS revoked,
      count(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until < clock_timestamp())::bigint AS expired
    FROM public.video_rights_evidence
    GROUP BY lifecycle_status, rights_status
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.status, x.case_kind), '[]'::jsonb)
  INTO v_cases FROM (
    SELECT status, case_kind, count(*)::bigint AS count
    FROM public.video_moderation_cases
    GROUP BY status, case_kind
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.control_key), '[]'::jsonb)
  INTO v_controls FROM (
    SELECT control_key, enabled, reason, updated_at
    FROM public.video_reels_pipeline_controls
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_control_history FROM (
    SELECT control_key,enabled_before,enabled_after,reason,created_at
    FROM public.video_reels_control_events
    ORDER BY created_at DESC LIMIT 20
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.status), '[]'::jsonb)
  INTO v_jobs FROM (
    SELECT status, job_type, count(*)::bigint AS count,
      count(*) FILTER (WHERE status IN ('queued','retry') AND available_at < clock_timestamp())::bigint AS due
    FROM public.video_enrichment_jobs
    WHERE status IN ('queued','running','retry','dead_letter','succeeded')
      AND (created_at >= v_since OR status IN ('queued','running','retry','dead_letter'))
    GROUP BY status, job_type
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.status), '[]'::jsonb)
  INTO v_costs FROM (
    SELECT status, count(*)::bigint AS renditions,
      coalesce(sum(estimated_cost_cents), 0)::bigint AS estimated_cost_cents,
      coalesce(sum(output_bytes), 0)::numeric AS output_bytes
    FROM public.video_native_renditions
    WHERE created_at >= v_since
    GROUP BY status
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.surface, x.feed_mode), '[]'::jsonb)
  INTO v_delivery FROM (
    SELECT surface, feed_mode, playback_type, count(*)::bigint AS samples,
      round(avg(startup_ms))::integer AS startup_ms_avg,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY startup_ms)::integer AS startup_ms_p95,
      sum(dropped_frames)::bigint AS dropped_frames,
      sum(decoded_frames)::bigint AS decoded_frames,
      round(avg(memory_mb)::numeric, 1) AS memory_mb_avg,
      round(avg(transferred_kb)::numeric, 1) AS transferred_kb_avg,
      round(avg(battery_level)::numeric, 3) AS battery_level_avg,
      count(*) FILTER (WHERE data_saver)::bigint AS data_saver_samples
    FROM public.reels_delivery_metrics
    WHERE measured_at >= v_since
    GROUP BY surface, feed_mode, playback_type
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.event_type, x.discovery_source), '[]'::jsonb)
  INTO v_learning FROM (
    SELECT event_type, coalesce(discovery_source,'unknown') AS discovery_source,
      count(*)::bigint AS events,
      count(DISTINCT session_id)::bigint AS organic_sessions
    FROM public.video_learning_events
    WHERE occurred_at >= v_since
      AND organic_qualified IS TRUE AND rejection_code IS NULL
    GROUP BY event_type, coalesce(discovery_source,'unknown')
  ) x;
  SELECT count(DISTINCT session_id)::bigint INTO v_organic_sessions
  FROM public.video_learning_events
  WHERE occurred_at >= v_since
    AND organic_qualified IS TRUE AND rejection_code IS NULL;

  SELECT jsonb_build_object(
    'duplicateCanonicalKeys', count(*) FILTER (WHERE rows > 1)::bigint,
    'duplicateRows', coalesce(sum(rows - 1) FILTER (WHERE rows > 1), 0)::bigint
  ) INTO v_duplicates
  FROM (
    SELECT canonical_asset_key, count(*) AS rows
    FROM public.social_reels
    WHERE canonical_asset_key IS NOT NULL AND is_public IS TRUE AND is_deleted IS NOT TRUE
    GROUP BY canonical_asset_key
  ) duplicates;

  RETURN jsonb_build_object(
    'generatedAt', clock_timestamp(), 'windowHours', v_hours, 'windowStart', v_since,
    'sources', v_sources, 'ingestion', v_ingestion, 'quota', v_quota,
    'candidates', v_candidates, 'topicLeakCount', v_topic_leaks,
    'rightsEvidence', v_rights, 'moderationCases', v_cases, 'controls', v_controls,
    'controlHistory', v_control_history, 'jobs', v_jobs, 'nativeCosts', v_costs, 'delivery', v_delivery,
    'learningFunnel', v_learning, 'organicSessions', v_organic_sessions,
    'duplicates', v_duplicates
  );
END
$function$;
DO $postflight$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.fn_video_operations_snapshot(integer)'::regprocedure);
  IF position('status IN (''queued'',''retry'') AND available_at < clock_timestamp()' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'postflight: due count does not match claimable queue states';
  END IF;
  IF has_function_privilege('anon', 'public.fn_video_operations_snapshot(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_video_operations_snapshot(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_video_operations_snapshot(integer)', 'EXECUTE')
  THEN RAISE EXCEPTION 'postflight: snapshot function grants changed'; END IF;
END
$postflight$;

COMMIT;

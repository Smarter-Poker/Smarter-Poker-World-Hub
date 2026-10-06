-- 20261006022123_stable_admin_phase11_identity_links.sql
-- Reserved against origin/main and every remote branch.
--
-- I3 is a read-only investigator view over evidence the platform already owns.
-- Raw IP addresses, device identifiers, fingerprints, email addresses and user
-- agents never leave this function. A shared network is correlation, not a
-- verdict, and the response says how complete and current every source is.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_identity_links(
  p_include_horses boolean DEFAULT true,
  p_since          timestamptz DEFAULT now() - interval '90 days',
  p_as_of          timestamptz DEFAULT now(),
  p_limit          integer DEFAULT 25,
  p_cursor         jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $fn$
DECLARE
  v_as_of       timestamptz := least(coalesce(p_as_of, now()), now());
  v_since       timestamptz := coalesce(p_since, now() - interval '90 days');
  v_limit       integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_include     boolean := coalesce(p_include_horses, true);
  v_rows        jsonb;
  v_total       bigint;
  v_next        jsonb;
  v_coverage    jsonb;
  v_evidence    bigint;
BEGIN
  IF v_since > v_as_of OR v_since < v_as_of - interval '365 days' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'INVALID_WINDOW',
      'message', 'The identity evidence window must be between one instant and 365 days',
      'state', 'unknown');
  END IF;

  IF p_cursor IS NOT NULL AND NOT (p_cursor ?& array[
    'evidence_weight', 'shared_signal_count', 'evidence_occurrences',
    'last_seen', 'player_a_id', 'player_b_id'
  ]) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'INVALID_CURSOR',
      'message', 'The identity link cursor is incomplete', 'state', 'unknown');
  END IF;

  SELECT jsonb_build_array((
    SELECT jsonb_build_object(
      'source', 'auth_sessions',
      'label', 'Authentication Sessions',
      'capture_scope', 'Supabase Authentication Sessions',
      'state', CASE
        WHEN count(*) = 0 THEN 'nothing_produced'
        WHEN max(coalesce(s.updated_at, s.created_at)) < v_as_of - interval '7 days' THEN 'stale'
        ELSE 'producing' END,
      'rows', count(*),
      'users', count(DISTINCT s.user_id),
      'latest_at', max(coalesce(s.updated_at, s.created_at)))
    FROM auth.sessions s
    WHERE s.user_id IS NOT NULL AND s.ip IS NOT NULL
      AND coalesce(s.updated_at, s.created_at) >= v_since
      AND coalesce(s.updated_at, s.created_at) <= v_as_of
  )) || jsonb_build_array((
    SELECT jsonb_build_object(
      'source', 'tracked_sessions',
      'label', 'Tracked Device Sessions',
      'capture_scope', 'Settings Session Tracking Only',
      'state', CASE
        WHEN count(*) = 0 THEN 'nothing_produced'
        WHEN max(coalesce(s.last_active, s.created_at)) < v_as_of - interval '7 days' THEN 'stale'
        ELSE 'producing' END,
      'rows', count(*),
      'users', count(DISTINCT s.user_id),
      'latest_at', max(coalesce(s.last_active, s.created_at)))
    FROM public.user_sessions s
    WHERE s.user_id IS NOT NULL AND s.ip_address IS NOT NULL
      AND coalesce(s.last_active, s.created_at) >= v_since
      AND coalesce(s.last_active, s.created_at) <= v_as_of
  )) || jsonb_build_array((
    SELECT jsonb_build_object(
      'source', 'signup_abuse',
      'label', 'Signup Abuse Evidence',
      'capture_scope', 'Signup Abuse Log',
      'state', CASE
        WHEN count(*) = 0 THEN 'nothing_produced'
        WHEN max(coalesce(s.last_signup_at, s.first_signup_at)) < v_as_of - interval '7 days' THEN 'stale'
        ELSE 'producing' END,
      'rows', count(*),
      'users', count(DISTINCT s.user_id),
      'latest_at', max(coalesce(s.last_signup_at, s.first_signup_at)))
    FROM public.signup_abuse_log s
    WHERE s.user_id IS NOT NULL
      AND coalesce(s.last_signup_at, s.first_signup_at) >= v_since
      AND coalesce(s.last_signup_at, s.first_signup_at) <= v_as_of
      AND (s.ip_address IS NOT NULL OR nullif(btrim(s.device_fingerprint), '') IS NOT NULL)
  )) || jsonb_build_array((
    SELECT jsonb_build_object(
      'source', 'registered_devices',
      'label', 'Registered Devices',
      'capture_scope', 'Device Registration Records',
      'state', CASE
        WHEN count(*) = 0 THEN 'nothing_produced'
        WHEN max(coalesce(d.last_active, d.created_at)) < v_as_of - interval '7 days' THEN 'stale'
        ELSE 'producing' END,
      'rows', count(*),
      'users', count(DISTINCT d.user_id),
      'latest_at', max(coalesce(d.last_active, d.created_at)))
    FROM public.user_devices d
    WHERE d.user_id IS NOT NULL AND nullif(btrim(d.device_id), '') IS NOT NULL
      AND coalesce(d.last_active, d.created_at) >= v_since
      AND coalesce(d.last_active, d.created_at) <= v_as_of
  )) INTO v_coverage;

  WITH evidence AS MATERIALIZED (
    SELECT 'auth_sessions'::text AS source, 'shared_ip'::text AS evidence_kind,
           s.user_id, host(s.ip)::text AS evidence_value,
           min(s.created_at) AS first_seen,
           max(coalesce(s.updated_at, s.created_at)) AS last_seen,
           count(*)::bigint AS occurrences
    FROM auth.sessions s
    WHERE s.user_id IS NOT NULL AND s.ip IS NOT NULL
      AND coalesce(s.updated_at, s.created_at) >= v_since
      AND coalesce(s.updated_at, s.created_at) <= v_as_of
    GROUP BY s.user_id, host(s.ip)
    UNION ALL
    SELECT 'tracked_sessions', 'shared_ip', s.user_id, btrim(s.ip_address::text),
           min(s.created_at), max(coalesce(s.last_active, s.created_at)), count(*)::bigint
    FROM public.user_sessions s
    WHERE s.user_id IS NOT NULL AND s.ip_address IS NOT NULL
      AND coalesce(s.last_active, s.created_at) >= v_since
      AND coalesce(s.last_active, s.created_at) <= v_as_of
    GROUP BY s.user_id, btrim(s.ip_address::text)
    UNION ALL
    SELECT 'signup_abuse', 'shared_ip', s.user_id, btrim(s.ip_address::text),
           min(coalesce(s.first_signup_at, s.last_signup_at)),
           max(coalesce(s.last_signup_at, s.first_signup_at)), count(*)::bigint
    FROM public.signup_abuse_log s
    WHERE s.user_id IS NOT NULL AND s.ip_address IS NOT NULL
      AND btrim(s.ip_address::text) NOT IN ('', 'unknown')
      AND coalesce(s.last_signup_at, s.first_signup_at) >= v_since
      AND coalesce(s.last_signup_at, s.first_signup_at) <= v_as_of
    GROUP BY s.user_id, btrim(s.ip_address::text)
    UNION ALL
    SELECT 'signup_abuse', 'device_fingerprint', s.user_id, btrim(s.device_fingerprint),
           min(coalesce(s.first_signup_at, s.last_signup_at)),
           max(coalesce(s.last_signup_at, s.first_signup_at)), count(*)::bigint
    FROM public.signup_abuse_log s
    WHERE s.user_id IS NOT NULL AND nullif(btrim(s.device_fingerprint), '') IS NOT NULL
      AND coalesce(s.last_signup_at, s.first_signup_at) >= v_since
      AND coalesce(s.last_signup_at, s.first_signup_at) <= v_as_of
    GROUP BY s.user_id, btrim(s.device_fingerprint)
    UNION ALL
    SELECT 'registered_devices', 'registered_device', d.user_id, btrim(d.device_id),
           min(d.created_at), max(coalesce(d.last_active, d.created_at)), count(*)::bigint
    FROM public.user_devices d
    WHERE d.user_id IS NOT NULL AND nullif(btrim(d.device_id), '') IS NOT NULL
      AND coalesce(d.last_active, d.created_at) >= v_since
      AND coalesce(d.last_active, d.created_at) <= v_as_of
    GROUP BY d.user_id, btrim(d.device_id)
  ), identities AS MATERIALIZED (
    SELECT user_id, evidence_kind, evidence_value,
           array_agg(DISTINCT source ORDER BY source) AS sources,
           min(first_seen) AS first_seen, max(last_seen) AS last_seen,
           sum(occurrences)::bigint AS occurrences
    FROM evidence
    WHERE nullif(evidence_value, '') IS NOT NULL
    GROUP BY user_id, evidence_kind, evidence_value
  ), cardinality AS MATERIALIZED (
    SELECT evidence_kind, evidence_value, count(DISTINCT user_id)::integer AS linked_users
    FROM identities GROUP BY evidence_kind, evidence_value
  ), pair_signals AS MATERIALIZED (
    SELECT a.user_id AS player_a_id, b.user_id AS player_b_id,
           a.evidence_kind,
           CASE a.evidence_kind
             WHEN 'device_fingerprint' THEN 400
             WHEN 'registered_device' THEN 300
             ELSE 100 END AS evidence_weight,
           least(a.first_seen, b.first_seen) AS first_seen,
           greatest(a.last_seen, b.last_seen) AS last_seen,
           (a.occurrences + b.occurrences)::bigint AS occurrences,
           c.linked_users,
           ARRAY(SELECT DISTINCT x FROM unnest(a.sources || b.sources) x ORDER BY x) AS sources
    FROM identities a
    JOIN identities b
      ON b.evidence_kind = a.evidence_kind
     AND b.evidence_value = a.evidence_value
     AND b.user_id > a.user_id
    JOIN cardinality c
      ON c.evidence_kind = a.evidence_kind AND c.evidence_value = a.evidence_value
  ), pair_base AS MATERIALIZED (
    SELECT player_a_id, player_b_id,
           max(evidence_weight)::integer AS evidence_weight,
           count(*)::integer AS shared_signal_count,
           sum(occurrences)::bigint AS evidence_occurrences,
           max(linked_users)::integer AS largest_shared_network,
           min(first_seen) AS first_seen,
           max(last_seen) AS last_seen,
           array_agg(DISTINCT evidence_kind ORDER BY evidence_kind) AS evidence_types
    FROM pair_signals
    GROUP BY player_a_id, player_b_id
  ), ranked AS MATERIALIZED (
    SELECT b.*,
           ARRAY(
             SELECT DISTINCT source_name
             FROM pair_signals ps
             CROSS JOIN LATERAL unnest(ps.sources) source_name
             WHERE ps.player_a_id = b.player_a_id AND ps.player_b_id = b.player_b_id
             ORDER BY source_name
           ) AS sources,
           coalesce(pa.display_name, pa.username, b.player_a_id::text) AS player_a_name,
           coalesce(pb.display_name, pb.username, b.player_b_id::text) AS player_b_name,
           coalesce(pa.is_horse, false) AS player_a_is_horse,
           coalesce(pb.is_horse, false) AS player_b_is_horse
    FROM pair_base b
    LEFT JOIN public.profiles pa ON pa.id = b.player_a_id
    LEFT JOIN public.profiles pb ON pb.id = b.player_b_id
    WHERE v_include OR (NOT coalesce(pa.is_horse, false) AND NOT coalesce(pb.is_horse, false))
  ), selected AS MATERIALIZED (
    SELECT r.*
    FROM ranked r
    WHERE p_cursor IS NULL OR
      ROW(r.evidence_weight, r.shared_signal_count, r.evidence_occurrences, r.last_seen) < ROW(
        (p_cursor ->> 'evidence_weight')::integer,
        (p_cursor ->> 'shared_signal_count')::integer,
        (p_cursor ->> 'evidence_occurrences')::bigint,
        (p_cursor ->> 'last_seen')::timestamptz)
      OR (
        ROW(r.evidence_weight, r.shared_signal_count, r.evidence_occurrences, r.last_seen) = ROW(
          (p_cursor ->> 'evidence_weight')::integer,
          (p_cursor ->> 'shared_signal_count')::integer,
          (p_cursor ->> 'evidence_occurrences')::bigint,
          (p_cursor ->> 'last_seen')::timestamptz)
        AND ROW(r.player_a_id, r.player_b_id) > ROW(
          (p_cursor ->> 'player_a_id')::uuid,
          (p_cursor ->> 'player_b_id')::uuid)
      )
  ), page AS MATERIALIZED (
    SELECT s.*, row_number() OVER (
      ORDER BY evidence_weight DESC, shared_signal_count DESC,
               evidence_occurrences DESC, last_seen DESC,
               player_a_id ASC, player_b_id ASC) AS rn
    FROM selected s
    ORDER BY evidence_weight DESC, shared_signal_count DESC,
             evidence_occurrences DESC, last_seen DESC,
             player_a_id ASC, player_b_id ASC
    LIMIT v_limit + 1
  )
  SELECT
    coalesce(jsonb_agg((to_jsonb(p) - 'rn') ORDER BY p.rn)
      FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
    (SELECT count(*)::bigint FROM ranked),
    CASE WHEN count(*) > v_limit THEN (
      SELECT jsonb_build_object(
        'evidence_weight', z.evidence_weight,
        'shared_signal_count', z.shared_signal_count,
        'evidence_occurrences', z.evidence_occurrences,
        'last_seen', z.last_seen,
        'player_a_id', z.player_a_id,
        'player_b_id', z.player_b_id)
      FROM page z WHERE z.rn = v_limit) END,
    (SELECT count(*)::bigint FROM identities)
  INTO v_rows, v_total, v_next, v_evidence
  FROM page p;

  RETURN jsonb_build_object(
    'ok', true,
    'state', CASE
      WHEN v_total > 0 THEN 'review_available'
      WHEN v_evidence > 0 THEN 'nothing_to_review'
      ELSE 'nothing_produced' END,
    'links', v_rows,
    'rows', v_rows,
    'total', v_total,
    'next_cursor', v_next,
    'has_more', v_next IS NOT NULL,
    'coverage', v_coverage,
    'since', v_since,
    'as_of', v_as_of,
    'measured_at', clock_timestamp(),
    'disclosure', 'Shared identity evidence is correlation for human review, never a verdict. Raw identifiers are withheld.');
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object(
    'ok', false, 'code', 'INVALID_CURSOR',
    'message', 'The identity link cursor is invalid', 'state', 'unknown');
WHEN OTHERS THEN
  RAISE NOTICE 'fn_ca_integrity_identity_links source error: %', SQLERRM;
  RETURN jsonb_build_object(
    'ok', false, 'code', 'IDENTITY_LINK_SOURCE_ERROR',
    'message', 'The identity evidence sources could not be read', 'state', 'unknown');
END;
$fn$;

ALTER FUNCTION public.fn_ca_integrity_identity_links(boolean, timestamptz, timestamptz, integer, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_identity_links(boolean, timestamptz, timestamptz, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_identity_links(boolean, timestamptz, timestamptz, integer, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.fn_ca_integrity_identity_links(boolean, timestamptz, timestamptz, integer, jsonb) IS
  'Bounded, cursor-paged multi-accounting correlation. Returns pair summaries and per-source coverage, never raw IP, device, fingerprint, email or user-agent values. Includes horses by default.';

DO $assert$
BEGIN
  IF to_regprocedure('public.fn_ca_integrity_identity_links(boolean,timestamp with time zone,timestamp with time zone,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: fn_ca_integrity_identity_links is missing';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ca_integrity_identity_links(boolean,timestamp with time zone,timestamp with time zone,integer,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ca_integrity_identity_links(boolean,timestamp with time zone,timestamp with time zone,integer,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_ca_integrity_identity_links(boolean,timestamp with time zone,timestamp with time zone,integer,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: identity links execute grants are not service-role only';
  END IF;
END;
$assert$;

COMMIT;

-- ============================================================================
-- 20261005120500_trivia_p7_competitive_read_boundaries.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Phase 7
-- AFFECTS:     trivia tournament read RPCs; PvP quote RPC; execute grants
-- IRREVERSIBLE: no
--
-- WHY:
--   The Phase 6 field, bracket, match and results RPCs did not receive the
--   verified viewer id. Because the HTTP layer invokes them with service_role,
--   possession of a private canary tournament UUID was enough to read it.
--   Phase 7 also needs an authoritative, pre-commit PvP quote rather than UI
--   arithmetic copied from the rules contract.
--
-- HOW:
--   Add one fail-closed tournament visibility predicate and v2, viewer-aware
--   read RPCs; remove service_role execution from the unscoped v1 reads; and
--   expose a user-scoped PvP quote derived from the live rules registry.
-- ============================================================================

BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.trivia_tournaments') IS NULL
       OR to_regclass('public.trivia_tournament_canary_access') IS NULL
       OR to_regclass('public.profiles') IS NULL
       OR to_regclass('public.trivia_rules_versions') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 preflight: required relations are missing';
    END IF;
    IF to_regprocedure('public.trivia_tournament_field_v1(uuid,integer,integer,text,text)') IS NULL
       OR to_regprocedure('public.trivia_tournament_bracket_v1(uuid,integer,integer,integer)') IS NULL
       OR to_regprocedure('public.trivia_tournament_match_v1(uuid,uuid)') IS NULL
       OR to_regprocedure('public.trivia_tournament_results_v1(uuid,integer,integer,text)') IS NULL
       OR to_regprocedure('public.trivia_rules_current(text)') IS NULL
       OR to_regprocedure('public.trivia_rules_pvp_money(text,integer)') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 preflight: Phase 2, 5 or 6 functions are missing';
    END IF;
    IF to_regprocedure('public.trivia_tournament_field_v2(uuid,uuid,integer,integer,text,text)') IS NOT NULL
       OR to_regprocedure('public.trivia_tournament_bracket_v2(uuid,uuid,integer,integer,integer)') IS NOT NULL
       OR to_regprocedure('public.trivia_tournament_match_v2(uuid,uuid,uuid)') IS NOT NULL
       OR to_regprocedure('public.trivia_tournament_results_v2(uuid,uuid,integer,integer,text)') IS NOT NULL
       OR to_regprocedure('public.trivia_pvp_quote_v2(uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'trivia p7 preflight: a target function already exists';
    END IF;
END
$preflight$;

CREATE FUNCTION public.trivia_tournament_visible_v1(
    p_tournament_id uuid,
    p_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_tournaments AS t
         WHERE t.id = p_tournament_id
           AND t.engine_version IS NOT NULL
           AND (
                t.schedule_kind = 'public_nightly'
                OR EXISTS (
                    SELECT 1
                      FROM public.trivia_tournament_canary_access AS a
                     WHERE a.tournament_id = t.id
                       AND a.user_id = p_user_id
                )
           )
    )
$$;

CREATE FUNCTION public.trivia_tournament_field_v2(
    p_tournament_id uuid,
    p_user_id uuid DEFAULT NULL,
    p_offset integer DEFAULT 0,
    p_limit integer DEFAULT 50,
    p_search text DEFAULT NULL,
    p_kind text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN NOT public.trivia_tournament_visible_v1(p_tournament_id, p_user_id)
            THEN jsonb_build_object('success', false, 'error', 'tournament_not_found')
        ELSE public.trivia_tournament_field_v1(
            p_tournament_id, p_offset, p_limit, p_search, p_kind)
    END
$$;

CREATE FUNCTION public.trivia_tournament_bracket_v2(
    p_tournament_id uuid,
    p_user_id uuid DEFAULT NULL,
    p_round integer DEFAULT 1,
    p_offset integer DEFAULT 0,
    p_limit integer DEFAULT 64
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN NOT public.trivia_tournament_visible_v1(p_tournament_id, p_user_id)
            THEN jsonb_build_object('success', false, 'error', 'tournament_not_found')
        ELSE public.trivia_tournament_bracket_v1(
            p_tournament_id, p_round, p_offset, p_limit)
    END
$$;

CREATE FUNCTION public.trivia_tournament_match_v2(
    p_tournament_id uuid,
    p_matchup_id uuid,
    p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN NOT public.trivia_tournament_visible_v1(p_tournament_id, p_user_id)
            THEN jsonb_build_object('success', false, 'error', 'tournament_not_found')
        ELSE public.trivia_tournament_match_v1(p_tournament_id, p_matchup_id)
    END
$$;

CREATE FUNCTION public.trivia_tournament_results_v2(
    p_tournament_id uuid,
    p_user_id uuid DEFAULT NULL,
    p_offset integer DEFAULT 0,
    p_limit integer DEFAULT 50,
    p_kind text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN NOT public.trivia_tournament_visible_v1(p_tournament_id, p_user_id)
            THEN jsonb_build_object('success', false, 'error', 'tournament_not_found')
        ELSE public.trivia_tournament_results_v1(
            p_tournament_id, p_offset, p_limit, p_kind)
    END
$$;

CREATE FUNCTION public.trivia_pvp_quote_v2(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rules jsonb;
    v_rule_body jsonb;
    v_balance bigint;
    v_stakes jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;

    SELECT COALESCE(p.diamonds, 0)::bigint
      INTO v_balance
      FROM public.profiles AS p
     WHERE p.id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    v_rules := public.trivia_rules_current('pvp.standard');
    v_rule_body := v_rules -> 'rules';
    IF v_rules ->> 'id' IS NULL
       OR jsonb_typeof(v_rule_body -> 'stakes') IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'stake', x.stake,
               'pot', (m.money ->> 'pot')::integer,
               'rake', (m.money ->> 'rake')::integer,
               'possibleReturn', (m.money ->> 'winner_payout')::integer,
               'netWin', (m.money ->> 'winner_payout')::integer - x.stake
           ) ORDER BY x.stake), '[]'::jsonb)
      INTO v_stakes
      FROM (
          SELECT value::integer AS stake
            FROM jsonb_array_elements_text(v_rule_body -> 'stakes')
      ) AS x
      CROSS JOIN LATERAL (
          SELECT public.trivia_rules_pvp_money(v_rules ->> 'id', x.stake) AS money
      ) AS m;

    RETURN jsonb_build_object(
        'success', true,
        'engine', 'pvp-v2',
        'serverNow', clock_timestamp(),
        'balance', v_balance,
        'rulesVersion', v_rules ->> 'id',
        'stakes', v_stakes,
        'questionCount', COALESCE((v_rule_body -> 'questions' ->> 'count')::integer, 20),
        'humanFirst', COALESCE((v_rule_body -> 'horse' ->> 'human_first')::boolean, true),
        'horseWaitSeconds', jsonb_build_object(
            'min', COALESCE((v_rule_body -> 'horse' -> 'fallback_wait_seconds' ->> 'min')::integer, 20),
            'max', COALESCE((v_rule_body -> 'horse' -> 'fallback_wait_seconds' ->> 'max')::integer, 45)),
        'horseLabel', COALESCE(v_rule_body -> 'horse' ->> 'disclosure', 'Smarter Horse'),
        'cancellation', 'search_only_before_match',
        'tie', 'stake_refund'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.trivia_tournament_visible_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_field_v1(uuid, integer, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_bracket_v1(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_match_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_results_v1(uuid, integer, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_field_v2(uuid, uuid, integer, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_bracket_v2(uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_match_v2(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_results_v2(uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp_quote_v2(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.trivia_tournament_field_v2(uuid, uuid, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_bracket_v2(uuid, uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_match_v2(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_tournament_results_v2(uuid, uuid, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_pvp_quote_v2(uuid) TO service_role;

COMMENT ON FUNCTION public.trivia_tournament_visible_v1(uuid, uuid) IS
    'Fail-closed Phase 7 public-nightly or viewer-canary visibility predicate. Owner-only helper.';
COMMENT ON FUNCTION public.trivia_pvp_quote_v2(uuid) IS
    'Phase 7 pre-commit PvP balance and economics quote derived from the active immutable rules version.';

DO $postcondition$
DECLARE
    v_service oid := (SELECT oid FROM pg_roles WHERE rolname = 'service_role');
BEGIN
    IF to_regprocedure('public.trivia_tournament_field_v2(uuid,uuid,integer,integer,text,text)') IS NULL
       OR to_regprocedure('public.trivia_tournament_bracket_v2(uuid,uuid,integer,integer,integer)') IS NULL
       OR to_regprocedure('public.trivia_tournament_match_v2(uuid,uuid,uuid)') IS NULL
       OR to_regprocedure('public.trivia_tournament_results_v2(uuid,uuid,integer,integer,text)') IS NULL
       OR to_regprocedure('public.trivia_pvp_quote_v2(uuid)') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 postcondition: a scoped function is missing';
    END IF;
    IF has_function_privilege('service_role', 'public.trivia_tournament_field_v1(uuid,integer,integer,text,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_tournament_bracket_v1(uuid,integer,integer,integer)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_tournament_match_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_tournament_results_v1(uuid,integer,integer,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia p7 postcondition: an unscoped v1 read remains executable';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.trivia_tournament_field_v2(uuid,uuid,integer,integer,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_tournament_bracket_v2(uuid,uuid,integer,integer,integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_tournament_match_v2(uuid,uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_tournament_results_v2(uuid,uuid,integer,integer,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_pvp_quote_v2(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia p7 postcondition: service_role grant is missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('trivia_tournament_visible_v1', 'trivia_tournament_field_v2',
               'trivia_tournament_bracket_v2', 'trivia_tournament_match_v2',
               'trivia_tournament_results_v2', 'trivia_pvp_quote_v2')
           AND NOT ('search_path=""' = ANY(COALESCE(p.proconfig, ARRAY[]::text[])))
    ) THEN
        RAISE EXCEPTION 'trivia p7 postcondition: a definer function lacks the empty search_path';
    END IF;
END
$postcondition$;

COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3: apply these statements in a NEW migration)
-- ============================================================================
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.trivia_tournament_field_v1(uuid, integer, integer, text, text) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_tournament_bracket_v1(uuid, integer, integer, integer) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_tournament_match_v1(uuid, uuid) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_tournament_results_v1(uuid, integer, integer, text) TO service_role;
-- DROP FUNCTION public.trivia_tournament_field_v2(uuid, uuid, integer, integer, text, text);
-- DROP FUNCTION public.trivia_tournament_bracket_v2(uuid, uuid, integer, integer, integer);
-- DROP FUNCTION public.trivia_tournament_match_v2(uuid, uuid, uuid);
-- DROP FUNCTION public.trivia_tournament_results_v2(uuid, uuid, integer, integer, text);
-- DROP FUNCTION public.trivia_pvp_quote_v2(uuid);
-- DROP FUNCTION public.trivia_tournament_visible_v1(uuid, uuid);
-- COMMIT;

-- ============================================================================
-- 20261005122000_trivia_p7_pvp_quote_join_binding.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Phase 7 competitive contract lane
-- AFFECTS:     public.trivia_pvp_quote_v3, public.trivia_pvp_join_v3,
--              public.trivia_pvp__join_core_v3, PvP service-role RPC grants
-- IRREVERSIBLE: no
--
-- WHY:
--   The first Phase 7 quote returned the current immutable rules id, but join
--   did not accept it. A rules activation between quote and join could
--   therefore create a ticket under economics the player had not confirmed.
--   The quote also omitted the database join and horse switches, so a client
--   could present an entry or horse fallback that the authoritative database
--   had paused. This migration binds every new join to its exact quoted rules
--   version before any ticket, match or escrow mutation and exposes the two
--   database capabilities in the quote.
--
-- HOW:
--   - Adds a v3 quote with authoritative joinsEnabled and DB-effective
--     horseFallbackEnabled fields.
--   - Adds a v3 join core that locks and compares the current immutable rules
--     pointer before inserting a ticket, then uses that captured version for
--     the entire transaction.
--   - Preserves idempotent retries and recovery only when the expected version
--     equals the already-stored ticket or match version.
--   - Removes service-role access to the superseded unbound v2 quote/join and
--     grants only the v3 public entry points.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(name ORDER BY name)
      INTO v_missing
      FROM (VALUES
          ('public.profiles'),
          ('public.trivia_pvp_active_seats'),
          ('public.trivia_pvp_engine_config'),
          ('public.trivia_pvp_matches'),
          ('public.trivia_pvp_queue'),
          ('public.trivia_rules_current'),
          ('public.trivia_rules_versions')
      ) AS required(name)
     WHERE to_regclass(name) IS NULL;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding preflight: missing relations %', v_missing;
    END IF;

    IF to_regprocedure('public.trivia_pvp_quote_v2(uuid)') IS NULL
       OR to_regprocedure('public.trivia_pvp_join_v2(uuid,integer,uuid,boolean)') IS NULL
       OR to_regprocedure('public.trivia_pvp__status_core(uuid,uuid,boolean,timestamp with time zone)') IS NULL
       OR to_regprocedure('public.trivia_pvp__try_match(uuid,boolean,timestamp with time zone)') IS NULL
       OR to_regprocedure('public.trivia_pvp__user_lock(uuid)') IS NULL
       OR to_regprocedure('public.trivia_pvp__bucket_lock(integer,text)') IS NULL
       OR to_regprocedure('public.trivia_pvp__draw_wait_seconds()') IS NULL
       OR to_regprocedure('public.trivia_rules_get(text)') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding preflight: required Phase 2/5/7 functions are missing';
    END IF;

    IF to_regprocedure('public.trivia_pvp_quote_v3(uuid)') IS NOT NULL
       OR to_regprocedure('public.trivia_pvp_join_v3(uuid,integer,uuid,boolean,text)') IS NOT NULL
       OR to_regprocedure('public.trivia_pvp__join_core_v3(uuid,integer,uuid,boolean,text,timestamp with time zone,integer)') IS NOT NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding preflight: a v3 target already exists';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.trivia_pvp_engine_config WHERE id = 1) THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding preflight: engine config row 1 is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM public.trivia_rules_current AS c
          JOIN public.trivia_rules_versions AS v ON v.id = c.rules_version_id
         WHERE c.rules_key = 'pvp.standard'
           AND v.rules_key = c.rules_key
           AND v.family = 'pvp'
    ) THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding preflight: current pvp.standard rules are missing';
    END IF;
END
$preflight$;

-- 2. AUTHORITATIVE QUOTE
CREATE FUNCTION public.trivia_pvp_quote_v3(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_rules jsonb;
    v_rule_body jsonb;
    v_balance bigint;
    v_stakes jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;

    SELECT *
      INTO v_cfg
      FROM public.trivia_pvp_engine_config
     WHERE id = 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_configuration_unavailable');
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
        'serverNow', statement_timestamp(),
        'balance', v_balance,
        'rulesVersion', v_rules ->> 'id',
        'joinsEnabled', v_cfg.joins_enabled,
        -- This is database-effective capability. The server-only release flag
        -- is applied by the API before the browser sees the final value.
        'horseFallbackEnabled', v_cfg.joins_enabled AND v_cfg.horses_enabled,
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
$function$;

-- 3. QUOTE-BOUND JOIN CORE
CREATE FUNCTION public.trivia_pvp__join_core_v3(
    p_user_id uuid,
    p_stake integer,
    p_client_nonce uuid,
    p_horses_allowed boolean,
    p_expected_rules_version text,
    p_now timestamptz DEFAULT NULL,
    p_wait_seconds integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_ticket public.trivia_pvp_queue%ROWTYPE;
    v_rules jsonb;
    v_rules_version text;
    v_existing_rules_version text;
    v_wait integer;
    v_now timestamptz;
    v_available bigint;
    v_effective_horses boolean;
BEGIN
    IF p_user_id IS NULL OR p_client_nonce IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    IF p_stake IS NULL OR p_stake NOT IN (10, 25, 50, 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;
    IF p_expected_rules_version IS NULL
       OR p_expected_rules_version !~ '^pvp\.standard@[1-9][0-9]*$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_rules_version');
    END IF;
    IF p_wait_seconds IS NOT NULL AND p_wait_seconds NOT BETWEEN 20 AND 45 THEN
        RAISE EXCEPTION 'horse wait must be 20..45 seconds';
    END IF;

    -- Serializes every user join/retry. This advisory lock changes no state.
    PERFORM public.trivia_pvp__user_lock(p_user_id);

    -- A replay is valid only for the exact rules quote already stored on that
    -- ticket. This keeps idempotency across a later global rules activation.
    SELECT *
      INTO v_ticket
      FROM public.trivia_pvp_queue
     WHERE user_id = p_user_id
       AND client_nonce = p_client_nonce;
    IF FOUND THEN
        IF v_ticket.rules_version_id IS DISTINCT FROM p_expected_rules_version THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'rules_quote_stale',
                'quotedRulesVersion', p_expected_rules_version,
                'storedRulesVersion', v_ticket.rules_version_id);
        END IF;
        PERFORM public.trivia_pvp__log(
            v_ticket.match_id, v_ticket.id, p_user_id, 'human',
            'ticket_join_replayed', jsonb_build_object('status', v_ticket.status),
            COALESCE(p_now, clock_timestamp()));
        RETURN public.trivia_pvp__status_core(
            p_user_id, v_ticket.id, p_horses_allowed, p_now)
            || jsonb_build_object('join', 'replayed');
    END IF;

    -- A join request can recover an existing match, but it cannot use a quote
    -- for different rules to drive that match's next state transition.
    SELECT m.rules_version_id
      INTO v_existing_rules_version
      FROM public.trivia_pvp_active_seats AS s
      JOIN public.trivia_pvp_matches AS m ON m.id = s.match_id
     WHERE s.user_id = p_user_id;
    IF FOUND THEN
        IF v_existing_rules_version IS DISTINCT FROM p_expected_rules_version THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'rules_quote_stale',
                'quotedRulesVersion', p_expected_rules_version,
                'storedRulesVersion', v_existing_rules_version);
        END IF;
        RETURN public.trivia_pvp__status_core(p_user_id, NULL, p_horses_allowed, p_now)
            || jsonb_build_object('join', 'already_in_match');
    END IF;

    -- A second tab adopts the one durable waiting ticket only when it presents
    -- that ticket's rules version. It never creates a second entry.
    SELECT *
      INTO v_ticket
      FROM public.trivia_pvp_queue
     WHERE user_id = p_user_id
       AND status = 'waiting';
    IF FOUND THEN
        IF v_ticket.engine_version IS DISTINCT FROM 'pvp-v2' THEN
            RETURN jsonb_build_object('success', false, 'error', 'legacy_ticket_present');
        END IF;
        IF v_ticket.rules_version_id IS DISTINCT FROM p_expected_rules_version THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'rules_quote_stale',
                'quotedRulesVersion', p_expected_rules_version,
                'storedRulesVersion', v_ticket.rules_version_id);
        END IF;
        PERFORM public.trivia_pvp__log(
            NULL, v_ticket.id, p_user_id, 'human', 'ticket_join_adopted',
            jsonb_build_object('requested_stake', p_stake),
            COALESCE(p_now, clock_timestamp()));
        RETURN public.trivia_pvp__status_core(
            p_user_id, v_ticket.id, p_horses_allowed, p_now)
            || jsonb_build_object(
                'join', 'already_searching',
                'stake_mismatch', v_ticket.stake_amount <> p_stake);
    END IF;

    -- Lock both mutable pointers for the rest of this transaction. The rules
    -- document itself is immutable, so the captured id owns all economics
    -- below even if an operator attempts to activate another version.
    SELECT c.rules_version_id
      INTO v_rules_version
      FROM public.trivia_rules_current AS c
     WHERE c.rules_key = 'pvp.standard'
     FOR SHARE OF c;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;
    IF v_rules_version IS DISTINCT FROM p_expected_rules_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'rules_quote_stale',
            'quotedRulesVersion', p_expected_rules_version,
            'currentRulesVersion', v_rules_version);
    END IF;

    SELECT *
      INTO v_cfg
      FROM public.trivia_pvp_engine_config
     WHERE id = 1
     FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_configuration_unavailable');
    END IF;
    IF NOT v_cfg.joins_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_joins_paused');
    END IF;

    v_rules := public.trivia_rules_get(v_rules_version);
    IF v_rules ->> 'id' IS DISTINCT FROM v_rules_version
       OR jsonb_typeof(v_rules -> 'rules' -> 'stakes') IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;
    IF NOT ((v_rules -> 'rules' -> 'stakes') @> to_jsonb(p_stake)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;

    -- Pre-check only. No Diamonds move until both seats are escrowed by the
    -- match creation authority later in this same transaction.
    SELECT COALESCE(p.diamonds, 0)
      INTO v_available
      FROM public.profiles AS p
     WHERE p.id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;
    IF v_available < p_stake THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds');
    END IF;

    v_wait := COALESCE(p_wait_seconds, public.trivia_pvp__draw_wait_seconds());
    v_effective_horses := COALESCE(p_horses_allowed, false) AND v_cfg.horses_enabled;
    PERFORM public.trivia_pvp__bucket_lock(p_stake, v_rules_version);
    v_now := COALESCE(p_now, clock_timestamp());
    PERFORM set_config('trivia_pvp.v2_authority', 'ticket:' || p_user_id::text, true);
    INSERT INTO public.trivia_pvp_queue (
        user_id, stake_amount, status, expires_at, created_at,
        engine_version, client_nonce, rules_version_id, joined_at,
        heartbeat_at, lease_expires_at, horse_wait_seconds, horse_eligible_at, updated_at
    ) VALUES (
        p_user_id, p_stake, 'waiting',
        v_now + make_interval(secs => GREATEST(v_cfg.max_search_seconds, v_wait + 30)), v_now,
        'pvp-v2', p_client_nonce, v_rules_version, v_now,
        v_now, v_now + make_interval(secs => v_cfg.lease_seconds), v_wait,
        v_now + make_interval(secs => v_wait), v_now
    ) RETURNING * INTO v_ticket;
    PERFORM set_config('trivia_pvp.v2_authority', '', true);

    PERFORM public.trivia_pvp__log(
        NULL, v_ticket.id, p_user_id, 'human', 'ticket_joined',
        jsonb_build_object(
            'stake', p_stake,
            'rules_version_id', v_rules_version,
            'quoted_rules_version_id', p_expected_rules_version,
            'horse_wait_seconds', v_wait,
            'horse_eligible_at', v_ticket.horse_eligible_at),
        v_now);

    PERFORM public.trivia_pvp__try_match(v_ticket.id, v_effective_horses, p_now);
    RETURN public.trivia_pvp__dto(p_user_id, p_now, v_effective_horses)
        || jsonb_build_object('join', 'created');
END;
$function$;

CREATE FUNCTION public.trivia_pvp_join_v3(
    p_user_id uuid,
    p_stake integer,
    p_client_nonce uuid,
    p_horses_allowed boolean,
    p_expected_rules_version text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    RETURN public.trivia_pvp__join_core_v3(
        p_user_id,
        p_stake,
        p_client_nonce,
        COALESCE(p_horses_allowed, false),
        p_expected_rules_version,
        NULL,
        NULL);
END;
$function$;

-- 4. ACL CUTOVER
ALTER FUNCTION public.trivia_pvp_quote_v3(uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_pvp__join_core_v3(uuid, integer, uuid, boolean, text, timestamptz, integer) OWNER TO postgres;
ALTER FUNCTION public.trivia_pvp_join_v3(uuid, integer, uuid, boolean, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.trivia_pvp_quote_v2(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp_join_v2(uuid, integer, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp_quote_v3(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp__join_core_v3(uuid, integer, uuid, boolean, text, timestamptz, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp_join_v3(uuid, integer, uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.trivia_pvp_quote_v3(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_pvp_join_v3(uuid, integer, uuid, boolean, text) TO service_role;

COMMENT ON FUNCTION public.trivia_pvp_quote_v3(uuid) IS
    'Phase 7 authoritative PvP quote: immutable rules id, economics, join capability and DB-effective horse capability.';
COMMENT ON FUNCTION public.trivia_pvp__join_core_v3(uuid, integer, uuid, boolean, text, timestamptz, integer) IS
    'Owner-only Phase 7 join transaction. Binds a new queue/match/escrow path to the exact quoted immutable rules version.';
COMMENT ON FUNCTION public.trivia_pvp_join_v3(uuid, integer, uuid, boolean, text) IS
    'Service-only Phase 7 quote-bound PvP join entry point.';

-- 5. POST-APPLY ASSERTIONS
DO $postcondition$
DECLARE
    v_fn regprocedure;
    v_def text;
BEGIN
    IF to_regprocedure('public.trivia_pvp_quote_v3(uuid)') IS NULL
       OR to_regprocedure('public.trivia_pvp_join_v3(uuid,integer,uuid,boolean,text)') IS NULL
       OR to_regprocedure('public.trivia_pvp__join_core_v3(uuid,integer,uuid,boolean,text,timestamp with time zone,integer)') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding postcondition: a v3 function is missing';
    END IF;

    IF has_function_privilege('service_role', 'public.trivia_pvp_quote_v2(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_pvp_join_v2(uuid,integer,uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_pvp__join_core_v3(uuid,integer,uuid,boolean,text,timestamp with time zone,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding postcondition: a superseded or internal function remains executable';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.trivia_pvp_quote_v3(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_pvp_join_v3(uuid,integer,uuid,boolean,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding postcondition: v3 service grant is missing';
    END IF;
    IF has_function_privilege('anon', 'public.trivia_pvp_quote_v3(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_pvp_quote_v3(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_pvp_join_v3(uuid,integer,uuid,boolean,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_pvp_join_v3(uuid,integer,uuid,boolean,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding postcondition: browser execution reopened';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc AS p
          JOIN pg_namespace AS n ON n.oid = p.pronamespace
          JOIN pg_roles AS r ON r.oid = p.proowner
         WHERE n.nspname = 'public'
           AND p.proname IN ('trivia_pvp_quote_v3', 'trivia_pvp__join_core_v3', 'trivia_pvp_join_v3')
           AND (NOT p.prosecdef
                OR r.rolname <> 'postgres'
                OR NOT ('search_path=""' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))))
    ) THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding postcondition: function ownership/definer/search_path drift';
    END IF;

    v_fn := 'public.trivia_pvp__join_core_v3(uuid,integer,uuid,boolean,text,timestamp with time zone,integer)'::regprocedure;
    SELECT pg_get_functiondef(v_fn) INTO v_def;
    IF strpos(v_def, 'FOR SHARE OF c') = 0
       OR strpos(v_def, 'rules_quote_stale') = 0
       OR strpos(v_def, 'INSERT INTO public.trivia_pvp_queue') = 0
       OR strpos(v_def, 'p_expected_rules_version') = 0 THEN
        RAISE EXCEPTION 'trivia p7 pvp quote binding postcondition: join binding definition drift';
    END IF;
END
$postcondition$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3: apply these statements in a NEW migration)
-- ============================================================================
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.trivia_pvp_quote_v2(uuid) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_pvp_join_v2(uuid, integer, uuid, boolean) TO service_role;
-- DROP FUNCTION public.trivia_pvp_join_v3(uuid, integer, uuid, boolean, text);
-- DROP FUNCTION public.trivia_pvp__join_core_v3(uuid, integer, uuid, boolean, text, timestamptz, integer);
-- DROP FUNCTION public.trivia_pvp_quote_v3(uuid);
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;

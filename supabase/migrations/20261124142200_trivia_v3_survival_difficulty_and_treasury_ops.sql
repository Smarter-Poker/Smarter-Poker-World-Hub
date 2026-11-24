-- ============================================================================
-- Migration: 20261124142200_trivia_v3_survival_difficulty_and_treasury_ops.sql
-- TIER: 3 (Additive Trivia V3 Survival per-level difficulty & supervisor
--          treasury replenishment from accumulated rake)
--
-- Scope:
--   1. Survival V3 Per-Level Difficulty:
--      - trivia_p3_candidates_v1 honors transaction-local
--        'trivia.p3_survival_difficulty' ('easy'|'medium'|'hard') when
--        profile.mode = 'survival', with graceful fallback to the full mixed
--        eligible pool whenever a difficulty slice has fewer than
--        profile.question_count candidates. Existing 4-arg signature preserved.
--      - trivia_start_solo_session_v3 adds a backward-compatible 5-arg
--        overload (p_difficulty text) and keeps the 4-arg overload delegating
--        to it with NULL so zero existing callers break. For mode='survival',
--        derives the authoritative per-level difficulty from p_parent_session_id
--        (L1-2 easy, L3-5 medium, L6-10 hard), preventing client difficulty
--        downgrade tampering while aligning V3 with Survival's progression.
--   2. Supervisor Treasury Replenishment Action:
--      - Preserves immutable append-only trivia_operator_roles_v1 untouched;
--        enforces supervisor role (v_context->'roles' ? 'supervisor') directly.
--      - Widens trivia_operator_events_v1 action/target_kind CHECK constraints
--        to allow 'treasury_replenish_from_rake' and target_kind 'treasury'.
--      - Updates trivia_operator_execute_v1 to execute
--        'treasury_replenish_from_rake' (supervisor-only, reasoned, idempotent
--        p_request_key, bounded integer amount > 0 and <= available rake across
--        house:rake:tournament + house:rake:pvp, balanced double-entry
--        trivia_ledger_post debiting rake accounts and crediting
--        treasury:trivia, recording an immutable operator receipt).
-- ============================================================================

BEGIN;

-- ── 1. Pre-flight live predecessor MD5 checks (fail closed on drift) ────────
DO $preflight$
DECLARE
    v_md5 text;
BEGIN
    SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'trivia_p3_candidates_v1'
       AND pg_get_function_identity_arguments(p.oid) =
           'p_profile_id text, p_player_ids uuid[], p_exclude_canonical uuid[], p_as_of timestamp with time zone, OUT qids uuid[], OUT rids uuid[], OUT cats text[], OUT diffs text[], OUT tiers smallint[]';
    IF v_md5 IS DISTINCT FROM '63ec2657faf23f28b745bcebacb37b85' THEN
        RAISE EXCEPTION 'preflight failed: trivia_p3_candidates_v1 MD5 mismatch (got %)', COALESCE(v_md5, '<missing>');
    END IF;

    SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'trivia_start_solo_session_v3'
       AND pg_get_function_identity_arguments(p.oid) =
           'p_session_id uuid, p_user_id uuid, p_mode text, p_parent_session_id uuid';
    IF v_md5 IS DISTINCT FROM 'f778e2b3c8c956db0550bfe449aa19b1' THEN
        RAISE EXCEPTION 'preflight failed: trivia_start_solo_session_v3 MD5 mismatch (got %)', COALESCE(v_md5, '<missing>');
    END IF;

    SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'trivia_operator_execute_v1'
       AND pg_get_function_identity_arguments(p.oid) =
           'p_operator_id uuid, p_request_key text, p_action text, p_reason text, p_target_id uuid, p_payload jsonb';
    IF v_md5 IS DISTINCT FROM '7d5247c334dc15e6899301f7fd2dd14f' THEN
        RAISE EXCEPTION 'preflight failed: trivia_operator_execute_v1 MD5 mismatch (got %)', COALESCE(v_md5, '<missing>');
    END IF;
END $preflight$;

-- ── 2. Survival V3 Per-Level Difficulty in trivia_p3_candidates_v1 ──────────
CREATE OR REPLACE FUNCTION public.trivia_p3_candidates_v1(
    p_profile_id text,
    p_player_ids uuid[],
    p_exclude_canonical uuid[],
    p_as_of timestamp with time zone,
    OUT qids uuid[],
    OUT rids uuid[],
    OUT cats text[],
    OUT diffs text[],
    OUT tiers smallint[]
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_p public.trivia_roster_profiles%ROWTYPE;
    v_seen jsonb;
    v_cool jsonb;
    v_excl jsonb;
    v_req_diff text := NULLIF(btrim(current_setting('trivia.p3_survival_difficulty', true)), '');
BEGIN
    SELECT * INTO v_p FROM public.trivia_roster_profiles r WHERE r.profile_id = p_profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown_profile %', p_profile_id; END IF;
    qids := '{}'; rids := '{}'; cats := '{}'; diffs := '{}'; tiers := '{}';
    -- As before: a NULL inside the exclusion list excludes every candidate.
    IF array_position(coalesce(p_exclude_canonical, '{}'::uuid[]), NULL) IS NOT NULL THEN RETURN; END IF;
    SELECT coalesce(jsonb_object_agg(z.canon::text, true), '{}'::jsonb) INTO v_seen
      FROM (SELECT DISTINCT c.canonical_question_id AS canon
              FROM public.trivia_user_question_history h
              JOIN public.trivia_question_curation c ON c.question_id = h.question_id
             WHERE h.user_id = ANY (coalesce(p_player_ids, '{}'::uuid[]))
               AND h.seen_at <= p_as_of
               AND h.seen_at > p_as_of - make_interval(days => v_p.exposure_window_days)) z;
    SELECT coalesce(jsonb_object_agg(z.canon::text, true), '{}'::jsonb) INTO v_cool
      FROM (SELECT DISTINCT i.canonical_question_id AS canon
              FROM public.trivia_roster_snapshot_items i
              JOIN public.trivia_roster_snapshots rs ON rs.id = i.snapshot_id
             WHERE v_p.global_cooldown_days > 0
               AND rs.scope_kind IN ('daily','tournament_plan')
               AND rs.created_at <= p_as_of
               AND rs.created_at > p_as_of - make_interval(days => v_p.global_cooldown_days)) z;
    SELECT coalesce(jsonb_object_agg(z.id::text, true), '{}'::jsonb) INTO v_excl
      FROM (SELECT DISTINCT u.id FROM unnest(coalesce(p_exclude_canonical, '{}'::uuid[])) AS u(id)) z;

    -- Survival per-level difficulty slice (L1-2 easy, L3-5 medium, L6-10 hard).
    -- Falls back gracefully to the full mixed eligible pool if the requested
    -- difficulty slice has fewer than profile.question_count candidates.
    IF v_p.mode = 'survival' AND v_req_diff IN ('easy', 'medium', 'hard') THEN
        SELECT coalesce(array_agg(z.qid), '{}'), coalesce(array_agg(z.rid), '{}'), coalesce(array_agg(z.cat), '{}'),
               coalesce(array_agg(z.diff), '{}'), coalesce(array_agg(z.tr), '{}')
          INTO qids, rids, cats, diffs, tiers
          FROM (SELECT p.question_id AS qid, p.revision_id AS rid, p.category AS cat, p.difficulty AS diff,
                       (CASE WHEN v_seen ? p.question_id::text THEN 2 WHEN v_cool ? p.question_id::text THEN 1 ELSE 0 END)::smallint AS tr
                  FROM public.trivia_eligible_question_pool_v1 p
                 WHERE v_p.mode = ANY (p.modes)
                   AND p.category = ANY (v_p.categories)
                   AND p.difficulty = v_req_diff
                   AND (v_p.per_question_seconds IS NULL OR p.min_timer_seconds <= v_p.per_question_seconds)
                   AND NOT (v_excl ? p.question_id::text)) z;
        IF coalesce(cardinality(qids), 0) >= v_p.question_count THEN
            RETURN;
        END IF;
        qids := '{}'; rids := '{}'; cats := '{}'; diffs := '{}'; tiers := '{}';
    END IF;

    SELECT coalesce(array_agg(z.qid), '{}'), coalesce(array_agg(z.rid), '{}'), coalesce(array_agg(z.cat), '{}'),
           coalesce(array_agg(z.diff), '{}'), coalesce(array_agg(z.tr), '{}')
      INTO qids, rids, cats, diffs, tiers
      FROM (SELECT p.question_id AS qid, p.revision_id AS rid, p.category AS cat, p.difficulty AS diff,
                   (CASE WHEN v_seen ? p.question_id::text THEN 2 WHEN v_cool ? p.question_id::text THEN 1 ELSE 0 END)::smallint AS tr
              FROM public.trivia_eligible_question_pool_v1 p
             WHERE v_p.mode = ANY (p.modes)
               AND p.category = ANY (v_p.categories)
               AND (v_p.per_question_seconds IS NULL OR p.min_timer_seconds <= v_p.per_question_seconds)
               AND NOT (v_excl ? p.question_id::text)) z;
END $function$;

REVOKE ALL ON FUNCTION public.trivia_p3_candidates_v1(text, uuid[], uuid[], timestamp with time zone)
    FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. Survival V3 Per-Level Difficulty in trivia_start_solo_session_v3 ─────
-- 5-arg overload (no default on p_difficulty so 4-arg calls stay unambiguous).
CREATE OR REPLACE FUNCTION public.trivia_start_solo_session_v3(
    p_session_id uuid,
    p_user_id uuid,
    p_mode text,
    p_parent_session_id uuid,
    p_difficulty text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_profile text;
    s public.trivia_sessions%ROWTYPE;
    v_snap jsonb;
    v_snapshot_id uuid;
    v_kind text;
    v_scope text;
    v_players uuid[];
    v_created jsonb;
    v_actor text;
    v_parent_level integer;
    v_target_level integer;
    v_target_diff text := NULL;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('daily','history','rules','pro',
       'arcade','mtt','cash','icm','gto','mixed','survival','endless','time-attack') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
    END IF;
    v_profile := 'solo.' || p_mode || '/roster@1';
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_session:' || p_session_id::text, 0));
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id;
    IF FOUND THEN
        IF s.user_id = p_user_id AND s.mode = p_mode AND s.engine_version IS NOT NULL THEN
            RETURN public.trivia_session_view_v3(p_session_id, p_user_id)
                || jsonb_build_object('resumed', true, 'duplicate', true);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'session_id_conflict');
    END IF;
    SELECT CASE WHEN coalesce(p.is_horse, false) THEN 'horse' ELSE 'human' END INTO v_actor
      FROM public.profiles p WHERE p.id = p_user_id;
    IF v_actor IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
    IF p_mode = 'daily' THEN
        -- Daily's promise: every player answers the SAME questions that Chicago day.
        v_kind := 'daily'; v_scope := ((now() AT TIME ZONE 'America/Chicago')::date)::text; v_players := '{}'::uuid[];
    ELSE
        v_kind := 'solo_session'; v_scope := p_session_id::text; v_players := ARRAY[p_user_id];
    END IF;

    -- Authoritative Survival per-level difficulty: L1-2 easy, L3-5 medium, L6-10 hard.
    -- Derived server-side from parent session chain so a player cannot forge an
    -- easier difficulty on higher levels; falls back to validated p_difficulty
    -- only if parent lookup is unavailable before create_trivia_session_v2 checks it.
    IF p_mode = 'survival' THEN
        IF p_parent_session_id IS NULL THEN
            v_target_level := 1;
        ELSE
            SELECT ps.survival_level INTO v_parent_level
              FROM public.trivia_sessions ps
             WHERE ps.id = p_parent_session_id
               AND ps.user_id = p_user_id
               AND ps.mode = 'survival';
            IF FOUND THEN
                v_target_level := coalesce(v_parent_level, 1) + 1;
            END IF;
        END IF;
        IF v_target_level IS NOT NULL THEN
            v_target_diff := CASE
                WHEN v_target_level <= 2 THEN 'easy'
                WHEN v_target_level <= 5 THEN 'medium'
                ELSE 'hard'
            END;
        ELSIF p_difficulty IN ('easy', 'medium', 'hard') THEN
            v_target_diff := p_difficulty;
        END IF;
    END IF;

    IF v_target_diff IS NOT NULL THEN
        PERFORM set_config('trivia.p3_survival_difficulty', v_target_diff, true);
    ELSE
        PERFORM set_config('trivia.p3_survival_difficulty', '', true);
    END IF;
    v_snap := public.trivia_build_roster_v1(v_kind, v_scope, v_profile, v_players, '{}'::uuid[]);
    PERFORM set_config('trivia.p3_survival_difficulty', '', true);

    IF (v_snap ->> 'success')::boolean IS NOT TRUE THEN RETURN v_snap; END IF;
    v_snapshot_id := (v_snap ->> 'snapshot_id')::uuid;
    v_created := public.create_trivia_session_v2(p_session_id, p_user_id, p_mode,
        ARRAY(SELECT question_id FROM public.trivia_roster_snapshot_items WHERE snapshot_id = v_snapshot_id
               AND round_no = 1 ORDER BY position),
        public.trivia_p3_permutations(v_snapshot_id, 1, p_session_id), p_parent_session_id);
    IF coalesce((v_created ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_created; END IF;
    IF coalesce((v_created ->> 'duplicate')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_id_conflict');
    END IF;
    PERFORM public.trivia_p3_bind_session(p_session_id, v_snapshot_id, 1, v_profile, 'solo:' || p_session_id::text,
        v_actor, jsonb_build_object('entry_cost', v_created -> 'entry_cost', 'entry_state', v_created -> 'entry_state'));
    RETURN public.trivia_session_view_v3(p_session_id, p_user_id)
        || jsonb_build_object('resumed', false, 'duplicate', false, 'newBalance', v_created -> 'new_balance',
                              'survivalLevel', v_created -> 'survival_level');
END $function$;

REVOKE ALL ON FUNCTION public.trivia_start_solo_session_v3(uuid, uuid, text, uuid, text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_start_solo_session_v3(uuid, uuid, text, uuid, text)
    TO service_role;

-- Preserve existing 4-arg overload so zero existing callers break.
CREATE OR REPLACE FUNCTION public.trivia_start_solo_session_v3(
    p_session_id uuid,
    p_user_id uuid,
    p_mode text,
    p_parent_session_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN public.trivia_start_solo_session_v3(
        p_session_id, p_user_id, p_mode, p_parent_session_id, NULL::text
    );
END $function$;

REVOKE ALL ON FUNCTION public.trivia_start_solo_session_v3(uuid, uuid, text, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_start_solo_session_v3(uuid, uuid, text, uuid)
    TO service_role;

-- ── 4. Supervisor Treasury Replenishment Event Constraints ───────────────────
-- trivia_operator_roles_v1 is append-only (enforced by trivia_p11_forbid_history_mutation);
-- supervisor-only authorization is enforced via v_context->'roles' ? 'supervisor'.

ALTER TABLE public.trivia_operator_events_v1
    DROP CONSTRAINT trivia_operator_events_v1_action_check,
    ADD CONSTRAINT trivia_operator_events_v1_action_check CHECK (
        action = ANY (ARRAY[
            'question_quarantine'::text,
            'question_release'::text,
            'pvp_recover'::text,
            'pvp_joins_set'::text,
            'pvp_horses_set'::text,
            'tournament_cancel'::text,
            'tournament_recover_settlement'::text,
            'incident_note'::text,
            'payout_hold'::text,
            'payout_release'::text,
            'round_recover'::text,
            'match_recover'::text,
            'treasury_replenish_from_rake'::text
        ])
    );

ALTER TABLE public.trivia_operator_events_v1
    DROP CONSTRAINT trivia_operator_events_v1_target_kind_check,
    ADD CONSTRAINT trivia_operator_events_v1_target_kind_check CHECK (
        target_kind = ANY (ARRAY[
            'question'::text,
            'question_quarantine'::text,
            'pvp_engine'::text,
            'tournament'::text,
            'incident'::text,
            'settlement'::text,
            'round'::text,
            'match'::text,
            'treasury'::text
        ])
    );

-- ── 5. Supervisor Treasury Replenishment Action in trivia_operator_execute_v1
CREATE OR REPLACE FUNCTION public.trivia_operator_execute_v1(
    p_operator_id uuid,
    p_request_key text,
    p_action text,
    p_reason text,
    p_target_id uuid DEFAULT NULL::uuid,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_context jsonb;
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_hash text;
    v_existing public.trivia_operator_events_v1%ROWTYPE;
    v_receipt uuid := extensions.gen_random_uuid();
    v_result jsonb := '{}'::jsonb;
    v_outcome text := 'failed';
    v_amount_text text;
    v_amount bigint;
    v_tourn_acc public.trivia_ledger_accounts%ROWTYPE;
    v_pvp_acc public.trivia_ledger_accounts%ROWTYPE;
    v_treasury_acc public.trivia_ledger_accounts%ROWTYPE;
    v_tourn_avail bigint;
    v_pvp_avail bigint;
    v_total_avail bigint;
    v_from_tourn bigint;
    v_from_pvp bigint;
    v_lines jsonb;
    v_post jsonb;
    v_treasury_after bigint;
    v_tourn_after bigint;
    v_pvp_after bigint;
    v_extra_keys text[];
BEGIN
    IF p_action NOT IN ('payout_hold', 'payout_release', 'treasury_replenish_from_rake') THEN
        RETURN public.trivia_operator_execute_before_payout_control_v1(
            p_operator_id, p_request_key, p_action, p_reason, p_target_id, p_payload
        );
    END IF;
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_operator_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_required');
    END IF;
    IF p_request_key IS NULL OR p_request_key !~ '^[A-Za-z0-9_.:@-]{8,128}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request_key');
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;
    IF jsonb_typeof(v_payload) <> 'object' OR octet_length(v_payload::text) > 4096 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
    END IF;

    v_context := public.trivia_operator_context_core_v1(p_operator_id);

    -- ── Branch A: treasury_replenish_from_rake (supervisor-only) ────────────
    IF p_action = 'treasury_replenish_from_rake' THEN
        IF p_target_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_target');
        END IF;
        SELECT array_agg(k) INTO v_extra_keys
          FROM jsonb_object_keys(v_payload) AS k
         WHERE k NOT IN ('replenishAmount', 'amount');
        IF coalesce(cardinality(v_extra_keys), 0) > 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_payload_field');
        END IF;
        IF (v_payload ? 'replenishAmount') AND (v_payload ? 'amount')
           AND (v_payload->>'replenishAmount') IS DISTINCT FROM (v_payload->>'amount') THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
        END IF;
        v_amount_text := COALESCE(v_payload->>'replenishAmount', v_payload->>'amount');
        IF v_amount_text IS NULL OR v_amount_text !~ '^[0-9]{1,7}$' THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
        END IF;
        v_amount := v_amount_text::bigint;
        IF v_amount <= 0 OR v_amount > 1000000 THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
        END IF;
        IF NOT COALESCE((v_context->>'allowed')::boolean, false)
           OR NOT (v_context->'roles' ? 'supervisor') THEN
            RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
        END IF;

        v_hash := encode(extensions.digest(convert_to(
            jsonb_build_object(
                'operatorId', p_operator_id,
                'requestKey', p_request_key,
                'action', p_action,
                'reason', btrim(p_reason),
                'targetId', p_target_id,
                'payload', jsonb_build_object('replenishAmount', v_amount)
            )::text, 'UTF8'), 'sha256'), 'hex');
        PERFORM pg_advisory_xact_lock(hashtextextended(
            'trivia-operator:' || p_operator_id::text || ':' || p_request_key, 0
        ));
        SELECT * INTO v_existing
          FROM public.trivia_operator_events_v1
         WHERE operator_id = p_operator_id AND request_key = p_request_key;
        IF FOUND THEN
            IF v_existing.request_hash <> v_hash THEN
                RETURN jsonb_build_object(
                    'success', false, 'error', 'idempotency_conflict',
                    'receipt_id', v_existing.receipt_id
                );
            END IF;
            RETURN jsonb_build_object(
                'success', v_existing.outcome = 'succeeded',
                'receipt_id', v_existing.receipt_id,
                'replayed', true,
                'action', v_existing.action,
                'outcome', v_existing.outcome,
                'result', v_existing.result
            );
        END IF;

        PERFORM pg_advisory_xact_lock(hashtextextended('trivia-operator-target:treasury:trivia', 0));

        BEGIN
            PERFORM public.trivia_ledger_ensure_account('house:rake:pvp');
            PERFORM public.trivia_ledger_ensure_account('house:rake:tournament');
            PERFORM public.trivia_ledger_ensure_account('treasury:trivia');

            -- Lock accounts in deterministic code order to match trivia_ledger_post.
            SELECT * INTO v_pvp_acc FROM public.trivia_ledger_accounts
             WHERE account_code = 'house:rake:pvp' FOR UPDATE;
            SELECT * INTO v_tourn_acc FROM public.trivia_ledger_accounts
             WHERE account_code = 'house:rake:tournament' FOR UPDATE;
            SELECT * INTO v_treasury_acc FROM public.trivia_ledger_accounts
             WHERE account_code = 'treasury:trivia' FOR UPDATE;

            IF v_pvp_acc.state <> 'open' OR v_tourn_acc.state <> 'open' OR v_treasury_acc.state <> 'open' THEN
                v_outcome := 'refused';
                v_result := jsonb_build_object(
                    'success', false,
                    'error', 'account_closed'
                );
            ELSE
                v_tourn_avail := GREATEST(0::bigint, v_tourn_acc.balance - COALESCE(v_tourn_acc.min_balance, 0::bigint));
                v_pvp_avail := GREATEST(0::bigint, v_pvp_acc.balance - COALESCE(v_pvp_acc.min_balance, 0::bigint));
                v_total_avail := v_tourn_avail + v_pvp_avail;

                IF v_amount > v_total_avail THEN
                    v_outcome := 'refused';
                    v_result := jsonb_build_object(
                        'success', false,
                        'error', 'insufficient_rake_balance',
                        'requested', v_amount,
                        'available', v_total_avail,
                        'tournament_rake_available', v_tourn_avail,
                        'pvp_rake_available', v_pvp_avail
                    );
                ELSE
                    v_from_tourn := LEAST(v_amount, v_tourn_avail);
                    v_from_pvp := v_amount - v_from_tourn;
                    v_lines := '[]'::jsonb;
                    IF v_from_tourn > 0 THEN
                        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
                            'account', 'house:rake:tournament',
                            'amount', -v_from_tourn,
                            'memo', 'supervisor treasury replenishment from tournament rake'
                        ));
                    END IF;
                    IF v_from_pvp > 0 THEN
                        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
                            'account', 'house:rake:pvp',
                            'amount', -v_from_pvp,
                            'memo', 'supervisor treasury replenishment from pvp rake'
                        ));
                    END IF;
                    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
                        'account', 'treasury:trivia',
                        'amount', v_amount,
                        'memo', 'supervisor treasury replenishment from accumulated rake'
                    ));

                    v_post := public.trivia_ledger_post(
                        jsonb_build_object(
                            'idempotency_key', 'ops:treasury_replenish:' || p_operator_id::text || ':' || p_request_key,
                            'operation', 'treasury_fund',
                            'source_event', 'treasury.replenished_from_rake',
                            'source_type', 'treasury',
                            'source_id', 'treasury:trivia',
                            'actor_kind', 'operator',
                            'actor_id', p_operator_id,
                            'funding_source', 'house_revenue',
                            'approval', jsonb_build_object(
                                'approved_by', 'supervisor:' || p_operator_id::text,
                                'reason', btrim(p_reason),
                                'evidence', 'trivia_operator_events_v1:' || v_receipt::text || '; request_key=' || p_request_key
                            ),
                            'request', jsonb_build_object(
                                'op', 'treasury_replenish_from_rake',
                                'amount', v_amount,
                                'from_tournament_rake', v_from_tourn,
                                'from_pvp_rake', v_from_pvp,
                                'receipt_id', v_receipt
                            )
                        ),
                        v_lines
                    );

                    IF COALESCE((v_post->>'success')::boolean, false) IS TRUE THEN
                        SELECT balance INTO v_treasury_after FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia';
                        SELECT balance INTO v_tourn_after FROM public.trivia_ledger_accounts WHERE account_code = 'house:rake:tournament';
                        SELECT balance INTO v_pvp_after FROM public.trivia_ledger_accounts WHERE account_code = 'house:rake:pvp';
                        v_outcome := 'succeeded';
                        v_result := jsonb_build_object(
                            'success', true,
                            'journal_id', v_post->'journal_id',
                            'journal_seq', v_post->'journal_seq',
                            'replenished_amount', v_amount,
                            'from_tournament_rake', v_from_tourn,
                            'from_pvp_rake', v_from_pvp,
                            'treasury_balance_after', v_treasury_after,
                            'tournament_rake_after', v_tourn_after,
                            'pvp_rake_after', v_pvp_after
                        );
                    ELSE
                        v_outcome := 'failed';
                        v_result := jsonb_build_object(
                            'success', false,
                            'error', COALESCE(v_post->>'error', 'ledger_post_failed')
                        );
                    END IF;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_result := jsonb_build_object('error', 'action_failed', 'sqlstate', SQLSTATE);
            v_outcome := 'failed';
        END;

        INSERT INTO public.trivia_operator_events_v1
            (receipt_id, operator_id, request_key, request_hash, action, reason,
             target_kind, target_id, outcome, result)
        VALUES
            (v_receipt, p_operator_id, p_request_key, v_hash, p_action, btrim(p_reason),
             'treasury', NULL, v_outcome, v_result);

        RETURN jsonb_build_object(
            'success', v_outcome = 'succeeded',
            'receipt_id', v_receipt,
            'replayed', false,
            'action', p_action,
            'outcome', v_outcome,
            'result', v_result
        );
    END IF;

    -- ── Branch B: payout_hold / payout_release (preserved unchanged) ────────
    IF p_target_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'target_required');
    END IF;
    -- No payout control accepts amount, recipient, role, outcome or any other
    -- browser-provided authority. Its payload is deliberately empty.
    IF v_payload <> '{}'::jsonb THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload_field');
    END IF;
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'capabilities' ? 'settlement_control') THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
    END IF;

    v_hash := encode(extensions.digest(convert_to(
        jsonb_build_object(
            'operatorId', p_operator_id,
            'requestKey', p_request_key,
            'action', p_action,
            'reason', btrim(p_reason),
            'targetId', p_target_id,
            'payload', v_payload
        )::text, 'UTF8'), 'sha256'), 'hex');
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'trivia-operator:' || p_operator_id::text || ':' || p_request_key, 0
    ));
    SELECT * INTO v_existing
      FROM public.trivia_operator_events_v1
     WHERE operator_id = p_operator_id AND request_key = p_request_key;
    IF FOUND THEN
        IF v_existing.request_hash <> v_hash THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'idempotency_conflict',
                'receipt_id', v_existing.receipt_id
            );
        END IF;
        RETURN jsonb_build_object(
            'success', v_existing.outcome = 'succeeded',
            'receipt_id', v_existing.receipt_id,
            'replayed', true,
            'action', v_existing.action,
            'outcome', v_existing.outcome,
            'result', v_existing.result
        );
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'trivia-operator-target:settlement:' || p_target_id::text, 0
    ));

    BEGIN
        v_result := public.trivia_settlement_payout_control_apply_v1(
            p_operator_id,
            v_receipt,
            CASE WHEN p_action = 'payout_hold' THEN 'hold' ELSE 'release' END,
            p_target_id,
            btrim(p_reason)
        );
        v_outcome := CASE
            WHEN COALESCE((v_result->>'success')::boolean, false) THEN 'succeeded'
            ELSE 'failed'
        END;
    EXCEPTION WHEN OTHERS THEN
        v_result := jsonb_build_object('error', 'action_failed', 'sqlstate', SQLSTATE);
        v_outcome := 'failed';
    END;

    INSERT INTO public.trivia_operator_events_v1
        (receipt_id, operator_id, request_key, request_hash, action, reason,
         target_kind, target_id, outcome, result)
    VALUES
        (v_receipt, p_operator_id, p_request_key, v_hash, p_action, btrim(p_reason),
         'settlement', p_target_id, v_outcome, v_result);

    RETURN jsonb_build_object(
        'success', v_outcome = 'succeeded',
        'receipt_id', v_receipt,
        'replayed', false,
        'action', p_action,
        'outcome', v_outcome,
        'result', v_result
    );
END
$function$;

REVOKE ALL ON FUNCTION public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)
    TO service_role;

-- ── 6. Post-flight verification assertions ──────────────────────────────────
DO $post$
DECLARE
    v_has_supervisor boolean;
    v_overloads integer;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.trivia_operator_roles_v1 WHERE role_key = 'supervisor'
    ) INTO v_has_supervisor;
    IF v_has_supervisor IS NOT TRUE THEN
        RAISE EXCEPTION 'postcondition failed: supervisor role missing in trivia_operator_roles_v1';
    END IF;

    SELECT count(*) INTO v_overloads
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'trivia_start_solo_session_v3';
    IF v_overloads <> 2 THEN
        RAISE EXCEPTION 'postcondition failed: expected 2 trivia_start_solo_session_v3 overloads, got %', v_overloads;
    END IF;

    IF has_function_privilege('anon', 'public.trivia_start_solo_session_v3(uuid, uuid, text, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_start_solo_session_v3(uuid, uuid, text, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_p3_candidates_v1(text, uuid[], uuid[], timestamptz)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_p3_candidates_v1(text, uuid[], uuid[], timestamptz)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'postcondition failed: browser role granted EXECUTE on service/internal RPC';
    END IF;

    IF NOT has_function_privilege('service_role', 'public.trivia_start_solo_session_v3(uuid, uuid, text, uuid, text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_start_solo_session_v3(uuid, uuid, text, uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'postcondition failed: service_role missing EXECUTE on public RPC';
    END IF;
END $post$;

NOTIFY pgrst, 'reload schema';

COMMIT;

/* FORWARD ROLLBACK (Tier 3 forward-only safety note: never drop ledger rows or
   immutable operator event rows. To roll back function behavior:
   1. Restore predecessor trivia_p3_candidates_v1 (MD5 63ec2657faf23f28b745bcebacb37b85).
   2. Restore predecessor 4-arg trivia_start_solo_session_v3 (MD5 f778e2b3c8c956db0550bfe449aa19b1)
      and DROP FUNCTION IF EXISTS public.trivia_start_solo_session_v3(uuid, uuid, text, uuid, text).
   3. Restore predecessor trivia_operator_execute_v1 (MD5 7d5247c334dc15e6899301f7fd2dd14f).
   4. Leave widened CHECK constraints on trivia_operator_events_v1 in place so any recorded
      treasury_replenish_from_rake receipts remain valid.
   5. NOTIFY pgrst, 'reload schema';) */

-- ============================================================================
-- 20261005234000_trivia_p11_operations_authority.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Phase 11 operations authority lane
-- AFFECTS:     additive operator roles/grants, immutable operations receipts,
--              incident notes, durable health episodes, service-only RPCs
-- IRREVERSIBLE: yes (operator evidence is permanent)
--
-- WHY:
--   The Phase 11 operations page was a read-only projection authorized by a
--   generic profile role. It could not safely quarantine questions, operate
--   the existing PvP and nightly-tournament engines, retain incident notes,
--   or prove who requested an action. This installs the named, least-privilege
--   Trivia operator contract at the database boundary. Every supported action
--   requires a verified operator id, a reason and a stable request key, and
--   produces one immutable receipt. Unsupported recovery and payout-hold
--   actions are refused truthfully instead of recording unenforced state.
--
-- HOW:
--   - Seed five named Trivia roles and explicit capabilities; seed existing
--     superadmin/god profiles as supervisors and admin profiles as observers.
--   - Execute supported actions through one idempotent service-role-only RPC,
--     delegating to the existing authoritative question, PvP and tournament
--     functions instead of duplicating their state machines.
--   - Keep immutable operator events, incident notes and alert transitions.
--   - Compute cross-domain health and privacy-safe support projections without
--     exposing answer material, participant identities or browser authority.
--
-- See .agent/workflows/migration-safety.md for the Tier 3 protocol.
-- ============================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS ----------------------------------------------------
DO $preflight$
DECLARE
    v_missing text[] := ARRAY[]::text[];
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN v_missing := v_missing || 'profiles'; END IF;
    IF to_regclass('public.trivia_questions') IS NULL THEN v_missing := v_missing || 'trivia_questions'; END IF;
    IF to_regclass('public.trivia_question_quarantine') IS NULL THEN v_missing := v_missing || 'trivia_question_quarantine'; END IF;
    IF to_regclass('public.trivia_pvp_engine_config') IS NULL THEN v_missing := v_missing || 'trivia_pvp_engine_config'; END IF;
    IF to_regclass('public.trivia_pvp_queue') IS NULL THEN v_missing := v_missing || 'trivia_pvp_queue'; END IF;
    IF to_regclass('public.trivia_pvp_matches') IS NULL THEN v_missing := v_missing || 'trivia_pvp_matches'; END IF;
    IF to_regclass('public.trivia_tournaments') IS NULL THEN v_missing := v_missing || 'trivia_tournaments'; END IF;
    IF to_regclass('public.trivia_tournament_entrants') IS NULL THEN v_missing := v_missing || 'trivia_tournament_entrants'; END IF;
    IF to_regclass('public.trivia_tournament_bracket_rounds') IS NULL THEN v_missing := v_missing || 'trivia_tournament_bracket_rounds'; END IF;
    IF to_regclass('public.trivia_tournament_matchups') IS NULL THEN v_missing := v_missing || 'trivia_tournament_matchups'; END IF;
    IF to_regclass('public.trivia_tournament_scheduler_runs') IS NULL THEN v_missing := v_missing || 'trivia_tournament_scheduler_runs'; END IF;
    IF to_regclass('public.trivia_settlements') IS NULL THEN v_missing := v_missing || 'trivia_settlements'; END IF;
    IF to_regclass('public.trivia_ledger_accounts') IS NULL THEN v_missing := v_missing || 'trivia_ledger_accounts'; END IF;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'trivia_p11 preflight: required tables missing: %', array_to_string(v_missing, ', ');
    END IF;

    IF to_regprocedure('public.trivia_quarantine_question_v1(uuid,text,text,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_release_question_quarantine_v1(uuid,text,text)') IS NULL
       OR to_regprocedure('public.trivia_pvp_recover_v2(integer)') IS NULL
       OR to_regprocedure('public.trivia_tournament_operator_cancel(uuid,text,text)') IS NULL
       OR to_regprocedure('public.trivia_tournament_scheduler_acquire(text,integer)') IS NULL
       OR to_regprocedure('public.trivia_tournament_settle(uuid,bigint)') IS NULL
       OR to_regprocedure('public.trivia_tournament_scheduler_release(uuid,bigint)') IS NULL
       OR to_regprocedure('public.trivia_question_health_v1(boolean)') IS NULL
       OR to_regprocedure('extensions.digest(bytea,text)') IS NULL
       OR to_regprocedure('extensions.gen_random_uuid()') IS NULL THEN
        RAISE EXCEPTION 'trivia_p11 preflight: required authoritative RPC or pgcrypto primitive is missing';
    END IF;

    IF to_regclass('public.trivia_operator_roles_v1') IS NOT NULL
       OR to_regclass('public.trivia_operator_events_v1') IS NOT NULL
       OR to_regprocedure('public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'trivia_p11 preflight: operations authority already exists; never replay this migration';
    END IF;
END
$preflight$;

-- 2. NAMED ROLES AND DURABLE GRANTS ------------------------------------------
CREATE TABLE public.trivia_operator_roles_v1 (
    role_key text PRIMARY KEY CHECK (role_key IN (
        'observer', 'question_curator', 'engine_operator',
        'settlement_operator', 'supervisor'
    )),
    title text NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
    capabilities text[] NOT NULL CHECK (cardinality(capabilities) > 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.trivia_operator_roles_v1 (role_key, title, capabilities) VALUES
    ('observer', 'Trivia observer', ARRAY['snapshot', 'support_lookup']),
    ('question_curator', 'Trivia question curator', ARRAY[
        'snapshot', 'support_lookup', 'incident_note',
        'question_quarantine', 'question_release'
    ]),
    ('engine_operator', 'Trivia engine operator', ARRAY[
        'snapshot', 'support_lookup', 'incident_note', 'pvp_recover',
        'pvp_switch', 'tournament_cancel', 'tournament_recover'
    ]),
    ('settlement_operator', 'Trivia settlement operator', ARRAY[
        'snapshot', 'support_lookup', 'incident_note', 'settlement_control'
    ]),
    ('supervisor', 'Trivia operations supervisor', ARRAY[
        'snapshot', 'support_lookup', 'incident_note',
        'question_quarantine', 'question_release', 'pvp_recover',
        'pvp_switch', 'tournament_cancel', 'tournament_recover',
        'settlement_control'
    ]);

CREATE TABLE public.trivia_operator_grants_v1 (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    operator_id uuid NOT NULL,
    role_key text NOT NULL REFERENCES public.trivia_operator_roles_v1(role_key),
    active boolean NOT NULL DEFAULT true,
    granted_by text NOT NULL CHECK (length(btrim(granted_by)) BETWEEN 3 AND 120),
    grant_reason text NOT NULL CHECK (length(btrim(grant_reason)) BETWEEN 8 AND 500),
    granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    revoked_at timestamptz,
    revoked_by text,
    revoke_reason text,
    CHECK ((active AND revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
        OR (NOT active AND revoked_at IS NOT NULL
            AND length(btrim(revoked_by)) BETWEEN 3 AND 120
            AND length(btrim(revoke_reason)) BETWEEN 8 AND 500))
);
CREATE UNIQUE INDEX trivia_operator_grants_v1_active_uidx
    ON public.trivia_operator_grants_v1 (operator_id, role_key) WHERE active;
CREATE INDEX trivia_operator_grants_v1_operator_idx
    ON public.trivia_operator_grants_v1 (operator_id, granted_at DESC);

INSERT INTO public.trivia_operator_grants_v1
    (operator_id, role_key, granted_by, grant_reason)
SELECT p.id,
       CASE WHEN p.role IN ('god', 'superadmin') THEN 'supervisor' ELSE 'observer' END,
       'migration:20261005234000',
       'Preserve existing administrative visibility under named least-privilege Trivia roles.'
  FROM public.profiles p
 WHERE p.role IN ('admin', 'superadmin', 'god')
ON CONFLICT (operator_id, role_key) WHERE active DO NOTHING;

-- 3. IMMUTABLE OPERATOR AND ALERT EVIDENCE -----------------------------------
CREATE TABLE public.trivia_operator_events_v1 (
    receipt_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    operator_id uuid NOT NULL,
    request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_.:@-]{8,128}$'),
    request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    action text NOT NULL CHECK (action IN (
        'question_quarantine', 'question_release', 'pvp_recover',
        'pvp_joins_set', 'pvp_horses_set', 'tournament_cancel',
        'tournament_recover_settlement', 'incident_note',
        'payout_hold', 'payout_release', 'round_recover', 'match_recover'
    )),
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 500),
    target_kind text NOT NULL CHECK (target_kind IN (
        'question', 'question_quarantine', 'pvp_engine', 'tournament',
        'incident', 'settlement', 'round', 'match'
    )),
    target_id uuid,
    outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'refused', 'standby')),
    result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (operator_id, request_key)
);
CREATE INDEX trivia_operator_events_v1_created_idx
    ON public.trivia_operator_events_v1 (created_at DESC);
CREATE INDEX trivia_operator_events_v1_target_idx
    ON public.trivia_operator_events_v1 (target_kind, target_id, created_at DESC)
    WHERE target_id IS NOT NULL;

CREATE TABLE public.trivia_incident_notes_v1 (
    note_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    receipt_id uuid NOT NULL UNIQUE REFERENCES public.trivia_operator_events_v1(receipt_id),
    operator_id uuid NOT NULL,
    incident_key text NOT NULL CHECK (incident_key ~ '^[A-Za-z0-9_.:@-]{3,120}$'),
    severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    status text NOT NULL CHECK (status IN ('open', 'monitoring', 'resolved')),
    note text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX trivia_incident_notes_v1_incident_idx
    ON public.trivia_incident_notes_v1 (incident_key, created_at DESC);

CREATE TABLE public.trivia_operations_alert_episodes_v1 (
    condition_key text PRIMARY KEY CHECK (length(condition_key) BETWEEN 3 AND 240),
    episode_key uuid NOT NULL UNIQUE DEFAULT extensions.gen_random_uuid(),
    code text NOT NULL CHECK (code ~ '^[a-z0-9_]{3,80}$'),
    severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
    subject_type text NOT NULL CHECK (subject_type IN (
        'global', 'question_pool', 'scheduler', 'tournament', 'round',
        'match', 'settlement'
    )),
    subject_id uuid,
    summary text NOT NULL CHECK (length(summary) BETWEEN 3 AND 500),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
    firing_since timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    resolved_at timestamptz,
    occurrence_count bigint NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1)
);
CREATE INDEX trivia_operations_alert_episodes_v1_active_idx
    ON public.trivia_operations_alert_episodes_v1 (severity, firing_since)
    WHERE resolved_at IS NULL;

CREATE TABLE public.trivia_operations_alert_events_v1 (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    episode_key uuid NOT NULL,
    condition_key text NOT NULL,
    transition text NOT NULL CHECK (transition IN ('firing', 'resolved')),
    code text NOT NULL,
    severity text NOT NULL,
    summary text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX trivia_operations_alert_events_v1_episode_idx
    ON public.trivia_operations_alert_events_v1 (episode_key, occurred_at);

CREATE OR REPLACE FUNCTION public.trivia_p11_forbid_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$body$;

CREATE OR REPLACE FUNCTION public.trivia_p11_grant_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'Trivia operator grants cannot be deleted' USING ERRCODE = '42501';
    END IF;
    IF OLD.operator_id IS DISTINCT FROM NEW.operator_id
       OR OLD.role_key IS DISTINCT FROM NEW.role_key
       OR OLD.granted_by IS DISTINCT FROM NEW.granted_by
       OR OLD.grant_reason IS DISTINCT FROM NEW.grant_reason
       OR OLD.granted_at IS DISTINCT FROM NEW.granted_at
       OR OLD.active = false OR NEW.active = true
       OR NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR NEW.revoke_reason IS NULL THEN
        RAISE EXCEPTION 'Trivia operator grants can only transition once from active to revoked'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END
$body$;

CREATE TRIGGER trivia_operator_roles_v1_immutable
    BEFORE UPDATE OR DELETE ON public.trivia_operator_roles_v1
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p11_forbid_history_mutation();
CREATE TRIGGER trivia_operator_roles_v1_no_truncate
    BEFORE TRUNCATE ON public.trivia_operator_roles_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p11_forbid_history_mutation();
CREATE TRIGGER trivia_operator_grants_v1_guard
    BEFORE UPDATE OR DELETE ON public.trivia_operator_grants_v1
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p11_grant_guard();
CREATE TRIGGER trivia_operator_grants_v1_no_truncate
    BEFORE TRUNCATE ON public.trivia_operator_grants_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p11_grant_guard();

DO $history_triggers$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'trivia_operator_events_v1',
        'trivia_incident_notes_v1',
        'trivia_operations_alert_events_v1'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I '
            || 'FOR EACH ROW EXECUTE FUNCTION public.trivia_p11_forbid_history_mutation()',
            v_table || '_immutable', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I '
            || 'FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p11_forbid_history_mutation()',
            v_table || '_no_truncate', v_table
        );
    END LOOP;
END
$history_triggers$;

-- 4. ROLE CONTEXT -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_operator_context_core_v1(p_operator_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
    WITH active_grants AS (
        SELECT g.role_key, r.capabilities
          FROM public.trivia_operator_grants_v1 g
          JOIN public.trivia_operator_roles_v1 r USING (role_key)
         WHERE g.operator_id = p_operator_id AND g.active AND g.revoked_at IS NULL
    ), capabilities AS (
        SELECT DISTINCT c.capability
          FROM active_grants a
          CROSS JOIN LATERAL unnest(a.capabilities) AS c(capability)
    )
    SELECT jsonb_build_object(
        'allowed', EXISTS (SELECT 1 FROM active_grants),
        'roles', COALESCE((SELECT jsonb_agg(role_key ORDER BY role_key) FROM active_grants), '[]'::jsonb),
        'capabilities', COALESCE((SELECT jsonb_agg(capability ORDER BY capability) FROM capabilities), '[]'::jsonb)
    )
$body$;

CREATE OR REPLACE FUNCTION public.trivia_operator_context_v1(p_operator_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_operator_id IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'roles', '[]'::jsonb, 'capabilities', '[]'::jsonb);
    END IF;
    RETURN public.trivia_operator_context_core_v1(p_operator_id);
END
$body$;

-- 5. CROSS-DOMAIN HEALTH WITH DURABLE EPISODES -------------------------------
CREATE OR REPLACE FUNCTION public.trivia_operations_health_v1(
    p_operator_id uuid,
    p_record boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_context jsonb;
    v_question jsonb;
    v_condition record;
    v_episode public.trivia_operations_alert_episodes_v1%ROWTYPE;
    v_conditions jsonb;
    v_active jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'capabilities' ? 'snapshot') THEN
        RAISE EXCEPTION 'trivia operator snapshot capability required' USING ERRCODE = '42501';
    END IF;

    v_question := public.trivia_question_health_v1(false);
    CREATE TEMP TABLE IF NOT EXISTS pg_temp.trivia_p11_conditions (
        condition_key text PRIMARY KEY,
        code text NOT NULL,
        severity text NOT NULL,
        subject_type text NOT NULL,
        subject_id uuid,
        summary text NOT NULL,
        detail jsonb NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE pg_temp.trivia_p11_conditions;

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'question-pool:eligible', 'eligible_pool_short', 'critical', 'question_pool', NULL::uuid,
           'The authoritative eligible question pool is below one full 256-player field.',
           jsonb_build_object('eligible_pool', COALESCE((v_question#>>'{metrics,eligible_pool}')::integer, 0), 'minimum', 256)
     WHERE COALESCE((v_question#>>'{metrics,eligible_pool}')::integer, 0) < 256;

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'tournament:' || t.id::text || ':horse-field-missing',
           'horse_field_missing', 'critical', 'tournament', t.id,
           'An active nightly tournament is missing its authoritative horse-field contract.',
           jsonb_build_object('lifecycle', t.lifecycle_state, 'horseTarget', t.horse_target,
                              'populationMode', t.horse_population_mode)
      FROM public.trivia_tournaments t
     WHERE t.engine_version IS NOT NULL
       AND t.schedule_kind = 'public_nightly'
       AND t.lifecycle_state IN ('scheduled', 'registration', 'held', 'live', 'settling')
       AND (t.horse_target IS NULL OR t.horse_target NOT BETWEEN 70 AND 140
            OR t.horse_population_mode IS NULL);

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'tournament:' || t.id::text || ':horse-field-short',
           'horse_field_short', 'critical', 'tournament', t.id,
           'A nightly tournament reached registration close below its authoritative horse target.',
           jsonb_build_object(
               'lifecycle', t.lifecycle_state,
               'horseTarget', t.horse_target,
               'horsesEntered', count(e.id)
           )
      FROM public.trivia_tournaments t
      LEFT JOIN public.trivia_tournament_entrants e
        ON e.tournament_id = t.id
       AND e.participant_kind = 'horse'
       AND e.entry_state = 'entered'
     WHERE t.engine_version IS NOT NULL
       AND t.schedule_kind = 'public_nightly'
       AND t.horse_population_mode = 'enabled'
       AND t.lifecycle_state IN ('registration', 'held', 'live', 'settling')
       AND v_now >= t.registration_closes_at
     GROUP BY t.id, t.lifecycle_state, t.horse_target
    HAVING count(e.id) < t.horse_target;

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'scheduler:duplicate-owner', 'scheduler_duplicate_owner', 'critical', 'scheduler', NULL::uuid,
           'More than one nightly tournament scheduler owner run is unfinished.',
           jsonb_build_object('unfinishedOwners', count(*))
      FROM public.trivia_tournament_scheduler_runs r
     WHERE r.outcome = 'owner' AND r.finished_at IS NULL
    HAVING count(*) > 1;

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'round:' || r.tournament_id::text || ':' || r.round_number::text,
           'tournament_round_stuck', 'critical', 'round', r.tournament_id,
           'A tournament round remains open more than 120 seconds beyond its deadline.',
           jsonb_build_object('round', r.round_number, 'deadlineAt', r.deadline_at,
                              'resolved', r.resolved_count, 'matchups', r.matchup_count)
      FROM public.trivia_tournament_bracket_rounds r
     WHERE r.status = 'open' AND r.deadline_at < v_now - interval '120 seconds';

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'match:' || m.id::text, 'tournament_match_stuck', 'critical', 'match', m.id,
           'An unresolved tournament match remains in an overdue open round.',
           jsonb_build_object('tournamentId', m.tournament_id, 'round', m.round_number, 'status', m.status)
      FROM public.trivia_tournament_matchups m
      JOIN public.trivia_tournament_bracket_rounds r
        ON r.tournament_id = m.tournament_id AND r.round_number = m.round_number
     WHERE m.status IN ('pending', 'ready')
       AND r.status = 'open' AND r.deadline_at < v_now - interval '120 seconds';

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'settlement:' || s.id::text || ':open-after-terminal',
           'settlement_reconciliation_open', 'critical', 'settlement', s.id,
           'A terminal Trivia subject still has a nonterminal settlement.',
           jsonb_build_object('subjectType', s.subject_type, 'subjectId', s.subject_id, 'state', s.state)
      FROM public.trivia_settlements s
     WHERE s.state IN ('open', 'locked')
       AND ((s.subject_type = 'pvp_match' AND EXISTS (
                SELECT 1 FROM public.trivia_pvp_matches m
                 WHERE m.id = s.subject_id
                   AND m.status IN ('complete', 'completed', 'cancelled', 'expired', 'abandoned')
            )) OR (s.subject_type = 'tournament' AND EXISTS (
                SELECT 1 FROM public.trivia_tournaments t
                 WHERE t.id = s.subject_id AND t.lifecycle_state IN ('settled', 'cancelled')
            )));

    INSERT INTO pg_temp.trivia_p11_conditions
    SELECT 'settlement:' || s.id::text || ':escrow-nonzero',
           'settlement_escrow_nonzero', 'critical', 'settlement', s.id,
           'A terminal Trivia settlement retains a nonzero escrow balance.',
           jsonb_build_object('subjectType', s.subject_type, 'subjectId', s.subject_id,
                              'state', s.state, 'escrowBalance', a.balance)
      FROM public.trivia_settlements s
      JOIN public.trivia_ledger_accounts a ON a.account_code = s.escrow_account_code
     WHERE s.state IN ('settled', 'refunded', 'voided') AND a.balance <> 0;

    IF p_record THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('trivia-operations-health-v1', 0));
        FOR v_condition IN SELECT * FROM pg_temp.trivia_p11_conditions ORDER BY condition_key LOOP
            SELECT * INTO v_episode
              FROM public.trivia_operations_alert_episodes_v1
             WHERE condition_key = v_condition.condition_key FOR UPDATE;
            IF NOT FOUND THEN
                INSERT INTO public.trivia_operations_alert_episodes_v1
                    (condition_key, code, severity, subject_type, subject_id, summary, detail,
                     firing_since, last_seen_at)
                VALUES
                    (v_condition.condition_key, v_condition.code, v_condition.severity,
                     v_condition.subject_type, v_condition.subject_id, v_condition.summary,
                     v_condition.detail, v_now, v_now)
                RETURNING * INTO v_episode;
                INSERT INTO public.trivia_operations_alert_events_v1
                    (episode_key, condition_key, transition, code, severity, summary, occurred_at)
                VALUES (v_episode.episode_key, v_episode.condition_key, 'firing', v_episode.code,
                        v_episode.severity, v_episode.summary, v_now);
            ELSIF v_episode.resolved_at IS NOT NULL THEN
                UPDATE public.trivia_operations_alert_episodes_v1
                   SET episode_key = extensions.gen_random_uuid(), code = v_condition.code,
                       severity = v_condition.severity, subject_type = v_condition.subject_type,
                       subject_id = v_condition.subject_id, summary = v_condition.summary,
                       detail = v_condition.detail, firing_since = v_now, last_seen_at = v_now,
                       resolved_at = NULL, occurrence_count = occurrence_count + 1
                 WHERE condition_key = v_condition.condition_key
                RETURNING * INTO v_episode;
                INSERT INTO public.trivia_operations_alert_events_v1
                    (episode_key, condition_key, transition, code, severity, summary, occurred_at)
                VALUES (v_episode.episode_key, v_episode.condition_key, 'firing', v_episode.code,
                        v_episode.severity, v_episode.summary, v_now);
            ELSE
                UPDATE public.trivia_operations_alert_episodes_v1
                   SET code = v_condition.code, severity = v_condition.severity,
                       subject_type = v_condition.subject_type, subject_id = v_condition.subject_id,
                       summary = v_condition.summary, detail = v_condition.detail, last_seen_at = v_now
                 WHERE condition_key = v_condition.condition_key;
            END IF;
        END LOOP;

        FOR v_episode IN
            SELECT * FROM public.trivia_operations_alert_episodes_v1 e
             WHERE e.resolved_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM pg_temp.trivia_p11_conditions c
                                WHERE c.condition_key = e.condition_key)
             FOR UPDATE
        LOOP
            UPDATE public.trivia_operations_alert_episodes_v1
               SET resolved_at = v_now, last_seen_at = v_now
             WHERE condition_key = v_episode.condition_key;
            INSERT INTO public.trivia_operations_alert_events_v1
                (episode_key, condition_key, transition, code, severity, summary, occurred_at)
            VALUES (v_episode.episode_key, v_episode.condition_key, 'resolved', v_episode.code,
                    v_episode.severity, v_episode.summary, v_now);
        END LOOP;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'conditionKey', c.condition_key, 'code', c.code, 'severity', c.severity,
               'subjectType', c.subject_type, 'subjectId', c.subject_id,
               'summary', c.summary, 'detail', c.detail
           ) ORDER BY c.severity, c.condition_key), '[]'::jsonb)
      INTO v_conditions FROM pg_temp.trivia_p11_conditions c;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'episodeKey', e.episode_key, 'conditionKey', e.condition_key,
               'code', e.code, 'severity', e.severity, 'subjectType', e.subject_type,
               'subjectId', e.subject_id, 'summary', e.summary,
               'firingSince', e.firing_since, 'lastSeenAt', e.last_seen_at,
               'occurrenceCount', e.occurrence_count
           ) ORDER BY e.firing_since), '[]'::jsonb)
      INTO v_active
      FROM public.trivia_operations_alert_episodes_v1 e WHERE e.resolved_at IS NULL;
    RETURN jsonb_build_object(
        'healthy', jsonb_array_length(v_conditions) = 0,
        'checkedAt', v_now,
        'recorded', p_record,
        'conditions', v_conditions,
        'activeEpisodes', v_active
    );
END
$body$;

-- 6. PRIVACY-SAFE SUPPORT AND EVENT PROJECTIONS ------------------------------
CREATE OR REPLACE FUNCTION public.trivia_operator_recent_events_v1(
    p_operator_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    v_context jsonb;
    v_result jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'capabilities' ? 'snapshot') THEN
        RAISE EXCEPTION 'trivia operator snapshot capability required' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(jsonb_agg(row_value ORDER BY created_at DESC), '[]'::jsonb)
      INTO v_result
      FROM (
          SELECT e.created_at,
                 jsonb_build_object(
                     'receiptId', e.receipt_id, 'operatorId', e.operator_id,
                     'action', e.action, 'outcome', e.outcome,
                     'targetKind', e.target_kind, 'targetId', e.target_id,
                     'createdAt', e.created_at
                 ) AS row_value
            FROM public.trivia_operator_events_v1 e
           ORDER BY e.created_at DESC
           LIMIT least(greatest(COALESCE(p_limit, 50), 1), 100)
      ) recent;
    RETURN v_result;
END
$body$;

CREATE OR REPLACE FUNCTION public.trivia_operator_support_lookup_v1(
    p_operator_id uuid,
    p_kind text,
    p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    v_context jsonb;
    v_result jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'capabilities' ? 'support_lookup') THEN
        RAISE EXCEPTION 'trivia operator support lookup capability required' USING ERRCODE = '42501';
    END IF;
    IF p_target_id IS NULL OR p_kind NOT IN ('user', 'pvp_match', 'tournament', 'question') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_support_lookup');
    END IF;

    IF p_kind = 'user' THEN
        SELECT jsonb_build_object(
            'success', true, 'kind', 'user', 'targetId', p_target_id,
            'found', p.id IS NOT NULL,
            'participant_kind', CASE WHEN COALESCE(p.is_horse, false) THEN 'horse' ELSE 'human' END,
            'waiting_ticket_count', (SELECT count(*) FROM public.trivia_pvp_queue q
                                      WHERE q.user_id = p_target_id AND q.status = 'waiting'),
            'active_match_count', (SELECT count(*) FROM public.trivia_pvp_matches m
                                    WHERE p_target_id IN (m.player1_id, m.player2_id)
                                      AND m.status IN ('pending', 'active', 'settling')),
            'tournament_entry_count', (SELECT count(*) FROM public.trivia_tournament_entrants e
                                        WHERE e.participant_id = p_target_id),
            'nonterminal_settlement_count', (SELECT count(*)
                FROM public.trivia_settlement_participants sp
                JOIN public.trivia_settlements s ON s.id = sp.settlement_id
               WHERE sp.user_id = p_target_id AND s.state IN ('open', 'locked'))
        ) INTO v_result FROM (SELECT 1) seed
        LEFT JOIN public.profiles p ON p.id = p_target_id;
    ELSIF p_kind = 'pvp_match' THEN
        SELECT jsonb_build_object(
            'success', true, 'kind', 'pvp_match', 'targetId', m.id,
            'found', true, 'status', m.status, 'matchKind', m.match_kind,
            'stakeAmount', m.stake_amount, 'createdAt', m.created_at,
            'deadlineAt', m.deadline_at, 'completedAt', m.completed_at,
            'participantCount', CASE WHEN m.player2_id IS NULL THEN 1 ELSE 2 END,
            'settlementState', s.state, 'settlementOutcome', s.outcome,
            'escrowBalance', a.balance
        ) INTO v_result
          FROM public.trivia_pvp_matches m
          LEFT JOIN public.trivia_settlements s
            ON s.subject_type = 'pvp_match' AND s.subject_id = m.id
          LEFT JOIN public.trivia_ledger_accounts a ON a.account_code = s.escrow_account_code
         WHERE m.id = p_target_id;
    ELSIF p_kind = 'tournament' THEN
        SELECT jsonb_build_object(
            'success', true, 'kind', 'tournament', 'targetId', t.id,
            'found', true, 'lifecycle', t.lifecycle_state, 'startTime', t.start_time,
            'terminalReason', t.terminal_reason, 'horseTarget', t.horse_target,
            'horseCount', (SELECT count(*) FROM public.trivia_tournament_entrants e
                            WHERE e.tournament_id = t.id AND e.participant_kind = 'horse'),
            'humanCount', (SELECT count(*) FROM public.trivia_tournament_entrants e
                            WHERE e.tournament_id = t.id AND e.participant_kind = 'human'),
            'unresolved_match_count', (SELECT count(*) FROM public.trivia_tournament_matchups m
                                       WHERE m.tournament_id = t.id AND m.status <> 'resolved'),
            'stuck_round_count', (SELECT count(*) FROM public.trivia_tournament_bracket_rounds r
                                  WHERE r.tournament_id = t.id AND r.status = 'open'
                                    AND r.deadline_at < now() - interval '120 seconds'),
            'settlementState', s.state, 'settlementOutcome', s.outcome,
            'escrowBalance', a.balance
        ) INTO v_result
          FROM public.trivia_tournaments t
          LEFT JOIN public.trivia_settlements s
            ON s.subject_type = 'tournament' AND s.subject_id = t.id
          LEFT JOIN public.trivia_ledger_accounts a ON a.account_code = s.escrow_account_code
         WHERE t.id = p_target_id;
    ELSE
        SELECT jsonb_build_object(
            'success', true, 'kind', 'question', 'targetId', q.id,
            'found', true, 'category', q.category, 'difficulty', q.difficulty,
            'active_quarantine_count', (SELECT count(*) FROM public.trivia_question_quarantine qq
                                        WHERE qq.question_id = q.id AND qq.released_at IS NULL),
            'activeQuarantineReasons', COALESCE((SELECT jsonb_agg(qq.reason_code ORDER BY qq.reason_code)
                                        FROM public.trivia_question_quarantine qq
                                        WHERE qq.question_id = q.id AND qq.released_at IS NULL), '[]'::jsonb),
            'openReportCount', (SELECT count(*) FROM public.trivia_question_reports qr
                                WHERE qr.question_id = q.id AND qr.resolved_at IS NULL)
        ) INTO v_result FROM public.trivia_questions q WHERE q.id = p_target_id;
    END IF;
    RETURN COALESCE(v_result, jsonb_build_object(
        'success', true, 'kind', p_kind, 'targetId', p_target_id, 'found', false
    ));
END
$body$;

-- 7. IDEMPOTENT OPERATOR ACTION BOUNDARY -------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_operator_execute_v1(
    p_operator_id uuid,
    p_request_key text,
    p_action text,
    p_reason text,
    p_target_id uuid DEFAULT NULL,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    v_context jsonb;
    v_capability text;
    v_target_kind text;
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_hash text;
    v_existing public.trivia_operator_events_v1%ROWTYPE;
    v_receipt uuid := extensions.gen_random_uuid();
    v_result jsonb := '{}'::jsonb;
    v_outcome text := 'failed';
    v_underlying jsonb;
    v_before boolean;
    v_lease jsonb;
    v_holder text;
    v_run_id uuid;
    v_fence bigint;
    v_lifecycle text;
    v_note boolean := false;
BEGIN
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

    v_capability := CASE p_action
        WHEN 'question_quarantine' THEN 'question_quarantine'
        WHEN 'question_release' THEN 'question_release'
        WHEN 'pvp_recover' THEN 'pvp_recover'
        WHEN 'pvp_joins_set' THEN 'pvp_switch'
        WHEN 'pvp_horses_set' THEN 'pvp_switch'
        WHEN 'tournament_cancel' THEN 'tournament_cancel'
        WHEN 'tournament_recover_settlement' THEN 'tournament_recover'
        WHEN 'round_recover' THEN 'tournament_recover'
        WHEN 'match_recover' THEN 'tournament_recover'
        WHEN 'incident_note' THEN 'incident_note'
        WHEN 'payout_hold' THEN 'settlement_control'
        WHEN 'payout_release' THEN 'settlement_control'
        ELSE NULL
    END;
    v_target_kind := CASE p_action
        WHEN 'question_quarantine' THEN 'question'
        WHEN 'question_release' THEN 'question_quarantine'
        WHEN 'pvp_recover' THEN 'pvp_engine'
        WHEN 'pvp_joins_set' THEN 'pvp_engine'
        WHEN 'pvp_horses_set' THEN 'pvp_engine'
        WHEN 'tournament_cancel' THEN 'tournament'
        WHEN 'tournament_recover_settlement' THEN 'tournament'
        WHEN 'round_recover' THEN 'round'
        WHEN 'match_recover' THEN 'match'
        WHEN 'incident_note' THEN 'incident'
        WHEN 'payout_hold' THEN 'settlement'
        WHEN 'payout_release' THEN 'settlement'
        ELSE NULL
    END;
    IF v_capability IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
    END IF;
    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'capabilities' ? v_capability) THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
    END IF;
    IF p_action IN ('question_quarantine', 'question_release', 'tournament_cancel',
                    'tournament_recover_settlement', 'round_recover', 'match_recover',
                    'payout_hold', 'payout_release') AND p_target_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'target_required');
    END IF;

    -- No action accepts financial amounts, identities, roles or an asserted result.
    IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_payload) key
         WHERE key IN ('operatorId', 'userId', 'role', 'roles', 'capability',
                       'capabilities', 'amount', 'diamonds', 'unlocked', 'outcome',
                       'receiptId', 'settledDiamonds')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_authority_forbidden');
    END IF;
    IF (p_action = 'question_quarantine' AND EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_payload) key WHERE key <> 'reasonCode'))
       OR (p_action = 'pvp_recover' AND EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_payload) key WHERE key <> 'limit'))
       OR (p_action IN ('pvp_joins_set', 'pvp_horses_set') AND EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_payload) key WHERE key <> 'enabled'))
       OR (p_action = 'incident_note' AND EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_payload) key
             WHERE key NOT IN ('incidentKey', 'note', 'severity', 'status')))
       OR (p_action IN ('question_release', 'tournament_cancel',
            'tournament_recover_settlement', 'payout_hold', 'payout_release',
            'round_recover', 'match_recover') AND v_payload <> '{}'::jsonb) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload_field');
    END IF;

    v_hash := encode(extensions.digest(convert_to(
        jsonb_build_object(
            'operatorId', p_operator_id, 'requestKey', p_request_key,
            'action', p_action, 'reason', btrim(p_reason),
            'targetId', p_target_id, 'payload', v_payload
        )::text, 'UTF8'), 'sha256'), 'hex');
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia-operator:' || p_operator_id::text || ':' || p_request_key, 0));
    SELECT * INTO v_existing FROM public.trivia_operator_events_v1
     WHERE operator_id = p_operator_id AND request_key = p_request_key;
    IF FOUND THEN
        IF v_existing.request_hash <> v_hash THEN
            RETURN jsonb_build_object('success', false, 'error', 'idempotency_conflict',
                                      'receipt_id', v_existing.receipt_id);
        END IF;
        RETURN jsonb_build_object(
            'success', v_existing.outcome = 'succeeded',
            'receipt_id', v_existing.receipt_id, 'replayed', true,
            'action', v_existing.action, 'outcome', v_existing.outcome,
            'result', v_existing.result
        );
    END IF;
    IF p_target_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(
            'trivia-operator-target:' || v_target_kind || ':' || p_target_id::text, 0));
    END IF;

    BEGIN
        CASE p_action
            WHEN 'question_quarantine' THEN
                IF COALESCE(v_payload->>'reasonCode', '') !~ '^[a-z0-9_]{3,64}$' THEN
                    v_result := jsonb_build_object('error', 'invalid_reason_code');
                ELSE
                    v_underlying := public.trivia_quarantine_question_v1(
                        p_target_id, v_payload->>'reasonCode', 'operator_console',
                        'operator:' || p_operator_id::text,
                        jsonb_build_object('requestKey', p_request_key, 'reason', btrim(p_reason))
                    );
                    v_result := v_underlying;
                END IF;
            WHEN 'question_release' THEN
                v_result := public.trivia_release_question_quarantine_v1(
                    p_target_id, 'operator:' || p_operator_id::text, btrim(p_reason));
            WHEN 'pvp_recover' THEN
                IF v_payload ? 'limit' AND (
                    jsonb_typeof(v_payload->'limit') <> 'number'
                    OR (v_payload->>'limit')::integer NOT BETWEEN 1 AND 500
                ) THEN
                    v_result := jsonb_build_object('error', 'invalid_limit');
                ELSE
                    v_result := public.trivia_pvp_recover_v2(
                        COALESCE((v_payload->>'limit')::integer, 100));
                END IF;
            WHEN 'pvp_joins_set' THEN
                IF jsonb_typeof(v_payload->'enabled') <> 'boolean' THEN
                    v_result := jsonb_build_object('error', 'enabled_required');
                ELSE
                    SELECT joins_enabled INTO v_before
                      FROM public.trivia_pvp_engine_config WHERE id = 1 FOR UPDATE;
                    UPDATE public.trivia_pvp_engine_config
                       SET joins_enabled = (v_payload->>'enabled')::boolean, updated_at = clock_timestamp()
                     WHERE id = 1;
                    v_result := jsonb_build_object('success', true, 'before', v_before,
                                                   'enabled', (v_payload->>'enabled')::boolean);
                END IF;
            WHEN 'pvp_horses_set' THEN
                IF jsonb_typeof(v_payload->'enabled') <> 'boolean' THEN
                    v_result := jsonb_build_object('error', 'enabled_required');
                ELSE
                    SELECT horses_enabled INTO v_before
                      FROM public.trivia_pvp_engine_config WHERE id = 1 FOR UPDATE;
                    UPDATE public.trivia_pvp_engine_config
                       SET horses_enabled = (v_payload->>'enabled')::boolean, updated_at = clock_timestamp()
                     WHERE id = 1;
                    v_result := jsonb_build_object('success', true, 'before', v_before,
                                                   'enabled', (v_payload->>'enabled')::boolean);
                END IF;
            WHEN 'tournament_cancel' THEN
                v_result := public.trivia_tournament_operator_cancel(
                    p_target_id, btrim(p_reason), 'operator:' || p_operator_id::text);
            WHEN 'tournament_recover_settlement' THEN
                SELECT lifecycle_state INTO v_lifecycle
                  FROM public.trivia_tournaments WHERE id = p_target_id;
                IF NOT FOUND THEN
                    v_result := jsonb_build_object('error', 'tournament_not_found');
                ELSIF v_lifecycle <> 'settling' THEN
                    v_result := jsonb_build_object('error', 'tournament_not_settling', 'lifecycle', v_lifecycle);
                ELSE
                    -- Phase 12 parses this bounded holder before admitting an
                    -- operator scheduler run. The encoded target makes canary
                    -- authority verifiable without exceeding holder_id's
                    -- 200-character contract; request idempotency remains in
                    -- the immutable operator receipt and target advisory lock.
                    v_holder := 'operator:' || p_operator_id::text || ':canary:' || p_target_id::text;
                    v_lease := public.trivia_tournament_scheduler_acquire(v_holder, 60);
                    IF NOT COALESCE((v_lease->>'owner')::boolean, false) THEN
                        v_result := jsonb_build_object('error', 'scheduler_busy',
                                                       'leaseExpiresAt', v_lease->'lease_expires_at');
                    ELSE
                        v_run_id := (v_lease->>'run_id')::uuid;
                        v_fence := (v_lease->>'fencing_token')::bigint;
                        v_underlying := public.trivia_tournament_settle(p_target_id, v_fence);
                        PERFORM public.trivia_tournament_scheduler_release(v_run_id, v_fence);
                        v_result := v_underlying;
                    END IF;
                END IF;
            WHEN 'incident_note' THEN
                IF COALESCE(v_payload->>'incidentKey', '') !~ '^[A-Za-z0-9_.:@-]{3,120}$'
                   OR length(btrim(COALESCE(v_payload->>'note', ''))) NOT BETWEEN 8 AND 2000
                   OR COALESCE(v_payload->>'severity', 'info') NOT IN ('info', 'warning', 'critical')
                   OR COALESCE(v_payload->>'status', 'open') NOT IN ('open', 'monitoring', 'resolved') THEN
                    v_result := jsonb_build_object('error', 'invalid_incident_note');
                ELSE
                    v_note := true;
                    v_result := jsonb_build_object('success', true,
                                                   'incidentKey', v_payload->>'incidentKey');
                END IF;
            WHEN 'payout_hold' THEN
                v_result := jsonb_build_object(
                    'error', 'unsupported_action',
                    'detail', 'The Phase 2 settlement contract has no payout-only hold at its settlement choke point.'
                );
                v_outcome := 'refused';
            WHEN 'payout_release' THEN
                v_result := jsonb_build_object(
                    'error', 'unsupported_action',
                    'detail', 'No enforceable payout hold exists to release at the Phase 2 settlement choke point.'
                );
                v_outcome := 'refused';
            WHEN 'round_recover' THEN
                v_result := jsonb_build_object(
                    'error', 'unsupported_action',
                    'detail', 'The existing tournament engine has no target-safe round recovery RPC.'
                );
                v_outcome := 'refused';
            WHEN 'match_recover' THEN
                v_result := jsonb_build_object(
                    'error', 'unsupported_action',
                    'detail', 'The existing tournament engine has no target-safe match recovery RPC.'
                );
                v_outcome := 'refused';
        END CASE;
        IF v_outcome <> 'refused' THEN
            IF p_action = 'pvp_recover' THEN
                IF v_result ->> 'outcome' = 'standby'
                   AND COALESCE((v_result ->> 'owner')::boolean, false) IS FALSE THEN
                    -- The fenced runner executed correctly, but this operator
                    -- request did not own or run recovery. Keep that durable
                    -- result distinct and never project it as action success.
                    v_result := v_result || jsonb_build_object(
                        'success', false,
                        'detail', 'PvP recovery already has a canonical owner; this operator request remained standby.'
                    );
                    v_outcome := 'standby';
                ELSIF COALESCE((v_result ->> 'success')::boolean, false) IS TRUE THEN
                    v_outcome := 'succeeded';
                ELSE
                    v_outcome := 'failed';
                END IF;
            ELSE
                v_outcome := CASE
                    WHEN COALESCE((v_result->>'success')::boolean, false)
                      OR COALESCE((v_result->>'settled')::boolean, false)
                    THEN 'succeeded' ELSE 'failed' END;
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
         v_target_kind, p_target_id, v_outcome, v_result);
    IF v_note AND v_outcome = 'succeeded' THEN
        INSERT INTO public.trivia_incident_notes_v1
            (receipt_id, operator_id, incident_key, severity, status, note)
        VALUES
            (v_receipt, p_operator_id, v_payload->>'incidentKey',
             COALESCE(v_payload->>'severity', 'info'), COALESCE(v_payload->>'status', 'open'),
             btrim(v_payload->>'note'));
    END IF;
    RETURN jsonb_build_object(
        'success', v_outcome = 'succeeded', 'receipt_id', v_receipt,
        'replayed', false, 'action', p_action, 'outcome', v_outcome,
        'result', v_result
    );
END
$body$;

-- 8. RLS / ACL BOUNDARY -------------------------------------------------------
ALTER TABLE public.trivia_operator_roles_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_operator_grants_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_operator_events_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_incident_notes_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_operations_alert_episodes_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_operations_alert_events_v1 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
    public.trivia_operator_roles_v1,
    public.trivia_operator_grants_v1,
    public.trivia_operator_events_v1,
    public.trivia_incident_notes_v1,
    public.trivia_operations_alert_episodes_v1,
    public.trivia_operations_alert_events_v1
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.trivia_operations_alert_events_v1_id_seq
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
    public.trivia_p11_forbid_history_mutation(),
    public.trivia_p11_grant_guard(),
    public.trivia_operator_context_core_v1(uuid),
    public.trivia_operator_context_v1(uuid),
    public.trivia_operations_health_v1(uuid,boolean),
    public.trivia_operator_recent_events_v1(uuid,integer),
    public.trivia_operator_support_lookup_v1(uuid,text,uuid),
    public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_operator_context_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_operations_health_v1(uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_operator_recent_events_v1(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_operator_support_lookup_v1(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb) TO service_role;

COMMENT ON FUNCTION public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb) IS
    'Phase 11 exact-once Trivia operator boundary. The verified user id comes from the server; every supported action emits one immutable receipt.';
COMMENT ON FUNCTION public.trivia_operations_health_v1(uuid,boolean) IS
    'Phase 11 cross-domain health. Recording is explicit at read time; no cron, watcher or repair loop drives correctness.';

-- 9. POST-APPLY ASSERTIONS ----------------------------------------------------
DO $postflight$
DECLARE
    v_roles integer;
    v_bad_paths integer;
    v_history_triggers integer;
BEGIN
    SELECT count(*) INTO v_roles FROM public.trivia_operator_roles_v1;
    IF v_roles <> 5 THEN
        RAISE EXCEPTION 'trivia_p11 postflight: expected 5 named operator roles, found %', v_roles;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.trivia_operator_roles_v1
                    WHERE role_key = 'supervisor' AND capabilities @> ARRAY['snapshot','settlement_control']) THEN
        RAISE EXCEPTION 'trivia_p11 postflight: supervisor capability contract is incomplete';
    END IF;
    IF has_function_privilege('anon', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia_p11 postflight: execute RPC ACL is not service-role-only';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname IN ('trivia_operator_roles_v1','trivia_operator_grants_v1',
                             'trivia_operator_events_v1','trivia_incident_notes_v1',
                             'trivia_operations_alert_episodes_v1','trivia_operations_alert_events_v1')
           AND NOT c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'trivia_p11 postflight: every operations table must have RLS enabled';
    END IF;
    SELECT count(*) INTO v_bad_paths
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('trivia_operator_context_core_v1','trivia_operator_context_v1',
                         'trivia_operations_health_v1','trivia_operator_recent_events_v1',
                         'trivia_operator_support_lookup_v1','trivia_operator_execute_v1')
       AND (NOT p.prosecdef OR NOT ('search_path=pg_catalog, public, extensions, pg_temp' = ANY(p.proconfig)));
    IF v_bad_paths <> 0 THEN
        RAISE EXCEPTION 'trivia_p11 postflight: % authority RPC(s) lack SECDEF or fixed search_path', v_bad_paths;
    END IF;
    SELECT count(*) INTO v_history_triggers
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal
       AND c.relname IN ('trivia_operator_events_v1','trivia_incident_notes_v1',
                         'trivia_operations_alert_events_v1')
       AND t.tgname LIKE '%_immutable';
    IF v_history_triggers <> 3 THEN
        RAISE EXCEPTION 'trivia_p11 postflight: immutable history triggers missing';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ============================================================================
-- ROLLBACK / DISABLE (Tier 3, forward-only evidence)
-- ============================================================================
-- This migration is forward-only. Immutable operator events, incident notes
-- and alert transition history must not be dropped, truncated or rewritten.
-- If the action surface must be disabled, apply a NEW migration containing:
--
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION
--   public.trivia_operator_context_v1(uuid),
--   public.trivia_operations_health_v1(uuid,boolean),
--   public.trivia_operator_recent_events_v1(uuid,integer),
--   public.trivia_operator_support_lookup_v1(uuid,text,uuid),
--   public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
-- FROM service_role;
-- UPDATE public.trivia_operator_grants_v1
--    SET active = false, revoked_at = clock_timestamp(),
--        revoked_by = 'forward-disable-migration',
--        revoke_reason = 'Disable Phase 11 operator execution while preserving permanent evidence.'
--  WHERE active;
-- COMMIT;
--
-- Restore only with another reviewed forward migration and new grants.

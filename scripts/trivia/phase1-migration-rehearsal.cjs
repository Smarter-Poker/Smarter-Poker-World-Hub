#!/usr/bin/env node

/**
 * Execute the Phase 1 migration and its behavioral release gates inside one
 * outer transaction. Every fixture, wallet receipt, ACL change, and DDL change
 * is rolled back, on both success and failure.
 *
 * Run against a disposable production clone or staging database by default.
 * The live project is refused unless the operator deliberately supplies the
 * break-glass variable documented below.
 *
 * Required environment (one of):
 *   SUPABASE_DB_URL
 *   SUPABASE_DB_PASSWORD
 * Optional:
 *   SUPABASE_DB_SSL=disable       (local PostgreSQL only)
 *   SUPABASE_PROJECT_REF          (defaults to the checked-in project ref)
 *   TRIVIA_PHASE1_REHEARSAL_TARGET=clone|staging|local
 *   TRIVIA_PHASE1_ALLOW_PRODUCTION_REHEARSAL=true  (break glass)
 */

const fs = require('node:fs');
const path = require('node:path');
let Client;
try {
    ({ Client } = require('pg'));
} catch {
    console.error('The locked pg dependency is required.');
    process.exit(1);
}

const migrationPath = path.resolve(
    process.argv[2] || 'supabase/migrations/20260906120000_trivia_pvp_containment.sql',
);
const databaseUrl = process.env.SUPABASE_DB_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'kuklfnapbkmacvwxktbh';
const productionProjectRef = 'kuklfnapbkmacvwxktbh';
const rehearsalTarget = process.env.TRIVIA_PHASE1_REHEARSAL_TARGET;
const productionBreakGlass = process.env.TRIVIA_PHASE1_ALLOW_PRODUCTION_REHEARSAL === 'true';

function databaseUrlTargetsProduction(value) {
    if (!value) return false;
    try {
        const parsed = new URL(value);
        const username = decodeURIComponent(parsed.username || '');
        return parsed.hostname === `db.${productionProjectRef}.supabase.co`
            || (parsed.hostname.endsWith('.pooler.supabase.com')
                && username === `postgres.${productionProjectRef}`);
    } catch {
        console.error('SUPABASE_DB_URL is invalid.');
        process.exit(1);
    }
}

const productionTarget = projectRef === productionProjectRef
    || databaseUrlTargetsProduction(databaseUrl);
if (productionTarget && !productionBreakGlass) {
    console.error(
        'Refusing rollback rehearsal against the live project. Use a clone/staging target, '
        + 'or deliberately set TRIVIA_PHASE1_ALLOW_PRODUCTION_REHEARSAL=true for break glass.',
    );
    process.exit(1);
}
if (!productionTarget && !['clone', 'staging', 'local'].includes(rehearsalTarget)) {
    console.error('Set TRIVIA_PHASE1_REHEARSAL_TARGET=clone, staging, or local.');
    process.exit(1);
}

if (!databaseUrl && !password) {
    console.error('SUPABASE_DB_URL or SUPABASE_DB_PASSWORD is required.');
    process.exit(1);
}
if (!fs.existsSync(migrationPath)) {
    console.error(`Migration not found: ${path.basename(migrationPath)}`);
    process.exit(1);
}

let source;
try {
    source = fs.readFileSync(migrationPath, 'utf8');
} catch {
    console.error('Migration could not be read.');
    process.exit(1);
}
const beginMarkers = source.match(/^\s*BEGIN;\s*$/gm) || [];
const commitMarkers = source.match(/^\s*COMMIT;\s*$/gm) || [];
if (beginMarkers.length !== 1 || commitMarkers.length !== 1) {
    console.error('Expected exactly one top-level BEGIN; and COMMIT; marker.');
    process.exit(1);
}
const rehearsedSql = source
    .replace(/^\s*BEGIN;\s*$/m, '')
    .replace(/^\s*COMMIT;\s*$/m, '');

function extractEmergencyRollback(sql) {
    const marker = sql.indexOf('-- EMERGENCY ROLLBACK');
    if (marker < 0) throw new Error('emergency_rollback_marker_missing');

    const lines = sql.slice(marker).split(/\r?\n/);
    const begin = lines.findIndex((line) => /^\s*--\s*BEGIN;\s*$/.test(line));
    const commit = lines.findIndex((line, index) => (
        index > begin && /^\s*--\s*COMMIT;\s*$/.test(line)
    ));
    if (begin < 0 || commit < 0) {
        throw new Error('emergency_rollback_boundaries_missing');
    }

    const body = lines
        .slice(begin + 1, commit)
        .map((line) => line.replace(/^\s*-- ?/, ''))
        .join('\n')
        .trim();
    if (!body || /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body)) {
        throw new Error('emergency_rollback_body_unsafe');
    }
    return body;
}

let emergencyRollbackSql;
try {
    emergencyRollbackSql = extractEmergencyRollback(source);
} catch (error) {
    console.error(`Invalid emergency rollback block: ${error.message}`);
    process.exit(1);
}

const configs = databaseUrl
    ? [{
        connectionString: databaseUrl,
        ssl: process.env.SUPABASE_DB_SSL === 'disable'
            ? false
            : { rejectUnauthorized: false },
    }]
    : [
        {
            host: 'aws-0-us-west-2.pooler.supabase.com',
            port: 6543,
            user: `postgres.${projectRef}`,
            password,
            database: 'postgres',
            ssl: { rejectUnauthorized: false },
        },
        {
            host: `db.${projectRef}.supabase.co`,
            port: 5432,
            user: 'postgres',
            password,
            database: 'postgres',
            ssl: { rejectUnauthorized: false },
        },
    ];

async function connect() {
    let lastError;
    for (const config of configs) {
        const client = new Client({
            ...config,
            connectionTimeoutMillis: 10_000,
            statement_timeout: 360_000,
        });
        try {
            await client.connect();
            return client;
        } catch (error) {
            lastError = error;
            await client.end().catch(() => {});
        }
    }
    throw lastError || new Error('database_connection_failed');
}

function assertTrue(condition, message) {
    if (!condition) throw new Error(message);
}

async function expectPermissionDenied(client, savepoint, text, values = []) {
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
        await client.query(text, values);
    } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        if (error.code === '42501') return;
        throw new Error(`${savepoint}_wrong_sqlstate`);
    }
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    throw new Error(`${savepoint}_unexpectedly_allowed`);
}

async function expectRollbackRefusal(client, rollbackSql) {
    const savepoint = 'rollback_refusal_probe';
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
        await client.query(rollbackSql);
    } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        if (error.code === 'P0001'
            && error.message.includes('rollback refused: active/settling PvP matches')) {
            return;
        }
        throw new Error('emergency_rollback_refused_for_wrong_reason');
    }
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    throw new Error('emergency_rollback_failed_to_refuse_active_match');
}

const behaviorSql = `
    CREATE TEMP TABLE phase1_rehearsal_fixture (
        human_id uuid NOT NULL,
        horse_id uuid NOT NULL,
        question_ids uuid[] NOT NULL,
        parity_match_id uuid NOT NULL,
        rollback_match_id uuid NOT NULL
    ) ON COMMIT DROP;

    DO $phase1_behavior$
    DECLARE
        v_human uuid;
        v_horse uuid;
        v_questions uuid[];
        v_nonce uuid := gen_random_uuid();
        v_expired_session uuid := gen_random_uuid();
        v_parity_match uuid := gen_random_uuid();
        v_parity_human_session uuid := gen_random_uuid();
        v_parity_horse_session uuid := gen_random_uuid();
        v_fault_match uuid := gen_random_uuid();
        v_fault_human_session uuid := gen_random_uuid();
        v_fault_horse_session uuid := gen_random_uuid();
        v_rollback_match uuid := gen_random_uuid();
        v_result jsonb;
        v_human_funded integer;
        v_horse_funded integer;
        v_human_before_replay integer;
        v_horse_before_replay integer;
        v_human_before_fault integer;
        v_horse_before_fault integer;
        v_horse_after_injection integer;
        v_receipts_before_replay integer;
        v_receipts_after_replay integer;
        v_count integer;
        v_fault_seen boolean := false;
        v_fault_scope_completed boolean := false;
        v_error_message text;
    BEGIN
        IF EXISTS (
            SELECT 1 FROM public.trivia_pvp_matches
             WHERE status IN ('active', 'settling')
        ) THEN
            RAISE EXCEPTION 'behavior_probe_requires_drained_matches';
        END IF;

        SELECT p.id INTO v_human
          FROM public.profiles AS p
         WHERE p.is_horse IS NOT TRUE
           AND EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p.id)
         ORDER BY p.id
         LIMIT 1
         FOR UPDATE OF p SKIP LOCKED;
        IF v_human IS NULL THEN
            RAISE EXCEPTION 'behavior_probe_human_fixture_unavailable';
        END IF;

        -- Deliberately select from the horse registry, not auth.users. The
        -- release contract says a horse is a profile-backed player; every real
        -- session, score, streak, and ledger FK traversed below must support it.
        SELECT p.id INTO v_horse
          FROM public.profiles AS p
         WHERE p.is_horse IS TRUE
         ORDER BY p.id
         LIMIT 1
         FOR UPDATE OF p SKIP LOCKED;
        IF v_horse IS NULL THEN
            RAISE EXCEPTION 'behavior_probe_horse_fixture_unavailable';
        END IF;

        SELECT array_agg(gen_random_uuid() ORDER BY n)
          INTO v_questions
          FROM generate_series(1, 20) AS n;

        SELECT public.add_diamonds_to_balance(
            v_human, 100, 'adjustment', 'Phase 1 transactional rehearsal funding',
            'phase1_rehearsal_fund_human_' || v_nonce::text
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           OR (v_result ->> 'amount')::integer IS DISTINCT FROM 100
           OR (v_result ->> 'multiplier')::numeric IS DISTINCT FROM 1::numeric THEN
            RAISE EXCEPTION 'behavior_probe_human_funding_failed';
        END IF;

        SELECT public.add_diamonds_to_balance(
            v_horse, 100, 'adjustment', 'Phase 1 transactional rehearsal funding',
            'phase1_rehearsal_fund_horse_' || v_nonce::text
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           OR (v_result ->> 'amount')::integer IS DISTINCT FROM 100
           OR (v_result ->> 'multiplier')::numeric IS DISTINCT FROM 1::numeric THEN
            RAISE EXCEPTION 'behavior_probe_horse_funding_failed';
        END IF;

        SELECT diamonds INTO v_human_funded FROM public.profiles WHERE id = v_human;
        SELECT diamonds INTO v_horse_funded FROM public.profiles WHERE id = v_horse;
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
             WHERE id = v_human AND diamonds = v_human_funded
               AND diamond_balance = v_human_funded
        ) OR NOT EXISTS (
            SELECT 1 FROM public.profiles
             WHERE id = v_horse AND diamonds = v_horse_funded
               AND diamond_balance = v_horse_funded
        ) THEN
            RAISE EXCEPTION 'behavior_probe_funding_alias_drift';
        END IF;

        -- The v2 wrapper must preserve the deadline CAS result from
        -- award_trivia_run and perform no downstream score or wallet writes.
        INSERT INTO public.trivia_sessions (
            id, user_id, mode, question_ids, permutations, status,
            entry_cost, entry_state, created_at, expires_at
        ) VALUES (
            v_expired_session, v_human, 'pvp', v_questions, '{}'::jsonb, 'open',
            0, 'free', clock_timestamp() - interval '2 minutes',
            clock_timestamp() - interval '1 minute'
        );
        SELECT public.award_trivia_run_v2(
            v_expired_session, 100, 10, 20, 20, 0
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS TRUE
           OR v_result ->> 'error' IS DISTINCT FROM 'session_expired'
           OR NOT EXISTS (
               SELECT 1 FROM public.trivia_sessions
                WHERE id = v_expired_session AND status = 'expired'
           )
           OR EXISTS (
               SELECT 1 FROM public.trivia_scores
                WHERE session_id = v_expired_session
           )
           OR EXISTS (
               SELECT 1 FROM public.diamond_transactions
                WHERE reference_id = 'trivia_session_' || v_expired_session::text
           ) THEN
            RAISE EXCEPTION 'behavior_probe_expired_award_failed';
        END IF;

        -- Fully funded human-vs-horse game. The horse wins so both the debit
        -- and positive settlement-credit paths are exercised for the horse.
        INSERT INTO public.trivia_pvp_matches (
            id, player1_id, player2_id, stake_amount, questions, status, created_at
        ) VALUES (
            v_parity_match, v_human, v_horse, 10,
            to_jsonb(v_questions), 'active', clock_timestamp()
        );

        SELECT public.create_trivia_pvp_session_v2(
            v_parity_human_session, v_parity_match, v_human, v_questions, '{}'::jsonb
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           OR COALESCE((v_result ->> 'duplicate')::boolean, false) IS TRUE THEN
            RAISE EXCEPTION 'behavior_probe_human_session_create_failed';
        END IF;

        SELECT public.create_trivia_pvp_session_v2(
            v_parity_horse_session, v_parity_match, v_horse, v_questions, '{}'::jsonb
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           OR COALESCE((v_result ->> 'duplicate')::boolean, false) IS TRUE THEN
            RAISE EXCEPTION 'behavior_probe_horse_session_create_failed';
        END IF;

        IF (SELECT count(*) FROM public.trivia_pvp_session_links
             WHERE match_id = v_parity_match) <> 2
           OR NOT EXISTS (
               SELECT 1 FROM public.profiles
                WHERE id = v_human AND diamonds = v_human_funded - 10
                  AND diamond_balance = v_human_funded - 10
           )
           OR NOT EXISTS (
               SELECT 1 FROM public.profiles
                WHERE id = v_horse AND diamonds = v_horse_funded - 10
                  AND diamond_balance = v_horse_funded - 10
           ) THEN
            RAISE EXCEPTION 'behavior_probe_stake_parity_failed';
        END IF;

        SELECT count(*) INTO v_count
          FROM public.diamond_transactions AS d
         WHERE (
               d.user_id = v_human
               AND d.reference_id = 'pvp_stake_' || v_parity_match::text || '_' || v_human::text
           OR  d.user_id = v_horse
               AND d.reference_id = 'pvp_stake_' || v_parity_match::text || '_' || v_horse::text
         )
           AND d.amount = -10
           AND d.transaction_type = 'pvp_stake'
           AND d.type = 'pvp_stake'
           AND COALESCE((d.metadata ->> 'multiplier')::numeric, 0) = 1;
        IF v_count <> 2 THEN
            RAISE EXCEPTION 'behavior_probe_stake_receipts_failed';
        END IF;

        SELECT public.award_trivia_run_v2(
            v_parity_human_session, 120, 12, 20, 20, 0
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'behavior_probe_on_time_human_award_failed';
        END IF;
        SELECT public.award_trivia_run_v2(
            v_parity_horse_session, 140, 14, 20, 20, 0
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'behavior_probe_on_time_horse_award_failed';
        END IF;

        IF (SELECT count(*) FROM public.trivia_sessions
             WHERE id IN (v_parity_human_session, v_parity_horse_session)
               AND status = 'submitted'
               AND submitted_at IS NOT NULL
               AND submitted_at <= expires_at
               AND diamonds_awarded = 0) <> 2 THEN
            RAISE EXCEPTION 'behavior_probe_on_time_award_state_failed';
        END IF;

        SELECT public.decide_trivia_pvp_settlement_v1(v_parity_match, false)
          INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           OR v_result ->> 'state' IS DISTINCT FROM 'decided'
           OR COALESCE((v_result ->> 'replayed')::boolean, true) IS TRUE
           OR (v_result ->> 'credit_count')::integer IS DISTINCT FROM 1
           OR (v_result ->> 'credited_amount')::integer IS DISTINCT FROM 18 THEN
            RAISE EXCEPTION 'behavior_probe_parity_settlement_failed';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.trivia_pvp_matches
             WHERE id = v_parity_match AND status = 'complete'
               AND completed_at IS NOT NULL AND settlement_kind = 'win'
               AND winner_id = v_horse
               AND player1_score = 12 AND player2_score = 14
               AND challenger_score = 12 AND opponent_score = 14
        ) OR NOT EXISTS (
            SELECT 1 FROM public.trivia_pvp_settlement_decisions
             WHERE match_id = v_parity_match AND decision_kind = 'win'
               AND winner_id = v_horse
               AND jsonb_array_length(credit_plan) = 1
               AND (credit_plan -> 0 ->> 'user_id')::uuid = v_horse
               AND (credit_plan -> 0 ->> 'amount')::integer = 18
        ) THEN
            RAISE EXCEPTION 'behavior_probe_atomic_terminal_state_failed';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
             WHERE id = v_human AND diamonds = v_human_funded - 10
               AND diamond_balance = v_human_funded - 10
        ) OR NOT EXISTS (
            SELECT 1 FROM public.profiles
             WHERE id = v_horse AND diamonds = v_horse_funded + 8
               AND diamond_balance = v_horse_funded + 8
        ) OR (SELECT count(*) FROM public.diamond_transactions AS d
               WHERE d.user_id = v_horse
                 AND d.reference_id = 'pvp_match_win_' || v_parity_match::text
                 AND d.amount = 18
                 AND d.transaction_type = 'pvp_win'
                 AND d.type = 'pvp_win'
                 AND COALESCE((d.metadata ->> 'multiplier')::numeric, 0) = 1) <> 1 THEN
            RAISE EXCEPTION 'behavior_probe_exact_horse_credit_failed';
        END IF;

        SELECT diamonds INTO v_human_before_replay
          FROM public.profiles WHERE id = v_human;
        SELECT diamonds INTO v_horse_before_replay
          FROM public.profiles WHERE id = v_horse;
        SELECT count(*) INTO v_receipts_before_replay
          FROM public.diamond_transactions
         WHERE reference_id IN (
            'pvp_stake_' || v_parity_match::text || '_' || v_human::text,
            'pvp_stake_' || v_parity_match::text || '_' || v_horse::text,
            'pvp_match_win_' || v_parity_match::text
         );

        SELECT public.decide_trivia_pvp_settlement_v1(v_parity_match, false)
          INTO v_result;
        SELECT count(*) INTO v_receipts_after_replay
          FROM public.diamond_transactions
         WHERE reference_id IN (
            'pvp_stake_' || v_parity_match::text || '_' || v_human::text,
            'pvp_stake_' || v_parity_match::text || '_' || v_horse::text,
            'pvp_match_win_' || v_parity_match::text
         );
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           OR v_result ->> 'state' IS DISTINCT FROM 'replay'
           OR COALESCE((v_result ->> 'replayed')::boolean, false) IS NOT TRUE
           OR (v_result ->> 'credit_count')::integer IS DISTINCT FROM 1
           OR (v_result ->> 'credited_amount')::integer IS DISTINCT FROM 18
           OR v_receipts_after_replay IS DISTINCT FROM v_receipts_before_replay
           OR (SELECT diamonds FROM public.profiles WHERE id = v_human)
                IS DISTINCT FROM v_human_before_replay
           OR (SELECT diamonds FROM public.profiles WHERE id = v_horse)
                IS DISTINCT FROM v_horse_before_replay
           OR (SELECT count(*) FROM public.trivia_pvp_settlement_decisions
                WHERE match_id = v_parity_match) <> 1 THEN
            RAISE EXCEPTION 'behavior_probe_settlement_replay_failed';
        END IF;

        -- A tied game has two credits. Seed a duplicate for the second credit:
        -- the first refund must be undone together with the decision and
        -- settling transition when the second credit is rejected.
        INSERT INTO public.trivia_pvp_matches (
            id, player1_id, player2_id, stake_amount, questions, status, created_at
        ) VALUES (
            v_fault_match, v_human, v_horse, 10,
            to_jsonb(v_questions), 'active', clock_timestamp()
        );
        SELECT public.create_trivia_pvp_session_v2(
            v_fault_human_session, v_fault_match, v_human, v_questions, '{}'::jsonb
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'behavior_probe_fault_human_session_failed';
        END IF;
        SELECT public.create_trivia_pvp_session_v2(
            v_fault_horse_session, v_fault_match, v_horse, v_questions, '{}'::jsonb
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'behavior_probe_fault_horse_session_failed';
        END IF;
        SELECT public.award_trivia_run_v2(
            v_fault_human_session, 130, 13, 20, 20, 0
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'behavior_probe_fault_human_award_failed';
        END IF;
        SELECT public.award_trivia_run_v2(
            v_fault_horse_session, 130, 13, 20, 20, 0
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'behavior_probe_fault_horse_award_failed';
        END IF;

        SELECT diamonds INTO v_human_before_fault
          FROM public.profiles WHERE id = v_human;
        SELECT diamonds INTO v_horse_before_fault
          FROM public.profiles WHERE id = v_horse;
        -- The outer exception block is a PostgreSQL subtransaction. It rolls
        -- the canonical injected credit back after the inner statement-level
        -- rollback assertions, without ever deleting a ledger row.
        BEGIN
            SELECT public.add_diamonds_to_balance(
                v_horse, 10, 'pvp_refund',
                'Phase 1 duplicate-credit fault injection',
                'pvp_tie_refund_' || v_fault_match::text || '_' || v_horse::text
            ) INTO v_result;
            IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
               OR (v_result ->> 'amount')::integer IS DISTINCT FROM 10
               OR (v_result ->> 'multiplier')::numeric IS DISTINCT FROM 1::numeric THEN
                RAISE EXCEPTION 'behavior_probe_fault_injection_failed';
            END IF;
            SELECT diamonds INTO v_horse_after_injection
              FROM public.profiles WHERE id = v_horse;
            IF v_horse_after_injection IS DISTINCT FROM v_horse_before_fault + 10 THEN
                RAISE EXCEPTION 'behavior_probe_fault_injection_balance_failed';
            END IF;

            BEGIN
                PERFORM public.decide_trivia_pvp_settlement_v1(v_fault_match, false);
                RAISE EXCEPTION 'duplicate_credit_probe_unexpectedly_succeeded';
            EXCEPTION WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
                IF v_error_message LIKE 'atomic PvP credit rejected for match %'
                   AND strpos(
                       v_error_message,
                       'pvp_tie_refund_' || v_fault_match::text || '_' || v_horse::text
                   ) > 0 THEN
                    v_fault_seen := true;
                ELSE
                    RAISE EXCEPTION 'duplicate_credit_probe_unexpected_failure';
                END IF;
            END;

            IF v_fault_seen IS NOT TRUE
               OR NOT EXISTS (
                   SELECT 1 FROM public.trivia_pvp_matches
                    WHERE id = v_fault_match AND status = 'active'
                      AND winner_id IS NULL AND settlement_kind IS NULL
                      AND completed_at IS NULL
               )
               OR EXISTS (
                   SELECT 1 FROM public.trivia_pvp_settlement_decisions
                    WHERE match_id = v_fault_match
               )
               OR EXISTS (
                   SELECT 1 FROM public.diamond_transactions
                    WHERE reference_id =
                        'pvp_tie_refund_' || v_fault_match::text || '_' || v_human::text
               )
               OR (SELECT count(*) FROM public.diamond_transactions
                    WHERE reference_id =
                        'pvp_tie_refund_' || v_fault_match::text || '_' || v_horse::text
                      AND user_id = v_horse AND amount = 10
                      AND transaction_type = 'pvp_refund') <> 1
               OR (SELECT diamonds FROM public.profiles WHERE id = v_human)
                    IS DISTINCT FROM v_human_before_fault
               OR (SELECT diamonds FROM public.profiles WHERE id = v_horse)
                    IS DISTINCT FROM v_horse_after_injection THEN
                RAISE EXCEPTION 'behavior_probe_duplicate_credit_rollback_failed';
            END IF;

            RAISE EXCEPTION 'duplicate_credit_probe_scope_complete';
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
            IF v_error_message = 'duplicate_credit_probe_scope_complete' THEN
                v_fault_scope_completed := true;
            ELSE
                RAISE;
            END IF;
        END;

        IF v_fault_scope_completed IS NOT TRUE
           OR (SELECT diamonds FROM public.profiles WHERE id = v_human)
                IS DISTINCT FROM v_human_before_fault
           OR (SELECT diamonds FROM public.profiles WHERE id = v_horse)
                IS DISTINCT FROM v_horse_before_fault
           OR EXISTS (
               SELECT 1 FROM public.diamond_transactions
                WHERE reference_id IN (
                    'pvp_tie_refund_' || v_fault_match::text || '_' || v_human::text,
                    'pvp_tie_refund_' || v_fault_match::text || '_' || v_horse::text
                )
           ) THEN
            RAISE EXCEPTION 'behavior_probe_fault_scope_cleanup_failed';
        END IF;

        SELECT public.decide_trivia_pvp_settlement_v1(v_fault_match, false)
          INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           OR v_result ->> 'state' IS DISTINCT FROM 'decided'
           OR (v_result ->> 'credit_count')::integer IS DISTINCT FROM 2
           OR (v_result ->> 'credited_amount')::integer IS DISTINCT FROM 20 THEN
            RAISE EXCEPTION 'behavior_probe_duplicate_credit_retry_envelope_failed';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.trivia_pvp_matches
             WHERE id = v_fault_match AND status = 'complete'
               AND settlement_kind = 'tie' AND winner_id IS NULL
        ) THEN
            RAISE EXCEPTION 'behavior_probe_duplicate_credit_retry_state_failed';
        END IF;
        IF (SELECT count(*) FROM public.diamond_transactions
             WHERE reference_id =
               'pvp_tie_refund_' || v_fault_match::text || '_' || v_human::text
               AND user_id = v_human AND amount = 10
               AND transaction_type = 'pvp_refund') <> 1 THEN
            RAISE EXCEPTION 'behavior_probe_duplicate_credit_retry_human_receipt_failed';
        END IF;
        IF (SELECT count(*) FROM public.diamond_transactions
             WHERE reference_id =
               'pvp_tie_refund_' || v_fault_match::text || '_' || v_horse::text
               AND user_id = v_horse AND amount = 10
               AND transaction_type = 'pvp_refund') <> 1 THEN
            RAISE EXCEPTION 'behavior_probe_duplicate_credit_retry_horse_receipt_failed';
        END IF;

        -- Leave exactly one stale, unfunded match for the executable rollback
        -- refusal probe. It is drained through the same settlement RPC later.
        INSERT INTO public.trivia_pvp_matches (
            id, player1_id, player2_id, stake_amount, questions, status, created_at
        ) VALUES (
            v_rollback_match, v_human, v_horse, 10,
            to_jsonb(v_questions), 'active',
            clock_timestamp() - interval '31 minutes'
        );
        INSERT INTO pg_temp.phase1_rehearsal_fixture (
            human_id, horse_id, question_ids, parity_match_id, rollback_match_id
        ) VALUES (
            v_human, v_horse, v_questions, v_parity_match, v_rollback_match
        );
    END
    $phase1_behavior$;
`;

async function main() {
    let client;
    let began = false;
    let stage = 'connect';
    try {
        client = await connect();
        stage = 'begin_outer_transaction';
        await client.query('BEGIN');
        began = true;
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '6min'");
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '7min'");
        await client.query(`
            SELECT set_config('request.jwt.claim.role', 'service_role', true),
                   set_config('request.jwt.claim.sub', '', true)
        `);

        stage = 'apply_migration';
        await client.query(rehearsedSql);

        stage = 'structural_postconditions';
        const structural = (await client.query(`
            SELECT
                to_regclass('public.trivia_pvp_session_links') IS NOT NULL AS links_exist,
                to_regclass('public.trivia_pvp_active_seats') IS NOT NULL AS seats_exist,
                to_regclass('public.competitive_quarantine') IS NOT NULL AS quarantine_exists,
                to_regclass('public.trivia_pvp_settlement_decisions') IS NOT NULL
                    AS decisions_exist,
                to_regprocedure('public.decide_trivia_pvp_settlement_v1(uuid,boolean)')
                    IS NOT NULL AS settlement_exists
        `)).rows[0] || {};
        assertTrue(Object.values(structural).every(Boolean), 'rehearsal_postcondition_failed');

        stage = 'behavioral_matrix';
        await client.query(behaviorSql);
        const fixture = (await client.query(`
            SELECT human_id, question_ids, rollback_match_id
              FROM pg_temp.phase1_rehearsal_fixture
        `)).rows[0];
        assertTrue(fixture, 'behavior_fixture_missing');

        stage = 'browser_denial_matrix';
        for (const role of ['authenticated', 'anon']) {
            await client.query('RESET ROLE');
            const roleUserId = role === 'authenticated'
                ? fixture.human_id
                : '00000000-0000-4000-8000-000000000001';
            await client.query(
                "SELECT set_config('request.jwt.claim.role', $1, true), "
                + "set_config('request.jwt.claim.sub', $2, true), "
                + "set_config('request.jwt.claims', "
                + "jsonb_build_object('role', $1, 'sub', $2)::text, true)",
                [role, roleUserId],
            );
            await client.query(`SET LOCAL ROLE ${role}`);
            const assumedRole = (await client.query('SELECT current_user AS role')).rows[0]?.role;
            assertTrue(assumedRole === role, `${role}_role_assumption_failed`);

            const prefix = `deny_${role}`;
            await expectPermissionDenied(client, `${prefix}_queue_insert`, `
                INSERT INTO public.trivia_pvp_queue (
                    user_id, stake_amount, status, created_at, expires_at
                ) VALUES ($1, 10, 'cancelled', clock_timestamp(), clock_timestamp())
            `, [roleUserId]);
            for (const table of [
                'trivia_pvp_matches', 'trivia_sessions',
                'trivia_tournaments', 'trivia_tournament_entries',
                'trivia_tournament_rounds',
            ]) {
                await expectPermissionDenied(client, `${prefix}_${table}_update`, `
                    UPDATE public.${table} SET id = id WHERE false
                `);
                await expectPermissionDenied(client, `${prefix}_${table}_delete`, `
                    DELETE FROM public.${table} WHERE false
                `);
            }
            for (const table of [
                'trivia_tournaments', 'trivia_tournament_entries',
                'trivia_tournament_rounds', 'trivia_tournaments_public',
            ]) {
                await expectPermissionDenied(client, `${prefix}_${table}_select`, `
                    SELECT count(*) FROM public.${table}
                `);
            }
            const threeParams = [fixture.rollback_match_id, roleUserId, fixture.question_ids];
            const twoParams = [fixture.rollback_match_id, roleUserId];
            const oneParam = [fixture.rollback_match_id];
            for (const [suffix, sql, values] of [
                ['generic_create', `SELECT public.create_trivia_session_v2(
                    $1::uuid, $2::uuid, 'pvp', $3::uuid[], '{}'::jsonb, NULL
                )`, threeParams],
                ['generic_answer', `SELECT public.record_trivia_session_answer(
                    $1::uuid, $2::uuid, ($3::uuid[])[1], 0
                )`, threeParams],
                ['pvp_create', `SELECT public.create_trivia_pvp_session_v2(
                    $1::uuid, $1::uuid, $2::uuid, $3::uuid[], '{}'::jsonb
                )`, threeParams],
                ['settlement', 'SELECT public.decide_trivia_pvp_settlement_v1($1::uuid, true)', oneParam],
                ['award_core', 'SELECT public.award_trivia_run($1::uuid, 0, 0, 20, 0)', oneParam],
                ['award_v2', 'SELECT public.award_trivia_run_v2($1::uuid, 0, 0, 20, 20, 0)', oneParam],
                ['stats', 'SELECT public.record_trivia_pvp_stats_v2($1::uuid)', oneParam],
                ['tournament_enter', 'SELECT public.enter_trivia_tournament_v2($1::uuid, $2::uuid)', twoParams],
                ['tournament_score', 'SELECT public.fn_trivia_tournament_add_entry_score($1::uuid, 0, 0)', oneParam],
                ['tournament_payout', 'SELECT public.fn_trivia_tournament_payout($1::uuid)', oneParam],
                ['tournament_results', `SELECT public.record_trivia_tournament_question_results_v3(
                    $2::uuid, $1::uuid, '[]'::jsonb
                )`, twoParams],
                ['tournament_submit', `SELECT public.fn_trivia_round_submit_verified_v3(
                    $1::uuid, $2::uuid, 0, 0, '[]'::jsonb
                )`, twoParams],
            ]) {
                await expectPermissionDenied(client, `${prefix}_${suffix}`, sql, values);
            }
            await expectPermissionDenied(client, `${prefix}_queue_sweep`, `
                SELECT public.expire_old_queue_entries()
            `);
        }
        await client.query('RESET ROLE');
        await client.query(`
            SELECT set_config('request.jwt.claim.role', 'service_role', true),
                   set_config('request.jwt.claim.sub', '', true)
        `);

        stage = 'emergency_rollback_refusal';
        await expectRollbackRefusal(client, emergencyRollbackSql);

        stage = 'drain_rollback_fixture';
        const drain = (await client.query(`
            SELECT public.decide_trivia_pvp_settlement_v1($1::uuid, true) AS result
        `, [fixture.rollback_match_id])).rows[0]?.result || {};
        assertTrue(
            drain.success === true
                && drain.state === 'decided'
                && drain.match_status === 'complete'
                && drain.credited_amount === 0
                && drain.decision?.kind === 'void',
            'rollback_fixture_drain_failed',
        );

        stage = 'emergency_forward_containment';
        await client.query(emergencyRollbackSql);
        const rolled = (await client.query(`
            SELECT
                NOT has_function_privilege(
                    'service_role',
                    'public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)',
                    'EXECUTE'
                ) AS entry_revoked,
                NOT has_function_privilege(
                    'service_role',
                    'public.decide_trivia_pvp_settlement_v1(uuid,boolean)',
                    'EXECUTE'
                ) AS settlement_revoked,
                NOT has_function_privilege(
                    'service_role',
                    'public.record_trivia_pvp_stats_v2(uuid)',
                    'EXECUTE'
                ) AS stats_revoked,
                has_function_privilege(
                    'service_role',
                    'public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)',
                    'EXECUTE'
                ) AS award_path_preserved,
                NOT has_table_privilege(
                    'authenticated', 'public.trivia_pvp_matches', 'INSERT'
                ) AND NOT has_table_privilege(
                    'authenticated', 'public.trivia_pvp_matches', 'UPDATE'
                ) AND NOT has_table_privilege(
                    'authenticated', 'public.trivia_pvp_matches', 'DELETE'
                ) AS browser_match_writes_still_denied,
                NOT has_table_privilege(
                    'authenticated', 'public.trivia_pvp_queue', 'INSERT'
                ) AND NOT has_table_privilege(
                    'authenticated', 'public.trivia_pvp_queue', 'UPDATE'
                ) AND NOT has_table_privilege(
                    'authenticated', 'public.trivia_pvp_queue', 'DELETE'
                ) AS browser_queue_writes_still_denied,
                to_regclass('public.trivia_pvp_session_links') IS NOT NULL
                    AS links_preserved,
                to_regclass('public.trivia_pvp_active_seats') IS NOT NULL
                    AS seats_preserved,
                to_regclass('public.competitive_quarantine') IS NOT NULL
                    AS quarantine_preserved,
                to_regclass('public.trivia_pvp_settlement_decisions') IS NOT NULL
                    AS decisions_preserved
        `)).rows[0] || {};
        assertTrue(
            Object.values(rolled).every(Boolean),
            'rollback_rehearsal_postcondition_failed',
        );

        stage = 'final_outer_rollback';
        await client.query('ROLLBACK');
        began = false;
        console.log(
            `Phase 1 migration behavioral rehearsal passed and rolled back: ${path.basename(migrationPath)}`,
        );
    } catch (error) {
        if (began && client) await client.query('ROLLBACK').catch(() => {});
        const sqlstate = typeof error?.code === 'string' ? ` (SQLSTATE ${error.code})` : '';
        const diagnostic = String(error?.message || 'unknown_error')
            .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
            .replace(/[\r\n]+/g, ' ')
            .slice(0, 240);
        console.error(`Phase 1 migration rehearsal failed at ${stage}${sqlstate}: ${diagnostic}`);
        process.exitCode = 1;
    } finally {
        if (client) await client.end().catch(() => {});
    }
}

main();

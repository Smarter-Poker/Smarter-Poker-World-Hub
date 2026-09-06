#!/usr/bin/env node

/**
 * Direct-Postgres release gate for Phase 1 competitive Trivia containment.
 *
 * REST/service-role reads cannot prove that browser roles lost write/execute
 * capabilities. This verifier binds both endpoints to the checked-in Supabase
 * project, inspects exact catalog contracts, and runs rollback-only abuse
 * probes as the real anon/authenticated roles. Output is aggregate/schema-only.
 */
const { Client } = require('pg');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'kuklfnapbkmacvwxktbh';
const NIL_UUID = '00000000-0000-4000-8000-000000000001';
const NIL_UUID_2 = '00000000-0000-4000-8000-000000000002';
const NIL_UUID_3 = '00000000-0000-4000-8000-000000000003';

const INTERNAL_TABLES = Object.freeze([
    'trivia_pvp_active_seats',
    'trivia_pvp_session_links',
    'trivia_pvp_settlement_decisions',
    'competitive_quarantine',
]);

const REQUIRED_TABLES = Object.freeze([
    'trivia_pvp_queue',
    'trivia_pvp_matches',
    'trivia_sessions',
    'trivia_tournaments',
    'trivia_tournament_entries',
    'trivia_tournament_rounds',
    ...INTERNAL_TABLES,
]);

const RPC_SIGNATURES = Object.freeze([
    'public.expire_old_queue_entries()',
    'public.create_trivia_session_v2(uuid,uuid,text,uuid[],jsonb,uuid)',
    'public.record_trivia_session_answer(uuid,uuid,uuid,integer)',
    'public.award_trivia_run(uuid,integer,integer,integer,integer)',
    'public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)',
    'public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)',
    'public.decide_trivia_pvp_settlement_v1(uuid,boolean)',
    'public.record_trivia_pvp_stats_v2(uuid)',
    'public.enter_trivia_tournament_v2(uuid,uuid)',
    'public.fn_trivia_tournament_add_entry_score(uuid,integer,integer)',
    'public.fn_trivia_tournament_payout(uuid)',
    'public.record_trivia_tournament_question_results_v3(uuid,uuid,jsonb)',
    'public.fn_trivia_round_submit_verified_v3(uuid,uuid,integer,integer,jsonb)',
]);

const RPC_SEARCH_PATHS = Object.freeze({
    'public.expire_old_queue_entries()': 'search_path=""',
    'public.create_trivia_session_v2(uuid,uuid,text,uuid[],jsonb,uuid)': 'search_path=public, extensions',
    'public.record_trivia_session_answer(uuid,uuid,uuid,integer)': 'search_path=public',
    'public.award_trivia_run(uuid,integer,integer,integer,integer)': 'search_path=public, extensions',
    'public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)': 'search_path=public, extensions',
    'public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)': 'search_path=public, extensions',
    'public.decide_trivia_pvp_settlement_v1(uuid,boolean)': 'search_path=public, extensions',
    'public.record_trivia_pvp_stats_v2(uuid)': 'search_path=public, extensions',
    'public.enter_trivia_tournament_v2(uuid,uuid)': 'search_path=public, extensions',
    'public.fn_trivia_tournament_add_entry_score(uuid,integer,integer)': 'search_path=""',
    'public.fn_trivia_tournament_payout(uuid)': 'search_path=""',
    'public.record_trivia_tournament_question_results_v3(uuid,uuid,jsonb)': 'search_path=public',
    'public.fn_trivia_round_submit_verified_v3(uuid,uuid,integer,integer,jsonb)': 'search_path=public',
});

const TRIGGER_FUNCTION_SIGNATURES = Object.freeze([
    'public.fn_trivia_pvp_match_sync_columns()',
    'public.sync_trivia_pvp_active_seats()',
    'public.validate_trivia_pvp_session_link()',
    'public.prevent_competitive_evidence_mutation()',
    'public.prevent_linked_trivia_pvp_identity_change()',
    'public.prevent_linked_trivia_session_identity_change()',
]);

const EXPECTED_POLICIES = Object.freeze([
    ['trivia_pvp_queue', 'trivia_pvp_queue_select_own', 'SELECT', '{authenticated}'],
    ['trivia_pvp_queue', 'trivia_pvp_queue_service_manage', 'ALL', '{service_role}'],
    ['trivia_pvp_matches', 'trivia_pvp_matches_select_participant', 'SELECT', '{authenticated}'],
    ['trivia_pvp_matches', 'trivia_pvp_matches_service_manage', 'ALL', '{service_role}'],
    ['trivia_sessions', 'trivia_sessions_select_own', 'SELECT', '{authenticated}'],
    ['trivia_tournaments', 'trivia_tournaments_service_manage', 'ALL', '{service_role}'],
    ['trivia_tournament_entries', 'trivia_tournament_entries_service_manage', 'ALL', '{service_role}'],
    ['trivia_tournament_rounds', 'trivia_tournament_rounds_service_manage', 'ALL', '{service_role}'],
    ['trivia_pvp_active_seats', 'trivia_pvp_active_seats_service_select', 'SELECT', '{service_role}'],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_service_select', 'SELECT', '{service_role}'],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_service_select', 'SELECT', '{service_role}'],
    ['competitive_quarantine', 'competitive_quarantine_service_select', 'SELECT', '{service_role}'],
]);

const EXPECTED_TRIGGERS = Object.freeze([
    ['trivia_pvp_matches', 'trg_trivia_pvp_match_sync', 'fn_trivia_pvp_match_sync_columns', 23],
    ['trivia_pvp_matches', 'trg_sync_trivia_pvp_active_seats', 'sync_trivia_pvp_active_seats', 29],
    ['trivia_pvp_matches', 'trg_00_guard_quarantined_pvp_match', 'prevent_competitive_evidence_mutation', 27],
    ['trivia_pvp_matches', 'trg_prevent_linked_trivia_pvp_identity_change', 'prevent_linked_trivia_pvp_identity_change', 23],
    ['trivia_pvp_session_links', 'trg_validate_trivia_pvp_session_link', 'validate_trivia_pvp_session_link', 23],
    ['trivia_sessions', 'trg_prevent_linked_trivia_session_identity_change', 'prevent_linked_trivia_session_identity_change', 19],
    ['trivia_sessions', 'trg_trivia_session_stats_v3', 'trg_finalize_trivia_session_stats_v3', 17],
    ['trivia_tournaments', 'trg_00_guard_quarantined_tournament', 'prevent_competitive_evidence_mutation', 27],
    ['trivia_tournament_entries', 'trg_00_guard_quarantined_tournament_entry', 'prevent_competitive_evidence_mutation', 31],
    ['trivia_tournament_entries', 'trg_trivia_tournament_player_count', 'fn_trivia_tournament_sync_player_count', 13],
    ['trivia_tournament_rounds', 'trg_00_guard_quarantined_tournament_round', 'prevent_competitive_evidence_mutation', 31],
    ['competitive_quarantine', 'trg_00_freeze_competitive_quarantine', 'prevent_competitive_evidence_mutation', 27],
    ['trivia_pvp_settlement_decisions', 'trg_00_freeze_pvp_settlement_decision', 'prevent_competitive_evidence_mutation', 27],
]);

const EXPECTED_CONSTRAINTS = Object.freeze([
    ['trivia_pvp_matches', 'trivia_pvp_matches_distinct_players_check', 'c', ['player1_id', 'player2_id', '<>']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_allowed_stake_check', 'c', ['stake_amount', '10', '25', '50', '100']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_winner_participant_check', 'c', ['winner_id', 'player1_id', 'player2_id']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_score_bounds_check', 'c', ['player1_score', 'player2_score', 'challenger_score', 'opponent_score', '20']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_score_aliases_check', 'c', ['player1_score', 'challenger_score', 'player2_score', 'opponent_score']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_status_check', 'c', ['pending', 'active', 'settling', 'abandoned']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_settlement_kind_check', 'c', ['settlement_kind', 'win', 'tie', 'refund', 'void']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_player1_profile_fkey', 'f', ['foreign key (player1_id)', 'references profiles(id)', 'on delete restrict']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_player2_profile_fkey', 'f', ['foreign key (player2_id)', 'references profiles(id)', 'on delete restrict']],
    ['trivia_pvp_matches', 'trivia_pvp_matches_winner_profile_fkey', 'f', ['foreign key (winner_id)', 'references profiles(id)', 'on delete restrict']],
    ['trivia_pvp_queue', 'trivia_pvp_queue_allowed_stake_check', 'c', ['stake_amount', '10', '25', '50', '100']],
    ['trivia_pvp_queue', 'trivia_pvp_queue_status_check', 'c', ['waiting', 'matched', 'cancelled', 'expired']],
    ['trivia_pvp_queue', 'trivia_pvp_queue_match_fkey', 'f', ['foreign key (match_id)', 'references trivia_pvp_matches(id)', 'on delete restrict']],
    ['trivia_pvp_active_seats', 'trivia_pvp_active_seats_pkey', 'p', ['primary key (match_id, side)']],
    ['trivia_pvp_active_seats', 'trivia_pvp_active_seats_one_match_per_user', 'u', ['unique (user_id)']],
    ['trivia_pvp_active_seats', 'trivia_pvp_active_seats_side_check', 'c', ['side', '1', '2']],
    ['trivia_pvp_active_seats', 'trivia_pvp_active_seats_match_fkey', 'f', ['foreign key (match_id)', 'references trivia_pvp_matches(id)', 'on delete cascade']],
    ['trivia_pvp_active_seats', 'trivia_pvp_active_seats_user_fkey', 'f', ['foreign key (user_id)', 'references profiles(id)', 'on delete restrict']],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_pkey', 'p', ['primary key (match_id, side)']],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_match_user_key', 'u', ['unique (match_id, user_id)']],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_session_key', 'u', ['unique (session_id)']],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_side_check', 'c', ['side', '1', '2']],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_match_fkey', 'f', ['foreign key (match_id)', 'references trivia_pvp_matches(id)', 'on delete restrict']],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_user_fkey', 'f', ['foreign key (user_id)', 'references profiles(id)', 'on delete restrict']],
    ['trivia_pvp_session_links', 'trivia_pvp_session_links_session_fkey', 'f', ['foreign key (session_id)', 'references trivia_sessions(id)', 'on delete restrict']],
    ['competitive_quarantine', 'competitive_quarantine_pkey', 'p', ['primary key (entity_type, entity_id)']],
    ['competitive_quarantine', 'competitive_quarantine_entity_type_check', 'c', ['trivia_pvp_match', 'trivia_tournament']],
    ['competitive_quarantine', 'competitive_quarantine_reason_check', 'c', ['legacy_abandoned_human_horse_refund_incident', 'legacy_8_horse_184_pool_unsettled']],
    ['competitive_quarantine', 'competitive_quarantine_snapshot_object_check', 'c', ['jsonb_typeof', 'invariant_snapshot', 'object']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_pkey', 'p', ['primary key (match_id)']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_match_fkey', 'f', ['foreign key (match_id)', 'references trivia_pvp_matches(id)', 'on delete restrict']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_winner_fkey', 'f', ['foreign key (winner_id)', 'references profiles(id)', 'on delete restrict']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_kind_check', 'c', ['decision_kind', 'win', 'tie', 'refund', 'void']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_winner_check', 'c', ['decision_kind', 'winner_id']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_score_check', 'c', ['player1_score', 'player2_score', '20']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_reference_key', 'u', ['unique (reference_family)']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_reference_check', 'c', ['reference_family', 'pvp_settlement_', 'match_id']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_side_state_check', 'c', ['jsonb_typeof', 'side_state', 'jsonb_array_length', '2']],
    ['trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_credit_plan_check', 'c', ['jsonb_typeof', 'credit_plan', 'array']],
]);

const EXPECTED_INDEXES = Object.freeze([
    ['trivia_pvp_queue', 'idx_pvp_queue_matching', false, ['stake_amount', 'status', 'created_at'], ['status', 'waiting']],
    ['trivia_pvp_queue', 'idx_pvp_queue_one_waiting', true, ['user_id'], ['status', 'waiting']],
    ['trivia_pvp_queue', 'idx_pvp_queue_expiry', false, ['expires_at'], ['status', 'waiting']],
    ['trivia_pvp_queue', 'idx_pvp_queue_match', false, ['match_id'], ['match_id', 'not null']],
    ['trivia_pvp_matches', 'idx_pvp_matches_player1', false, ['player1_id'], []],
    ['trivia_pvp_matches', 'idx_pvp_matches_player2', false, ['player2_id'], []],
    ['trivia_pvp_matches', 'idx_pvp_matches_winner', false, ['winner_id'], ['winner_id', 'not null']],
    ['trivia_pvp_matches', 'idx_pvp_matches_open', false, ['status', 'created_at desc'], ['status', 'active', 'settling']],
    ['trivia_pvp_session_links', 'idx_trivia_pvp_session_links_user', false, ['user_id', 'match_id'], []],
]);

function compactSql(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function sortedJson(value) {
    return JSON.stringify([...value].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

function sortedLedger(value) {
    return sortedJson(Object.entries(value || {}).map(([movementType, summary]) => [
        movementType,
        Number(summary?.count),
        Number(summary?.net),
        Number(summary?.missing),
    ]));
}

function assertProjectBinding() {
    const restUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!restUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for project binding');
    let rest;
    try { rest = new URL(restUrl); } catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL is invalid'); }
    if (rest.protocol !== 'https:' || rest.hostname !== `${PROJECT_REF}.supabase.co`) {
        throw new Error('REST endpoint does not match SUPABASE_PROJECT_REF');
    }
    if (!process.env.SUPABASE_DB_URL) return;
    let database;
    try { database = new URL(process.env.SUPABASE_DB_URL); } catch {
        throw new Error('SUPABASE_DB_URL is invalid');
    }
    const username = decodeURIComponent(database.username || '');
    const direct = database.hostname === `db.${PROJECT_REF}.supabase.co` && username === 'postgres';
    const pooler = database.hostname.endsWith('.pooler.supabase.com')
        && username === `postgres.${PROJECT_REF}`;
    if (!direct && !pooler) throw new Error('database endpoint does not match SUPABASE_PROJECT_REF');
}

function connectionConfigs() {
    assertProjectBinding();
    if (process.env.SUPABASE_DB_URL) {
        return [{
            connectionString: process.env.SUPABASE_DB_URL,
            ssl: process.env.SUPABASE_DB_SSL === 'disable' ? false : { rejectUnauthorized: false },
        }];
    }
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!password) return [];
    return [
        { host: 'aws-0-us-west-2.pooler.supabase.com', port: 6543, user: `postgres.${PROJECT_REF}`, password, database: 'postgres', ssl: { rejectUnauthorized: false } },
        { host: `db.${PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', password, database: 'postgres', ssl: { rejectUnauthorized: false } },
    ];
}

async function connect() {
    const configs = connectionConfigs();
    if (configs.length === 0) throw new Error('SUPABASE_DB_URL or SUPABASE_DB_PASSWORD is required');
    let lastError;
    for (const config of configs) {
        const client = new Client({ ...config, connectionTimeoutMillis: 10_000, statement_timeout: 60_000, application_name: 'trivia_phase1_production_verifier' });
        try {
            await client.connect();
            return client;
        } catch (error) {
            lastError = error;
            await client.end().catch(() => {});
        }
    }
    throw lastError || new Error('production_database_connection_failed');
}

async function privilege(client, role, object, permission, kind = 'table') {
    const fn = kind === 'function' ? 'has_function_privilege' : 'has_table_privilege';
    const { rows } = await client.query(`SELECT ${fn}($1, $2, $3) AS allowed`, [role, object, permission]);
    return rows[0]?.allowed === true;
}

async function setProbeRole(client, role, userId = NIL_UUID) {
    await client.query('RESET ROLE');
    await client.query(
        `SELECT set_config('request.jwt.claim.sub', $1, true),
                set_config('request.jwt.claim.role', $2, true),
                set_config('request.jwt.claims', jsonb_build_object('sub', $1, 'role', $2)::text, true)`,
        [userId, role],
    );
    await client.query(`SET LOCAL ROLE ${role}`);
    const { rows } = await client.query('SELECT current_user AS role');
    if (rows[0]?.role !== role) throw new Error(`failed_to_assume_${role}_role`);
}

async function expectPermissionDenied(client, label, sql, values = []) {
    const savepoint = `deny_${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`.slice(0, 60);
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
        await client.query(sql, values);
    } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        if (error.code === '42501') return true;
        throw new Error(`${label}_wrong_sqlstate_${error.code || 'unknown'}`);
    }
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return false;
}

function policySemanticsAreExact(rows) {
    return rows.every(row => {
        if (row.permissive !== 'PERMISSIVE') return false;
        const qual = compactSql(row.qual);
        const withCheck = compactSql(row.with_check);
        if (row.roles === '{service_role}') {
            if (row.cmd === 'ALL') return qual === 'true' && withCheck === 'true';
            return row.cmd === 'SELECT' && qual === 'true' && withCheck === '';
        }
        if (row.roles !== '{authenticated}' || row.cmd !== 'SELECT' || withCheck !== '') return false;
        if (!qual.includes('auth.uid()') || qual === 'true') return false;
        if (row.tablename === 'trivia_pvp_matches') return qual.includes('player1_id') && qual.includes('player2_id');
        return qual.includes('user_id') && ['trivia_pvp_queue', 'trivia_sessions'].includes(row.tablename);
    });
}

async function tableAclIsExact(client) {
    let ok = true;
    const readTables = new Set(['trivia_pvp_queue', 'trivia_pvp_matches', 'trivia_sessions']);
    for (const role of ['anon', 'authenticated']) {
        for (const table of REQUIRED_TABLES) {
            for (const permission of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
                ok = ok && !(await privilege(client, role, `public.${table}`, permission));
            }
            const shouldRead = role === 'authenticated' && readTables.has(table);
            ok = ok && (await privilege(client, role, `public.${table}`, 'SELECT')) === shouldRead;
        }
        ok = ok && !(await privilege(client, role, 'public.trivia_tournaments_public', 'SELECT'));
    }
    const service = new Map([
        ['trivia_pvp_queue', new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])],
        ['trivia_pvp_matches', new Set(['SELECT', 'INSERT', 'UPDATE'])],
        ['trivia_sessions', new Set(['SELECT', 'INSERT', 'UPDATE'])],
        ['trivia_tournaments', new Set(['SELECT', 'INSERT', 'UPDATE'])],
        ['trivia_tournament_entries', new Set(['SELECT', 'INSERT', 'UPDATE'])],
        ['trivia_tournament_rounds', new Set(['SELECT', 'INSERT', 'UPDATE'])],
        ...INTERNAL_TABLES.map(table => [table, new Set(['SELECT'])]),
    ]);
    for (const [table, expected] of service) {
        for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
            ok = ok && (await privilege(client, 'service_role', `public.${table}`, permission)) === expected.has(permission);
        }
    }
    ok = ok && await privilege(client, 'service_role', 'public.trivia_tournaments_public', 'SELECT');
    for (const permission of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        ok = ok && !(await privilege(client, 'service_role', 'public.trivia_tournaments_public', permission));
    }
    return ok;
}

async function columnAclIsExact(client) {
    const objects = [...REQUIRED_TABLES, 'trivia_tournaments_public'];
    const counts = await client.query(`
        SELECT relation.relname AS table_name, count(attribute.*)::integer AS column_count
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid
             AND attribute.attnum > 0 AND NOT attribute.attisdropped
         WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
         GROUP BY relation.relname
    `, [objects]);
    const columnCounts = new Map(counts.rows.map(row => [row.table_name, row.column_count]));
    if (columnCounts.size !== objects.length) return false;
    const grants = await client.query(`
        SELECT table_name, grantee, privilege_type, count(DISTINCT column_name)::integer AS column_count
          FROM information_schema.role_column_grants
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])
           AND grantee = ANY($2::text[])
         GROUP BY table_name, grantee, privilege_type
         ORDER BY table_name, grantee, privilege_type
    `, [objects, ['PUBLIC', 'anon', 'authenticated', 'service_role']]);
    const expected = [];
    for (const table of ['trivia_pvp_queue', 'trivia_pvp_matches', 'trivia_sessions']) {
        expected.push([table, 'authenticated', 'SELECT', columnCounts.get(table)]);
    }
    for (const table of REQUIRED_TABLES) {
        const privileges = INTERNAL_TABLES.includes(table) ? ['SELECT'] : ['INSERT', 'SELECT', 'UPDATE'];
        for (const permission of privileges) expected.push([table, 'service_role', permission, columnCounts.get(table)]);
    }
    expected.push(['trivia_tournaments_public', 'service_role', 'SELECT', columnCounts.get('trivia_tournaments_public')]);
    const actual = grants.rows.map(row => [row.table_name, row.grantee, row.privilege_type, row.column_count]);
    return sortedJson(actual) === sortedJson(expected);
}

async function functionCatalogIsExact(client) {
    const expected = [...RPC_SIGNATURES, ...TRIGGER_FUNCTION_SIGNATURES];
    const names = [...new Set(expected.map(signature => signature.match(/public\.([^ (]+)/)?.[1]))];
    const result = await client.query(`
        SELECT p.oid::regprocedure::text AS signature, p.proname, p.prosecdef,
               COALESCE(p.proconfig, ARRAY[]::text[]) AS proconfig, p.prosrc
          FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
         ORDER BY p.oid::regprocedure::text
    `, [names]);
    const mismatches = [];
    if (result.rowCount !== expected.length) mismatches.push(`function_count:${result.rowCount}/${expected.length}`);
    const bySignature = new Map(result.rows.map(row => [`public.${row.signature.replace(/^public\./, '')}`, row]));
    for (const signature of RPC_SIGNATURES) {
        const row = bySignature.get(signature);
        if (!row) mismatches.push(`missing:${signature}`);
        else if (row.prosecdef !== true) mismatches.push(`invoker:${signature}`);
        else if (row.proconfig.length !== 1 || row.proconfig[0] !== RPC_SEARCH_PATHS[signature]) mismatches.push(`search_path:${signature}`);
    }
    for (const signature of TRIGGER_FUNCTION_SIGNATURES) {
        const row = bySignature.get(signature);
        if (!row) mismatches.push(`missing:${signature}`);
        else if (row.prosecdef !== true) mismatches.push(`invoker:${signature}`);
        else if (row.proconfig.length !== 1 || row.proconfig[0] !== 'search_path=public, extensions') mismatches.push(`search_path:${signature}`);
    }
    const source = name => result.rows.find(row => row.proname === name)?.prosrc || '';
    const normalizedSource = name => compactSql(source(name));
    const semanticChecks = [
        ['score_alias_challenger', normalizedSource('fn_trivia_pvp_match_sync_columns').includes('new.challenger_score := coalesce')],
        ['score_alias_opponent', normalizedSource('fn_trivia_pvp_match_sync_columns').includes('new.opponent_score := coalesce')],
        ['no_identity_alias_challenger', !normalizedSource('fn_trivia_pvp_match_sync_columns').includes('new.challenger_id :=')],
        ['no_identity_alias_opponent', !normalizedSource('fn_trivia_pvp_match_sync_columns').includes('new.opponent_id :=')],
        ['award_expiry_guard', normalizedSource('award_trivia_run').includes('expires_at >= v_now')],
        ['award_v2_delegates', normalizedSource('award_trivia_run_v2').includes('public.award_trivia_run(p_session_id')],
        ['settlement_decision_receipt', normalizedSource('decide_trivia_pvp_settlement_v1').includes('insert into public.trivia_pvp_settlement_decisions')],
        ['settlement_locks_sessions', normalizedSource('decide_trivia_pvp_settlement_v1').includes('for update of session')],
        ['settlement_atomic_credits', normalizedSource('decide_trivia_pvp_settlement_v1').includes('public.add_diamonds_to_balance(')],
        ['stats_decision_gate', normalizedSource('record_trivia_pvp_stats_v2').includes("v_decision.decision_kind in ('win', 'tie')")],
        ['active_seats_no_horse_bypass', !normalizedSource('sync_trivia_pvp_active_seats').includes('is_horse')],
        ['session_no_horse_bypass', !normalizedSource('create_trivia_pvp_session_v2').includes('horse_session_forbidden')],
    ];
    for (const [name, passed] of semanticChecks) {
        if (!passed) mismatches.push(`semantic:${name}`);
    }
    return { ok: mismatches.length === 0, rows: result.rows, detail: mismatches.join(', ') };
}

async function verifyPhase1ProductionDatabase(check) {
    const client = await connect();
    try {
        check('database and REST credentials are bound to the production project', true, PROJECT_REF);
        const tableCatalog = await client.query(`
            SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relkind
              FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) ORDER BY c.relname
        `, [REQUIRED_TABLES]);
        check('all containment base tables exist with RLS enabled', tableCatalog.rowCount === REQUIRED_TABLES.length
            && tableCatalog.rows.every(row => row.rls_enabled === true && row.relkind === 'r'), `${tableCatalog.rowCount}/${REQUIRED_TABLES.length} tables`);
        const viewCatalog = await client.query(`SELECT relkind FROM pg_class WHERE oid = to_regclass('public.trivia_tournaments_public')`);
        check('retired tournament public surface remains a view', viewCatalog.rowCount === 1 && ['v', 'm'].includes(viewCatalog.rows[0].relkind));

        const policies = await client.query(`
            SELECT tablename, policyname, permissive, cmd, roles::text AS roles, qual, with_check
              FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[])
             ORDER BY tablename, policyname
        `, [REQUIRED_TABLES]);
        const policyIdentity = policies.rows.map(row => [row.tablename, row.policyname, row.cmd, row.roles]);
        check('containment RLS policy identity set is exact', sortedJson(policyIdentity) === sortedJson(EXPECTED_POLICIES), `${policies.rowCount}/${EXPECTED_POLICIES.length} policies`);
        check('containment RLS policy expressions are fail-closed and exact', policies.rowCount === EXPECTED_POLICIES.length && policySemanticsAreExact(policies.rows));
        check('table and view ACLs are least-privilege and exact', await tableAclIsExact(client));
        check('effective column ACLs contain no residual grants', await columnAclIsExact(client));

        let functionAclOk = true;
        for (const signature of RPC_SIGNATURES) {
            functionAclOk = functionAclOk && !(await privilege(client, 'anon', signature, 'EXECUTE', 'function'))
                && !(await privilege(client, 'authenticated', signature, 'EXECUTE', 'function'))
                && await privilege(client, 'service_role', signature, 'EXECUTE', 'function');
        }
        for (const signature of TRIGGER_FUNCTION_SIGNATURES) {
            for (const role of ['anon', 'authenticated', 'service_role']) {
                functionAclOk = functionAclOk && !(await privilege(client, role, signature, 'EXECUTE', 'function'));
            }
        }
        check('all generic, PvP and tournament RPC ACLs are exact', functionAclOk, `${RPC_SIGNATURES.length} RPCs`);
        const functions = await functionCatalogIsExact(client);
        check('competitive function overloads, search paths and semantics are exact', functions.ok,
            functions.detail || `${functions.rows.length}/${RPC_SIGNATURES.length + TRIGGER_FUNCTION_SIGNATURES.length} functions`);

        const triggerTables = [...new Set(EXPECTED_TRIGGERS.map(([table]) => table))];
        const triggerCatalog = await client.query(`
            SELECT relation.relname AS table_name, trigger.tgname AS trigger_name,
                   function.proname AS function_name, trigger.tgtype::integer AS trigger_type,
                   trigger.tgenabled, pg_get_triggerdef(trigger.oid) AS trigger_definition
              FROM pg_trigger AS trigger JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
              JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
              JOIN pg_proc AS function ON function.oid = trigger.tgfoid
             WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
               AND NOT trigger.tgisinternal ORDER BY relation.relname, trigger.tgname
        `, [triggerTables]);
        const triggerIdentity = triggerCatalog.rows.map(row => [row.table_name, row.trigger_name, row.function_name, row.trigger_type]);
        const statsTrigger = triggerCatalog.rows.find(row => row.trigger_name === 'trg_trivia_session_stats_v3');
        check('complete competitive trigger inventory, timing and events are exact', sortedJson(triggerIdentity) === sortedJson(EXPECTED_TRIGGERS)
            && triggerCatalog.rows.every(row => row.tgenabled === 'O')
            && compactSql(statsTrigger?.trigger_definition).includes('after update of settlement_result'), `${triggerCatalog.rowCount}/${EXPECTED_TRIGGERS.length} triggers`);

        const constraintNames = EXPECTED_CONSTRAINTS.map(([, name]) => name);
        const constraints = await client.query(`
            SELECT relation.relname AS table_name, con.conname, con.contype,
                   con.convalidated, pg_get_constraintdef(con.oid, true) AS definition
              FROM pg_constraint AS con JOIN pg_class AS relation ON relation.oid = con.conrelid
             WHERE con.connamespace = 'public'::regnamespace AND con.conname = ANY($1::text[])
             ORDER BY relation.relname, con.conname
        `, [constraintNames]);
        const expectedConstraintMap = new Map(EXPECTED_CONSTRAINTS.map(item => [item[1], item]));
        const constraintDefinitionsOk = constraints.rowCount === EXPECTED_CONSTRAINTS.length && constraints.rows.every(row => {
            const expected = expectedConstraintMap.get(row.conname);
            const definition = compactSql(row.definition);
            return expected && row.table_name === expected[0] && row.contype === expected[2] && row.convalidated === true
                && expected[3].every(fragment => definition.includes(compactSql(fragment)));
        });
        const internalConstraintInventory = await client.query(`
            SELECT relation.relname AS table_name, con.conname
              FROM pg_constraint AS con JOIN pg_class AS relation ON relation.oid = con.conrelid
             WHERE con.connamespace = 'public'::regnamespace AND relation.relname = ANY($1::text[])
             ORDER BY relation.relname, con.conname
        `, [INTERNAL_TABLES]);
        const expectedInternal = EXPECTED_CONSTRAINTS.filter(([table]) => INTERNAL_TABLES.includes(table)).map(([table, name]) => [table, name]);
        check('constraint tables, types, definitions and internal inventory are exact', constraintDefinitionsOk
            && sortedJson(internalConstraintInventory.rows.map(row => [row.table_name, row.conname])) === sortedJson(expectedInternal), `${constraints.rowCount}/${EXPECTED_CONSTRAINTS.length} constraints`);

        const indexNames = EXPECTED_INDEXES.map(([, name]) => name);
        const indexes = await client.query(`
            SELECT relation.relname AS table_name, index_class.relname AS index_name,
                   index.indisunique, index.indisvalid, index.indisready,
                   pg_get_indexdef(index.indexrelid) AS definition, pg_get_expr(index.indpred, index.indrelid) AS predicate
              FROM pg_index AS index JOIN pg_class AS index_class ON index_class.oid = index.indexrelid
              JOIN pg_class AS relation ON relation.oid = index.indrelid
              JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
             WHERE namespace.nspname = 'public' AND index_class.relname = ANY($1::text[])
               AND index.indisvalid AND index.indisready
             ORDER BY index_class.relname
        `, [indexNames]);
        const expectedIndexMap = new Map(EXPECTED_INDEXES.map(item => [item[1], item]));
        const indexDefinitionsOk = indexes.rowCount === EXPECTED_INDEXES.length && indexes.rows.every(row => {
            const expected = expectedIndexMap.get(row.index_name);
            const definition = compactSql(row.definition);
            const predicate = compactSql(row.predicate);
            return expected && row.table_name === expected[0] && row.indisunique === expected[2] && row.indisvalid && row.indisready
                && expected[3].every(fragment => definition.includes(compactSql(fragment)))
                && expected[4].every(fragment => predicate.includes(compactSql(fragment)));
        });
        check('critical index table, uniqueness, columns and predicates are exact', indexDefinitionsOk, `${indexes.rowCount}/${EXPECTED_INDEXES.length} indexes`);

        const quarantine = await client.query(`
            WITH expected_pvp AS (
                SELECT match.id FROM public.trivia_pvp_matches AS match
                  JOIN public.profiles AS p1 ON p1.id = match.player1_id
                  JOIN public.profiles AS p2 ON p2.id = match.player2_id
                 WHERE match.status = 'abandoned' AND match.created_at < timestamptz '2026-08-24 00:00:00+00'
                   AND (p1.is_horse IS TRUE) <> (p2.is_horse IS TRUE)
            ), actual_pvp AS (
                SELECT entity_id AS id FROM public.competitive_quarantine WHERE entity_type = 'trivia_pvp_match'
                 AND reason_code = 'legacy_abandoned_human_horse_refund_incident'
            ), expected_tournament AS (
                SELECT tournament.id FROM public.trivia_tournaments AS tournament CROSS JOIN LATERAL (
                    SELECT count(*)::integer AS entry_count,
                           count(*) FILTER (WHERE profile.is_horse IS TRUE)::integer AS horse_count,
                           count(entry.rank)::integer AS ranked_count, COALESCE(sum(entry.payout), 0)::integer AS total_payout
                      FROM public.trivia_tournament_entries AS entry LEFT JOIN public.profiles AS profile ON profile.id = entry.user_id
                     WHERE entry.tournament_id = tournament.id
                ) AS audit
                 WHERE tournament.status IN ('complete', 'completed') AND tournament.created_at < timestamptz '2026-08-28 00:00:00+00'
                   AND tournament.prize_pool = 184 AND audit.entry_count = 8 AND audit.horse_count = 8
                   AND audit.ranked_count = 0 AND audit.total_payout = 0
            ), actual_tournament AS (
                SELECT entity_id AS id FROM public.competitive_quarantine WHERE entity_type = 'trivia_tournament'
                 AND reason_code = 'legacy_8_horse_184_pool_unsettled'
            ), differences AS (
                (SELECT 'pvp_missing' AS kind, id FROM expected_pvp EXCEPT SELECT 'pvp_missing', id FROM actual_pvp)
                UNION ALL (SELECT 'pvp_extra', id FROM actual_pvp EXCEPT SELECT 'pvp_extra', id FROM expected_pvp)
                UNION ALL (SELECT 'tournament_missing', id FROM expected_tournament EXCEPT SELECT 'tournament_missing', id FROM actual_tournament)
                UNION ALL (SELECT 'tournament_extra', id FROM actual_tournament EXCEPT SELECT 'tournament_extra', id FROM expected_tournament)
            )
            SELECT (SELECT count(*)::integer FROM expected_pvp) AS expected_pvp,
                   (SELECT count(*)::integer FROM actual_pvp) AS actual_pvp,
                   (SELECT count(*)::integer FROM expected_tournament) AS expected_tournament,
                   (SELECT count(*)::integer FROM actual_tournament) AS actual_tournament,
                   (SELECT count(*)::integer FROM differences) AS difference_count,
                   (SELECT count(*)::integer FROM public.competitive_quarantine) AS total_count
        `);
        const q = quarantine.rows[0];
        check('quarantine IDs exactly equal the audited incident invariants', q.expected_pvp === 4 && q.actual_pvp === 4
            && q.expected_tournament === 1 && q.actual_tournament === 1 && q.difference_count === 0 && q.total_count === 5,
        `pvp=${q.actual_pvp}, tournaments=${q.actual_tournament}, differences=${q.difference_count}`);

        const state = await client.query(`
            SELECT (SELECT count(*)::integer FROM public.trivia_pvp_matches) AS match_count,
                (SELECT count(*)::integer FROM public.trivia_pvp_matches WHERE status = 'abandoned') AS abandoned_count,
                (SELECT count(*)::integer FROM public.trivia_pvp_matches WHERE status IN ('active', 'settling')) AS open_match_count,
                (SELECT count(*)::integer FROM public.trivia_pvp_queue) AS queue_count,
                (SELECT count(*)::integer FROM public.trivia_pvp_queue WHERE status = 'waiting') AS waiting_count,
                (SELECT count(*)::integer FROM public.trivia_sessions WHERE mode = 'pvp') AS pvp_session_count,
                (SELECT count(*)::integer FROM public.trivia_tournaments) AS tournament_count,
                (SELECT count(*)::integer FROM public.trivia_tournaments WHERE status IN ('upcoming', 'registration', 'active')) AS open_tournament_count,
                (SELECT count(*)::integer FROM public.trivia_tournament_entries) AS tournament_entry_count,
                (SELECT count(*)::integer FROM public.trivia_pvp_active_seats) AS active_seat_count,
                (SELECT count(*)::integer FROM public.trivia_pvp_settlement_decisions) AS decision_count
        `);
        const s = state.rows[0];
        check('production competitive row baseline remains contained', s.match_count === 4 && s.abandoned_count === 4 && s.open_match_count === 0
            && s.queue_count === 11 && s.waiting_count === 0 && s.pvp_session_count === 3 && s.tournament_count === 5
            && s.open_tournament_count === 0 && s.tournament_entry_count === 208 && s.active_seat_count === 0 && s.decision_count === 0,
        `matches=${s.match_count}, queue=${s.queue_count}, sessions=${s.pvp_session_count}, tournaments=${s.tournament_count}, entries=${s.tournament_entry_count}`);

        const ledger = await client.query(`
            WITH movements AS (
                SELECT COALESCE(NULLIF(BTRIM(transaction_type), ''), NULLIF(BTRIM(type), '')) AS movement_type,
                       amount, user_id, reference_id FROM public.diamond_transactions
                 WHERE COALESCE(NULLIF(BTRIM(transaction_type), ''), NULLIF(BTRIM(type), '')) = ANY($1::text[])
            ), grouped AS (
                SELECT movement_type, count(*)::integer AS row_count, COALESCE(sum(amount), 0)::integer AS net_amount,
                       count(*) FILTER (WHERE NULLIF(BTRIM(reference_id), '') IS NULL)::integer AS missing_reference_count
                  FROM movements GROUP BY movement_type
            ), duplicates AS (
                SELECT count(*)::integer AS duplicate_group_count FROM (
                    SELECT user_id, reference_id FROM movements WHERE NULLIF(BTRIM(reference_id), '') IS NOT NULL
                     GROUP BY user_id, reference_id HAVING count(*) > 1
                ) AS duplicate
            ), quarantined_payouts AS (
                SELECT count(*)::integer AS row_count FROM public.diamond_transactions AS transaction
                  JOIN public.competitive_quarantine AS quarantine ON quarantine.entity_type = 'trivia_tournament'
                   AND transaction.reference_id LIKE 'trivia_tourn_payout_' || quarantine.entity_id::text || '_%'
            )
            SELECT COALESCE(jsonb_object_agg(grouped.movement_type, jsonb_build_object('count', grouped.row_count,
                       'net', grouped.net_amount, 'missing', grouped.missing_reference_count)), '{}'::jsonb) AS movement_summary,
                   (SELECT duplicate_group_count FROM duplicates) AS duplicate_group_count,
                   COALESCE(sum(grouped.missing_reference_count), 0)::integer AS missing_reference_count,
                   (SELECT row_count FROM quarantined_payouts) AS quarantined_payout_count FROM grouped
        `, [['pvp_stake', 'pvp_refund', 'pvp_win', 'pvp_tie_refund', 'tournament_entry', 'tournament_entry_refund', 'tournament_cancel_refund', 'tournament_prize']]);
        const l = ledger.rows[0];
        const expectedLedger = {
            pvp_refund: { count: 488, net: 14240, missing: 0 },
            pvp_stake: { count: 3, net: -120, missing: 0 },
            tournament_prize: { count: 16, net: 4600, missing: 0 },
        };
        check('competitive ledger baseline, references and quarantined non-payout are exact', sortedLedger(l.movement_summary) === sortedLedger(expectedLedger)
            && l.missing_reference_count === 0 && l.duplicate_group_count === 0 && l.quarantined_payout_count === 0,
        `types=${Object.keys(l.movement_summary || {}).length}, missing=${l.missing_reference_count}, duplicates=${l.duplicate_group_count}`);

        await client.query('BEGIN');
        try {
            const fixture = await client.query(`
                SELECT profile.id,
                       (SELECT count(*)::integer FROM public.trivia_pvp_queue WHERE user_id = profile.id) AS queue_count,
                       (SELECT count(*)::integer FROM public.trivia_pvp_matches WHERE player1_id = profile.id OR player2_id = profile.id) AS match_count,
                       (SELECT count(*)::integer FROM public.trivia_sessions WHERE user_id = profile.id) AS session_count
                  FROM public.profiles AS profile JOIN auth.users AS auth_user ON auth_user.id = profile.id
                 WHERE profile.is_horse IS NOT TRUE ORDER BY profile.id LIMIT 1
            `);
            if (fixture.rowCount !== 1) throw new Error('authenticated_probe_fixture_unavailable');
            const own = fixture.rows[0];
            await setProbeRole(client, 'authenticated', own.id);
            const readable = await client.query(`
                SELECT (SELECT count(*)::integer FROM public.trivia_pvp_queue) AS queue_count,
                       (SELECT count(*)::integer FROM public.trivia_pvp_matches) AS match_count,
                       (SELECT count(*)::integer FROM public.trivia_sessions) AS session_count
            `);
            check('authenticated RLS reads reveal exactly caller-owned rows', readable.rows[0].queue_count === own.queue_count
                && readable.rows[0].match_count === own.match_count && readable.rows[0].session_count === own.session_count,
            `queue=${readable.rows[0].queue_count}, matches=${readable.rows[0].match_count}, sessions=${readable.rows[0].session_count}`);

            let abuseDenied = true;
            let abuseProbeCount = 0;
            const record = async (label, sql) => {
                const denied = await expectPermissionDenied(client, label, sql);
                abuseProbeCount += 1;
                abuseDenied = denied && abuseDenied;
            };
            const dmlTables = ['trivia_pvp_queue', 'trivia_pvp_matches', 'trivia_sessions', 'trivia_tournaments', 'trivia_tournament_entries', 'trivia_tournament_rounds'];
            const rpcCalls = [
                ['expire', 'SELECT public.expire_old_queue_entries()'],
                ['generic_create', `SELECT public.create_trivia_session_v2('${NIL_UUID}', '${NIL_UUID_2}', 'pvp', ARRAY[]::uuid[], '{}'::jsonb, NULL)`],
                ['generic_answer', `SELECT public.record_trivia_session_answer('${NIL_UUID}', '${NIL_UUID_2}', '${NIL_UUID_3}', 0)`],
                ['award_v1', `SELECT public.award_trivia_run('${NIL_UUID}', 0, 0, 0, 0)`],
                ['award_v2', `SELECT public.award_trivia_run_v2('${NIL_UUID}', 0, 0, 0, 0, 0)`],
                ['pvp_create', `SELECT public.create_trivia_pvp_session_v2('${NIL_UUID}', '${NIL_UUID_2}', '${NIL_UUID_3}', ARRAY[]::uuid[], '{}'::jsonb)`],
                ['settle', `SELECT public.decide_trivia_pvp_settlement_v1('${NIL_UUID}', false)`],
                ['stats', `SELECT public.record_trivia_pvp_stats_v2('${NIL_UUID}')`],
                ['tournament_enter', `SELECT public.enter_trivia_tournament_v2('${NIL_UUID}', '${NIL_UUID_2}')`],
                ['tournament_score', `SELECT public.fn_trivia_tournament_add_entry_score('${NIL_UUID}', 0, 0)`],
                ['tournament_payout', `SELECT public.fn_trivia_tournament_payout('${NIL_UUID}')`],
                ['tournament_results', `SELECT public.record_trivia_tournament_question_results_v3('${NIL_UUID}', '${NIL_UUID_2}', '[]'::jsonb)`],
                ['tournament_submit', `SELECT public.fn_trivia_round_submit_verified_v3('${NIL_UUID}', '${NIL_UUID_2}', 0, 0, '[]'::jsonb)`],
            ];
            for (const role of ['authenticated', 'anon']) {
                await setProbeRole(client, role, role === 'authenticated' ? own.id : NIL_UUID);
                for (const table of dmlTables) {
                    await record(`${role}_${table}_insert`, `INSERT INTO public.${table} DEFAULT VALUES`);
                    await record(`${role}_${table}_update`, `UPDATE public.${table} SET id = id WHERE false`);
                    await record(`${role}_${table}_delete`, `DELETE FROM public.${table} WHERE false`);
                }
                for (const table of ['trivia_tournaments', 'trivia_tournament_entries', 'trivia_tournament_rounds']) {
                    await record(`${role}_${table}_select`, `SELECT count(*) FROM public.${table}`);
                }
                await record(`${role}_tournament_view_select`, 'SELECT count(*) FROM public.trivia_tournaments_public');
                for (const [name, sql] of rpcCalls) await record(`${role}_${name}`, sql);
            }
            const expectedProbeCount = 2 * (dmlTables.length * 3 + 4 + rpcCalls.length);
            check('rollback-only anon/authenticated DML, view and RPC abuse matrix is denied', abuseDenied && abuseProbeCount === expectedProbeCount, `${abuseProbeCount}/${expectedProbeCount} probes`);
        } finally {
            await client.query('ROLLBACK');
        }
    } finally {
        await client.end().catch(() => {});
    }
}

module.exports = {
    EXPECTED_CONSTRAINTS,
    EXPECTED_INDEXES,
    EXPECTED_POLICIES,
    EXPECTED_TRIGGERS,
    INTERNAL_TABLES,
    RPC_SIGNATURES,
    TRIGGER_FUNCTION_SIGNATURES,
    verifyPhase1ProductionDatabase,
};

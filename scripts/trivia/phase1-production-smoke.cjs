#!/usr/bin/env node

/**
 * Production smoke for the Phase 1 fail-closed competitive boundary.
 *
 * Uses the dedicated probe account for authenticated HTTP coverage and one
 * uniquely marked, zero-cost session fixture so the generic answer/submit
 * routes can prove their server-owned mode gate. The fixture is deleted with
 * direct Postgres in finally and the before/after competitive snapshot must be
 * byte-identical. No token, user id, session id, question id, email or PII is
 * emitted in stdout or the optional evidence artifact.
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'kuklfnapbkmacvwxktbh';
const baseUrl = (process.env.PRODUCTION_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const expectedWorldHubSha = String(process.env.EXPECTED_WORLD_HUB_SHA || '').toLowerCase();
const artifactArg = process.argv.find(arg => arg.startsWith('--artifact='));
const artifactPath = artifactArg ? path.resolve(artifactArg.slice('--artifact='.length)) : null;
const FIXTURE_MARKER = Object.freeze({ __phase1_containment_smoke: true });
const competitiveTypes = Object.freeze([
    'pvp_stake',
    'pvp_refund',
    'pvp_win',
    'pvp_tie_refund',
    'tournament_entry',
    'tournament_entry_refund',
    'tournament_cancel_refund',
    'tournament_prize',
]);

function invariant(condition, message) {
    if (!condition) throw new Error(message);
}

function validateProjectBinding(url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL is invalid'); }
    invariant(parsed.protocol === 'https:' && parsed.hostname === `${PROJECT_REF}.supabase.co`,
        'Supabase URL does not match SUPABASE_PROJECT_REF');
    if (process.env.SUPABASE_DB_URL) {
        let database;
        try { database = new URL(process.env.SUPABASE_DB_URL); } catch {
            throw new Error('SUPABASE_DB_URL is invalid');
        }
        const username = decodeURIComponent(database.username || '');
        const direct = database.hostname === `db.${PROJECT_REF}.supabase.co` && username === 'postgres';
        const pooler = database.hostname.endsWith('.pooler.supabase.com')
            && username === `postgres.${PROJECT_REF}`;
        invariant(direct || pooler, 'database endpoint does not match SUPABASE_PROJECT_REF');
    }
}

async function connectDatabase() {
    const password = process.env.SUPABASE_DB_PASSWORD;
    const configs = process.env.SUPABASE_DB_URL
        ? [{
            connectionString: process.env.SUPABASE_DB_URL,
            ssl: process.env.SUPABASE_DB_SSL === 'disable' ? false : { rejectUnauthorized: false },
        }]
        : password
            ? [
                { host: 'aws-0-us-west-2.pooler.supabase.com', port: 6543, user: `postgres.${PROJECT_REF}`, password, database: 'postgres', ssl: { rejectUnauthorized: false } },
                { host: `db.${PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', password, database: 'postgres', ssl: { rejectUnauthorized: false } },
            ]
            : [];
    invariant(configs.length > 0, 'SUPABASE_DB_URL or SUPABASE_DB_PASSWORD is required for fixture cleanup');
    let lastError;
    for (const config of configs) {
        const client = new Client({ ...config, connectionTimeoutMillis: 10_000, statement_timeout: 30_000, application_name: 'trivia_phase1_production_smoke' });
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

async function cleanupProbeSessions(userId) {
    if (!userId) return 0;
    const client = await connectDatabase();
    try {
        const result = await client.query(`
            DELETE FROM public.trivia_sessions
             WHERE user_id = $1 AND mode = 'pvp' AND status = 'open'
               AND entry_cost = 0 AND entry_state = 'free'
               AND permutations @> $2::jsonb
        `, [userId, JSON.stringify(FIXTURE_MARKER)]);
        return result.rowCount;
    } finally {
        await client.end().catch(() => {});
    }
}

async function exactCount(sb, table, configure = query => query) {
    const { count, error } = await configure(sb.from(table).select('id', { count: 'exact', head: true }));
    if (error) throw new Error(`${table}: ${error.message}`);
    return count ?? 0;
}

async function movementSummary(sb, transactionType) {
    const configure = query => query.or(
        `transaction_type.eq.${transactionType},and(transaction_type.is.null,type.eq.${transactionType})`,
    );
    const { count, error: countError } = await configure(
        sb.from('diamond_transactions').select('id', { count: 'exact', head: true }),
    );
    if (countError) throw new Error(`diamond_transactions/${transactionType}: ${countError.message}`);
    const expectedRows = count ?? 0;
    let fetchedRows = 0;
    let net = 0;
    for (let offset = 0; offset < expectedRows; offset += 1000) {
        const { data, error } = await configure(
            sb.from('diamond_transactions').select('id, amount').order('id').range(offset, offset + 999),
        );
        if (error) throw new Error(`diamond_transactions/${transactionType}: ${error.message}`);
        fetchedRows += data?.length || 0;
        net += (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    }
    invariant(fetchedRows === expectedRows,
        `diamond_transactions/${transactionType}: fetched ${fetchedRows}/${expectedRows}`);
    return { rows: expectedRows, net };
}

async function snapshot(sb) {
    const movements = {};
    for (const transactionType of competitiveTypes) {
        movements[transactionType] = await movementSummary(sb, transactionType);
    }
    return {
        pvpMatches: await exactCount(sb, 'trivia_pvp_matches'),
        pvpOpen: await exactCount(sb, 'trivia_pvp_matches', query => query.in('status', ['active', 'settling'])),
        pvpQueueWaiting: await exactCount(sb, 'trivia_pvp_queue', query => query.eq('status', 'waiting')),
        pvpSessions: await exactCount(sb, 'trivia_sessions', query => query.eq('mode', 'pvp')),
        tournaments: await exactCount(sb, 'trivia_tournaments'),
        tournamentsOpen: await exactCount(sb, 'trivia_tournaments', query => query.in('status', ['upcoming', 'registration', 'active'])),
        tournamentEntries: await exactCount(sb, 'trivia_tournament_entries'),
        movements,
    };
}

async function expectUnavailable(route, {
    method = 'POST', body = {}, headers = {}, caller = 'anonymous',
} = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
        method,
        redirect: 'manual',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-cache', ...headers },
        body: method === 'GET' ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    invariant(response.status === 503, `${route}/${caller}: expected 503, received ${response.status}`);
    invariant(payload?.success === false, `${route}/${caller}: missing fail-closed payload`);
    invariant(['pvp_temporarily_unavailable', 'tournaments_temporarily_unavailable'].includes(payload.error),
        `${route}/${caller}: unexpected error ${payload?.error}`);
    invariant(/no-store/i.test(response.headers.get('cache-control') || ''), `${route}/${caller}: cacheable denial`);
    return { route, caller, status: response.status, error: payload.error };
}

async function expectRedirect(route) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } });
    const location = response.headers.get('location') || '';
    invariant([301, 302, 303, 307, 308].includes(response.status), `${route}: expected redirect, received ${response.status}`);
    invariant(new URL(location, baseUrl).pathname === '/hub/trivia', `${route}: unexpected redirect ${location}`);
    return { route, status: response.status, location };
}

async function expectRetired(route) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } });
    invariant([404, 410].includes(response.status), `${route}: expected retired 404/410, received ${response.status}`);
    return { route, status: response.status };
}

async function authenticateProbe(url, anonKey) {
    const email = process.env.PROBE_LOGIN_EMAIL || process.env.TEST_USER_EMAIL;
    const password = process.env.PROBE_LOGIN_PASSWORD || process.env.TEST_USER_PASSWORD;
    invariant(email && password, 'PROBE_LOGIN_EMAIL/PROBE_LOGIN_PASSWORD (or TEST equivalents) are required');
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    invariant(!error && data?.session?.access_token && data?.user?.id, `probe authentication failed: ${error?.code || 'unknown'}`);
    return { client, token: data.session.access_token, userId: data.user.id };
}

async function createProbeSession(sb, userId) {
    const { data: question, error: questionError } = await sb
        .from('trivia_questions').select('id').limit(1).maybeSingle();
    invariant(!questionError && question?.id, `probe question unavailable: ${questionError?.message || 'none'}`);
    const sessionId = randomUUID();
    const permutations = { ...FIXTURE_MARKER, [question.id]: [0, 1, 2, 3] };
    const { error } = await sb.from('trivia_sessions').insert({
        id: sessionId,
        user_id: userId,
        mode: 'pvp',
        question_ids: [question.id],
        permutations,
        status: 'open',
        entry_cost: 0,
        entry_state: 'free',
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    invariant(!error, `probe session insert failed: ${error?.message || 'unknown'}`);
    return { sessionId, questionId: question.id };
}

async function verifyHealth() {
    invariant(/^[0-9a-f]{40}$/.test(expectedWorldHubSha), 'EXPECTED_WORLD_HUB_SHA must be the exact 40-character merge SHA');
    const response = await fetch(`${baseUrl}/api/health?phase1=${Date.now()}`, {
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    });
    const payload = await response.json().catch(() => null);
    invariant(response.status === 200 && payload?.status === 'ok', `/api/health is not healthy (${response.status})`);
    invariant(payload?.checks?.db?.status === 'ok', '/api/health database check is not ok');
    invariant(String(payload?.version || '').toLowerCase() === expectedWorldHubSha,
        `/api/health version ${payload?.version || 'missing'} does not equal expected merge SHA`);
    return { status: response.status, app: payload.status, database: payload.checks.db.status, version: payload.version };
}

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const cronSecret = process.env.CRON_SECRET;
    invariant(url && serviceKey && anonKey, 'Supabase URL, service role key and anon key are required');
    invariant(cronSecret && cronSecret.length >= 20, 'CRON_SECRET is required for dormant lifecycle probes');
    validateProjectBinding(url);
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
    const auth = await authenticateProbe(url, anonKey);
    const authHeaders = { authorization: `Bearer ${auth.token}` };
    const cronHeaders = { authorization: `Bearer ${cronSecret}` };
    let fixture = null;
    let primaryError = null;
    let evidence;
    try {
        await cleanupProbeSessions(auth.userId);
        const before = await snapshot(sb);
        fixture = await createProbeSession(sb, auth.userId);

        const apiProbes = [];
        const dedicated = [
            ['/api/trivia/pvp-settle-match', { body: { matchId: randomUUID() } }],
            ['/api/trivia/tournament-enter', { body: { tournamentId: randomUUID() } }],
            ['/api/trivia/tournament-round-questions', { method: 'GET' }],
            ['/api/trivia/tournament-submit-round', { body: { roundId: randomUUID() } }],
        ];
        for (const [route, options] of dedicated) {
            apiProbes.push(await expectUnavailable(route, { ...options, caller: 'anonymous' }));
            apiProbes.push(await expectUnavailable(route, { ...options, headers: authHeaders, caller: 'authenticated' }));
        }
        apiProbes.push(await expectUnavailable('/api/trivia/session-start', {
            body: { mode: 'pvp' }, headers: authHeaders, caller: 'authenticated',
        }));
        apiProbes.push(await expectUnavailable('/api/trivia/session-start', {
            body: { mode: 'tournaments' }, headers: authHeaders, caller: 'authenticated',
        }));
        apiProbes.push(await expectUnavailable('/api/trivia/session-answer', {
            body: { sessionId: fixture.sessionId, questionId: fixture.questionId, displayIndex: 0 },
            headers: authHeaders, caller: 'authenticated',
        }));
        apiProbes.push(await expectUnavailable('/api/trivia/session-submit', {
            body: { sessionId: fixture.sessionId, answers: [] }, headers: authHeaders, caller: 'authenticated',
        }));
        apiProbes.push(await expectUnavailable('/api/trivia/tournament-lifecycle', {
            method: 'GET', headers: cronHeaders, caller: 'cron-authorized',
        }));
        apiProbes.push(await expectUnavailable('/api/cron/trivia-tournament-tick', {
            method: 'GET', headers: cronHeaders, caller: 'cron-authorized',
        }));
        apiProbes.push(await expectUnavailable('/api/cron/pvp-settle', {
            method: 'GET', headers: cronHeaders, caller: 'cron-authorized',
        }));

        const pageProbes = await Promise.all([
            expectRedirect('/hub/trivia/pvp'),
            expectRedirect('/hub/trivia/tournaments'),
        ]);
        const retiredRoutes = await Promise.all([
            expectRetired('/api/cron/trivia-pvp-cleanup'),
            expectRetired('/api/cron/trivia-tournaments'),
            expectRetired('/api/cron/trivia-tournament-rounds'),
        ]);
        const lobby = await fetch(`${baseUrl}/hub/trivia?phase1=${Date.now()}`, {
            redirect: 'follow', headers: { 'cache-control': 'no-cache' },
        });
        const lobbyHtml = await lobby.text();
        invariant(lobby.ok, `/hub/trivia: expected 2xx, received ${lobby.status}`);
        invariant(lobbyHtml.includes('Daily Trivia'), 'lobby SSR: Daily Trivia identity missing');
        invariant(lobbyHtml.includes('Quick Stakes'), 'lobby SSR: Quick Stakes identity missing');
        invariant(lobbyHtml.includes('Maintenance'), 'lobby SSR: competitive maintenance state missing');

        const health = await verifyHealth();
        const cleaned = await cleanupProbeSessions(auth.userId);
        fixture = null;
        invariant(cleaned === 1, `expected to remove one probe session, removed ${cleaned}`);
        const after = await snapshot(sb);
        invariant(JSON.stringify(after) === JSON.stringify(before),
            'competitive database or diamond aggregates changed during fail-closed probes');

        evidence = {
            evidence: 'trivia_phase1_production_smoke',
            capturedAtUtc: new Date().toISOString(),
            baseUrl,
            databaseProjectRef: PROJECT_REF,
            health,
            apiProbes,
            pageProbes,
            retiredRoutes,
            lobby: { status: lobby.status, dailyPreserved: true, quickStakesPreserved: true, maintenance: true, ssrVisible: true },
            authenticatedProbe: true,
            temporaryFixtureRemoved: true,
            before,
            after,
            unchanged: true,
        };
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        let cleanupError = null;
        if (fixture) {
            try { await cleanupProbeSessions(auth.userId); } catch (error) { cleanupError = error; }
        }
        try { await sb.auth.admin.signOut(auth.token, 'local'); } catch (error) {
            if (!cleanupError) cleanupError = error;
        }
        if (cleanupError && !primaryError) throw cleanupError;
    }

    const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
    if (artifactPath) {
        fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
        fs.writeFileSync(artifactPath, serialized, { encoding: 'utf8', flag: 'wx' });
    }
    process.stdout.write(serialized);
}

main().catch(error => {
    console.error(`Phase 1 production smoke failed: ${error?.message || error}`);
    process.exitCode = 1;
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    FORBIDDEN_BROADCAST_KEYS,
    emitTriviaRealtimeBroadcast,
    emitTriviaRealtimeBroadcasts,
    findForbiddenBroadcastKeys,
    nextBroadcastSeq,
    normalizeBroadcastMessage,
    sanitizeBroadcastPayload,
} from '../src/lib/trivia/realtimeBroadcast.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const MIGRATION = 'supabase/migrations/20261124200800_trivia_elo_matchmaking_and_friend_duels.sql';

test('Track 1 migration verifies predecessor MD5s, Elo widening windows, direct friend duel pairing, ACLs, and forward rollback', () => {
    const sql = read(MIGRATION);
    const rbIdx = sql.indexOf('/* FORWARD ROLLBACK');
    assert.ok(rbIdx > 0, 'migration must include FORWARD ROLLBACK block');
    const forward = sql.slice(0, rbIdx);

    // Predecessor MD5 guards
    assert.match(forward, /a525e7bc94e220c86de87dd6a2034e31/, 'guards trivia_pvp__try_match MD5');
    assert.match(forward, /4ccba5903f6a7fbc096d0a210d2771b4/, 'guards trivia_friend_challenge_create_v1 MD5');
    assert.match(forward, /736e61d65ab2cf26de11f2c409f63634/, 'guards trivia_friend_challenge_get_v1 MD5');
    assert.match(forward, /1e3abb5c665880ea033fcc40103914e0/, 'guards trivia_friend_challenge_accept_v1 MD5');

    // Elo widening windows (0-8s +/-150, 8-16s +/-350, >=16s unlimited; default 1200; closest Elo then oldest joined_at)
    assert.match(forward, /COALESCE\(rq\.elo, 1200\)/);
    assert.match(forward, />= 16\.0/);
    assert.match(forward, />= 8\.0[\s\S]{0,160}<= 350/);
    assert.match(forward, /<= 150/);
    assert.match(forward, /ORDER BY ABS\(v_t_elo - COALESCE\(rq\.elo, 1200\)\) ASC, q\.joined_at ASC, q\.id ASC/);

    // Friend challenge targeted recipient + atomic direct Phase 5 pairing
    assert.match(forward, /p_challenged_user_id uuid DEFAULT NULL/);
    assert.match(forward, /cannot_challenge_self/);
    assert.match(forward, /unauthorized_recipient/);
    assert.match(forward, /challenge_already_accepted/);
    assert.match(forward, /'replayed', true/);
    assert.match(forward, /public\.trivia_pvp__bind_match\(/);
    assert.match(forward, /'human_human'/);
    assert.match(forward, /public\.trivia_pvp_active_seats/);
    assert.match(forward, /challenger_insufficient_diamonds/);
    assert.match(forward, /accepter_insufficient_diamonds/);

    // Strict ACLs + PostgREST reload
    assert.match(forward, /REVOKE ALL ON FUNCTION public\.trivia_pvp__try_match\(uuid, boolean, timestamptz\)\s+FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(forward, /GRANT EXECUTE ON FUNCTION public\.trivia_friend_challenge_create_v1\(uuid, integer, integer, uuid\)\s+TO service_role;/);
    assert.match(forward, /GRANT EXECUTE ON FUNCTION public\.trivia_friend_challenge_accept_v1\(uuid, text\)\s+TO service_role;/);
    assert.match(forward, /NOTIFY pgrst, 'reload schema';/);
});

test('realtimeBroadcast sanitizer enforces answer-free allowlisted payloads and monotonic sequence numbers', () => {
    const seq1 = nextBroadcastSeq(1700000000000);
    const seq2 = nextBroadcastSeq(1700000000000);
    assert.ok(seq2 > seq1, 'sequence numbers must be strictly monotonic even within same millisecond');

    const clean = sanitizeBroadcastPayload({
        entityId: 'match-123',
        state: 'playing',
        action: 'join',
        matchId: 'match-123',
        extraIgnoredObj: { nested: true },
    });
    assert.ok(clean);
    assert.equal(clean.type, 'state_change');
    assert.equal(clean.entityId, 'match-123');
    assert.equal(clean.state, 'playing');
    assert.equal(clean.matchId, 'match-123');
    assert.ok(Number.isInteger(clean.seq) && clean.seq > 0);
    assert.equal(typeof clean.updatedAt, 'string');
    assert.equal('extraIgnoredObj' in clean, false);

    // Every forbidden answer/secret key must be detected and refused.
    assert.ok(FORBIDDEN_BROADCAST_KEYS.includes('correct_index'));
    assert.ok(FORBIDDEN_BROADCAST_KEYS.includes('correctIndex'));
    assert.ok(FORBIDDEN_BROADCAST_KEYS.includes('permutations'));
    assert.ok(FORBIDDEN_BROADCAST_KEYS.includes('horse_plan'));

    for (const badPayload of [
        { entityId: 'm1', state: 'playing', correct_index: 2 },
        { entityId: 'm1', state: 'playing', nested: { correctIndex: 1 } },
        { entityId: 'm1', state: 'playing', permutations: [0, 1, 2, 3] },
        { entityId: 'm1', state: 'playing', explanation: 'Spoiler' },
        { entityId: 'm1', state: 'playing', opponentScore: 9 },
        { entityId: 'm1', state: 'playing', secret: 'leak' },
    ]) {
        assert.ok(findForbiddenBroadcastKeys(badPayload).length > 0);
        assert.equal(sanitizeBroadcastPayload(badPayload), null, 'forbidden payload must be refused');
    }

    assert.equal(normalizeBroadcastMessage({ channel: 'invalid:topic', event: 'match_update', payload: { state: 'ok' } }), null);
    assert.ok(normalizeBroadcastMessage({ channel: 'trivia:pvp:match:abc-123', event: 'match_update', payload: { entityId: 'abc-123', state: 'playing' } }));
});

test('emitTriviaRealtimeBroadcasts posts sanitized messages to Supabase Realtime HTTP API and fails safely without throwing', async () => {
    const calls = [];
    const mockFetch = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 202 };
    };
    const env = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    };

    const res = await emitTriviaRealtimeBroadcasts(
        [
            {
                channel: 'trivia:pvp:match:11111111-1111-4111-8111-111111111111',
                event: 'match_update',
                payload: { entityId: '11111111-1111-4111-8111-111111111111', state: 'dealing' },
            },
            {
                // Forbidden key payload must be dropped silently and never sent.
                channel: 'trivia:pvp:match:11111111-1111-4111-8111-111111111111',
                event: 'match_update',
                payload: { entityId: 'bad', state: 'playing', correct_index: 3 },
            },
        ],
        { env, fetchImpl: mockFetch, timeoutMs: 500 },
    );

    assert.equal(res.ok, true);
    assert.equal(res.sent, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.supabase.co/realtime/v1/api/broadcast');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.apikey, 'test-service-key');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-service-key');

    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].topic, 'trivia:pvp:match:11111111-1111-4111-8111-111111111111');
    assert.equal(body.messages[0].event, 'match_update');
    assert.equal(body.messages[0].payload.type, 'state_change');
    assert.equal(findForbiddenBroadcastKeys(body).length, 0);

    // Unconfigured env returns immediately without calling fetch.
    const unconf = await emitTriviaRealtimeBroadcast(
        { channel: 'trivia:pvp:user:u1', event: 'state_update', payload: { state: 'ok' } },
        { env: {}, fetchImpl: mockFetch },
    );
    assert.equal(unconf.ok, false);
    assert.equal(unconf.reason, 'broadcast_unconfigured');

    // Network failure never throws.
    const errRes = await emitTriviaRealtimeBroadcast(
        { channel: 'trivia:pvp:user:u1', event: 'state_update', payload: { state: 'ok' } },
        {
            env,
            fetchImpl: async () => { throw new Error('network_down'); },
        },
    );
    assert.equal(errRes.ok, false);
    assert.equal(errRes.reason, 'network_error');
});

test('useTriviaRealtimeSync implements sequence deduplication and reconnect missed-event reconciliation', () => {
    const hookSrc = read('src/hooks/useTriviaRealtimeSync.js');
    assert.match(hookSrc, /export function extractRealtimeSeq\(/);
    assert.match(hookSrc, /export function evaluateRealtimeSeq\(/);
    assert.match(hookSrc, /lastSeqRef = useRef\(0\)/);
    assert.match(hookSrc, /wasDisconnectedRef = useRef\(false\)/);
    assert.match(hookSrc, /evaluateRealtimeSeq\(lastSeqRef\.current, payload\)/);
    assert.match(hookSrc, /if \(!decision\.accept\) return;/);
    assert.match(hookSrc, /lastSeqRef\.current = decision\.nextSeq;/);
    assert.match(hookSrc, /source: 'reconnect'/);
    assert.match(hookSrc, /setReconnectCount\(/);
    assert.match(hookSrc, /window\.addEventListener\('online', handleOnline\)/);
    assert.doesNotMatch(hookSrc, /[—–]/, 'hook contains no em-dashes');
});

test('PvP, Challenges, and Nightly Tournament API handlers emit sanitized server-side broadcasts', () => {
    const pvpHandler = read('src/lib/trivia/pvpApiHandler.js');
    const challengesApi = read('pages/api/trivia/challenges.js');
    const nightlyHandler = read('src/lib/trivia/nightlyTournamentApiHandler.js');
    const broadcastLib = read('src/lib/trivia/realtimeBroadcast.mjs');

    assert.match(pvpHandler, /import \{ emitTriviaRealtimeBroadcasts \} from '\.\/realtimeBroadcast\.mjs'/);
    assert.match(pvpHandler, /trivia:pvp:match:\$\{dto\.match\.id\}/);
    assert.match(pvpHandler, /trivia:pvp:user:\$\{user\.id\}/);

    assert.match(challengesApi, /import \{ emitTriviaRealtimeBroadcasts \} from '\.\.\/\.\.\/\.\.\/src\/lib\/trivia\/realtimeBroadcast\.mjs'/);
    assert.match(challengesApi, /p_challenged_user_id/);
    assert.match(challengesApi, /unauthorized_recipient/);
    assert.match(challengesApi, /challenge_already_accepted/);
    assert.match(challengesApi, /const \{ broadcastTargets, \.\.\.publicData \} = data;/);
    assert.match(challengesApi, /trivia:pvp:user:\$\{challengerId\}/);
    assert.match(challengesApi, /trivia:pvp:match:\$\{resolvedMatchId\}/);

    assert.match(nightlyHandler, /import \{ emitTriviaRealtimeBroadcast \} from '\.\/realtimeBroadcast\.mjs'/);
    assert.match(nightlyHandler, /trivia:tournament:\$\{tournamentId\}/);

    for (const [name, src] of [
        ['src/lib/trivia/realtimeBroadcast.mjs', broadcastLib],
        ['src/lib/trivia/pvpApiHandler.js', pvpHandler],
        ['pages/api/trivia/challenges.js', challengesApi],
        ['src/lib/trivia/nightlyTournamentApiHandler.js', nightlyHandler],
    ]) {
        assert.doesNotMatch(src, /[—–]/, `${name} must not contain em-dashes`);
    }
});

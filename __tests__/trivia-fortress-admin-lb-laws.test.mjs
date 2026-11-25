/**
 * Fortress Track 3 Anti-Regression Laws:
 *  - /admin/trivia-pool: zero SSR /auth/login redirect loop on browser GET,
 *    client-side JWT refresh-and-retry on 401, and workbenchAttempted guard
 *    eliminating unbounded loadWorkbench retry storms.
 *  - /admin/trivia-operations: shared fetchWithTokenRefresh calling
 *    supabase.auth.refreshSession() + retrying once on 401 before redirecting.
 *  - /hub/trivia/leaderboard: exact integer PvP Elo / Peak Elo formatting
 *    (never compact K notation) and most-recent settled Nightly Tournament
 *    default with nearest-event fallback.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function extractFunction(source, name) {
    const startRe = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
    const match = startRe.exec(source);
    assert.ok(match, `expected function ${name} to exist`);
    let parenIdx = source.indexOf('(', match.index);
    let pDepth = 0;
    let paramsEnd = -1;
    for (let i = parenIdx; i < source.length; i += 1) {
        const ch = source[i];
        if (ch === '(') pDepth += 1;
        else if (ch === ')') {
            pDepth -= 1;
            if (pDepth === 0) {
                paramsEnd = i;
                break;
            }
        }
    }
    assert.ok(paramsEnd >= 0, `expected closing paren for ${name}`);
    const braceIdx = source.indexOf('{', paramsEnd);
    assert.ok(braceIdx >= 0, `expected opening brace for ${name}`);
    let depth = 0;
    for (let i = braceIdx; i < source.length; i += 1) {
        const ch = source[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(match.index, i + 1);
            }
        }
    }
    throw new Error(`unterminated function ${name}`);
}

test('P0-3: /admin/trivia-pool never redirects on SSR missing Authorization header and prevents workbench retry storms', () => {
    const src = read('pages/admin/trivia-pool.js');
    const gssp = extractFunction(src, 'getServerSideProps');

    assert.doesNotMatch(
        gssp,
        /redirect:\s*\{\s*destination:\s*['"]\/auth\/login/,
        'getServerSideProps must NOT redirect browsers without SSR Authorization header to /auth/login',
    );
    assert.match(
        gssp,
        /return\s*\{\s*props:\s*\{\s*requiresClientAuth:\s*true\s*\}\s*\}/,
        'getServerSideProps must return requiresClientAuth shell for browser document GETs',
    );

    // Client-side JWT refresh-and-retry before redirecting to /auth/login
    assert.match(src, /supabase\.auth\.refreshSession\(\)/);
    assert.match(src, /async function fetchPoolWithTokenRefresh\(/);
    assert.match(src, /if \(response\.status === 401\)/);
    assert.match(src, /\/api\/admin\/trivia-pool-status/);
    assert.match(src, /\/api\/admin\/trivia-pool-curate/);

    // Auto-load useEffect must guard with workbenchAttempted and NEVER depend on workbenchLoading
    const autoLoadMatch = src.match(/useEffect\(\(\)\s*=>\s*\{\s*if\s*\(\(activeTab === 'curation' \|\| activeTab === 'calibration'\)[\s\S]*?\},\s*\[([^\]]+)\]\);/);
    assert.ok(autoLoadMatch, 'auto-load useEffect for curation/calibration tabs must exist');
    assert.match(autoLoadMatch[0], /workbenchAttempted/, 'auto-load effect must guard with workbenchAttempted');
    assert.doesNotMatch(autoLoadMatch[0], /workbenchLoading/, 'auto-load effect must never depend on or check workbenchLoading (causes infinite retry storm on error)');
    assert.doesNotMatch(autoLoadMatch[1], /workbenchLoading/, 'auto-load deps must exclude workbenchLoading');

    // Visual system & accessibility invariants preserved
    assert.match(src, /aria-label="Trivia Questions By Category"/);
    assert.match(src, /OperatorAdminSurface\.module\.css/);
    assert.match(src, /consoleStyles\.surface/);
    assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/);
    assert.doesNotMatch(src, /[—–]/, 'trivia-pool.js must not contain em-dashes or en-dashes');
    assert.doesNotMatch(src, /[↻✓✗◆]/u, 'trivia-pool.js must not use retired symbol icons');
    assert.doesNotMatch(src, /fontSize:\s*(?:9|10|11)(?:\D|$)/);
});

test('P0-3 behavioral: trivia-pool fetchPoolWithTokenRefresh retries once after refreshSession on 401 and buildCategoryCounts supports both APIs', async () => {
    const src = read('pages/admin/trivia-pool.js');
    const fetchHelperSrc = extractFunction(src, 'fetchPoolWithTokenRefresh');
    const buildCountsSrc = extractFunction(src, 'buildCategoryCounts');

    const calls = [];
    let refreshCount = 0;
    const mockFetch = async (url, init) => {
        calls.push({ url, auth: init?.headers?.Authorization });
        if (calls.length === 1) return { status: 401, ok: false };
        return { status: 200, ok: true, json: async () => ({ success: true }) };
    };
    const fetchPoolWithTokenRefresh = new Function(
        'getAccessToken',
        'refreshPoolAccessToken',
        'fetch',
        `${fetchHelperSrc}; return fetchPoolWithTokenRefresh;`,
    )(
        () => 'expired-jwt',
        async () => {
            refreshCount += 1;
            return 'fresh-jwt';
        },
        mockFetch,
    );

    const res = await fetchPoolWithTokenRefresh('/api/admin/trivia-pool-curate');
    assert.equal(refreshCount, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].auth, 'Bearer expired-jwt');
    assert.equal(calls[1].auth, 'Bearer fresh-jwt');
    assert.equal(res.unauthenticated, false);
    assert.equal(res.response.status, 200);

    // When refresh fails, unauthenticated is true after 1 fetch (no storm)
    const failCalls = [];
    const failHelper = new Function(
        'getAccessToken',
        'refreshPoolAccessToken',
        'fetch',
        `${fetchHelperSrc}; return fetchPoolWithTokenRefresh;`,
    )(
        () => 'expired-jwt',
        async () => null,
        async (url) => {
            failCalls.push(url);
            return { status: 401, ok: false };
        },
    );
    const failRes = await failHelper('/api/admin/trivia-pool-curate');
    assert.equal(failCalls.length, 1);
    assert.equal(failRes.unauthenticated, true);

    const ALL = [
        'gto_theory', 'gto_scenarios', 'cash_game_situations', 'mtt_situations', 'icm_chip_ev',
        'poker_history', 'famous_hands', 'player_profiles', 'tournament_facts', 'rule_knowledge',
    ];
    const buildCategoryCounts = new Function('ALL', `${buildCountsSrc}; return buildCategoryCounts;`)(ALL);

    const fromStatus = buildCategoryCounts({
        gto_theory: { easy: 300, medium: 750, hard: 450, total: 1500 },
    }, null);
    assert.deepEqual(fromStatus.gto_theory, { easy: 300, medium: 750, hard: 450, total: 1500 });
    assert.deepEqual(fromStatus.rule_knowledge, { easy: 0, medium: 0, hard: 0, total: 0 });

    const fromDepth = buildCategoryCounts(null, [
        { category: 'rule_knowledge', total_questions: 1420, eligible_count: 1180 },
    ]);
    assert.equal(fromDepth.rule_knowledge.total, 1420);
});

test('P2-2: /admin/trivia-operations refreshes expired JWTs via refreshSession and retries once on 401 before redirecting', async () => {
    const src = read('pages/admin/trivia-operations.js');

    assert.match(src, /supabase\.auth\.refreshSession\(\)/);
    assert.match(src, /async function fetchWithTokenRefresh\(/);
    assert.match(src, /if \(response\.status === 401\)/);
    assert.match(src, /await fetchWithTokenRefresh\(\s*'\/api\/admin\/trivia-operations'/);
    assert.doesNotMatch(src, /@supabase\/supabase-js|SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(src, /[—–]/, 'trivia-operations.js must not contain em-dashes or en-dashes');

    const helperSrc = extractFunction(src, 'fetchWithTokenRefresh');
    const calls = [];
    let refreshes = 0;
    const fetchWithTokenRefresh = new Function(
        'readLocalAccessToken',
        'refreshOperatorAccessToken',
        'fetch',
        `${helperSrc}; return fetchWithTokenRefresh;`,
    )(
        () => 'stale-token-1h-old',
        async () => {
            refreshes += 1;
            return 'rotated-fresh-token';
        },
        async (url, init) => {
            calls.push({ url, method: init?.method || 'GET', auth: init?.headers?.Authorization });
            if (calls.length === 1) return { status: 401, ok: false, json: async () => ({ error: 'expired' }) };
            return { status: 200, ok: true, json: async () => ({ generated_at: '2026-11-25T04:30:00Z' }) };
        },
    );

    const postResult = await fetchWithTokenRefresh('/api/admin/trivia-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pvp_recover' }),
    }, 'stale-token-1h-old');

    assert.equal(refreshes, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].auth, 'Bearer stale-token-1h-old');
    assert.equal(calls[1].auth, 'Bearer rotated-fresh-token');
    assert.equal(postResult.response.status, 200);
    assert.equal(postResult.token, 'rotated-fresh-token');
});

test('P1-8 & P2: /hub/trivia/leaderboard renders exact integer Elo/Peak Elo and defaults Nightly Results to latest settled event', () => {
    const src = read('pages/hub/trivia/leaderboard.js');

    // Exact Elo formatting (never compact K notation for elo or peakElo)
    assert.match(src, /function formatExactElo\(/);
    assert.match(src, /toLocaleString\('en-US'\)/);
    assert.match(src, /\{formatExactElo\(viewerRating\.elo\)\}/);
    assert.match(src, /\{formatExactElo\(viewerRating\.peakElo\)\}/);
    assert.match(src, /\{formatExactElo\(entry\.elo\)\}/);
    assert.doesNotMatch(src, /formatTriviaDisplayNumber\(viewerRating\.elo\)/);
    assert.doesNotMatch(src, /formatTriviaDisplayNumber\(viewerRating\.peakElo\)/);
    assert.doesNotMatch(src, /formatTriviaDisplayNumber\(entry\.elo\)/);
    assert.doesNotMatch(src, /[—–]/, 'leaderboard.js must not contain em-dashes or en-dashes');

    // Executable exact Elo precision proof (1192 -> "1,192", 1200 -> "1,200", NEVER "1.1K" / "1.2K")
    const formatExactEloSrc = extractFunction(src, 'formatExactElo');
    const formatExactElo = new Function(`${formatExactEloSrc}; return formatExactElo;`)();
    assert.equal(formatExactElo(1192), '1,192');
    assert.equal(formatExactElo(1200), '1,200');
    assert.equal(formatExactElo(985), '985');
    assert.equal(formatExactElo(2150), '2,150');
    assert.equal(formatExactElo(Number.NaN), '0');

    // Executable Nightly Results event selection proof
    const eventStartMsSrc = extractFunction(src, 'eventStartMs');
    const latestResultsEventSrc = extractFunction(src, 'latestResultsEvent');
    const latestResultsEvent = new Function(
        `${eventStartMsSrc}\n${latestResultsEventSrc}\nreturn latestResultsEvent;`,
    )();

    // 1. Prefers most recent settled event over future scheduled events
    const mixedSchedule = [
        { tournamentId: 'old-settled', localDate: '2026-11-23', state: 'settled', startsAt: '2026-11-24T02:00:00Z' },
        { tournamentId: 'night-1-settled', localDate: '2026-11-24', state: 'settled', startsAt: '2026-11-25T02:00:00Z' },
        { tournamentId: 'future-1', localDate: '2026-11-25', state: 'scheduled', startsAt: '2026-11-26T02:00:00Z' },
        { tournamentId: 'future-7', localDate: '2026-12-01', state: 'scheduled', startsAt: '2026-12-02T02:00:00Z' },
    ];
    assert.equal(latestResultsEvent(mixedSchedule)?.tournamentId, 'night-1-settled');

    // 2. Supports settled === true + startTime alias
    const settledBoolSchedule = [
        { tournamentId: 'future-1', localDate: '2026-11-25', state: 'scheduled', startTime: '2026-11-26T02:00:00Z' },
        { tournamentId: 'settled-flag', localDate: '2026-11-24', settled: true, startTime: '2026-11-25T02:00:00Z' },
    ];
    assert.equal(latestResultsEvent(settledBoolSchedule)?.tournamentId, 'settled-flag');

    // 3. When zero settled/live events exist, falls back to NEAREST event (2026-11-25), NOT furthest future (2026-12-01)
    const futureOnlySchedule = [
        { tournamentId: 'future-7', localDate: '2026-12-01', state: 'scheduled', startsAt: '2026-12-02T02:00:00Z' },
        { tournamentId: 'future-1', localDate: '2026-11-25', state: 'scheduled', startsAt: '2026-11-26T02:00:00Z' },
        { tournamentId: 'future-3', localDate: '2026-11-27', state: 'scheduled', startsAt: '2026-11-28T02:00:00Z' },
    ];
    assert.equal(latestResultsEvent(futureOnlySchedule)?.tournamentId, 'future-1');
});

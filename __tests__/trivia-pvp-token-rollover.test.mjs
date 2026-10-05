import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const experienceSource = readFileSync(
    new URL('../src/components/trivia/pvp/PvpCompetitiveExperience.jsx', import.meta.url),
    'utf8',
);
const serverRunSource = readFileSync(
    new URL('../src/hooks/useServerGradedRun.js', import.meta.url),
    'utf8',
);

function sourceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
    assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
}

function okResponse() {
    return {
        ok: true,
        status: 200,
        async json() { return { success: true }; },
    };
}

test('same-user PvP token rollover reaches join, start, answer, and submit', async () => {
    const requestPvpSource = sourceBetween(
        experienceSource,
        'async function requestPvp',
        '\nfunction DataRow',
    );
    const postJsonSource = sourceBetween(
        serverRunSource,
        'async function postJson',
        '\n/**\n * @param {string} mode',
    );

    const authState = { userId: 'same-player', token: 'token-before-rollover' };
    const requests = [];
    const freshToken = async () => authState.token;
    const fetchImpl = async (url, options) => {
        requests.push({ url, authorization: options.headers.Authorization });
        return okResponse();
    };

    const requestPvp = new Function(
        'getFreshAccessToken',
        'fetch',
        `${requestPvpSource}\nreturn requestPvp;`,
    )(freshToken, fetchImpl);
    const postJson = new Function(
        'fetch',
        `${postJsonSource}\nreturn postJson;`,
    )(fetchImpl);

    await requestPvp('join', { body: { stake: 10 } });
    authState.token = 'token-after-join';
    await postJson('/api/trivia/session-start', { mode: 'pvp' }, freshToken);
    authState.token = 'token-after-start';
    await postJson('/api/trivia/session-answer', { sessionId: 'session-1' }, freshToken);
    authState.token = 'token-after-answer';
    await postJson('/api/trivia/session-submit', { sessionId: 'session-1' }, freshToken);

    assert.equal(authState.userId, 'same-player');
    assert.deepEqual(requests, [
        { url: '/api/trivia/pvp/join', authorization: 'Bearer token-before-rollover' },
        { url: '/api/trivia/session-start', authorization: 'Bearer token-after-join' },
        { url: '/api/trivia/session-answer', authorization: 'Bearer token-after-start' },
        { url: '/api/trivia/session-submit', authorization: 'Bearer token-after-answer' },
    ]);
});

test('the shipped PvP call sites use the maintained request-time resolver', () => {
    assert.match(
        experienceSource,
        /import \{ getFreshAccessToken \} from '\.\.\/\.\.\/\.\.\/lib\/authUtils'/,
    );
    assert.match(experienceSource, /const token = await getFreshAccessToken\(\)/);
    assert.match(
        experienceSource,
        /useServerGradedRun\('pvp', \{ accessTokenProvider: getFreshAccessToken \}\)/,
    );
    assert.doesNotMatch(experienceSource, /const accessToken = useMemo\(/);
    assert.doesNotMatch(experienceSource, /useServerGradedRun\('pvp', \{ accessToken \}\)/);

    assert.match(serverRunSource, /const current = await accessTokenProvider\(\)/);
    for (const route of ['session-start', 'session-answer', 'session-submit']) {
        assert.match(
            serverRunSource,
            new RegExp(`postJson\\(\\s*'/api/trivia/${route}'[\\s\\S]*?resolveAccessToken\\s*\\)`),
            `${route} must resolve the current token for its own request`,
        );
    }

    // Existing solo and daily consumers may continue supplying a fixed token
    // or no token at all; this Phase 7 repair only opts the long-lived PvP flow
    // into request-time refresh.
    assert.match(serverRunSource, /const accessToken = opts\.accessToken/);
    assert.match(serverRunSource, /return typeof accessToken === 'string'/);
});

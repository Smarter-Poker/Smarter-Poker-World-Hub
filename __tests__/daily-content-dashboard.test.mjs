import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const API = 'pages/api/admin/daily-content.js';
const PAGE = 'pages/hub/admin/daily-content.js';
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

test('daily content API keeps the admin gate', async () => {
    const src = await read(API);
    assert.match(src, /ADMIN_ROUTE_SECRET/);
    assert.match(src, /x-admin-secret/);
    assert.match(src, /is_admin !== true/);
    assert.match(src, /status\(403\)/);
    assert.match(src, /status\(401\)/);
    assert.match(src, /applyRateLimit\(/);
});

test('daily content API reads data only with the service-role client', async () => {
    const src = await read(API);
    assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(src, /const adm = createClient\(url, srKey/);
    // The anon client is used only to verify the bearer token, never for daily_content_* tables.
    const anonClients = [...src.matchAll(/const (\w+) = createClient\(url, anonKey/g)].map((m) => m[1]);
    assert.ok(anonClients.length >= 1);
    for (const name of anonClients) {
        assert.doesNotMatch(src, new RegExp(`${name}\\s*\\.from\\(`), `${name} (anon) must not query tables`);
    }
    assert.match(src, /from\('daily_content_editions'\)/);
});

test('turning the global pause off is refused until Gate 4', async () => {
    const src = await read(API);
    assert.match(src, /Publishing requires Gate 4 approval/);
    assert.match(src, /scope === 'global' && paused === false/);
    assert.match(src, /status\(409\)/);
    assert.match(src, /daily_content_events/);
    assert.match(src, /pause_set/);
    assert.match(src, /pause_cleared/);
});

test('daily content API rejects unknown methods and scopes', async () => {
    const src = await read(API);
    assert.match(src, /status\(405\)/);
    assert.match(src, /function validScope/);
});

test('dashboard page calls the admin API with the bearer token and has no emoji', async () => {
    const src = await read(PAGE);
    assert.match(src, /\/api\/admin\/daily-content/);
    assert.match(src, /Authorization: `Bearer \$\{token\}`/);
    assert.match(src, /smarter-poker-auth/);
    assert.match(src, /PRIVATE DRY RUN · Publishing Off \(Gate 4 Not Approved\)/);
    assert.doesNotMatch(src, EMOJI);
    const apiSrc = await read(API);
    assert.doesNotMatch(apiSrc, EMOJI);
});

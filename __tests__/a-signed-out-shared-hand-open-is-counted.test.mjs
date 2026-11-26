/**
 * A SIGNED-OUT OPEN OF A SHARED HAND IS COUNTED (2026-11-26).
 *
 * Club Arena migration 20261126054024 (issue #9828) made the anon door
 * fn_ca_shared_hand_open a pure read and moved the view count to
 * fn_ca_shared_hand_count_view, which only authenticated and service_role can
 * execute. POST /api/club-arena/shared-hand-view counts a signed-out open with
 * the service role. Pinned here: the token shape, POST only, the answer is
 * only { counted }, a failure never reaches the caller, the exact
 * service-role call shape, the durable per-visitor dedupe, no Bearer or
 * crawler is counted, and the service role never reaches a browser module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BURST_LIMIT,
    DEDUPE_WINDOW_SECONDS,
    createSharedHandViewHandler,
    dedupeKey,
    strictHandToken,
} from '../src/lib/sharedHandView.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SERVICE = 'sb_secret_test_service_key';
const ENV = { SUPABASE_SERVICE_ROLE_KEY: SERVICE, NEXT_PUBLIC_SUPABASE_URL: 'https://db.example' };
const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

function fakeRes() {
    const r = { statusCode: 0, headers: {}, body: undefined };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
    r.status = (s) => { r.statusCode = s; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
}

function fakeFetch({ fresh = true, counted = true, fail = null } = {}) {
    const calls = [];
    const impl = async (url, init) => {
        calls.push({ url, init, args: JSON.parse(init.body) });
        if (fail === 'throw') throw new Error('network down');
        if (fail === 'status') return { ok: false, status: 503, json: async () => ({}) };
        if (url.endsWith('/check_rate_limit_strict')) return { ok: true, json: async () => fresh };
        return { ok: true, json: async () => ({ counted }) };
    };
    return { impl, calls };
}

const req = (over = {}) => ({
    method: 'POST',
    body: { token: 'AbCd2345' },
    headers: { 'user-agent': BROWSER, 'x-real-ip': '203.0.113.7' },
    ...over,
});

async function run(r, deps = {}) {
    const f = deps.fetch || fakeFetch();
    const res = fakeRes();
    const handler = createSharedHandViewHandler({ fetchImpl: f.impl, env: ENV, ...deps.extra });
    await handler(r, res);
    return { res, calls: f.calls };
}

test('only a well-formed 8-character token is accepted, untrimmed and unrepaired', async () => {
    assert.equal(strictHandToken('AbCd2345'), 'AbCd2345');
    for (const bad of [' AbCd2345', 'AbCd2345 ', 'AbCd234', 'AbCd23456', 'AbCdI345', 'AbCdO345', 'AbCdl345', 'AbCd0345', 'AbCd1345', '../etc/p', '', null, 7, {}]) {
        assert.equal(strictHandToken(bad), null, String(bad));
        const { res, calls } = await run(req({ body: { token: bad } }));
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { counted: false });
        assert.equal(calls.length, 0, 'a bad token never reaches the database');
    }
    const { res } = await run(req({ body: 'not json' }));
    assert.equal(res.statusCode, 400);
});

test('POST only', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
        const { res, calls } = await run(req({ method }));
        assert.equal(res.statusCode, 405, method);
        assert.equal(res.headers.allow, 'POST');
        assert.deepEqual(res.body, { counted: false });
        assert.equal(calls.length, 0);
    }
});

test('a signed-out browser open is counted once, through the service role, in the exact call shape', async () => {
    const { res, calls } = await run(req());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { counted: true });
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
    assert.equal(calls.length, 2);

    const [dedupe, count] = calls;
    assert.equal(dedupe.url, 'https://db.example/rest/v1/rpc/check_rate_limit_strict');
    assert.deepEqual(dedupe.args, {
        p_key: dedupeKey('AbCd2345', '203.0.113.7'),
        p_limit: 1,
        p_window_seconds: DEDUPE_WINDOW_SECONDS,
    });
    assert.doesNotMatch(dedupe.args.p_key, /203\.0\.113\.7/, 'the address is hashed, never stored');

    assert.equal(count.url, 'https://db.example/rest/v1/rpc/fn_ca_shared_hand_count_view');
    assert.deepEqual(count.args, { p_token: 'AbCd2345' });
    for (const c of calls) {
        assert.equal(c.init.method, 'POST');
        assert.equal(c.init.headers.apikey, SERVICE);
        // A modern secret key is not a JWT: it travels as apikey alone.
        assert.equal(c.init.headers.Authorization, undefined);
    }
});

test('a legacy service JWT also travels as Authorization', async () => {
    const f = fakeFetch();
    const res = fakeRes();
    await createSharedHandViewHandler({ fetchImpl: f.impl, env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOi.service' } })(req(), res);
    assert.equal(f.calls[1].init.headers.Authorization, 'Bearer eyJhbGciOi.service');
});

test('the database decides the count: a revoked link or deleted sender answers counted false', async () => {
    const { res } = await run(req(), { fetch: fakeFetch({ counted: false }) });
    assert.deepEqual(res.body, { counted: false });
});

test('the same visitor on the same link inside the window is not counted again', async () => {
    const { res, calls } = await run(req(), { fetch: fakeFetch({ fresh: false }) });
    assert.deepEqual(res.body, { counted: false });
    assert.equal(calls.length, 1, 'no count call after the dedupe says no');
    assert.equal(dedupeKey('AbCd2345', '1.1.1.1'), dedupeKey('AbCd2345', '1.1.1.1'));
    assert.notEqual(dedupeKey('AbCd2345', '1.1.1.1'), dedupeKey('AbCd2345', '1.1.1.2'));
    assert.notEqual(dedupeKey('AbCd2345', '1.1.1.1'), dedupeKey('WxYz6789', '1.1.1.1'));
});

test('a signed-in request is never counted here (the client counts it through the RPC)', async () => {
    const { res, calls } = await run(req({ headers: { 'user-agent': BROWSER, authorization: 'Bearer eyJ.user.jwt' } }));
    assert.deepEqual(res.body, { counted: false });
    assert.equal(calls.length, 0);
});

test('a link-preview crawler is never counted', async () => {
    for (const ua of ['facebookexternalhit/1.1', 'WhatsApp/2.23', 'Slackbot-LinkExpanding 1.0', 'Discordbot/2.0', 'TelegramBot', 'Twitterbot/1.0']) {
        const { res, calls } = await run(req({ headers: { 'user-agent': ua } }));
        assert.deepEqual(res.body, { counted: false }, ua);
        assert.equal(calls.length, 0, ua);
    }
});

test('the burst limiter answers 429 with only { counted: false }', async () => {
    let seen;
    const rateLimit = (r, opts) => { seen = opts; return { ok: false }; };
    const { res, calls } = await run(req(), { extra: { rateLimit } });
    assert.equal(res.statusCode, 429);
    assert.deepEqual(res.body, { counted: false });
    assert.equal(calls.length, 0);
    assert.deepEqual(seen, BURST_LIMIT);
});

test('a failure never throws to the caller and never says anything but counted false', async () => {
    for (const fetchState of [fakeFetch({ fail: 'throw' }), fakeFetch({ fail: 'status' })]) {
        const { res } = await run(req(), { fetch: fetchState });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { counted: false });
    }
    const res = fakeRes();
    await createSharedHandViewHandler({ fetchImpl: fakeFetch().impl, env: {} })(req(), res);
    assert.deepEqual(res.body, { counted: false }, 'no service key: nothing counted, nothing thrown');
    const res2 = fakeRes();
    await createSharedHandViewHandler({ fetchImpl: fakeFetch().impl, env: ENV })({ method: 'POST', body: { token: 'AbCd2345' } }, res2);
    assert.deepEqual(Object.keys(res2.body), ['counted']);
});

// ── the law ──────────────────────────────────────────────────────────────

function walk(dir, out = []) {
    for (const name of readdirSync(join(ROOT, dir))) {
        if (name === 'node_modules') continue;
        const rel = `${dir}/${name}`;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
        else if (/\.(jsx?|tsx?|mjs)$/.test(name)) out.push(rel);
    }
    return out;
}

test('law: the counter is reached only through the server route, with the service role', () => {
    const route = read('pages/api/club-arena/shared-hand-view.js');
    assert.match(route, /createSharedHandViewHandler\(\{ rateLimit \}\)/);
    const importers = [...walk('pages'), ...walk('src')]
        .filter((p) => /from ['"][./]*(?:src\/lib\/)?sharedHandView(?:\.js)?['"]/.test(read(p)))
        .filter((p) => !p.startsWith('src/lib/sharedHandView'));
    assert.deepEqual(importers, ['pages/api/club-arena/shared-hand-view.js'], 'no page or component may load the service-role module');

    const anonPath = read('src/lib/sharedHandLink.js');
    assert.doesNotMatch(anonPath.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /fn_ca_shared_hand_count_view/, 'the anon-key module never names the writer');
    const view = read('src/lib/sharedHandView.js');
    assert.match(view, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(view, /NEXT_PUBLIC_SUPABASE_ANON_KEY|resolveAnonKey/, 'the writer is never called with the anon key');
});

test('law: this file runs on every build, beside the shared-hand link tests', () => {
    const prebuild = JSON.parse(read('package.json')).scripts.prebuild;
    assert.match(prebuild, /__tests__\/shared-hand-links\.test\.mjs __tests__\/a-signed-out-shared-hand-open-is-counted\.test\.mjs/);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  "LITERALLY NOTHING CHANGED" — the stale service worker
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan said this several times. Each time the code was merged AND live on the
 * server — checked against production, not assumed. His device was running a
 * cached app shell from a worker that took control long ago.
 *
 * A new worker sits in `waiting` until every client of the old one closes. On
 * a phone that means force-quitting from the app switcher, which nobody does.
 * /_next/static is cached CacheFirst (correct — webpack hashes the filename),
 * but the HTML naming those new hashes is served by the OLD worker, so the
 * browser never learns they exist. The app freezes at whatever build was
 * current when the worker took over.
 *
 * skipWaiting alone CANNOT FIX THIS. It lives in the new worker, and the new
 * worker is the one that cannot take over. The old worker predates it and
 * will never call it. The page has to reach across and say "activate now".
 *
 * Run: node --test __tests__/sw-update.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPDATER = readFileSync(join(ROOT, 'src/components/ui/ServiceWorkerUpdater.jsx'), 'utf8');
const WORKER = readFileSync(join(ROOT, 'worker/index.js'), 'utf8');
const APP = readFileSync(join(ROOT, 'pages/_app.js'), 'utf8');
const NEXT_CONFIG = readFileSync(join(ROOT, 'next.config.js'), 'utf8');
const RUN_HOOK = readFileSync(join(ROOT, 'src/hooks/useServerGradedRun.js'), 'utf8');

test('root worker registration is app-owned and rejects safely in WebKit', () => {
    assert.match(
        NEXT_CONFIG,
        /register:\s*false/,
        'next-pwa must not launch the Workbox Window registration path'
    );
    assert.match(
        UPDATER,
        /navigator\.serviceWorker\.register\('\/sw\.js',\s*\{\s*scope:\s*'\/'\s*\}\)/,
        'the app must still register the generated root worker'
    );
    assert.match(
        UPDATER,
        /if \(!reg \|\| cancelled\) return;/,
        'a browser that declines registration must stop before reading worker state'
    );
});

test('the page actively checks for a new worker', () => {
    // Without update(), an installed PWA only looks on the browser's own
    // schedule, which can be days.
    assert.match(UPDATER, /\.update\(\)/, 'nothing asks the browser to re-check for a new worker');
});

test('a waiting worker is told to take over', () => {
    assert.match(UPDATER, /SP_SKIP_WAITING/, 'the page must message the waiting worker');
    assert.match(UPDATER, /reg\??\.waiting/, 'it must target the waiting worker specifically');
});

test('the worker honours that message', () => {
    // The handshake is useless if only one side implements it.
    assert.match(WORKER, /addEventListener\('message'/, 'the worker ignores messages entirely');
    assert.match(WORKER, /SP_SKIP_WAITING/, 'the worker does not honour the promote message');
    const handler = WORKER.slice(WORKER.indexOf("addEventListener('message'"));
    assert.match(handler.slice(0, 400), /skipWaiting\(\)/, 'the message handler must actually skip waiting');
});

test('a worker update never reloads the page you are on', () => {
    // Dan, 2026-11-10: "YOU NEED TO FIX WHAT EVER IS CAUSING A PAGE TO AUTO
    // REFRESH WHEN ITS CLICKED AND LOADED... A FEW SECONDS LATER IT INSTANTLY
    // 'RELOADS' AGAIN ON ITS OWN. THIS HAPPENS 100% OF THE TIME INSIDE OF
    // MESSENGER, AND ALOT OF TIMES FOR THE OTHER PAGES."
    //
    // This component was the cause. Read live from a Messenger tab in Dan's
    // browser that day, sp_sw_decisions held ten consecutive
    // controllerchange -> reload pairs, and the final pair sat 1ms before the
    // surviving document's timeOrigin with navigation type 'reload'.
    // chunk_reload_count was null, so ChunkLoadRecovery never fired: every
    // reload came from here.
    //
    // The old handler assumed a controller replacement meant this document's
    // HTML and chunks had come from the OLD worker. next.config.js makes that
    // impossible: same-origin document requests, /_next/static/chunks/pages/*
    // and /_next/data/* are all NetworkOnly, so every document is fetched off
    // the network and is already the build production serves. The reload could
    // never fetch anything newer. It could only discard a rendered page.
    //
    // The promotion handshake stays (the tests above pin it) because a waiting
    // worker that never activates is its own bug. Activation is enough: the
    // new worker serves the NEXT navigation.
    assert.match(UPDATER, /controllerchange/, 'nothing observes the new worker taking control');
    assert.doesNotMatch(
        UPDATER,
        /location\.reload\(\)/,
        'the updater must never reload the document; fix the caching rule that served stale assets, not the page the player is reading'
    );
    assert.doesNotMatch(
        UPDATER,
        /location\.(href|assign|replace)\s*[=(]/,
        'a navigation is a reload wearing a different name'
    );
});

test('nothing is left behind to re-arm a reload', () => {
    // Four guards existed here only to decide WHEN that reload was safe: a
    // live Training gameplay route, an active server-issued Trivia run, a
    // ringing or connected call, and unsent typed text. With no reload at all
    // each is satisfied absolutely rather than conditionally. They are removed
    // rather than left as unreachable code for the next agent to rewire, and
    // the stronger guarantee is pinned here and in
    // __tests__/messenger-calls-work.law.test.mjs.
    for (const dead of [
        'reloadForUpdatedWorker',
        'RELOAD_COOLDOWN_MS',
        'recentlyReloaded',
        'markReloaded',
        'hadControllerAtLoad',
        'triviaReloadDeferred',
        'callReloadDeferred',
        'draftTimer',
    ]) {
        assert.ok(!UPDATER.includes(dead), `${dead} survives, so the reload path is still reachable`);
    }
});

test('the shared Trivia run lease is acquired, settled, reset and always released on unmount', () => {
    assert.match(RUN_HOOK, /activeRunReleaseRef = useRef\(null\)/);
    assert.match(RUN_HOOK, /activeRunReleaseRef\.current = acquireActiveTriviaRun\(\)/);
    const accountEffect = RUN_HOOK.slice(
        RUN_HOOK.indexOf('// Re-adopt only a validated'),
        RUN_HOOK.indexOf('const openSession')
    );
    assert.match(
        accountEffect,
        /operationScopeRef\.current\.transition\(operationIdentity\);[\s\S]*?const invalidateLifecycle = \(\) => \{\s*operationScopeRef\.current\.transition\(null\);\s*clearActiveRun\(\);\s*\};[\s\S]*?return invalidateLifecycle;[\s\S]*?setRecoverableSession\(record\);\s*return invalidateLifecycle;/,
        'both effect branches must install the lifecycle-invalidating unmount cleanup'
    );
    const resume = RUN_HOOK.slice(RUN_HOOK.indexOf('const resume = useCallback'), RUN_HOOK.indexOf('const acknowledgeSettlement'));
    assert.match(
        resume,
        /sessionRef\.current = recovery\.sessionId;[\s\S]*?markRunActive\(\);[\s\S]*?await submit\(\[\], \{ recovering: true \}\)/,
        'settlement replay must hold a run lease before the network request'
    );
    assert.match(
        RUN_HOOK,
        /const projectionPending = mode === 'endless'[\s\S]*?!isTerminalEndlessHighScoreProjection\(json\?\.highScoreProjection\);\s*if \(!projectionPending\) clearActiveRun\(\);\s*return json;/,
        'a nonterminal Endless projection must retain its live-run lease'
    );
    assert.match(
        RUN_HOOK,
        /if \(mode === 'endless'[\s\S]*?!isTerminalEndlessHighScoreProjection\([\s\S]*?lastSettlementRef\.current\?\.highScoreProjection\)\) return false;[\s\S]*?retireRecovery\(\);\s*clearActiveRun\(\);/,
        'acknowledgement must refuse malformed or pending projection receipts'
    );
    assert.match(RUN_HOOK, /const reset = useCallback[\s\S]*?setError\(null\);[\s\S]*?clearActiveRun\(\);/);
});

test('active Trivia run leases are aggregate, idempotent and notify only at zero crossings', async () => {
    const signal = await import(`../src/lib/trivia/activeRunSignal.mjs?sw-test=${Date.now()}`);
    const transitions = [];
    const unsubscribe = signal.subscribeToActiveTriviaRuns(active => transitions.push(active));
    const releaseFirst = signal.acquireActiveTriviaRun();
    const releaseSecond = signal.acquireActiveTriviaRun();
    assert.equal(signal.hasActiveTriviaRun(), true);
    assert.deepEqual(transitions, [true], 'a second mounted run does not emit a false boundary');
    releaseFirst();
    releaseFirst();
    assert.equal(signal.hasActiveTriviaRun(), true, 'one unmount cannot clear another run');
    assert.deepEqual(transitions, [true]);
    releaseSecond();
    assert.equal(signal.hasActiveTriviaRun(), false);
    assert.deepEqual(transitions, [true, false]);
    unsubscribe();
});

test('the updater is mounted app-wide, not on one page', () => {
    assert.match(APP, /import ServiceWorkerUpdater/, 'not imported in _app');
    assert.match(APP, /<ServiceWorkerUpdater\s*\/>/, 'not rendered in _app');
});

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

test('control change triggers exactly one reload, never a loop', () => {
    assert.match(UPDATER, /controllerchange/, 'nothing reacts to the new worker taking control');
    assert.match(UPDATER, /location\.reload\(\)/, 'the page must reload to pick up the new build');
    // A worker that activates and claims immediately can drive
    // controllerchange -> reload -> controllerchange forever. That is worse
    // than a stale build, so the guard is not optional.
    assert.match(UPDATER, /sessionStorage/, 'the reload must be guarded by persisted state');
    assert.match(UPDATER, /RELOAD_COOLDOWN_MS|cooldown/i, 'the guard needs a cooldown window');
    // And a storage failure must fail CLOSED (assume recently reloaded),
    // never open into an unguarded reload.
    const fn = UPDATER.slice(UPDATER.indexOf('function recentlyReloaded'));
    assert.match(fn.slice(0, 400), /catch\s*\{[\s\S]*?return true/, 'a storage failure must not enable an unguarded reload');
});

test('the first worker to claim an uncontrolled page never reloads it', () => {
    // Dan, 2026-09-01: "the world hub page is doing this weird glitch where it
    // loads, then glitches and 'reloads' a 2nd time." Reproduced by
    // unregistering the root worker, clearing sessionStorage and navigating to
    // /hub once: the resulting document reported
    // performance.getEntriesByType('navigation')[0].type === 'reload' and
    // sp_sw_reloaded_at had just been written. next-pwa builds the worker with
    // skipWaiting + clientsClaim, so on a page that loaded WITHOUT a controller
    // the worker claims immediately and controllerchange fires even though the
    // page's HTML and chunks came straight off the network. Nothing is stale;
    // the reload is pure flicker, and the sessionStorage cooldown cannot
    // suppress it because a fresh session starts with empty sessionStorage.
    assert.match(
        UPDATER,
        /const hadControllerAtLoad = Boolean\(navigator\.serviceWorker\.controller\)/,
        'the updater must record whether the document loaded already controlled'
    );
    const controllerHandler = UPDATER.slice(UPDATER.indexOf('const onControllerChange'));
    const firstClaimGuard = controllerHandler.indexOf('if (!hadControllerAtLoad) return;');
    const reload = controllerHandler.indexOf('window.location.reload()');
    assert.ok(firstClaimGuard >= 0, 'the first-claim transition is not guarded');
    assert.ok(reload > firstClaimGuard, 'the first-claim guard must precede the reload');
    // The flag has to be read at mount, before anything promotes a waiting
    // worker. Sampling it inside the handler would always see the NEW
    // controller and the guard would never fire.
    assert.ok(
        UPDATER.indexOf('const hadControllerAtLoad') < UPDATER.indexOf('const onControllerChange'),
        'the controller must be sampled before the handler is defined'
    );
});

test('a worker update never reloads a live Training gameplay session', () => {
    assert.match(UPDATER, /\/hub\\\/training\\\/\(\?:arena\|play\)/, 'Training gameplay routes are not identified');
    const controllerHandler = UPDATER.slice(UPDATER.indexOf('const onControllerChange'));
    const gameplayGuard = controllerHandler.indexOf('isLiveGameplaySession()');
    const reload = controllerHandler.indexOf('window.location.reload()');
    assert.ok(gameplayGuard >= 0 && reload > gameplayGuard, 'gameplay must be guarded before the reload');
});

test('the updater is mounted app-wide, not on one page', () => {
    assert.match(APP, /import ServiceWorkerUpdater/, 'not imported in _app');
    assert.match(APP, /<ServiceWorkerUpdater\s*\/>/, 'not rendered in _app');
});

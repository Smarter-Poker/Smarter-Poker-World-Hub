/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PUSH MUST NOT WAIT ON THE APP'S CACHE LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25: turning notifications on showed "Working..." for 10-15
 * seconds and then "Service worker startup timed out after 30s".
 *
 * The worker was not slow, it was FAILING. Enrolment went through /sw.js, the
 * next-pwa worker, whose install step precaches 818 URLs. A service worker is
 * not `activated` until install RESOLVES — so every one of those 818 downloads
 * has to finish first, and if a SINGLE one 404s or times out, install rejects,
 * the worker goes redundant, and it never activates at all.
 *
 * Raising the timeout from 10s to 30s could not fix that, and didn't: the
 * error simply changed from "after 10s" to "after 30s".
 *
 * Push now uses its own worker with no precache and no fetch handler.
 *
 * Run: node --test __tests__/push-dedicated-worker.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = readFileSync(join(ROOT, 'src/lib/push-client.js'), 'utf8');
const WORKER_PATH = join(ROOT, 'public/push/sw.js');

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('the dedicated push worker exists and is served from /push/', () => {
    assert.ok(existsSync(WORKER_PATH), 'public/push/sw.js is missing');
});

test('the push worker has NO precache and NO fetch handler', () => {
    const w = stripComments(readFileSync(WORKER_PATH, 'utf8'));
    assert.ok(!/precache/i.test(w), 'a precache is exactly what made the app worker unable to activate');
    assert.ok(
        !/addEventListener\(\s*['"]fetch['"]/.test(w),
        'a fetch handler drags this worker into the request path and back into the same failure mode'
    );
    assert.match(w, /addEventListener\(\s*['"]push['"]/, 'it must handle push');
    assert.match(w, /skipWaiting\(\)/, 'it must activate immediately');
});

test('enrolment registers the push worker, not the app worker', () => {
    const c = stripComments(CLIENT);
    assert.match(c, /register\(\s*'\/push\/sw\.js'/, 'push must register its own worker');
    assert.ok(
        !/register\(\s*'\/sw\.js'/.test(c),
        'enrolling through /sw.js reintroduces the 818-entry precache dependency'
    );
});

test('the push worker takes a narrow scope so it cannot replace the app worker', () => {
    // Two registrations cannot share a scope. Registering at '/' would REPLACE
    // the next-pwa worker and kill offline caching for the whole app.
    const c = stripComments(CLIENT);
    assert.match(c, /scope:\s*'\/push\/'/, 'the push worker must claim its own scope');
});

test('no enrolment path still waits on navigator.serviceWorker.ready', () => {
    // ready resolves only for the CONTROLLING registration, which is the app
    // worker — the one that could not activate. Three call sites used it.
    const c = stripComments(CLIENT);
    assert.ok(
        !/navigator\.serviceWorker\.ready/.test(c),
        'a push path is still gated on the app worker becoming the controller'
    );
});

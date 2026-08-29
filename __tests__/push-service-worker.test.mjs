/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  "Service worker startup timed out after 10s"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25, turning push on from an iPhone on one bar of signal. The
 * toggle showed "Working..." then flipped back to Off with that red banner.
 *
 * TWO CAUSES, BOTH IN THE WAITING, NOT THE PUSH:
 *
 * 1. The client awaited navigator.serviceWorker.ready. That resolves only when
 *    a worker is active AND CONTROLLING the current page. A PWA opened for the
 *    first time from the Home Screen is not controlled yet, so it waited on an
 *    activate+claim round trip it never needed — pushManager.subscribe() only
 *    requires an ACTIVE registration.
 *
 * 2. The worker had no skipWaiting. A newly deployed worker installed behind
 *    the running one and sat in `waiting` until every tab closed. The page was
 *    therefore waiting for control by a worker that could not activate while
 *    that very page was open.
 *
 * Ten seconds to fetch a 76KB worker, install, activate and claim on a weak
 * mobile connection was never realistic either.
 *
 * Run: node --test __tests__/push-service-worker.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = readFileSync(join(ROOT, 'src/lib/push-client.js'), 'utf8');

/** Assertions must read CODE, not the comments describing the bug. */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const WORKER = readFileSync(join(ROOT, 'worker/index.js'), 'utf8');

test('the worker activates immediately instead of queueing behind the old one', () => {
    assert.match(
        WORKER,
        /skipWaiting\(\)/,
        'without skipWaiting a new worker waits for every tab to close, and a page waiting on control deadlocks against it'
    );
    assert.match(WORKER, /clients\.claim\(\)/, 'clients.claim is what takes over open pages once active');
});

test('enrolment waits on the REGISTRATION going active, not on page control', () => {
    assert.match(CLIENT, /waitForActiveWorker/, 'the registration-scoped wait is gone');

    const fn = CLIENT.slice(CLIENT.indexOf('async function getRegistration'));
    // Strip comments FIRST. The comment inside this function explains the bug
    // and therefore mentions serviceWorker.ready; matching prose instead of
    // code made this assertion fail against a correct implementation.
    const body = stripComments(fn.slice(0, fn.indexOf('\n}') + 2));

    // ready() may remain ONLY as a last-resort fallback, never as the first gate.
    const readyAt = body.indexOf('serviceWorker.ready');
    const activeAt = body.indexOf('waitForActiveWorker');
    assert.ok(activeAt > -1, 'getRegistration must wait for an active worker');
    assert.ok(
        readyAt === -1 || activeAt < readyAt,
        'serviceWorker.ready must not be reached before the registration-scoped wait'
    );
    assert.match(body, /reg\.active/, 'it must return as soon as the registration has an active worker');
});

test('the startup budget is realistic for a cold PWA on mobile data', () => {
    const m = CLIENT.match(/ready:\s*([0-9_]+)/);
    assert.ok(m, 'the ready timeout is gone');
    const ms = Number(m[1].replace(/_/g, ''));
    // Floor raised 20s -> 60s on 2026-08-29, from a measurement rather than a
    // guess: a first-ever registration against production took about 55
    // seconds, because install precaches the entire manifest atomically before
    // the worker can activate. At 30s the wait expired mid-install and the
    // user was told the worker "did not start" while it was starting fine.
    assert.ok(
        ms >= 60_000,
        `ready budget is ${ms}ms; a first-ever install precaches the whole manifest before it can activate, measured at ~55s on a FAST connection, so anything under a minute reports a healthy worker as broken`
    );
});

test('waitForActiveWorker resolves rather than hanging when nothing is pending', () => {
    // A registration that is already active, or has no installing/waiting
    // worker, must not leave the caller waiting for a statechange that will
    // never fire — that would reproduce the original hang in a new place.
    const fn = CLIENT.slice(CLIENT.indexOf('function waitForActiveWorker'));
    const body = stripComments(fn.slice(0, fn.indexOf('\n}\n') + 3));
    assert.match(body, /reg\?\.active.*resolve|if \(reg\?\.active\) return/s, 'an already-active registration must short-circuit');
    assert.match(body, /if \(!pending\) return/, 'no pending worker must resolve immediately');
    assert.match(body, /redundant/, "a replaced worker never reaches 'activated'; it must not hang the caller");
    assert.match(body, /setTimeout/, 'the wait must be bounded');
});

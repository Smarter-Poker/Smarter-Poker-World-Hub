/**
 * THE APP REOPENS WHERE YOU LEFT IT (Dan, 2026-09-13)
 *
 * "Smarter.poker app should ALWAYS open back up from exactly where you left
 * off and inside of on the page you left off on. Not just back to the world
 * hub."
 *
 * The installed PWA has start_url /hub, and iOS relaunches a discarded
 * standalone app there. Two halves fix it and both are pinned here:
 *
 *   1. src/lib/resumeRoute.js records the player's route (shared contract with
 *      Club Arena: sp:last-route + sp:session-alive), and pages/_app.js wires
 *      it to the router.
 *   2. pages/_document.js carries the inline restore script that runs before
 *      React and replaces /hub with the recorded route on a standalone launch.
 *
 * Plus the unrelated one-liner shipped in the same commit: the engine's
 * `tournament_resumed` event (raised after the hourly maintenance break) must
 * map to an URGENT push type, or a player who closed the app during the break
 * is never told their seat is being dealt again.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    LAST_ROUTE_KEY,
    SESSION_ALIVE_KEY,
    MAX_AGE_MS,
    isResumable,
    recordLastRoute,
    installLastRouteRecorder,
} from '../src/lib/resumeRoute.js';
import { eventToTypeKey, isUrgentType } from '../src/lib/push/push-prefs.js';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
}

function withBrowser(location, fn) {
    const listeners = {};
    const add = (target) => (type, cb) => { (listeners[`${target}:${type}`] ||= []).push(cb); };
    const remove = (target) => (type, cb) => {
        const key = `${target}:${type}`;
        listeners[key] = (listeners[key] || []).filter((x) => x !== cb);
    };
    const win = {
        location,
        localStorage: new MemoryStorage(),
        sessionStorage: new MemoryStorage(),
        addEventListener: add('window'),
        removeEventListener: remove('window'),
    };
    const doc = {
        visibilityState: 'visible',
        addEventListener: add('document'),
        removeEventListener: remove('document'),
    };
    const prevWin = globalThis.window;
    const prevDoc = globalThis.document;
    globalThis.window = win;
    globalThis.document = doc;
    try {
        return fn({ win, doc, listeners });
    } finally {
        if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
        if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    }
}

test('the contract keys and the age ceiling are the shared ones', () => {
    assert.equal(LAST_ROUTE_KEY, 'sp:last-route');
    assert.equal(SESSION_ALIVE_KEY, 'sp:session-alive');
    assert.equal(MAX_AGE_MS, 24 * 60 * 60 * 1000);
});

test('isResumable refuses the places that are nowhere to come back to', () => {
    for (const p of [
        '/', '/hub', '/hub/',
        '/auth', '/auth/login', '/auth/login?redirect=/hub/poker-near-me',
        '/404', '/500', '/_error', '/404/',
        '/hub/club-arena/table/x?authError=no_session',
        '//evil.example/hub', 'https://evil.example/hub', 'hub/poker-near-me',
        '', null, undefined, 42,
    ]) {
        assert.equal(isResumable(p), false, `${String(p)} must not be resumable`);
    }
});

test('isResumable accepts real destinations, query and all', () => {
    for (const p of [
        '/hub/club-arena/table/x?name=y',
        '/hub/poker-near-me',
        '/hub/training/preflop#drill-3',
        '/hub/settings?section=notifications',
        '/commander',
    ]) {
        assert.equal(isResumable(p), true, `${p} must be resumable`);
    }
});

test('recordLastRoute writes both keys with a numeric timestamp, and skips the excluded', () => {
    withBrowser({ pathname: '/hub/poker-near-me', search: '', hash: '' }, ({ win }) => {
        const before = Date.now();
        assert.equal(recordLastRoute('/hub/club-arena/table/x?name=y'), true);
        const rec = JSON.parse(win.localStorage.getItem(LAST_ROUTE_KEY));
        assert.equal(rec.path, '/hub/club-arena/table/x?name=y');
        assert.equal(typeof rec.at, 'number');
        assert.ok(rec.at >= before && rec.at <= Date.now());
        assert.equal(win.sessionStorage.getItem(SESSION_ALIVE_KEY), '1');

        assert.equal(recordLastRoute('/auth/login'), false);
        assert.equal(JSON.parse(win.localStorage.getItem(LAST_ROUTE_KEY)).path,
            '/hub/club-arena/table/x?name=y', 'an excluded route never overwrites a good one');
    });
});

test('recordLastRoute never throws when storage refuses', () => {
    withBrowser({ pathname: '/hub/x', search: '', hash: '' }, ({ win }) => {
        win.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
        win.sessionStorage.setItem = () => { throw new Error('SecurityError'); };
        assert.doesNotThrow(() => recordLastRoute('/hub/poker-near-me'));
    });
});

test('installLastRouteRecorder records now, on route change, on pagehide, on hidden, and cleans up', () => {
    withBrowser({ pathname: '/hub/poker-near-me', search: '?tab=live', hash: '' }, ({ win, doc, listeners }) => {
        const routerListeners = {};
        const router = {
            events: {
                on: (t, cb) => { (routerListeners[t] ||= []).push(cb); },
                off: (t, cb) => { routerListeners[t] = (routerListeners[t] || []).filter((x) => x !== cb); },
            },
        };
        const cleanup = installLastRouteRecorder(router);
        const current = () => JSON.parse(win.localStorage.getItem(LAST_ROUTE_KEY)).path;

        assert.equal(current(), '/hub/poker-near-me?tab=live', 'recorded immediately');

        routerListeners.routeChangeComplete[0]('/hub/training/preflop');
        assert.equal(current(), '/hub/training/preflop', 'recorded on routeChangeComplete');

        win.location = { pathname: '/hub/club-arena/table/abc', search: '', hash: '' };
        listeners['window:pagehide'][0]();
        assert.equal(current(), '/hub/club-arena/table/abc', 'recorded on pagehide');

        win.location = { pathname: '/hub/settings', search: '', hash: '' };
        listeners['document:visibilitychange'][0]();
        assert.equal(current(), '/hub/club-arena/table/abc', 'visible: nothing recorded');
        doc.visibilityState = 'hidden';
        listeners['document:visibilitychange'][0]();
        assert.equal(current(), '/hub/settings', 'recorded when hidden');

        cleanup();
        assert.equal(routerListeners.routeChangeComplete.length, 0);
        assert.equal(listeners['window:pagehide'].length, 0);
        assert.equal(listeners['document:visibilitychange'].length, 0);
    });
});

test('_app.js wires the recorder to the router', () => {
    const src = read('pages/_app.js');
    assert.match(src, /import \{ installLastRouteRecorder \} from '\.\.\/src\/lib\/resumeRoute'/);
    assert.match(src, /useEffect\(\(\) => installLastRouteRecorder\(router\), \[router\]\)/);
});

test('_document.js restores the recorded route before React, on a standalone launch only', () => {
    const src = read('pages/_document.js');
    const start = src.indexOf('THE APP REOPENS WHERE YOU LEFT IT');
    assert.ok(start > 0, 'the restore block is present');
    const script = src.slice(start, src.indexOf('PWA STALE CACHE BUSTER', start));
    for (const needle of [
        "'sp:last-route'",
        "'sp:session-alive'",
        '(display-mode: standalone)',
        'navigator.standalone === true',
        'document.referrer',
        'location.replace(path)',
        '24 * 60 * 60 * 1000',
        "'authError='",
        'localStorage.removeItem(LAST_ROUTE_KEY)',
    ]) {
        assert.ok(script.includes(needle), `restore script must contain ${needle}`);
    }
    // It lives in <Head>, ahead of the body, so it runs before React hydrates.
    assert.ok(start < src.indexOf('</Head>'), 'the restore script must be inside <Head>');
});

test('tournament_resumed pushes as urgent, like blinding-off, and digests with a real label', () => {
    const key = eventToTypeKey('tournament_resumed');
    assert.equal(key, 'tournament_starting');
    assert.equal(isUrgentType(key), true, 'a resumed tournament must pierce quiet hours');
    assert.equal(eventToTypeKey('tournament_blinding_off'), key, 'same treatment as blinding-off');
    const dispatch = read('pages/api/cron/push-dispatch.js');
    assert.match(dispatch, /tournament_resumed: 'tournaments resumed'/);
});

test('no em dash anywhere in the shipped files', () => {
    for (const rel of ['src/lib/resumeRoute.js', '__tests__/the-app-reopens-where-you-left-it.test.mjs']) {
        assert.ok(!read(rel).includes('\u2014'), `${rel} carries an em dash`);
    }
});

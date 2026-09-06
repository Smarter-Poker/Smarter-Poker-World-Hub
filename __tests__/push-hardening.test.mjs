/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PUSH DELIVERY CANNOT SILENTLY BREAK AGAIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-26. Push was broken on every phone for months. Two things let that
 * happen and both are now guarded:
 *
 *   1. NOTHING ASKED PRODUCTION. CI went green, the PR merged, and
 *      /push/sw.js still returned 404 because the deploy had not finished. A
 *      green tick answers "did it merge", never "is it serving".
 *
 *   2. THE HEALTH CRON ONLY LOOKED AT INDIVIDUAL USERS. pages/api/cron/
 *      push-health.js checks zombie endpoints and staff without devices. With
 *      ZERO subscriptions platform-wide there was no user to complain about,
 *      so it ran for months in silence while push_outbox accumulated 1,612
 *      rows skipped for no_subscription.
 *
 * Run: node --test __tests__/push-hardening.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    LEGACY_PREF_COLUMN,
    LEGACY_PREF_COLUMNS,
    legacyPrefAllowed,
} from '../src/lib/push/push-prefs.js';
import { gateDecision } from '../src/lib/push/push-gate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github/workflows/push-delivery-watchdog.yml');
const HEALTH = readFileSync(join(ROOT, 'pages/api/cron/push-health.js'), 'utf8');

test('a watchdog probes PRODUCTION, not just CI', () => {
    assert.ok(existsSync(WF), 'the production push watchdog is gone');
    const wf = readFileSync(WF, 'utf8');
    assert.match(wf, /smarter\.poker\/push\/sw\.js/, 'it must fetch the real worker URL');
    assert.match(wf, /http_code/, 'it must assert on the HTTP status, which is how the 404 hid');
});

test('the watchdog checks the three things that actually broke', () => {
    const wf = readFileSync(WF, 'utf8');
    assert.match(wf, /precache/i, 'a precache reintroduces the 30s enrolment hang');
    assert.ok(
        wf.includes("]fetch[") || wf.includes("'fetch'") || wf.includes('"fetch"'),
        'a fetch handler drags the worker back into the request path'
    );
    assert.match(wf, /_app-/, 'it must confirm the shipped client still registers the worker');
});

test('the watchdog does not use a schedule trigger', () => {
    // CLAUDE.md 11.4: new workflows with schedule: are banned unless added to
    // the CHECK 6c allowlist. Running on push to main needs no allowlist entry
    // and therefore cannot drift out of one.
    const wf = readFileSync(WF, 'utf8');
    assert.ok(!/^\s*schedule:/m.test(wf), 'a schedule: trigger requires allowlisting in CHECK 6c');
    assert.match(wf, /branches:\s*\[main\]/, 'it must run after a merge to main');
});

test('the watchdog waits for the deploy before probing', () => {
    // A push to main STARTS a Vercel build. Probing immediately reports the
    // previous deploy — passing while the new one is still building, or
    // failing on a 404 that is merely early.
    const wf = readFileSync(WF, 'utf8');
    assert.match(wf, /sleep \d{3}/, 'probing without waiting measures the previous deploy');
});

test('push-health alarms on the PLATFORM, not only on individual users', () => {
    assert.match(HEALTH, /is_active/, 'it must count active subscriptions');
    assert.match(
        HEALTH,
        /no active push subscriptions exist platform-wide/,
        'zero subscribers platform-wide is never normal and must be its own alarm'
    );
});

test('the delivery alarm cannot fire on low adoption alone', () => {
    // I first wrote `skipped24h > 200`. Production is 999 in 24h WITH push
    // working, because adoption is low — that alarm would have fired daily and
    // been ignored, recreating the silence it exists to end.
    // "(skipped24h || 0) > 0" is fine — it is one clause of the compound
    // rule below. What must never return is a standalone numeric threshold
    // like "> 200", which at current adoption fires every single day.
    assert.ok(
        !/skipped24h\s*\|\|\s*0\)\s*>\s*[1-9]\d+/.test(HEALTH),
        'a raw skipped-count threshold (> 10 or more) fires every day at current adoption'
    );
    assert.match(HEALTH, /sent24h/, 'the signal must be "subscribers exist but nothing was delivered"');
    assert.match(
        HEALTH,
        /activeSubs \|\| 0\) > 0 && \(sent24h \|\| 0\) === 0/,
        'the alarm must require subscribers AND zero deliveries'
    );
});

test('daily challenge pushes honour Club Arena daily mission reminders', () => {
    assert.equal(LEGACY_PREF_COLUMN.daily_challenge, 'daily_mission_reminders');
    assert.ok(
        LEGACY_PREF_COLUMNS.includes('daily_mission_reminders'),
        'the batched preference query must select the column Club Arena writes'
    );
    assert.equal(
        legacyPrefAllowed({ daily_mission_reminders: false }, 'daily_challenge'),
        false,
        'turning daily mission reminders off must suppress a daily challenge push'
    );

    const decision = gateDecision(
        { prefs: null, legacy: { daily_mission_reminders: false } },
        'daily_challenge'
    );
    assert.deepEqual(decision, {
        allowed: false,
        reason: 'legacy_disabled:daily_challenge',
    });
});

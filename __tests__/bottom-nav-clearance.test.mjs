/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BOTTOM NAV CLEARANCE — one number, not eighty-one
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25: the same padding as Club Arena on every mobile page, and
 * the extra padding at the bottom footer gone.
 *
 * The cause is not that a token was missing. BOTTOM_NAV_CLEARANCE has existed
 * in BottomNavBar.jsx the whole time:
 *
 *     BOTTOM_NAV_H         = calc(56px + env(safe-area-inset-bottom, 0px))
 *     BOTTOM_NAV_CLEARANCE = calc(56px + 16px + env(safe-area-inset-bottom, 0px))
 *
 * When measured, 81 pages rendered <BottomNavBar> and exactly ONE imported the
 * token. 66 hardcoded their own paddingBottom instead, in values of 0, 4, 6,
 * 8, 10, 16, 24, 40, 60, 70, 72 and 80. The most common was 70 — which is not
 * 56+16, and accounts for none of the home-indicator inset, so on any iPhone
 * with a home indicator those pages sat ~34px short and content hid behind
 * the bar.
 *
 * This is the same shape as the notification resolver and the toggle
 * component: a canonical thing existed and nothing used it.
 *
 * This guard covers the pages migrated so far and grows with each batch,
 * rather than failing the build for the ~57 not yet converted.
 *
 * Run: node --test __tests__/bottom-nav-clearance.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Batch 1 — the mobile-critical surfaces. Append as later batches land.
const MIGRATED = [
    'pages/hub/friends.js',
    'pages/hub/index.js',
    'pages/hub/notifications.js',
    'pages/hub/profile.js',
    'pages/hub/poker/lobby.js',
    'pages/hub/messenger/blocked.js',
    'pages/hub/messenger/requests.js',
    'pages/hub/trivia/settings.js',
    'pages/hub/diamond-arena/table-settings.js',
];

test('the clearance token still exists and still accounts for the safe area', () => {
    const nav = readFileSync(join(ROOT, 'src/components/ui/BottomNavBar.jsx'), 'utf8');
    assert.match(nav, /export const BOTTOM_NAV_CLEARANCE/, 'the token is gone');
    assert.match(
        nav,
        /BOTTOM_NAV_CLEARANCE\s*=\s*'calc\([^']*env\(safe-area-inset-bottom/,
        'the clearance must include env(safe-area-inset-bottom) or every iPhone hides content behind the bar'
    );
});

test('migrated pages use the token and no hardcoded pad', () => {
    for (const rel of MIGRATED) {
        const p = join(ROOT, rel);
        assert.ok(existsSync(p), `${rel} is gone; update this list`);
        const src = readFileSync(p, 'utf8');

        assert.match(src, /BOTTOM_NAV_CLEARANCE/, `${rel} no longer uses the clearance token`);
        assert.ok(
            !/paddingBottom: *70\b/.test(src),
            `${rel} has gone back to a hardcoded paddingBottom: 70, which ignores the home-indicator inset`
        );
    }
});

test('a page that uses the token also imports it', () => {
    // Using the identifier without importing it is a ReferenceError at
    // runtime and, in this codebase, a blank page rather than a stack trace.
    for (const rel of MIGRATED) {
        const src = readFileSync(join(ROOT, rel), 'utf8');
        if (!/BOTTOM_NAV_CLEARANCE/.test(src)) continue;
        assert.match(
            src,
            /import\s+BottomNavBar,\s*\{[^}]*BOTTOM_NAV_CLEARANCE[^}]*\}\s*from/,
            `${rel} uses BOTTOM_NAV_CLEARANCE without importing it`
        );
    }
});

/**
 * NO API ROUTE DECIDES ENTITLEMENT WITH THE BROWSER GATE
 *
 * `premiumFeatureGate.checkFeatureAccess` is a browser gate. It reads
 * localStorage, queries `profiles` through the anon client (whose RLS refuses
 * the read without a session), and recovers by fetching a RELATIVE url. Inside
 * a Node API route every one of those paths fails, the gate returns
 * `hasAccess: false`, and the route answers 403 to every caller, VIP included.
 *
 * That was measured on 2026-09-08 against /api/bankroll/scan-receipt with an
 * account holding 494,455 diamonds. The fix there was `serverFeatureGate`,
 * which asks the same questions with the service-role client the route already
 * holds. Six sibling routes carried the identical defect and refused every
 * paying user of Player Notes, CSV export, PDF export, the tax report, the
 * variance projection and dealer-document scanning.
 *
 * This test walks every file under pages/api so the seventh copy cannot land.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(ROOT, 'pages', 'api');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Comments stripped: a route may name the browser gate to explain why it is gone. */
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(js|ts|mjs|cjs)$/.test(entry.name)) out.push(path.relative(ROOT, full));
    }
    return out;
}

/** The routes that carried the defect on 2026-09-08. */
const PREMIUM_ROUTES = [
    'pages/api/poker/player-notes.js',
    'pages/api/bankroll/export.js',
    'pages/api/bankroll/export-pdf.js',
    'pages/api/bankroll/tax-report.js',
    'pages/api/bankroll/projection.js',
    'pages/api/bankroll/scan-dealer-document.js',
    'pages/api/bankroll/scan-receipt.js',
];

test('no file under pages/api calls the browser gate', () => {
    const offenders = walk(API).filter((rel) => {
        const src = code(rel);
        return /\bcheckFeatureAccess\s*\(/.test(src)
            || /from\s+['"][^'"]*premiumFeatureGate['"]/.test(src);
    });
    assert.deepEqual(offenders, [], `these routes would 403 every user: ${offenders.join(', ')}`);
});

test('every premium route asks the server gate with the service-role client', () => {
    for (const rel of PREMIUM_ROUTES) {
        const src = code(rel);
        assert.match(src, /import \{ checkServerFeatureAccess \} from '[./]+src\/lib\/gates\/serverFeatureGate'/,
            `${rel} must import the server gate`);
        assert.match(src, /checkServerFeatureAccess\(getSupabase\(\), \w+(?:\.id)?, 'bankroll_pro'\)/,
            `${rel} must gate bankroll_pro through the route's own service-role client`);
        assert.match(src, /if \(!access\.hasAccess\)/, `${rel} must still refuse the unentitled`);
    }
});

test('the server gate fails closed', () => {
    const gate = read('src/lib/gates/serverFeatureGate.js');
    assert.match(gate, /is_vip/, 'VIP is the first question');
    assert.match(gate, /daily_unlock_all/, 'then the universal day pass');
    assert.match(gate, /premium_feature_access/, 'then a pass for this feature');
    assert.match(gate, /return deny\('profile-unavailable'\)/, 'a database error must deny, not grant');
    assert.match(gate, /return deny\('pass-unavailable'\)/, 'a pass-table error must deny, not grant');
});

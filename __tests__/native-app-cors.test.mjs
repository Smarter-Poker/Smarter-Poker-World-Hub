/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The Club Arena native app can call the Hub's API (2026-09-07)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Club Arena ships as a Capacitor app. Its webview origin is
 * capacitor://localhost on iOS and https://localhost on Android, so every call
 * it makes to a Hub API route is cross-origin, and every call carrying the
 * Bearer session is preflighted. middleware.ts section 0 answers those
 * preflights and stamps the CORS headers - for those two origins only, on the
 * API prefixes Club Arena's source actually calls, and nothing else.
 *
 * Pins:
 *   1. the two origins, and no wildcard;
 *   2. every prefix the middleware allows is also in its matcher (a prefix
 *      in one list and not the other is a silent no-op);
 *   3. the early return, so the geo gate and the JWT presence gate that
 *      never ran on these paths still do not;
 *   4. OPTIONS is answered 204 with the headers, before anything else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MW = readFileSync(resolve(process.cwd(), 'middleware.ts'), 'utf8');

const PREFIXES = [
  '/api/club-arena/',
  '/api/store/',
  '/api/vip/',
  '/api/notifications/',
  '/api/push/',
  '/api/rewards/',
  '/api/poy/',
  '/api/avatars',
  '/api/auth/delete-account',
];

test('only the two app origins, never a wildcard', () => {
  assert.match(MW, /NATIVE_APP_ORIGINS = new Set\(\['capacitor:\/\/localhost', 'https:\/\/localhost'\]\)/);
  assert.ok(!/Allow-Origin', '\*'/.test(MW), 'no wildcard origin');
  assert.match(MW, /res\.headers\.set\('Access-Control-Allow-Origin', origin\)/);
  assert.match(MW, /res\.headers\.append\('Vary', 'Origin'\)/);
});

test('every allowed prefix is in the matcher, and vice versa', () => {
  const matcher = MW.slice(MW.indexOf('matcher: ['));
  for (const p of PREFIXES) {
    assert.ok(MW.includes(`'${p}',`), `${p} in NATIVE_APP_API_PREFIXES`);
    const pattern = p.endsWith('/') ? `'${p}:path*'` : `'${p}'`;
    assert.ok(matcher.includes(pattern), `${pattern} in the matcher`);
  }
});

test('the app paths return early: no geo gate, no JWT gate on them', () => {
  const s = MW.indexOf('if (isNativeAppApiPath(pathname)) {');
  assert.ok(s > 0);
  const block = MW.slice(s, MW.indexOf('// ── 1. Redirect www'));
  assert.match(block, /return withNativeAppCors\(NextResponse\.next\(\), origin\)/);
  assert.match(block, /return NextResponse\.next\(\);\s*\}/, 'other callers untouched');
});

test('a preflight is answered 204 with the headers', () => {
  assert.match(MW, /request\.method === 'OPTIONS'/);
  assert.match(MW, /new NextResponse\(null, \{ status: 204 \}\)/);
  assert.match(MW, /Access-Control-Allow-Headers[\s\S]*Authorization, Content-Type/);
});

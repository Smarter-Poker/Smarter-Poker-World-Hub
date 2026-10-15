// LAW: a browser spec that plants a fabricated session never lets it reach
// live Supabase Realtime.
//
// Specs plant made-up sessions in `smarter-poker-auth` and mock REST and Auth.
// The Realtime WebSocket was never mocked, so every run joined production
// Realtime channels with the made-up token. Realtime rejected each one, and
// in October 2026 those rejections (JwtSignerError, JwtSignatureError,
// MalformedJWT) were the project's entire Realtime error log. Supabase
// support (ticket SU-505102) read them as a signer fault; the subjects were
// this repo's fixtures: 00000000-0000-4000-8000-000000000909 (horses console
// phase 9) and 00000000-0000-4000-8000-000000000022 (diamond store).
//
// e2e/fixtures/realtimeSessionGuard.ts refuses any join whose access_token
// is not an asymmetric, key-identified JWT, before a server socket opens.
// This law keeps every fabricating spec wired to it, and pins what the guard
// accepts and refuses. Club Arena carries the same law for its own specs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const E2E = path.join(ROOT, 'e2e');
const GUARD = path.join(E2E, 'fixtures', 'realtimeSessionGuard.ts');

function specFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.endsWith('-snapshots') ? [] : specFiles(full);
    return /\.(spec|setup)\.ts$/.test(entry.name) ? [full] : [];
  });
}

// A spec fabricates a session when it writes `smarter-poker-auth` with an
// access_token literal of its own. A spec that signs in for real receives its
// token from Supabase Auth and never writes one.
function fabricatesSession(source) {
  return /setItem\(\s*['"`]smarter-poker-auth['"`]/.test(source) && /access_token\s*:/.test(source);
}

test('every spec that fabricates a session installs the Realtime session guard', () => {
  const unguarded = specFiles(E2E)
    .filter((file) => fabricatesSession(fs.readFileSync(file, 'utf8')))
    .filter((file) => !/installRealtimeSessionGuard\(\s*context\s*\)/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  assert.deepEqual(
    unguarded,
    [],
    'These specs plant a fabricated session without keeping it off live Realtime. Add\n' +
      "  import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';\n" +
      '  test.beforeEach(async ({ context }) => { await installRealtimeSessionGuard(context); });\n'
  );
});

test('the fabricating specs this law was written for are still recognised', () => {
  for (const name of ['025-horses-console-phase9.spec.ts', '05-diamond-store.spec.ts', 'global-footer-visual.spec.ts']) {
    assert.ok(fabricatesSession(fs.readFileSync(path.join(E2E, name), 'utf8')), `${name} no longer matches the detector`);
  }
});

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (header) => `${b64(header)}.${b64({ sub: 'x', role: 'authenticated' })}.c2lnbmF0dXJl`;

test('the guard accepts issued sessions and refuses every fixture shape that reached production', async () => {
  const { isIssuedAccessToken, fabricatedTokenIn } = await import(GUARD);

  assert.equal(isIssuedAccessToken(jwt({ alg: 'ES256', kid: 'f3c1', typ: 'JWT' })), true);
  assert.equal(isIssuedAccessToken(jwt({ alg: 'RS256', kid: 'a1', typ: 'JWT' })), true);
  assert.equal(isIssuedAccessToken('sb_publishable_example'), true);

  // horses console phase 9: an empty header (`e30` is `{}`).
  assert.equal(isIssuedAccessToken(`e30.${b64({ sub: 'x' })}.phase9`), false);
  // diamond store: HS256 with no key id.
  assert.equal(isIssuedAccessToken(`${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'x' })}.phase22signature`), false);
  // video library and footer: not a JWT at all.
  assert.equal(isIssuedAccessToken('local-browser-fixture-only'), false);
  assert.equal(isIssuedAccessToken('footer-visual-boundary-token'), false);
  // HS256 even with a kid, and alg none, are never issued by this project.
  assert.equal(isIssuedAccessToken(jwt({ alg: 'HS256', kid: 'legacy' })), false);
  assert.equal(isIssuedAccessToken(jwt({ alg: 'none', kid: 'x' })), false);

  const join = (token) =>
    JSON.stringify(['1', '1', 'realtime:private:x', 'phx_join', { config: {}, access_token: token }]);
  assert.equal(fabricatedTokenIn(join('local-browser-fixture-only')), 'local-browser-fixture-only');
  assert.equal(fabricatedTokenIn(join(jwt({ alg: 'ES256', kid: 'f3c1' }))), null);
  assert.equal(fabricatedTokenIn(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '2' })), null);
});

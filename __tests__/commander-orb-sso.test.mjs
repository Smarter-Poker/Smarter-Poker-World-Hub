/**
 * GUARD: __tests__/commander-orb-sso.test.mjs
 *
 * 2026-11-27, Dan: Club Commander kept asking for a password when opened from
 * the hub instead of staying signed in. Root cause: the Commander card read
 * localStorage['smarter-poker-auth'].session.access_token. supabase-js v2
 * stores the session flat, so the token was always undefined, the SSO hop
 * never ran, and every click landed on the Commander password form.
 *
 * These pins keep the card on the SDK session and the one-time SSO endpoint.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the Commander card opens through openClubCommander', () => {
  const hub = code(read('src/world/WorldHub.tsx'));
  const block = hub.slice(hub.indexOf("orbId === 'club-commander'"), hub.indexOf("orbId === 'club-arena'"));
  assert.match(block, /openClubCommander\(\)/);
  assert.doesNotMatch(block, /smarter-poker-auth/, 'never read the raw storage blob for the token');
});

test('nothing reads the non-existent .session wrapper from the stored v2 session', () => {
  const hub = code(read('src/world/WorldHub.tsx'));
  assert.doesNotMatch(hub, /auth\??\.session\??\.access_token/);
});

test('openClubCommander takes the token from supabase.auth.getSession() and calls the SSO endpoint', () => {
  const src = code(read('src/lib/commander/openClubCommander.js'));
  assert.match(src, /supabase\.auth\.getSession\(\)/);
  assert.match(src, /data\?\.session\?\.access_token/);
  assert.match(src, /\/api\/auth\/commander-sso/);
  assert.match(src, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(src, /localStorage/);
});

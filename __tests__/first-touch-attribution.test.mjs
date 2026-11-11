/**
 * Campaign tags on LinkedIn and Reddit links must survive to the account
 * record. Before 2026-11-11 nothing captured them (no Vercel Web Analytics on
 * hub-vanguard; PostHog only loads on auth pages), so every tag was lost.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRST_TOUCH_KEY, cleanTag, parseFirstTouch, recordFirstTouch, firstTouchMetadata, attributionForNewAccount } from '../src/lib/acquisition/firstTouch.mjs';

function fakeWindow(search, pathname = '/freerolls') {
  const store = new Map();
  return {
    location: { search, pathname },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    store,
  };
}

test('first tagged landing is kept and later landings never overwrite it', () => {
  const w = fakeWindow('?utm_source=linkedin&utm_medium=social&utm_campaign=freerolls');
  const t0 = Date.parse('2026-11-11T12:00:00Z');
  recordFirstTouch(w, t0);
  w.location = { search: '?utm_source=reddit&utm_medium=social&utm_campaign=poker', pathname: '/tools' };
  recordFirstTouch(w, t0 + 1000);
  assert.deepEqual(firstTouchMetadata(w, t0 + 2000), {
    acquisition_utm_source: 'linkedin',
    acquisition_utm_medium: 'social',
    acquisition_utm_campaign: 'freerolls',
    acquisition_landing_path: '/freerolls',
    acquisition_captured_at: '2026-11-11T12:00:00.000Z',
  });
});

test('an untagged visit records nothing and a direct tagged sign-up still attributes', () => {
  const w = fakeWindow('?ref=123');
  assert.equal(recordFirstTouch(w), null);
  assert.equal(w.store.has(FIRST_TOUCH_KEY), false);
  assert.deepEqual(firstTouchMetadata(w), {});
  const direct = fakeWindow('?utm_source=reddit', '/auth/signup');
  assert.equal(firstTouchMetadata(direct).acquisition_utm_source, 'reddit');
});

test('tags are restricted to a short safe alphabet', () => {
  assert.equal(cleanTag('<script>'), null);
  assert.equal(cleanTag('a b'), null);
  assert.equal(cleanTag('x'.repeat(100)).length, 64);
  assert.equal(parseFirstTouch('?utm_source=%22%3E%3Cimg', '/'), null);
  assert.equal(parseFirstTouch('?utm_source=linkedin', '/<x>').landing_path, '/');
});

test('expired and corrupt records are ignored', () => {
  const w = fakeWindow('');
  w.localStorage.setItem(FIRST_TOUCH_KEY, '{bad');
  assert.deepEqual(firstTouchMetadata(w), {});
  w.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify({ utm_source: 'linkedin', captured_at: '2026-01-01T00:00:00Z' }));
  assert.deepEqual(firstTouchMetadata(w, Date.parse('2026-11-11T00:00:00Z')), {});
});

test('the app records first touch and sign-up writes it to the account metadata', () => {
  assert.match(readFileSync('pages/_app.js', 'utf8'), /acquisition\/firstTouch\.mjs'\)\s*\.then\(\(m\) => m\.recordFirstTouch\(\)\)/);
  const signup = readFileSync('pages/auth/signup.js', 'utf8');
  assert.match(signup, /import \{ firstTouchMetadata \} from '\.\.\/\.\.\/src\/lib\/acquisition\/firstTouch\.mjs';/);
  assert.match(signup, /\.\.\.firstTouchMetadata\(\),/);
});

test('OAuth: only a brand-new account without attribution is attributed', () => {
  const now = Date.parse('2026-11-11T18:00:00Z');
  const w = fakeWindow('?utm_source=reddit&utm_campaign=poker', '/tools');
  recordFirstTouch(w, now - 60_000);
  const fresh = { created_at: '2026-11-11T17:55:00Z', user_metadata: {} };
  assert.equal(attributionForNewAccount(fresh, w, now).acquisition_utm_source, 'reddit');
  assert.equal(attributionForNewAccount({ ...fresh, created_at: '2026-10-01T00:00:00Z' }, w, now), null, 'existing player is never re-attributed');
  assert.equal(attributionForNewAccount({ ...fresh, user_metadata: { acquisition_utm_source: 'linkedin' } }, w, now), null, 'first attribution wins');
  assert.equal(attributionForNewAccount(fresh, fakeWindow(''), now), null, 'untagged visit writes nothing');
  assert.equal(attributionForNewAccount(null, w, now), null);
});

test('the OAuth callback writes attribution for new accounts', () => {
  const cb = readFileSync('pages/auth/callback.js', 'utf8');
  assert.match(cb, /import \{ attributionForNewAccount \} from '\.\.\/\.\.\/src\/lib\/acquisition\/firstTouch\.mjs';/);
  assert.match(cb, /const acquisition = attributionForNewAccount\(user\);\s*if \(acquisition\) await supabase\.auth\.updateUser\(\{ data: acquisition \}\);/);
});

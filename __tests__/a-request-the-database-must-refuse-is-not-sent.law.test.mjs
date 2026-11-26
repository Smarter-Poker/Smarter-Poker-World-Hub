/**
 * LAW - A REQUEST THE DATABASE MUST REFUSE IS NOT SENT (2026-11-26)
 *
 * Dan, 2026-11-26: fix every bug at the root, harden it, and test it before
 * claiming success.
 *
 * Production Postgres logged these from World Hub code in one day:
 *   - 76 `permission denied for table friendships`: the public profile page
 *     read friendships for signed-out visitors and crawlers. anon has no
 *     grant on friendships, so the read could only fail.
 *   - 4 more on friendships: the friends page and the notifications feed
 *     accepted a request with a direct UPDATE (authenticated has no UPDATE
 *     grant) plus an accepted reverse upsert (RLS admits only pending rows).
 *     The feed showed "Is Now Your Friend!" while both writes were refused.
 *   - 62 `invalid input syntax for type uuid`: /api/club-arena/spin-activation
 *     put a route slug into clubs.id.
 *   - `cash-<n>` into game_registry.id (uuid) in /api/games/[slug].
 *   - `hand-nonexistent` into hand_history.hand_number (integer) in
 *     /api/training/audit-hand-history.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Validate the value, or ask
 * the definer function that owns the write, before the request leaves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('a browser never writes friendships.status itself', () => {
  for (const rel of ['pages/hub/friends.js', 'src/components/notifications/HubNotificationsFeed.jsx']) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /from\('friendships'\)\s*\.update\(/,
      `${rel}: friendships has no UPDATE grant; accept through accept_friendship`
    );
    assert.doesNotMatch(
      src,
      /from\('friendships'\)\s*\.upsert\(/,
      `${rel}: RLS admits only a pending insert; an accepted upsert is always refused`
    );
    assert.match(src, /rpc\('accept_friendship', \{ p_friendship_id: /, `${rel}: accept via the RPC`);
  }
});

test('an accept the RPC declines is not shown as accepted', () => {
  assert.match(read('pages/hub/friends.js'), /if \(error \|\| data\?\.success === false\)/);
  assert.match(
    read('src/components/notifications/HubNotificationsFeed.jsx'),
    /accepted\?\.error \|\| accepted\?\.data\?\.success === false/
  );
});

test('the public profile reads friendships only for a signed-in viewer', () => {
  const src = read('pages/hub/user/[username].js');
  const start = src.indexOf('const batch1Promises = [');
  const end = src.indexOf('];', start);
  const batch = src.slice(start, end);
  const reads = batch.match(/from\('friendships'\)/g) || [];
  assert.equal(reads.length, 2);
  assert.equal((batch.match(/user\s*\?\s*supabase\s*\.from\('friendships'\)/g) || []).length, 2);
  assert.match(batch, /: NO_FRIEND_ROWS/);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('the spin route refuses a non-uuid club before any database call', () => {
  const src = read('pages/api/club-arena/spin-activation.js');
  const guard = src.indexOf('if (!UUID_PATTERN.test(clubId))');
  assert.ok(guard > -1, 'clubId is checked against UUID_PATTERN');
  assert.ok(guard < src.indexOf('await authorise(token, clubId)'), 'the check comes before authorise');
  assert.match(src, /const UUID_PATTERN = \/\^\[0-9a-f\]\{8\}/);
  for (const slug of ['kings-club', 'crest-cert-template-1', 'demo', '']) assert.equal(UUID.test(slug), false);
});

test('a game is looked up by id only when the slug is a uuid', () => {
  const src = read('pages/api/games/[slug].js');
  assert.match(src, /UUID_PATTERN\.test\(String\(slug\)\)\s*\?\s*await getSupabase\(\)/);
});

test('a hand is looked up by hand_number only when the id is an integer', () => {
  const src = read('pages/api/training/audit-hand-history.js');
  assert.match(src, /isHandNumber\s*\?\s*await hhQuery\.eq\('hand_number', requestedHandId\)/);
  const isHandNumber = (v) => /^\d{1,10}$/.test(v) && Number(v) <= 2147483647;
  assert.equal(isHandNumber('hand-nonexistent'), false);
  assert.equal(isHandNumber('9999999999'), false);
  assert.equal(isHandNumber('1234'), true);
});

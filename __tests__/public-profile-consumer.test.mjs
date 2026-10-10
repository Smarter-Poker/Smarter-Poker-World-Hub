import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadSurface } from './social-poker-card-harness.mjs';
import { stripComments } from '../scripts/ci/lib/rpc-calls.mjs';

const HELPER = 'src/lib/publicProfile.js';
const PROFILE_PAGE = 'pages/hub/user/[username].js';
const PREFETCH = 'src/hooks/useProfilePrefetch.js';

test('the helper URL-encodes the username and preserves not-found versus unavailable', async () => {
  const { module } = loadSurface(HELPER);
  const calls = [];
  const ok = await module.loadPublicProfile(' check raise ', async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, profile: { id: 'p1', username: 'check raise' } }),
    };
  });
  assert.deepEqual(ok, { data: { id: 'p1', username: 'check raise' }, error: null, status: 200 });
  assert.equal(calls[0].url, '/api/profile/public?username=check%20raise');
  assert.deepEqual(calls[0].options, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  const absent = await module.loadPublicProfile('missing', async () => ({
    ok: false,
    status: 404,
    json: async () => ({ success: false, error: 'Profile not found' }),
  }));
  assert.deepEqual(absent, { data: null, error: 'Profile not found', status: 404 });

  const down = await module.loadPublicProfile('player', async () => ({
    ok: false,
    status: 503,
    json: async () => ({ success: false, error: 'Profile temporarily unavailable' }),
  }));
  assert.deepEqual(down, { data: null, error: 'Profile temporarily unavailable', status: 503 });
});

test('all three profile-page reads and feed prefetch use the canonical helper', () => {
  const page = stripComments(readFileSync(join(ROOT, PROFILE_PAGE), 'utf8'));
  const prefetch = stripComments(readFileSync(join(ROOT, PREFETCH), 'utf8'));
  assert.match(
    page,
    /import \{ loadPublicProfile \} from ['"]\.\.\/\.\.\/\.\.\/src\/lib\/publicProfile['"]/
  );
  assert.equal((page.match(/loadPublicProfile\(username\)/g) || []).length, 3);
  assert.doesNotMatch(page, /SAFE_PROFILE_COLUMNS/);
  assert.doesNotMatch(
    page,
    /\.from\(['"]profiles['"]\)\s*\.select\(['"]avatar_url, arena_avatar_url/
  );
  assert.match(prefetch, /loadPublicProfile\(username\)/);
  assert.doesNotMatch(prefetch, /\.from\(['"]profiles['"]\)/);
});

test('the profile page distinguishes a missing player from an unavailable lookup and still mounts hand stats', () => {
  const page = readFileSync(join(ROOT, PROFILE_PAGE), 'utf8');
  assert.match(page, /status === 404 \? 'not_found' : 'unavailable'/);
  assert.match(page, /Profile Temporarily Unavailable/);
  assert.match(page, /User Not Found/);
  assert.match(page, /<HandStatsCard userId=\{profile\.id\} isOwnProfile=\{isOwnProfile\} \/>/);
});

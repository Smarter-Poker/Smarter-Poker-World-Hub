/**
 * The public profile Reels tab shows only ready, undeleted, public reels.
 *
 * Before Phase 8 the query at the Reels slot of pages/hub/user/[username].js
 * had no predicate at all (select by author, order, limit), and the
 * permissive "Public read access" policy on social_reels (USING true) lets
 * any client read every row, so a queued, failed, deleted or private reel
 * appeared on the profile. The Reels surface itself already filters; this
 * pins the same three predicates on the profile query: media_status = ready
 * and is_deleted = false always, is_public = true unless the viewer owns the
 * profile. Source contract, like the sibling auxiliary-reels-console pin.
 *
 * Run: node --test __tests__/profile-reels-tab-ready-only.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const profileSource = readFileSync(join(ROOT, 'pages/hub/user/[username].js'), 'utf8');

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

// The Reels query sits between the videos query and the past-lives query of
// the content batch; the block is small enough to reason about as a whole.
const reelsQuery = between(profileSource, '// Reels:', '// Past Lives');

test('the profile Reels query is still the one query, on social_reels, with its columns, order and limit', () => {
  assert.equal((reelsQuery.match(/\.from\('social_reels'\)/g) || []).length, 1);
  assert.match(reelsQuery, /\.select\('id, video_url, caption, thumbnail_url, view_count, created_at'\)/);
  assert.match(reelsQuery, /\.eq\('author_id', socialId\)/);
  assert.match(reelsQuery, /\.order\('created_at', \{ ascending: false \}\)\.limit\(30\)/);
});

test('ready and undeleted are asked of every viewer, on the same chain as the author predicate', () => {
  assert.match(
    reelsQuery,
    /\.eq\('author_id', socialId\)\s*\.eq\('media_status', 'ready'\)\s*\.eq\('is_deleted', false\);/
  );
  assert.equal((reelsQuery.match(/\.eq\('media_status', 'ready'\)/g) || []).length, 1);
  assert.equal((reelsQuery.match(/\.eq\('is_deleted', false\)/g) || []).length, 1);
});

test('public is asked of everyone except the owner of the profile', () => {
  assert.match(reelsQuery, /const viewerOwnsProfile = user\?\.id === data\.id;/);
  assert.match(reelsQuery, /if \(!viewerOwnsProfile\) reelsQuery = reelsQuery\.eq\('is_public', true\);/);
  assert.equal((reelsQuery.match(/\.eq\('is_public', true\)/g) || []).length, 1);
  // The page's own ownership test is the same comparison, so the two agree.
  assert.match(profileSource, /const isOwnProfile = currentUser\?\.id === profile\.id;/);
});

test('horses are players: no reel predicate tests who the author is', () => {
  assert.doesNotMatch(reelsQuery, /is_horse|origin_type|scheduler|isHorse/);
});

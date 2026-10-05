/**
 * The profile Reels tab must use the canonical server-owned eligibility gate.
 * Direct social_reels reads cannot adjudicate mutable playback, rights,
 * linked-post privacy, native-object health, or historical aliases.
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

const reelsQuery = between(profileSource, '// Profile Reels use', '// Past Lives');

test('profile Reels never query social_reels directly', () => {
  assert.doesNotMatch(reelsQuery, /\.from\('social_reels'\)/);
  assert.doesNotMatch(reelsQuery, /supabase\s*\.from/);
});

test('public profiles use the canonical bounded profile endpoint', () => {
  assert.match(reelsQuery, /`\/api\/reels\/profile\?author_id=\$\{encodeURIComponent\(socialId\)\}&limit=30`/);
  assert.match(reelsQuery, /method: 'GET'/);
  assert.match(reelsQuery, /cache: 'no-store'/);
});

test('owners retain My Reels through the authenticated canonical endpoint', () => {
  assert.match(reelsQuery, /const viewerOwnsProfile = user\?\.id === data\.id/);
  assert.match(reelsQuery, /viewerOwnsProfile\s*\? '\/api\/reels\/mine\?limit=30'/);
  assert.match(reelsQuery, /Authorization: `Bearer \$\{token\}`/);
});

test('an invalid canonical response fails closed', () => {
  assert.match(reelsQuery, /!response\.ok \|\| !payload\?\.success \|\| !Array\.isArray\(payload\.data\)/);
  assert.match(reelsQuery, /return \{ data: \[\], error: new Error/);
});

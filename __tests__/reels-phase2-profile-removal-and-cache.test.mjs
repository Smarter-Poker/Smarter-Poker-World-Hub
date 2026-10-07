import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('pages/hub/user/[username].js', 'utf8');
const service = fs.readFileSync('src/services/SocialService.js', 'utf8');
const endpoint = fs.readFileSync('pages/api/reels/remove.js', 'utf8');
const helper = fs.readFileSync('src/lib/removeOwnedReels.js', 'utf8');

test('profile cache never hydrates or persists playable videos and Reels', () => {
  assert.doesNotMatch(profile, /if \(parsed\.videos\) setVideos\(parsed\.videos\)/);
  assert.doesNotMatch(profile, /if \(parsed\.reels\) setReels\(parsed\.reels\)/);
  assert.doesNotMatch(profile, /videos:\s*userVideos/);
  assert.doesNotMatch(profile, /reels:\s*userReels/);
  assert.match(profile, /setVideos\(\[\]\);\s*setReels\(\[\]\);/);
});

test('profile media revalidates canonically on focus and visibility', () => {
  assert.match(profile, /refreshCanonicalProfileMedia/);
  assert.match(profile, /addEventListener\('focus', refreshCanonicalProfileMedia\)/);
  assert.match(profile, /addEventListener\('visibilitychange', refreshWhenVisible\)/);
  assert.match(profile, /\/api\/social\/profile-videos\?author_id=/);
  assert.match(profile, /\/api\/reels\/profile\?author_id=/);
  assert.match(profile, /controller\?\.abort\(\)/);
});

test('owner Reel removal uses one authenticated alias-aware server boundary', () => {
  assert.doesNotMatch(profile, /from\('social_reels'\)\.delete\(/);
  assert.doesNotMatch(service, /from\('social_reels'\)\.delete\(/);
  assert.match(profile, /removeOwnedReels\(\{ reelId \}\)/);
  assert.doesNotMatch(profile, /removeOwnedReels\(\{ sourcePostId: postId \}\)/);
  assert.doesNotMatch(service, /removeOwnedReels/);
  assert.match(helper, /Authorization: `Bearer \$\{token\}`/);
  assert.match(endpoint, /getServerUserWithFallback\(req, client\)/);
  assert.match(endpoint, /client\.rpc\('remove_owned_social_reel'/);
  assert.match(endpoint, /p_owner_id: user\.id/);
  assert.match(endpoint, /row\.author_id !== user\.id/);
  assert.match(profile, /toast\.error\('Could not remove Reel\. Please try again\.'\)/);
});

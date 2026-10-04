import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const creatorPage = fs.readFileSync(new URL('../pages/hub/reels/creator.js', import.meta.url), 'utf8');
const adminPage = fs.readFileSync(new URL('../pages/hub/admin/video-rights-moderation.js', import.meta.url), 'utf8');
const consoleSource = fs.readFileSync(new URL('../src/components/video-rights/VideoCreatorRightsConsole.jsx', import.meta.url), 'utf8');
const consoleStyles = fs.readFileSync(new URL('../src/components/video-rights/VideoCreatorRightsConsole.module.css', import.meta.url), 'utf8');

test('Phase 9 exposes separate creator and moderation console routes', () => {
  assert.match(creatorPage, /VideoCreatorRightsConsole mode="creator"/);
  assert.match(adminPage, /VideoCreatorRightsConsole mode="admin"/);
  assert.match(creatorPage, /noindex,nofollow/);
  assert.match(adminPage, /noindex,nofollow/);
});

test('creator console covers every required rights workflow', () => {
  for (const label of ['Sources', 'Submissions', 'Attribution', 'Clip Reviews', 'Cases']) {
    assert.match(consoleSource, new RegExp(`['"]${label}['"]`));
  }
  for (const action of ['submit_claim', 'reserve_upload', 'submit_submission', 'request_attribution_update', 'review_clip', 'request_takedown']) {
    assert.match(consoleSource, new RegExp(`['"]${action}['"]`));
  }
  assert.match(consoleSource, /Rights Expire/);
  assert.match(consoleSource, /Territories/);
  assert.match(consoleSource, /Evidence Reference/);
  assert.match(consoleSource, /Source Master File/);
  assert.match(consoleSource, /reservation\.signedUrl/);
});

test('moderation console wires claims, submissions, reports and global takedowns', () => {
  for (const label of ['Source Claims', 'Master Submissions', 'Reports', 'Takedowns']) {
    assert.match(consoleSource, new RegExp(`['"]${label}['"]`));
  }
  assert.match(consoleSource, /apply_takedown/);
  assert.match(consoleSource, /Take Down Everywhere/);
  assert.match(consoleSource, /version: row\.version/);
});

test('all requests are bearer-bound and stale account responses are refused', () => {
  assert.match(consoleSource, /Authorization: `Bearer \$\{token\}`/);
  assert.match(consoleSource, /createLatestRequestGuard/);
  assert.match(consoleSource, /createReelAccountScope/);
  assert.match(consoleSource, /\(body\.ownerId \|\| body\.owner_id\).*owner\.ownerId/);
  assert.match(consoleSource, /request\.isCurrent\(\) \|\| !owner\.isCurrent\(\)/);
  assert.match(consoleSource, /requestGuardRef\.current\.abort\(\)/);
});

test('console provides loading, empty, error, retry and signed-out states', () => {
  assert.match(consoleSource, /role="status"/);
  assert.match(consoleSource, /role="alert"/);
  assert.match(consoleSource, /Retry Connection/);
  assert.match(consoleSource, /Sign In To Open Your Account-Bound Creator Rights Ledger/);
  assert.match(consoleSource, /No Clips Are Waiting For Your Review/);
});

test('visual treatment is mobile-first painted hardware rather than flat cards', () => {
  assert.match(consoleSource, /VideoLibraryConsole/);
  assert.match(consoleStyles, /radial-gradient/);
  assert.match(consoleStyles, /linear-gradient/);
  assert.match(consoleStyles, /box-shadow/);
  assert.match(consoleStyles, /\.recordCap/);
  assert.match(consoleStyles, /@media\(min-width:700px\)/);
  assert.match(consoleStyles, /prefers-reduced-motion/);
  assert.doesNotMatch(consoleSource, /<svg|lucide|heroicons/i);
});

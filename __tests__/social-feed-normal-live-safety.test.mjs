import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APP_ORIGIN,
  forbiddenMutation,
  validateReceipt,
} from '../scripts/ci/social-feed-normal-live-check.mjs';

const source = readFileSync(new URL('../scripts/ci/social-feed-normal-live-check.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
const SHA = '0123456789abcdef0123456789abcdef01234567';

test('the Social feed certificate permits reads and presence but blocks publication and row writes', () => {
  assert.equal(forbiddenMutation('GET', `${APP_ORIGIN}/api/social/feed?sort=learning`), false);
  assert.equal(forbiddenMutation('POST', `${APP_ORIGIN}/api/social/presence`), false);
  assert.equal(forbiddenMutation('POST', `${APP_ORIGIN}/api/link-preview/batch`), false);
  assert.equal(forbiddenMutation('POST', `${APP_ORIGIN}/api/link-preview`), true);
  assert.equal(forbiddenMutation('POST', `${APP_ORIGIN}/api/social/posts`), true);
  assert.equal(forbiddenMutation('PATCH', 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/profiles?id=eq.1'), true);
  assert.equal(forbiddenMutation('POST', 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/rpc/update_profile'), true);
  assert.equal(forbiddenMutation('PATCH', 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/social_posts?id=eq.1'), true);
  assert.equal(forbiddenMutation('DELETE', 'https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/social_comments?id=eq.1'), true);
});

test('the certificate is manual, protected-main-only, exact-source, and uses hosted test credentials', () => {
  assert.match(workflow, /social-feed-normal-live:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /git merge-base --is-ancestor "\$DEPLOYED_SHA" "\$SOURCE_SHA"/);
  assert.match(workflow, /git diff --quiet "\$DEPLOYED_SHA" "\$SOURCE_SHA" --/);
  assert.match(workflow, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL \|\| secrets\.TEST_USER_EMAIL \}\}/);
  assert.match(workflow, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
  assert.doesNotMatch(workflow, /social-feed-normal-live[\s\S]{0,1800}(?:schedule:|workflow_run:)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|auth\.admin|createUser|deleteUser/);
});

test('a complete receipt requires both viewports, stable identity, and every affected behavior', () => {
  const receipt = {
    status: 'passed',
    sourceSha: SHA,
    expectedSha: SHA,
    observedSha: SHA,
    deploymentId: 'dpl_example',
    viewports: ['390x844', '1440x1000'],
    allowedMutationAttempts: 0,
    abortedMutationAttempts: 2,
    blockedMutationClasses: ['first-party-write'],
    checks: Object.fromEntries([
      'authenticated', 'articleImages', 'textBeforeMedia', 'plainReels',
      'viewerTextBeforeMedia', 'noAutomaticFeedReset', 'manualRefresh',
      'reactionsPresent', 'noForbiddenMutation', 'stableDeployment',
    ].map((key) => [key, true])),
  };
  assert.doesNotThrow(() => validateReceipt(receipt, SHA));
  assert.throws(() => validateReceipt({ ...receipt, checks: { ...receipt.checks, noAutomaticFeedReset: false } }, SHA));
  assert.throws(() => validateReceipt({ ...receipt, deploymentId: 'wrong' }, SHA));
});

test('the probe uses the reported articles, waits through the removed timer, and requires manual refresh', () => {
  for (const id of [
    'a5c2c3df-deb6-49f2-8354-5390340d6a6a',
    '8f23a912-60da-42de-b866-48f94ddc653d',
    'f5d1c20b-c454-4553-84f0-d0963bb8eb50',
  ]) assert.match(source, new RegExp(id));
  assert.match(source, /sleep\(65_000\)/);
  assert.match(source, /rootFeedRequestCount\(feedRequests\)/);
  assert.match(source, /waitForFunction\(\(\) => window\.scrollY < 10/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /data-post-card="true"\]\[data-post-id=/);
  assert.match(source, /getAttribute\('data-post-id'\)/);
  assert.match(source, /The rendered feed reordered automatically/);
  assert.match(source, /scroll position automatically/);
  assert.match(source, /window\.dispatchEvent\(new TouchEvent\('touchstart'/);
  assert.match(source, /Manual pull refresh did not request an offset-zero feed reload/);
  assert.match(source, /Production deployment changed during the certificate/);
  assert.match(source, /failureArticleId = id/);
  assert.match(source, /mobile-article-\$\{id\}\.png/);
  assert.match(source, /Certify the actual visible author words/);
  assert.match(source, /authorLinks\.find/);
  assert.match(source, /context\.route\('\*\*\/\*'/);
  assert.match(source, /route\.abort\('blockedbyclient'\)/);
  assert.doesNotMatch(source, /\.click\(\{\s*force:\s*true/);
  assert.match(workflow, /src\/lib\/socialPostClient\.js/);
  assert.match(workflow, /src\/components\/social\/SharedLinkPreviewCard\.jsx/);
  assert.match(workflow, /pages\/hub\/social-pages\/\[pageId\]\.js/);
});

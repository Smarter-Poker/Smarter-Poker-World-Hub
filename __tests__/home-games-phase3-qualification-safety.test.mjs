import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfiguration, assertOwnedGroup, assertPublicPrivacy, allowedBrowserWrite, createOperationKeys } from '../scripts/qualify-home-games-phase3.mjs';

test('unrelated API operations have distinct UUIDs while the same operation retains identity', () => {
  let sequence = 0;
  const key = createOperationKeys(() => `operation-${++sequence}`);
  assert.equal(key('POST', '/api/groups'), 'operation-1');
  assert.equal(key('POST', '/api/groups'), 'operation-1');
  assert.equal(key('PATCH', '/api/groups'), 'operation-2');
  assert.equal(key('POST', '/api/reports'), 'operation-3');
  assert.equal(key('POST', '/api/reports'), 'operation-3');
});

test('manual qualifier uses the maintained authenticated private-package install route', () => {
  const workflow = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  const job = workflow.split('  home-games-phase3-live:')[1].split('  reels-reconciliation:')[0];
  assert.match(job, /registry-url: 'https:\/\/npm\.pkg\.github\.com'/);
  assert.match(job, /scope: '@smarter-poker'/);
  assert.match(job, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_AUTH_TOKEN \}\}/);
  assert.match(job, /NPM_TOKEN: \$\{\{ secrets\.NPM_AUTH_TOKEN \}\}/);
  assert.match(job, /npm ci --ignore-scripts/);
  assert.doesNotMatch(job, /TEST_USER_EMAIL|TEST_USER_PASSWORD/);
});

test('browser allows only the exact owned invitation redemption, never broad mutations', () => {
  const url = 'https://smarter.poker/api/commander/home-games/join/owned-code';
  assert.equal(allowedBrowserWrite('POST', url, 'owned-code'), true);
  assert.equal(allowedBrowserWrite('POST', url, 'other-code'), false);
  assert.equal(allowedBrowserWrite('DELETE', url, 'owned-code'), false);
  assert.equal(allowedBrowserWrite('POST', 'https://elsewhere.invalid/api/commander/home-games/join/owned-code', 'owned-code'), false);
  assert.equal(allowedBrowserWrite('POST', 'https://smarter.poker/api/home-games/reports', 'owned-code'), false);
  assert.equal(allowedBrowserWrite('GET', 'https://smarter.poker/api/health', ''), true);
});

test('qualification requires persisted hide and consumer withholding, not false report resolution', () => {
  const source = readFileSync(new URL('../scripts/qualify-home-games-phase3.mjs', import.meta.url), 'utf8');
  assert.match(source, /stillPending\.status, 'pending'/);
  assert.match(source, /ordinary member feed exposed hidden post/);
  assert.match(source, /dependentRowsAbsent = true/);
  assert.match(source, /scrollWidth, observation\.clientWidth/);
  assert.match(source, /ordinary member received host management control/);
  assert.match(source, /nativePostVisible = true/);
  assert.match(source, /canonicalApprovedJoinVisible = true/);
  assert.doesNotMatch(source, /\.screenshot\(|\.storageState\(|\.tracing\.|recordHar|recordVideo/);
});

test('qualification refuses missing mode, foreign database and unqualified revision before writes', () => {
  const valid = { NEXT_PUBLIC_SUPABASE_URL: 'https://kuklfnapbkmacvwxktbh.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-placeholder', SUPABASE_SERVICE_ROLE_KEY: 'test-placeholder', HOME_GAMES_EXPECTED_SHA: 'a'.repeat(40), HOME_GAMES_QUALIFICATION_MODE: 'task-owned-fixtures' };
  validateConfiguration(valid);
  assert.throws(() => validateConfiguration({}), /required/);
  assert.throws(() => validateConfiguration({ ...valid, HOME_GAMES_QUALIFICATION_MODE: '' }));
  assert.throws(() => validateConfiguration({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'https://different.invalid' }));
  assert.throws(() => validateConfiguration({ ...valid, HOME_GAMES_EXPECTED_SHA: 'main' }));
});

test('browser verifies real report dialog without submission and hidden pending host queue after persistence', () => {
  const source = readFileSync(new URL('../scripts/qualify-home-games-phase3.mjs', import.meta.url), 'utf8');
  assert.match(source, /getByRole\('dialog', \{ name: 'Report Home Game Post'/);
  assert.match(source, /getByRole\('combobox', \{ name: 'Concern'/);
  assert.match(source, /getByRole\('textbox', \{ name: 'Describe the concern'/);
  assert.match(source, /Submit Report', exact: true \}\)\.isDisabled\(\), true/);
  assert.match(source, /keyboard\.press\('Escape'\)/);
  assert.match(source, /report dialog failed focus restoration/);
  assert.match(source, /report dialog horizontal overflow/);
  assert.match(source, /getByRole\('tab', \{ name: 'Moderation'/);
  assert.match(source, /Hidden \/ Awaiting Review/);
  assert.match(source, /Reports Remain Pending Platform Review/);
  assert.match(source, /nativeReportAndHostHidePersisted = true;\s+await qualifyBrowserConsumers\([^;]+moderationSlug: page\.slug/);
  assert.doesNotMatch(source, /Submit Report[^\n]+\.click\(/);
});

test('fixture cleanup requires exact group ID, host and unique run marker', () => {
  const group = { id: '00000000-0000-4000-8000-000000000001', owner_id: 'host', name: 'PNM Qualification own-run' };
  assertOwnedGroup(group, 'host', group.name);
  assert.throws(() => assertOwnedGroup(group, 'someone-else', group.name));
  assert.throws(() => assertOwnedGroup(group, 'host', 'another-run'));
  assert.throws(() => assertOwnedGroup({ ...group, id: '*' }, 'host', group.name));
});

test('privacy assertions reject address or invitation credential anywhere in returned JSON', () => {
  assertPublicPrivacy({ group: { name: 'Public safe identity' } }, 'private-address', 'private-token');
  assert.throws(() => assertPublicPrivacy({ deep: { address: 'private-address' } }, 'private-address', 'private-token'));
  assert.throws(() => assertPublicPrivacy({ url: '/join/private-token' }, 'private-address', 'private-token'));
});

test('qualifier cannot silently use personal account credentials or retry writes', () => {
  const source = readFileSync(new URL('../scripts/qualify-home-games-phase3.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /TEST_USER_EMAIL|TEST_USER_PASSWORD|['"]\.env|sendInvite|inviteUserByEmail/);
  assert.match(source, /auth\.admin\.createUser/);
  assert.match(source, /email_confirm: true/);
  assert.match(source, /qualification_run_id: runId/);
  assert.match(source, /assert\.equal\(owned\.data\.user\?\.user_metadata\?\.qualification_run_id, runId\)/);
  assert.match(source, /auth\.admin\.deleteUser/);
  assert.match(source, /receipt\.beforeSha = await health\(\)/);
  assert.match(source, /receipt\.afterSha = await health\(\)/);
  assert.doesNotMatch(source, /setInterval|setTimeout|while\s*\(/);
});

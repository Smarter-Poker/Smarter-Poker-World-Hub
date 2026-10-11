import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfiguration, assertOwnedIdentity, allowedBrowserRead, planningBrowserError } from '../scripts/qualify-pnm-player-planning-phase5.mjs';

test('planning browser assertions use the actual Playwright test runtime', async () => {
  const source = readFileSync(new URL('../scripts/qualify-pnm-player-planning-phase5.mjs', import.meta.url), 'utf8');
  assert.match(source, /const \{ expect \} = await import\('@playwright\/test'\)/);
  assert.doesNotMatch(source, /\{ chromium, expect \} = await import\('playwright'\)/);
  const { expect } = await import('@playwright/test');
  assert.equal(typeof expect, 'function');
  expect('persisted').toBe('persisted');
});
test('browser failure evidence retains errors without session or fixture details', () => {
  const error = new Error('Broken private-origin token-value owner@example.invalid https://example.invalid/path?token=secret');
  const message = planningBrowserError(error, ['private-origin', 'token-value']);
  assert.match(message, /Broken/);
  assert.doesNotMatch(message, /private-origin|token-value|owner@example.invalid|secret/);
  assert.match(message, /https:\/\/example.invalid\/path/);
});

test('planning qualifier refuses foreign project, unknown mode and non-qualified revision', () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://kuklfnapbkmacvwxktbh.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder', SUPABASE_SERVICE_ROLE_KEY: 'placeholder', PNM_PLANNING_EXPECTED_SHA: 'a'.repeat(40), PNM_PLANNING_MODE: 'task-owned-fixtures' };
  validateConfiguration(env);
  assert.throws(() => validateConfiguration({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://foreign.invalid' }));
  assert.throws(() => validateConfiguration({ ...env, PNM_PLANNING_MODE: '' }));
  assert.throws(() => validateConfiguration({ ...env, PNM_PLANNING_EXPECTED_SHA: 'main' }));
});
test('planning cleanup verifies exact isolated identity and refuses other accounts', () => {
  const expected = { id: 'owned', email: 'owned@example.invalid' };
  const user = { ...expected, user_metadata: { qualification_run_id: 'own' } };
  assertOwnedIdentity(user, expected, 'own');
  assert.throws(() => assertOwnedIdentity({ ...user, id: 'other' }, expected, 'own'));
  assert.throws(() => assertOwnedIdentity({ ...user, email: 'personal@example.com' }, expected, 'own'));
  assert.throws(() => assertOwnedIdentity(user, expected, 'other'));
});
test('planning browser is read-only and cannot retain session artifacts or publish', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(allowedBrowserRead(method), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(allowedBrowserRead(method), false);
  const source = readFileSync(new URL('../scripts/qualify-pnm-player-planning-phase5.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.storageState\(|\.tracing\.|recordHar|recordVideo|TEST_USER_EMAIL|TEST_USER_PASSWORD|setInterval|while\s*\(/);
  assert.match(source, /publicPlan\.screenshot\(\{ path: `\$\{evidenceDirectory\}\/public-plan-/);
  assert.doesNotMatch(source, /page\.screenshot\(/);
  assert.ok(source.indexOf('const publicPlan =') >= 0);
  assert.ok(source.indexOf('publicPlan.screenshot') > source.indexOf('const publicPlan ='));
  assert.match(source, /beforeSha = await health\(\)/);
  assert.match(source, /afterSha = await health\(\)/);
  assert.match(source, /observed\.clientWidth, observed\.scrollWidth/);
  assert.match(source, /observed\.planningControlCount > 0/);
  assert.match(source, /safePublicPlanAndDirectionsRendered = true/);
  assert.match(source, /width: 390, height: 844/);
});
test('unknown planning identities retain ownership before create and reconcile without duplicate create', () => {
  const source = readFileSync(new URL('../scripts/qualify-pnm-player-planning-phase5.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('receipt.fixtures.plannedIdentities.push') < source.indexOf('service.auth.admin.createUser'));
  assert.equal((source.match(/service\.auth\.admin\.createUser\(/g) || []).length, 1);
  assert.match(source, /Unknown identity durable read failed/);
  assert.ok(source.indexOf('receipt.operationIds.push(operationId)') < source.indexOf('const response = await fetch'));
  assert.match(source, /auth\.admin\.deleteUser/);
  assert.match(source, /absent\.error\?\.code, 'user_not_found'/);
  assert.match(source, /Owned planning cleanup readback/);
  assert.match(source, /plannedIdentities\.filter/);
  assert.match(source, /Unknown identity cleanup read failed/);
});
test('planning qualifier independently reads persistence, permissions, CAS, preferences and consumer reload', () => {
  const source = readFileSync(new URL('../scripts/qualify-pnm-player-planning-phase5.mjs', import.meta.url), 'utf8');
  for (const invariant of ['stored.user_id, owner.id', 'assert.deepEqual(stored.document, search)',
    'changed.status, 409', 'foreign.data.operation, null', 'foreignList.data.plans.length, 0',
    'directWrite.error', 'ownRows.length, 1', 'strangerRows.length, 0', 'ownReceipts.length, 1', 'strangerReceipts.length, 0', 'stale.status, 409', 'tripStored.document, trip',
    'preferenceStored.poker_near_me_preferences.geofenceAlerts, false',
    'preferenceStored.poker_near_me_preferences.showNewcomerFriendly, false',
    'await page.reload', 'structuredSavedSearchRestored = true', 'safePublicPlanAndDirectionsRendered = true', 'remaining.length, 0']) assert.ok(source.includes(invariant), invariant);
});
test('planning workflow uses maintained manual main lane and configured canonical secrets', () => {
  const source = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  const job = source.split('  pnm-player-planning-phase5-live:')[1]?.split('  pnm-contributions-phase4-live:')[0];
  assert.ok(job); assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /scope: '@smarter-poker'/);
  assert.match(job, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(job, /PNM_PLANNING_MODE: task-owned-fixtures/);
  assert.match(job, /node scripts\/qualify-pnm-player-planning-phase5\.mjs/);
  assert.ok(job.indexOf('run: npm ci --ignore-scripts') < job.indexOf('name: Verify task-owned planning safeguards'), 'Runtime safeguards require restored dependencies first');
  assert.doesNotMatch(job, /TEST_USER_PASSWORD|schedule:|deploy|publish/);
});
test('required planning regressions run once, retaining the existing shared preference gate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/build-safety-gate.yml', import.meta.url), 'utf8');
  for (const file of ['__tests__/pnm-player-planning-api.test.mjs', '__tests__/pnm-player-planning-ui.test.mjs', '__tests__/pnm-player-planning-phase5-qualification-safety.test.mjs', '__tests__/page-preferences-merge-before-save.test.mjs']) {
    assert.equal(workflow.split(file).length - 1, 1, `${file} must run exactly once`);
  }
});

test('published planning qualification exercises case-insensitive UUID persistence and recovery', () => {
  const source = readFileSync(new URL('../scripts/qualify-pnm-player-planning-phase5.mjs', import.meta.url), 'utf8');
  assert.match(source, /id: randomUUID\(\)\.toUpperCase\(\)/);
  assert.match(source, /const requestId = randomUUID\(\)\.toUpperCase\(\)/);
  assert.ok(source.includes('saved.data.plan.id, createSearch.id.toLowerCase()'));
  assert.ok(source.includes('saved.data.operation_id, requestId.toLowerCase()'));
  assert.ok(source.includes('original.data.operation.operation_id, requestId.toLowerCase()'));
  assert.ok(source.includes('assert.deepEqual(stored.document, search)'));
  assert.ok(source.includes('replay.status, 201'));
  assert.ok(source.includes('changed.status, 409'));
  assert.ok(source.includes("schemaVersion: 1, query: '', filters: { state: 'NV'"));
  assert.ok(source.includes("name: 'Save Search To Account', exact: true"));
  assert.ok(source.includes('filterOnlySearchResaveVisible = true'));
});

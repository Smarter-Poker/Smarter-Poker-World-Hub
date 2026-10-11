import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfiguration, assertOwnedIdentity, allowedBrowserRead } from '../scripts/qualify-pnm-player-planning-phase5.mjs';

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
  assert.doesNotMatch(job, /TEST_USER_PASSWORD|schedule:|deploy|publish/);
});

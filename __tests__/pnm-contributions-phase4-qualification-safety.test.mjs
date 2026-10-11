import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfiguration, assertOwnedVenue, allowedBrowserRead, venueHeadingName, staffMarkerPattern } from '../scripts/qualify-pnm-contributions-phase4.mjs';
import { normalizeWorldCopy } from '../src/lib/world-copy-policy.mjs';

test('rendered fixture names match the actual copy policy without losing exact venue identity', () => {
  const marker = 'PNM Contribution Qualification 80429866-ddc2-40c7-a273-76d4d7ca9137';
  const rendered = normalizeWorldCopy(marker);
  assert.notEqual(rendered, marker, 'reproduces the original exact-heading mismatch');
  assert.equal(venueHeadingName(marker), 'PNM Contribution Qualification 80429866-Ddc2-40c7-A273-76d4d7ca9137');
  assert.equal(venueHeadingName(marker), rendered);
  assert.equal(staffMarkerPattern(marker).test(`Contact: ${marker}`), true);
  assert.equal(staffMarkerPattern(marker).test(`Contact: ${rendered}`), true);
  assert.equal(staffMarkerPattern(marker).test(marker.replace('80429866', '80429867')), false);
  assert.equal(staffMarkerPattern('Owned [test].').test('Owned XtestYz'), false);
  const source = readFileSync(new URL('../scripts/qualify-pnm-contributions-phase4.mjs', import.meta.url), 'utf8');
  assert.match(source, /name: venueHeadingName\(marker\), level: 1, exact: true/);
  assert.match(source, /assert\.equal\(venue\.name, marker\)/);
});

test('phase4 qualification rejects unknown mode, foreign project or unqualified SHA before mutations', () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://kuklfnapbkmacvwxktbh.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder', SUPABASE_SERVICE_ROLE_KEY: 'placeholder', PNM_CONTRIBUTIONS_EXPECTED_SHA: 'a'.repeat(40), PNM_CONTRIBUTIONS_MODE: 'task-owned-fixtures' };
  validateConfiguration(env);
  assert.throws(() => validateConfiguration({ ...env, PNM_CONTRIBUTIONS_EXPECTED_SHA: 'main' }));
  assert.throws(() => validateConfiguration({ ...env, PNM_CONTRIBUTIONS_MODE: '' }));
  assert.throws(() => validateConfiguration({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://foreign.invalid' }));
});

test('cleanup ownership refuses another venue and active playable records', () => {
  const venue = { id: 4, name: 'Owned', source: 'pnm-contribution-qualification:own', is_active: false };
  assertOwnedVenue(venue, 'Owned', 'own');
  assert.throws(() => assertOwnedVenue(venue, 'Other', 'own'));
  assert.throws(() => assertOwnedVenue(venue, 'Owned', 'foreign'));
  assert.throws(() => assertOwnedVenue({ ...venue, is_active: true }, 'Owned', 'own'));
  assert.throws(() => assertOwnedVenue({ ...venue, id: '*' }, 'Owned', 'own'));
});

test('browser qualification allows reads only and retains no session artifacts', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(allowedBrowserRead(method), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(allowedBrowserRead(method), false);
  const source = readFileSync(new URL('../scripts/qualify-pnm-contributions-phase4.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.screenshot\(|\.storageState\(|\.tracing\.|recordHar|recordVideo|TEST_USER_EMAIL|TEST_USER_PASSWORD|setInterval|while\s*\(/);
  assert.match(source, /createUser/);
  assert.match(source, /qualification_run_id: runId/);
  assert.match(source, /user_metadata\.qualification_run_id, runId/);
  assert.match(source, /beforeSha = await health\(\)/);
  assert.match(source, /afterSha = await health\(\)/);
  assert.match(source, /auth\.admin\.deleteUser/);
  assert.match(source, /staff\.cookie = challenge\.cookies/);
  assert.match(source, /\/api\/auth\/mfa\/challenge/);
  assert.doesNotMatch(source, /createHmac|MFA_SESSION_SECRET/);
});

test('qualification retains permission, conflict, provenance, persistence and revocation checks', () => {
  const source = readFileSync(new URL('../scripts/qualify-pnm-contributions-phase4.mjs', import.meta.url), 'utf8');
  for (const evidence of ['foreignReceipt.data.operation, null', 'conflict.status, 409', 'noMfa.status, 403', 'pendingAccess.data.access.permissions.can_edit_games, false', 'directSchedule.error', 'badRevision.status, 409', "corrected.phone, 'qualification-only'", 'wired.commander_enabled, true', 'linked[0].owner_id, owner.id', 'deniedAfterRevoke.status, 403', 'observation.clientWidth, observation.scrollWidth']) assert.ok(source.includes(evidence), evidence);
});

test('unknown fixture writes retain ownership and read back before any possible replay', () => {
  const source = readFileSync(new URL('../scripts/qualify-pnm-contributions-phase4.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('receipt.fixtures.plannedIdentities.push') < source.indexOf('service.auth.admin.createUser'));
  assert.match(source, /unknown identity durable read failed/);
  assert.match(source, /unknown venue durable read/);
  assert.match(source, /receipt\.operationIds\.push\(operationId\)/);
  assert.match(source, /immutableAuditRetained = true/);
  assert.match(source, /MFA cleanup readback/);
  assert.match(source, /social cleanup readback/);
  assert.match(source, /removed identity must be absent/);
  assert.equal((source.match(/service\.auth\.admin\.createUser\(/g) || []).length, 1);
});

test('finite manual workflow uses existing supported authenticated secrets and canonical main', () => {
  const source = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  const job = source.split('  pnm-contributions-phase4-live:')[1]?.split('  home-games-phase3-live:')[0];
  assert.ok(job);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /scope: '@smarter-poker'/);
  assert.match(job, /secrets\.NPM_AUTH_TOKEN/);
  assert.match(job, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(job, /node scripts\/qualify-pnm-contributions-phase4\.mjs/);
  assert.match(job, /PNM_CONTRIBUTIONS_MODE: task-owned-fixtures/);
  assert.doesNotMatch(job, /TEST_USER_PASSWORD|schedule:|deploy|publish/);
});

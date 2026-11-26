import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig, AUDIT_UUID, collectPublic } from '../scripts/ci/training-phase6-public-certificate.mjs';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const base = { GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), EXPECTED_SHA: 'a'.repeat(40), TEST_USER_EMAIL: 'configured', TEST_USER_PASSWORD: 'fixture', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture', NEXT_PUBLIC_SUPABASE_URL: 'https://kuklfnapbkmacvwxktbh.supabase.co', RUNNER_TEMP: '/fixture', PUBLIC_EVIDENCE: '/fixture/public.json', DEPLOYMENT_URL: 'https://hub-vanguard-abc-smarter-poker.vercel.app' };
test('fixed designated audit identity and refusal boundaries', () => {
  assert.equal(validateConfig(base).expectedSha, base.EXPECTED_SHA);
  assert.equal(AUDIT_UUID, '2d1cd6c3-5700-4af9-a271-d4863fdab20d');
  for (const changed of [{ GITHUB_REF: 'refs/heads/feature' }, { EXPECTED_SHA: 'b'.repeat(40) }, { TEST_USER_PASSWORD: '' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, { DEPLOYMENT_URL: 'https://example.com' }]) assert.throws(() => validateConfig({ ...base, ...changed }));
});
test('actual identity mismatch refuses collector and removes private session directory', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.public-certificate-test-'));
  let called = false;
  try {
    await assert.rejects(collectPublic({ ...base, RUNNER_TEMP: dir }, {
      createClient: () => ({ auth: {
        signInWithPassword: async () => ({ data: { session: { access_token: 'fixture' } } }),
        getUser: async () => ({ data: { user: { id: 'owner-not-audit', email: base.TEST_USER_EMAIL } } }),
      } }),
      collect: async () => { called = true; },
    }), /designated audit identity mismatch/);
    assert.equal(called, false);
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('workflow connects maintained public collector without exporting session or declaring admin success', () => {
  const workflow = readFileSync(new URL('../.github/workflows/training-phase6-public-certificate.yml', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../scripts/ci/training-phase6-public-certificate.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /node scripts\/ci\/training-phase6-public-certificate.mjs/);
  assert.match(workflow, /vars.TEST_USER_EMAIL \|\| secrets.TEST_USER_EMAIL/);
  assert.match(source, /auth.getUser/);
  assert.match(source, /mode: 0o600/);
  assert.match(source, /runProductionDeliveryAttestation/);
  assert.match(source, /await rm\(privateDir/);
  assert.doesNotMatch(workflow, /path:.*state|ADMIN_DATABASE|SERVICE_ROLE/);
  assert.doesNotMatch(source, /releaseGateReady\s*[:=]\s*true/);
  const safety = readFileSync(new URL('../.github/workflows/build-safety-gate.yml', import.meta.url), 'utf8');
  assert.match(safety, /run: node --test __tests__\/training-phase6-public-certificate\.test\.mjs/);
});

test('catalog verification uses the designated browser session and never invokes the authority collector', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.catalog-certificate-test-'));
  const payload = Buffer.from(JSON.stringify({ sub: AUDIT_UUID })).toString('base64url');
  const session = { access_token: 'header.' + payload + '.fixture', refresh_token: 'fixture', user: { id: AUDIT_UUID } };
  const origin = new URL(base.DEPLOYMENT_URL).origin;
  try {
    const result = await collectPublic({ ...base, RUNNER_TEMP: dir, TRAINING_VERIFICATION: 'catalog' }, {
      createClient: () => ({ auth: {
        signInWithPassword: async () => ({ data: { session } }),
        getUser: async () => ({ data: { user: { id: AUDIT_UUID, email: base.TEST_USER_EMAIL } } }),
      } }),
      collect: () => assert.fail('catalog path must not run the authority cohort'),
      verifyCatalog: async ({ state, expectedSha, origin: receivedOrigin }) => {
        assert.equal(receivedOrigin, origin);
        assert.equal(expectedSha, base.EXPECTED_SHA);
        assert.equal(state.origins[0].origin, origin);
        assert.equal(JSON.parse(state.origins[0].localStorage[0].value).user.id, AUDIT_UUID);
        return 'catalog';
      },
    });
    assert.equal(result, 'catalog');
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

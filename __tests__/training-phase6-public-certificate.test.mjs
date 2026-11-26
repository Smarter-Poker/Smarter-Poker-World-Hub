import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig, AUDIT_UUID, collectPublic } from '../scripts/ci/training-phase6-public-certificate.mjs';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { orderCatalogGames, selectCatalogGames } from '../scripts/ci/training-catalog-live.mjs';
import { readDeploymentIdentity } from '../scripts/training-phase6-production-delivery-attestation.mjs';
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
        assert.equal(state.origins[0].origin, 'https://smarter.poker');
        assert.equal(JSON.parse(state.origins[0].localStorage[0].value).user.id, AUDIT_UUID);
        assert.ok(state.origins[0].localStorage.some(item => item.name === `sp_firstrun_notif_v2_${AUDIT_UUID}`));
        return 'catalog';
      },
    });
    assert.equal(result, 'catalog');
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('public catalog identity requires the same expected deployment and source revision', async () => {
  const expectedDeploymentOrigin = base.DEPLOYMENT_URL;
  const health = {
    status: 'ok', commitSha: base.EXPECTED_SHA, version: base.EXPECTED_SHA,
    deploymentUrl: new URL(expectedDeploymentOrigin).host, deploymentId: 'dpl_expected',
    checks: { db: { status: 'ok' }, trainingGradingReceipt: { status: 'ok' } },
  };
  const approve = await readDeploymentIdentity('https://smarter.poker', base.EXPECTED_SHA, {
    expectedDeploymentOrigin,
    fetchFn: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://smarter.poker');
      assert.deepEqual(options.headers, { 'cache-control': 'no-cache' });
      return Response.json(health);
    },
  });
  assert.equal(approve.deploymentUrl, expectedDeploymentOrigin);
  await assert.rejects(readDeploymentIdentity('https://smarter.poker', base.EXPECTED_SHA, {
    expectedDeploymentOrigin,
    fetchFn: async () => Response.json({ ...health, deploymentUrl: 'hub-vanguard-different-smarter-poker.vercel.app' }),
  }), /different immutable deployment/);
});

test('catalog verifies one entry per category first and preserves the full remainder', () => {
  const games = [
    { id: 'mtt-001', category: 'MTT' },
    { id: 'mtt-002', category: 'MTT' },
    { id: 'cash-001', category: 'CASH' },
    { id: 'psy-001', category: 'PSYCHOLOGY' },
    { id: 'cash-002', category: 'CASH' },
  ];
  const { categoryStarters, gamesInOrder } = orderCatalogGames(games);
  assert.deepEqual(categoryStarters.map(game => game.id), ['mtt-001', 'cash-001', 'psy-001']);
  assert.deepEqual(gamesInOrder.map(game => game.id), ['mtt-001', 'cash-001', 'psy-001', 'mtt-002', 'cash-002']);
});

test('results follow-ups can select exact canonical games without dropping unknown IDs', () => {
  const games = [{ id: 'mtt-001' }, { id: 'cash-001' }, { id: 'psy-001' }];
  assert.deepEqual(selectCatalogGames(games, 'cash-001, mtt-001'), games.slice(0, 2));
  assert.deepEqual(selectCatalogGames(games, ''), games);
  assert.throws(() => selectCatalogGames(games, 'cash-001,cash-001'), /duplicate/);
  assert.throws(() => selectCatalogGames(games, 'cash-001,missing'), /unknown/);
  assert.throws(() => validateConfig({ ...base, TRAINING_GAME_IDS: 'cash-001' }), /game filters/);
  assert.doesNotThrow(() => validateConfig({ ...base, TRAINING_GAME_IDS: 'cash-001', TRAINING_VERIFICATION: 'results-mobile' }));
});

test('the results browser paces answer clicks using the existing production pacer', () => {
  const runner = readFileSync(new URL('../scripts/ci/training-catalog-live.mjs', import.meta.url), 'utf8');
  assert.match(runner, /resultsViewport \? createSlidingWindowRequestPacer\(\)/);
  assert.match(runner, /await recordPacer\.waitForSlot\(\);[\s\S]{0,620}decision\.click/);
});

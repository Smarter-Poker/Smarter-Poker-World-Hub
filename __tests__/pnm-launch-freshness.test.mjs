import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_CHECKS, SUPABASE_ORIGIN, classifyFreshness, readFreshness, boundedJson, classifyCatalog, readDirectory, qualifyLaunchFreshness, receiptPath } from '../scripts/ci/read-pnm-launch-freshness.mjs';
const rows = () => REQUIRED_CHECKS.map((check_name) => ({ check_name, ok: true, detail: 'count=25' }));
const env = { NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: 'test-secret-not-real' };
test('all actual RPC gates retained; failed extra gates also fail', () => {
  assert.equal(classifyFreshness(rows()).status, 'PASS');
  assert.equal(classifyFreshness([...rows(), { check_name: 'new_gate', ok: false, detail: 'count=0' }]).status, 'FAIL');
});
test('empty, partial, duplicate, nonboolean or malformed RPC cannot pass', () => {
  for (const input of [null, [], rows().slice(1), [...rows(), rows()[0]], rows().map((r) => ({ ...r, ok: 'true' }))]) {
    assert.equal(classifyFreshness(input).status, 'UNKNOWN');
  }
});
test('host validation refuses credential transmission before fetch', async () => {
  let called = false;
  for (const url of ['https://evil.invalid', `${SUPABASE_ORIGIN}/`, `${SUPABASE_ORIGIN}?q=1`]) {
    assert.equal((await readFreshness({ env: { ...env, NEXT_PUBLIC_SUPABASE_URL: url }, fetchImpl: () => { called = true; } })).status, 'UNKNOWN');
  }
  assert.equal(called, false);
});
test('read-only RPC uses exact canonical path, forbids redirects, and does not reveal key', async () => {
  const result = await readFreshness({ env, fetchImpl: async (url, options) => {
    assert.equal(url, `${SUPABASE_ORIGIN}/rest/v1/rpc/pnm_freshness_invariants`);
    assert.equal(options.redirect, 'error'); assert.equal(options.body, '{}');
    assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    return { ok: true, json: async () => rows() };
  } });
  assert.equal(result.status, 'PASS'); assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});
test('unknown provider errors never leak response details or credentials', async () => {
  const result = await readFreshness({ env, fetchImpl: async () => { throw new Error(env.SUPABASE_SERVICE_ROLE_KEY); } });
  assert.equal(result.status, 'UNKNOWN'); assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});
test('deadline covers never-resolving fetch AND response body', async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => ({ ok: true, json: () => new Promise(() => {}) })]) {
    await assert.rejects(boundedJson('https://smarter.poker', { fetchImpl, timeoutMs: 5 }), /deadline/);
  }
});
const catalog = () => ({ venues: [], metadata: { data_mode: 'catalog', data_is_live: false, live_count_known: false,
  venues_with_observed_evidence: 0, venues_with_estimated_evidence: 0, catalog_venue_count: 422, catalog_game_count: 2202,
  total_tables_live: 0, total_tables_simulated: 0, total_tables_catalog: null, total_tables_running: null, catalog_live_counts_known: false } });
test('catalog capacity cannot masquerade as running activity', () => {
  assert.equal(classifyCatalog(catalog()).status, 'PASS');
  for (const change of [{ total_tables_running: 17 }, { data_is_live: true }, { catalog_live_counts_known: true }]) {
    assert.equal(classifyCatalog({ ...catalog(), metadata: { ...catalog().metadata, ...change } }).status, 'FAIL');
  }
  assert.equal(classifyCatalog({}).status, 'UNKNOWN');
});
test('real snapshot projection and directory helper retain finite drift budgets and public-only requests', async () => {
  const { readFile } = await import('node:fs/promises');
  const { buildSnapshotVenueDirectory } = await import('../src/lib/poker-near-me/venueDirectoryServer.js');
  const source = JSON.parse(await readFile('data/poker-venue-directory-snapshot.json', 'utf8'));
  const data = buildSnapshotVenueDirectory({ params: { limit: 1000, offset: 0 }, venues: source.venues, metadata: source.metadata }).data;
  const result = await readDirectory({ now: Date.parse(source.metadata.generated_at), fetchImpl: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://smarter.poker');
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.apikey, undefined);
    return { ok: true, headers: new Headers(), json: async () => ({ success: true, data, total: data.length }) };
  } });
  assert.equal(result.status, 'PASS'); assert.equal(result.exactIdParity, true);
  assert.deepEqual(result.thresholds, { ageDays: 30, futureSkewMinutes: 10, driftCount: 5, driftPercent: 2 });
});
test('receipt path is fixed; internal drive local output refused, hosted workspace supported', () => {
  assert.throws(() => receiptPath('/Users/example/work', {}), /external/);
  assert.equal(receiptPath('/runner/work/repo', { GITHUB_ACTIONS: 'true' }), '/runner/work/repo/test-results/pnm-launch-phase6/freshness.json');
  assert.equal(receiptPath('/Volumes/SmarterWork/agent-work/test', {}), '/Volumes/SmarterWork/agent-work/test/test-results/pnm-launch-phase6/freshness.json');
});
test('missing expected identity and changed production SHA cannot certify a snapshot', async () => {
  const expectedSha = 'a'.repeat(40);
  for (const missing of [true, false]) {
    let reads = 0;
    const result = await qualifyLaunchFreshness({ env, expectedSha: missing ? '' : expectedSha, fetchImpl: async (url) => {
      if (String(url).endsWith('/api/health')) return { ok: true, json: async () => ({ commitSha: ++reads === 1 ? expectedSha : 'b'.repeat(40), status: 'ok', checks: { db: { status: 'ok' } }, deploymentId: 'dpl_test' }) };
      if (String(url).includes('/rpc/')) return { ok: true, json: async () => rows() };
      if (String(url).endsWith('/live-tables')) return { ok: true, json: async () => catalog() };
      return { ok: false };
    } });
    assert.equal(reads, 2); assert.equal(result.identity.status, 'UNKNOWN'); assert.notEqual(result.status, 'PASS');
  }
});

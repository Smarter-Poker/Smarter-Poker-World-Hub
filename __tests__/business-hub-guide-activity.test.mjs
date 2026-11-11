import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildBusinessHubGuideEvent, captureBusinessHubGuideEvent } from '../src/lib/businessHubGuideActivity.mjs';
import { loadGrowthScorecard, summarizeFirstActions } from '../src/lib/acquisition/growthScorecard.mjs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);

function dataClient(tables) {
  return { from(table) {
    let data = [...(tables[table] || [])];
    let selected;
    let from = 0, to = Infinity;
    const value = (row, key) => key.split('.').reduce((obj, part) => obj?.[part], row);
    const q = {
      select(_fields, options) { selected = options; return q; },
      gte(key, v) { data = data.filter(row => value(row, key) >= v); return q; },
      lt(key, v) { data = data.filter(row => value(row, key) < v); return q; },
      eq(key, v) { data = data.filter(row => value(row, key) === v); return q; },
      not(key, _op, v) { data = data.filter(row => value(row, key) !== v); return q; },
      order() { data.sort((a, b) => a.id.localeCompare(b.id)); return q; },
      range(a, b) { from = a; to = b; return q; },
      then(resolve, reject) { return Promise.resolve({ count: data.length, data: selected?.head ? null : data.slice(from, to + 1), error: null }).then(resolve, reject); },
    };
    return q;
  } };
}

test('scorecard deduplicates first actions, excludes prior activity and never substitutes unavailable for zero', async () => {
  const verified = (id, user, date) => ({ id, user_id: user, created_at: date, attempt_id: id, training_attempts: { user_id: user, status: 'completed', practice_only: false } });
  const training = [verified('t1', 'old', '2026-10-01T00:00:00Z'), verified('t2', 'old', '2026-11-06T00:00:00Z'), verified('t3', 'new', '2026-11-06T00:00:00Z'), { ...verified('t4', 'practice', '2026-11-06T00:00:00Z'), training_attempts: { user_id: 'practice', status: 'completed', practice_only: true } }, { ...verified('t5', 'wrong-owner', '2026-11-06T00:00:00Z'), training_attempts: { user_id: 'other', status: 'completed', practice_only: false } }];
  const ledger = [{ id: 'l1', user_id: 'new', created_at: '2026-11-07T00:00:00Z' }];
  const report = await loadGrowthScorecard(dataClient({ training_sessions: training, bankroll_ledger: ledger, profiles: [] }), new Date('2026-11-11T18:00:00Z'));
  const metric = id => report.metrics.find(row => row.id === id);
  assert.equal(metric('accounts').value, 0);
  assert.equal(metric('accounts').status, 'measured');
  assert.equal(metric('first_action').value, 1, 'new account appears once across both products');
  assert.equal(metric('training').value, 2, 'only owned, completed non-practice sessions in the window');
  assert.equal(metric('ledger').value, 1);
  assert.equal(metric('qualified_visits').value, null);
  assert.equal(metric('venue_inquiries').value, null);
  assert.doesNotMatch(JSON.stringify(report), /wrong-owner|user_id|attempt_id/);
  assert.equal(summarizeFirstActions([], [{ user_id: 'start', created_at: report.start }, { user_id: 'end', created_at: report.end }], report.start, report.end), 1, 'half-open time window');
});

test('failed, truncated and over-limit history cannot become a measured first-action count', async () => {
  const broken = { from() { throw new Error('Database Unavailable'); } };
  const failed = await loadGrowthScorecard(broken);
  assert.ok(failed.metrics.every(row => row.value === null));
  for (const response of [{ data: [], count: 10001 }, { data: [], count: 2 }, { data: [], count: null }, { data: [], count: 0, error: { message: 'Failed' } }]) {
    const q = new Proxy({}, { get: (_o, key) => key === 'then' ? resolve => Promise.resolve(response).then(resolve) : () => q });
    const report = await loadGrowthScorecard({ from: () => q });
    assert.equal(report.metrics.find(row => row.id === 'first_action').value, null);
  }
});

test('growth data remains behind the existing admin gate and API only exposes aggregate output', async () => {
  const ts = require('typescript');
  const source = readFileSync(new URL('../pages/api/admin/auth-health-data.js', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const [authorization, admin, expected] of [[undefined, false, 401], ['Bearer valid-user', false, 403], ['Bearer valid-admin', true, 200]]) {
    let loads = 0;
    const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [] }), maybeSingle: async () => ({ data: { is_admin: admin } }) };
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'synthetic' } } }) }, from: () => q };
    const module = { exports: {} };
    vm.runInNewContext(code, {
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://local.example', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' } }, console,
      require: name => name.endsWith('supabaseServerClient') ? { createClient: () => client }
        : name.endsWith('growthScorecard.mjs') ? { loadGrowthScorecard: async () => { loads++; return { metrics: [{ value: 0 }] }; } }
          : name.endsWith('apiRateLimit') ? { applyRateLimit: () => true, LIMITS: { read: {} } } : { reportApiError() {} },
      module, exports: module.exports,
    });
    const res = { code: null, body: null, setHeader() {}, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
    await module.exports.default({ method: 'GET', headers: { authorization }, query: { view: 'signup' } }, res);
    assert.equal(res.code, expected);
    assert.equal(loads, expected === 200 ? 1 : 0);
    if (expected === 200) assert.equal(res.body.growth.metrics[0].value, 0);
    else assert.equal(res.body.growth, undefined);
  }
});

function client(overrides = {}) {
  const calls = [];
  const attribution = [];
  return {
    calls, attribution,
    browser: { navigator: {}, posthog: {
      has_opted_in_capturing: () => true,
      has_opted_out_capturing: () => false,
      capture: (...args) => calls.push(args),
      register_for_session: value => attribution.push(value),
      ...overrides,
    } },
  };
}

test('only fixed guide interactions and safe properties reach analytics', () => {
  const payload = buildBusinessHubGuideEvent('destination_click', {
    topic: 'training', language: 'es', source: 'business_hub', destination: 'training',
    password: 'secret', question: 'private question', url: '/auth/login?code=secret', userId: 'private', helpful: true,
  });
  assert.deepEqual(payload, { event: 'business_hub_destination_click', properties: {
    topic: 'training', language: 'es', source: 'business_hub', destination: 'training',
  } });
  assert.equal(buildBusinessHubGuideEvent('signup', {}), null);
  assert.equal(buildBusinessHubGuideEvent('destination_click', { destination: 'https://evil.example' }), null);
  assert.equal(buildBusinessHubGuideEvent('feedback', { helpful: 'yes' }), null);
  assert.deepEqual(buildBusinessHubGuideEvent('feedback', { helpful: false, topic: 'private question' }), {
    event: 'business_hub_feedback', properties: { helpful: false },
  });
});

test('missing SDK, snippet queue, absent or ambiguous consent never capture', () => {
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, undefined), false);
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, { posthog: [] }), false);
  for (const overrides of [
    { has_opted_in_capturing: undefined },
    { has_opted_in_capturing: () => false },
    { has_opted_in_capturing: () => 'true' },
    { has_opted_out_capturing: undefined },
    { has_opted_out_capturing: () => true },
    { has_opted_out_capturing: () => undefined },
  ]) {
    const c = client(overrides);
    assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
    assert.equal(c.calls.length, 0);
    assert.equal(c.attribution.length, 0);
  }
});

test('DNT, privacy control and consent revocation are respected on each call', () => {
  for (const field of ['navigator', 'window', 'gpc']) {
    const c = client();
    if (field === 'navigator') c.browser.navigator.doNotTrack = '1';
    if (field === 'window') c.browser.doNotTrack = 1;
    if (field === 'gpc') c.browser.navigator.globalPrivacyControl = true;
    assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
    assert.equal(c.calls.length, 0);
  }
  const c = client();
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), true);
  c.browser.posthog.has_opted_out_capturing = () => true;
  assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
  assert.equal(c.calls.length, 1);
});

test('consented attribution is session-scoped and contains only fixed values', () => {
  const c = client();
  assert.equal(captureBusinessHubGuideEvent('feedback', {
    topic: 'bankroll', language: 'en', source: 'help', helpful: true, userId: 'private',
  }, c.browser), true);
  assert.deepEqual(c.attribution, [{ business_hub_guide_topic: 'bankroll', business_hub_guide_language: 'en', business_hub_guide_source: 'help' }]);
  assert.deepEqual(c.calls, [['business_hub_feedback', { topic: 'bankroll', language: 'en', source: 'help', helpful: true }]]);
});

test('SDK failures are isolated and no loader, opt-in action or SDK configuration exists', () => {
  for (const method of ['has_opted_in_capturing', 'has_opted_out_capturing', 'capture']) {
    const c = client({ [method]: () => { throw new Error('unavailable'); } });
    assert.equal(captureBusinessHubGuideEvent('guide_view', {}, c.browser), false);
  }
  const c = client({ register_for_session: () => { throw new Error('unavailable'); } });
  assert.equal(captureBusinessHubGuideEvent('guide_view', { language: 'en' }, c.browser), true);
  assert.equal(c.calls.length, 1);
  const source = readFileSync(new URL('../src/lib/businessHubGuideActivity.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\b|\bfetch\s*\(|createElement|opt_in_capturing\s*\(|\.init\s*\(|set_config\s*\(/);
});

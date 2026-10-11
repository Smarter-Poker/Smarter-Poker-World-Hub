import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');
const root = new URL('../', import.meta.url);
const actor = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';
const revision = '2026-10-11T05:00:00.000Z';
function compile(path, modules) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (modules[name]) return modules[name];
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unexpected dependency ${name}`);
  }, module, module.exports);
  return module.exports;
}
function apiFixture({ category = 'location', action = 'apply', length = 501, mfa = true, replay = false } = {}) {
  const calls = [];
  const payload = { action, reason: 'r'.repeat(length), expected_updated_at: revision, source_url: 'https://venue.example.invalid/poker' };
  const receipt = { operation_id: operationId, status: 'applied' };
  const service = {
    from(table) {
      calls.push({ table });
      const query = { select() { return query; }, eq() { return query; }, async maybeSingle() {
        return { data: table === 'profiles' ? { role: 'admin' } : table === 'pnm_contribution_operations' ? replay ? { actor_id: actor, kind: 'correction_review', payload: { ...payload, correction_id: targetId }, result: receipt } : null : table === 'pnm_venue_corrections' ? { id: targetId, venue_id: 10, category, proposal: { latitude: 30.2672, longitude: -97.7431 } } : { id: 10, state: 'TX', city: 'Austin', venue_type: 'poker_club' }, error: null };
      } }; return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: receipt, error: null }; },
  };
  const helper = compile('src/lib/poker-near-me/venueContributionsServer.js', {
    '../supabaseServerClient': { createClient: () => service },
    '../serverAuth': { getServerUserWithFallback: async () => ({ user: { id: actor } }) },
    '../mfaGate': { requireMfaEnrolled: async () => ({ ok: mfa, status: 403, reason: 'MFA required' }) },
  });
  const integrity = compile('src/lib/poker-near-me/venueIntegrity.js', {});
  const integrityServer = compile('src/lib/poker-near-me/venueIntegrityServer.js', { './venueIntegrity.js': integrity, '../../../public/data/us-states-simplified.json': { default: JSON.parse(readFileSync(new URL('public/data/us-states-simplified.json', root), 'utf8')) } });
  const handler = compile('pages/api/admin/venue-contributions.js', {
    '../../../src/lib/poker-near-me/venueContributionsServer': helper,
    '../../../src/lib/poker-near-me/venueIntegrityServer': integrityServer,
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: {} },
  }).default;
  return { calls, receipt, async run() {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'isolated-fixture-not-a-key';
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    try { await handler({ method: 'POST', headers: { authorization: 'Bearer isolated-fixture' }, body: { operation_id: operationId, kind: 'correction', id: targetId, payload } }, res); }
    finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous; }
    return res;
  } };
}
test('location apply reason follows preserved 500-character transaction contract before RPC', async () => {
  const oversized = apiFixture();
  const refusal = await oversized.run();
  assert.equal(refusal.statusCode, 400);
  assert.match(refusal.body.error, /500/);
  assert.equal(oversized.calls.some(call => call.name), false);
  const boundary = apiFixture({ length: 500 });
  assert.equal((await boundary.run()).statusCode, 200);
  assert.equal(boundary.calls.find(call => call.name).args.p_payload.reason.length, 500);
});
test('other correction decisions retain 2000-character reasons', async () => {
  for (const options of [{ action: 'reject', length: 2000 }, { category: 'details', length: 2000 }, { category: 'closure', length: 2000 }, { category: 'schedule', length: 2000 }]) {
    const fixture = apiFixture(options);
    assert.equal((await fixture.run()).statusCode, 200);
    assert.equal(fixture.calls.find(call => call.name).args.p_payload.reason.length, 2000);
  }
});
test('MFA refusal never reads corrections or invokes writes', async () => {
  const fixture = apiFixture({ mfa: false });
  const response = await fixture.run();
  assert.equal(response.statusCode, 403);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(fixture.calls.some(call => call.table === 'pnm_venue_corrections' || call.name), false);
});
test('original durable review replay is returned before reassessment or new limits', async () => {
  const fixture = apiFixture({ replay: true });
  const response = await fixture.run();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.operation_id, fixture.receipt.operation_id);
  assert.equal(fixture.calls.some(call => call.table === 'pnm_venue_corrections' || call.name), false);
});
test('actual staff form changes location apply limit without truncating rejected reasons', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, claims: [], corrections: [{ id: targetId, venue_id: 10, category: 'location', status: 'pending', updated_at: revision }], has_more: false }) });
  const wrapper = ({ children }) => React.createElement('div', null, children);
  const page = compile('pages/admin/venue-contributions.js', {
    'next/head': { default: wrapper }, 'next/link': { default: props => React.createElement('a', props) }, 'next/router': { useRouter: () => ({ query: { venue_id: '10' } }) },
    '../../src/lib/authUtils': { getSessionToken: () => 'isolated-fixture' },
    '../../src/components/poker-near-me/PokerNearMeConsole': { PokerNearMePanelShell: wrapper },
    '../../src/components/poker-near-me/VenueContributions': { ContributionButton: props => React.createElement('button', props), ContributionField: wrapper, ContributionWriteState: () => null, useContributionWrite: () => ({ busy: false, pending: null, submit() {} }) },
    '../../src/components/poker-near-me/venueContributionClient.mjs': { readContributionJson: async response => response.json() },
    '../../src/components/poker-near-me/VenueContributions.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
  }).default;
  let tree;
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(page)); });
    const challenge = tree.root.findAllByType('a').find(link => link.props.children === 'Staff MFA Challenge');
    const challengeUrl = new URL(challenge.props.href, 'https://smarter.poker');
    assert.equal(challengeUrl.pathname, '/auth/mfa');
    assert.equal(challengeUrl.searchParams.get('next'), '/admin/venue-contributions?venue_id=10');
    assert.equal(challengeUrl.searchParams.has('redirect'), false, 'MFA uses its actual next parameter');
    assert.ok(tree.root.findAllByType('a').some(link => link.props.children === 'Staff Sign In'), 'sign-in remains reachable too');
    await renderer.act(async () => tree.root.findAllByType('button').find(button => button.props.children === 'Review Contribution').props.onClick());
    assert.equal(tree.root.findByType('textarea').props.maxLength, 500);
    const decision = tree.root.findAllByType('select').find(select => select.props.value === 'apply');
    await renderer.act(async () => decision.props.onChange({ target: { value: 'reject' } }));
    assert.equal(tree.root.findByType('textarea').props.maxLength, 2000);
    await renderer.act(async () => tree.root.findByType('textarea').props.onChange({ target: { value: 'r'.repeat(501) } }));
    await renderer.act(async () => tree.root.findAllByType('select').find(select => select.props.value === 'reject').props.onChange({ target: { value: 'apply' } }));
    assert.equal(tree.root.findByType('textarea').props.value.length, 501, 'switching decision must not silently truncate evidence');
    assert.equal(tree.root.findAllByType('button').find(button => button.props.children === 'Record Review Decision').props.disabled, true);
  } finally { await renderer.act(async () => tree?.unmount()); globalThis.fetch = previousFetch; }
});

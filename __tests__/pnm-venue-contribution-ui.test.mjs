import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  contributionPendingKey, loadPendingContribution, readContributionOperation,
  savePendingContribution, sendContributionRequest,
} from '../src/components/poker-near-me/venueContributionClient.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');
const OPERATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
function storage() { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key), data }; }
function response(payload, status = 200) { return { status, ok: status >= 200 && status < 300, json: async () => payload }; }

test('contribution client authenticates every write and requires the original committed receipt', async () => {
  const calls = [];
  const request = { url: '/api/poker/venue-contributions', body: { operation_id: OPERATION, venue_id: 12, kind: 'claim' } };
  const receipt = await sendContributionRequest(request, 'isolated-token', async (url, options) => { calls.push({ url, options }); return response({ success: true, operation_id: OPERATION, status: 'pending' }); });
  assert.equal(receipt.operation_id, OPERATION);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer isolated-token');
  await assert.rejects(readContributionOperation(OPERATION, 'isolated-token', async () => response({ success: true, operation: { operation_id: 'different', status: 'pending' } })), /receipt could not be verified/);
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  await assert.rejects(sendContributionRequest(request, null, () => assert.fail('unauthenticated write')), /Sign in/);
  await assert.rejects(sendContributionRequest(request, 'isolated-token', async () => response({ success: true })), /original request receipt/);
  await assert.rejects(sendContributionRequest(request, 'isolated-token', async () => response({ success: false, error: 'Permission denied' }, 403)), (error) => error.confirmedRefusal === true && error.status === 403);
  await assert.rejects(sendContributionRequest(request, 'isolated-token', async () => response({ success: false, error: 'Unconfirmed' }, 503)), (error) => !error.confirmedRefusal);
});

test('original operation status reads are private and absent receipts stay absent', async () => {
  const calls = [];
  const result = await readContributionOperation(OPERATION, 'isolated-token', async (url, options) => { calls.push({ url, options }); return response({ success: true, operation: null }); });
  assert.equal(result, null);
  assert.match(calls[0].url, new RegExp(OPERATION));
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer isolated-token');
});

test('pending requests retain exact operation and payload but never session credentials', () => {
  const store = storage();
  const request = { url: '/api/poker/venue-contributions', account_id: ACTOR, context: 'venue:12', body: { operation_id: OPERATION, payload: { source_url: 'https://example.invalid/source' } } };
  const key = contributionPendingKey(ACTOR, 'venue:12');
  savePendingContribution(store, key, request);
  assert.deepEqual(loadPendingContribution(store, key), request);
  assert.equal(loadPendingContribution(store, contributionPendingKey('other-user', 'venue:12')), null);
  assert.doesNotMatch(store.getItem(key), /Bearer|access_token|isolated-token/);
});

async function loadUi(auth) {
  const source = await readFile(new URL('../src/components/poker-near-me/VenueContributions.jsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const client = await import('../src/components/poker-near-me/venueContributionClient.mjs');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('/authUtils')) return auth;
    if (name === './PokerNearMeConsole') return { PokerNearMePanelShell: ({ as: Tag = 'article', children, ...props }) => React.createElement(Tag, props, children) };
    if (name === './venueContributionClient.mjs') return client;
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => String(key) });
    throw new Error(`Unexpected UI dependency ${name}`);
  }, module, module.exports);
  return module.exports;
}

test('actual write hook suppresses duplicate clicks, retains unknown operations and recovers without replay', async () => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.sessionStorage = storage();
  const ui = await loadUi({ getAuthUser: () => ({ id: ACTOR }), getSessionToken: () => 'isolated-token' });
  let writer; let confirmed = 0; let resolveWrite; const writes = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method === 'POST') { writes.push(JSON.parse(options.body)); await new Promise((resolve) => { resolveWrite = resolve; }); throw new Error('ack lost'); }
    return response({ success: true, operation: { operation_id: writes[0].operation_id, status: 'pending' } });
  };
  function Fixture() { writer = ui.useContributionWrite('venue:12', () => { confirmed++; }); return null; }
  let tree;
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    const first = writer.submit('/api/poker/venue-contributions', { venue_id: 12, kind: 'claim' });
    await writer.submit('/api/poker/venue-contributions', { venue_id: 12, kind: 'claim' });
    assert.equal(writes.length, 1);
    await renderer.act(async () => { resolveWrite(); await first; });
    assert.equal(writer.pending.body.operation_id, writes[0].operation_id);
    assert.equal(confirmed, 0);
    assert.match(writer.error, /not confirmed/);
    await renderer.act(async () => { await writer.check(); });
    assert.equal(writer.pending, null);
    assert.equal(confirmed, 1);
    assert.equal(writes.length, 1);
    assert.equal(globalThis.sessionStorage.data.size, 0);
  } finally { await renderer.act(async () => tree?.unmount()); Object.assign(globalThis, previous); }
});

test('venue page removes anonymous foreign-claim editor and wires explicit permissions to shared controls', async () => {
  const detail = await readFile(new URL('../pages/hub/venues/[id].js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/components/poker-near-me/VenueContributions.jsx', import.meta.url), 'utf8');
  assert.match(detail, /permissions\?\.can_edit_games === true/);
  assert.match(detail, /<VenueScheduleEditor venueId=\{id\} schedule=\{gameSchedule\}/);
  assert.match(detail, /fetch\('\/api\/poker\/venue-schedules\?venue_id=' \+ id \+ '&refresh=1', \{ cache: 'no-store' \}\)/);
  assert.match(detail, /onChanged=\{fetchGameSchedule\}/);
  assert.match(ui, /label="Game"><input[^>]*minLength=\{2\} maxLength=\{120\}/);
  assert.match(detail, /<VenueContributions key=\{id\}/);
  assert.doesNotMatch(detail, /handleClaimSubmit|role: 'Manager'|fetchClaimStatus|handleDeleteScheduleEntry/);
  assert.match(ui, /Authorization: `Bearer \$\{token\}`/);
  assert.match(ui, /expected_revision: revision/);
  assert.match(ui, /value="owner"/);
  assert.match(ui, /No Verification Email Or Text Is Sent/);
  assert.match(ui, /expected_updated_at: entry.updated_at/);
  assert.match(ui, /safeSource\(entry.source_url \|\| form.source_url\)/);
  assert.match(detail, /Schedule Refresh Unavailable/);
  assert.match(detail, /!showScheduleEditor && !scheduleReadError/);
});

test('actual venue claim form sends lowercase authenticated sourced payload and displays only own status', async () => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.sessionStorage = storage();
  const ui = await loadUi({ getAuthUser: () => ({ id: ACTOR }), getSessionToken: () => 'isolated-token' });
  const calls = []; const accesses = [];
  let submitted = false; let tree;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') {
      submitted = true;
      return response({ success: true, operation_id: JSON.parse(options.body).operation_id, status: 'under_review', claim: { id: OPERATION } });
    }
    return response({ success: true, access: { venue_id: 12, revision: '2026-10-11T00:00:00Z', is_claimed: true, claim: submitted ? { id: OPERATION, status: 'under_review' } : null, permissions: { can_edit_games: false }, corrections: [] } });
  };
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(ui.default, { venue: { id: 12, name: 'Owned Fixture' }, onAccessChange: (access) => accesses.push(access) })); });
    const claimButton = tree.root.findAllByType('button').find((button) => button.props.children === 'Claim This Venue');
    await renderer.act(async () => claimButton.props.onClick());
    for (const [type, maxLength, value] of [['text', 120, 'Fixture Manager'], ['email', 254, 'fixture@example.invalid'], ['url', 1000, 'https://example.invalid/venue']]) {
      const input = tree.root.findAllByType('input').find((item) => item.props.type === type && item.props.maxLength === maxLength);
      await renderer.act(async () => input.props.onChange({ target: { value } }));
    }
    await renderer.act(async () => tree.root.findByType('textarea').props.onChange({ target: { value: 'Independent association evidence' } }));
    await renderer.act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    const write = calls.find((call) => call.options.method === 'POST');
    const body = JSON.parse(write.options.body);
    assert.equal(body.payload.role, 'manager');
    assert.equal(body.payload.source_url, 'https://example.invalid/venue');
    assert.equal(body.venue_id, 12);
    assert.equal(write.options.headers.Authorization, 'Bearer isolated-token');
    assert.equal(accesses.at(-1).claim.status, 'under_review');
    assert.equal(accesses.at(-1).permissions.can_edit_games, false);
    assert.equal(tree.root.findAllByType('form').length, 0);
    assert.equal(globalThis.sessionStorage.data.size, 0);
  } finally { await renderer.act(async () => tree?.unmount()); Object.assign(globalThis, previous); }
});

test('staff review is reachable, uses current claim columns and preserves sourced revision decisions', async () => {
  const source = await readFile(new URL('../pages/admin/venue-contributions.js', import.meta.url), 'utf8');
  const integrity = await readFile(new URL('../pages/admin/venue-integrity.js', import.meta.url), 'utf8');
  assert.match(integrity, /href="\/admin\/venue-contributions"/);
  for (const field of ['claimant_name', 'claimant_title', 'claimant_email', 'claimant_phone', 'submitted_source_url']) assert.ok(source.includes(field));
  assert.match(source, /expected_updated_at: selected.updated_at/);
  assert.match(source, /minLength=\{12\}/);
  assert.match(source, /venue_id=\$\{venueFilter\}/);
  assert.match(source, /credentials: 'include'/);
});

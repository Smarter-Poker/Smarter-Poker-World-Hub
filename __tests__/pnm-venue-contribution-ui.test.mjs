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
    await renderer.act(async () => writer.clearRefusal());
    assert.match(writer.error, /not confirmed/, 'unknown feedback cannot be discarded');
    assert.equal(writer.pending.body.operation_id, writes[0].operation_id);
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

test('actual claim refusal is visible and cancel/reopen starts clean', async () => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.sessionStorage = storage();
  const ui = await loadUi({ getAuthUser: () => ({ id: ACTOR }), getSessionToken: () => 'isolated-token' });
  globalThis.fetch = async (url, options) => options.method === 'POST'
    ? response({ success: false, error: 'Association evidence was refused' }, 403)
    : response({ success: true, access: { venue_id: 12, revision: '2026-10-11T00:00:00Z', claim: null, permissions: {}, corrections: [] } });
  let tree;
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(ui.default, { venue: { id: 12 } })); });
    const click = async (label) => renderer.act(async () => tree.root.findAllByType('button').find((button) => button.props.children === label).props.onClick());
    await click('Claim This Venue');
    await renderer.act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(tree.root.findByProps({ role: 'alert' }).props.children, 'Association evidence was refused');
    await click('Cancel');
    assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0);
    await click('Claim This Venue');
    assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.equal(tree.root.findAllByType('form').length, 1);
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

test('committed hook receipts remain terminal when refreshing the consumer fails', async () => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.sessionStorage = storage();
  const ui = await loadUi({ getAuthUser: () => ({ id: ACTOR }), getSessionToken: () => 'isolated-token' });
  let writer; let writes = 0; let tree;
  globalThis.fetch = async (_, options) => {
    writes++;
    return response({ success: true, operation_id: JSON.parse(options.body).operation_id, status: 'under_review' });
  };
  function Fixture() { writer = ui.useContributionWrite('venue:12', () => { throw new Error('refresh unavailable'); }); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    await renderer.act(async () => writer.submit('/api/poker/venue-contributions', { venue_id: 12, kind: 'claim' }));
    assert.equal(writes, 1);
    assert.equal(writer.pending, null);
    assert.equal(writer.retryable, false);
    assert.match(writer.notice, /was recorded/);
    assert.match(writer.error, /recorded.*could not be refreshed/);
    assert.equal(globalThis.sessionStorage.data.size, 0);
  } finally { await renderer.act(async () => tree?.unmount()); Object.assign(globalThis, previous); }
});

test('retry refusal clears only a terminal original request; account-switched status results stay isolated', async () => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const listeners = new Map();
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  globalThis.sessionStorage = storage();
  let actor = ACTOR;
  const ui = await loadUi({ getAuthUser: () => ({ id: actor }), getSessionToken: () => `isolated-${actor}` });
  let writer; let writes = 0; let deferredRead; let tree;
  globalThis.fetch = async (_, options) => {
    if (options.method === 'POST') {
      writes++;
      if (writes === 1 || writes === 3) throw new Error('ack unavailable');
      return response({ success: false, error: 'Stale revision refused' }, 409);
    }
    if (writes === 3) return new Promise((resolve) => { deferredRead = resolve; });
    return response({ success: true, operation: null });
  };
  function Fixture() { writer = ui.useContributionWrite('venue:12'); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    await renderer.act(async () => writer.submit('/api/poker/venue-contributions', { venue_id: 12, kind: 'claim' }));
    const original = writer.pending.body.operation_id;
    await renderer.act(async () => writer.check());
    assert.equal(writer.retryable, true);
    await renderer.act(async () => writer.retryOriginal());
    assert.equal(writer.pending, null);
    assert.equal(writer.retryable, false);
    assert.equal(writer.error, 'Stale revision refused');
    assert.equal(globalThis.sessionStorage.data.size, 0);
    await renderer.act(async () => writer.submit('/api/poker/venue-contributions', { venue_id: 12, kind: 'claim' }));
    const unknown = writer.pending;
    assert.notEqual(unknown.body.operation_id, original);
    const checking = writer.check();
    await renderer.act(async () => { actor = '33333333-3333-4333-8333-333333333333'; listeners.get('storage')({ key: 'smarter-poker-auth' }); });
    await renderer.act(async () => { deferredRead(response({ success: true, operation: null })); await checking; });
    assert.equal(writer.pending, null);
    assert.equal(writer.retryable, false);
    assert.equal(writer.error, '');
    assert.deepEqual(loadPendingContribution(globalThis.sessionStorage, contributionPendingKey(ACTOR, 'venue:12')), unknown);
    assert.equal(writes, 3);
  } finally { await renderer.act(async () => tree?.unmount()); Object.assign(globalThis, previous); }
});

test('actual schedule edit round-trips stored zero seconds as strict API minute values', async () => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.sessionStorage = storage();
  const ui = await loadUi({ getAuthUser: () => ({ id: ACTOR }), getSessionToken: () => 'isolated-token' });
  const entry = { id: OPERATION, day_of_week: 'monday', game_name: 'NLH 1/2', start_time: '19:00:00', end_time: '02:00:00.000', source_url: 'https://example.invalid/schedule', updated_at: '2026-10-11T00:00:00Z' };
  let submitted; let tree; let changed = 0;
  globalThis.fetch = async (_, options) => { submitted = JSON.parse(options.body); return response({ success: true, operation_id: submitted.operation_id, status: 'updated' }); };
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(ui.VenueScheduleEditor, { venueId: 12, schedule: { monday: [entry] }, onChanged: () => { changed++; } })); });
    await renderer.act(async () => tree.root.findAllByType('button').find((button) => button.props.children === 'Edit Entry').props.onClick());
    assert.deepEqual(tree.root.findAllByType('input').filter((input) => input.props.type === 'time').map((input) => input.props.value), ['19:00', '02:00']);
    await renderer.act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(submitted.start_time, '19:00');
    assert.equal(submitted.end_time, '02:00');
    assert.equal(submitted.expected_updated_at, entry.updated_at);
    assert.equal(changed, 1);
    await renderer.act(async () => { tree.update(React.createElement(ui.VenueScheduleEditor, { venueId: 12, schedule: { monday: [{ ...entry, start_time: '19:00:31' }] }, onChanged() {} })); });
    await renderer.act(async () => tree.root.findAllByType('button').find((button) => button.props.children === 'Edit Entry').props.onClick());
    assert.equal(tree.root.findAllByType('input').find((input) => input.props.type === 'time').props.value, '19:00:31', 'nonzero legacy seconds must never be silently truncated');
  } finally { await renderer.act(async () => tree?.unmount()); Object.assign(globalThis, previous); }
});

test('an account switch during a receipt read cannot enable retry for the new account', async () => {
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  let listener; let actor = ACTOR; let writer; let tree; let resolveRead;
  globalThis.window = { addEventListener: (_, fn) => { listener = fn; }, removeEventListener() {} };
  globalThis.sessionStorage = storage();
  const pending = { account_id: ACTOR, context: 'venue:12', url: '/api/poker/venue-contributions', body: { operation_id: OPERATION } };
  savePendingContribution(globalThis.sessionStorage, contributionPendingKey(ACTOR, 'venue:12'), pending);
  const ui = await loadUi({ getAuthUser: () => ({ id: actor }), getSessionToken: () => 'isolated-token' });
  globalThis.fetch = () => new Promise((resolve) => { resolveRead = resolve; });
  function Fixture() { writer = ui.useContributionWrite('venue:12'); return null; }
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Fixture)); });
    const checking = writer.check();
    await renderer.act(async () => { actor = '33333333-3333-4333-8333-333333333333'; listener({ key: 'smarter-poker-auth' }); });
    await renderer.act(async () => { resolveRead(response({ success: true, operation: null })); await checking; });
    assert.equal(writer.pending, null);
    assert.equal(writer.retryable, false);
    assert.equal(writer.error, '');
    assert.deepEqual(loadPendingContribution(globalThis.sessionStorage, contributionPendingKey(ACTOR, 'venue:12')), pending);
  } finally { await renderer.act(async () => tree?.unmount()); Object.assign(globalThis, previous); }
});

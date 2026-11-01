import test from 'node:test';
// Required CHECK 8 already invokes this suite; register its transactional storage cases here.
import './horses-tournament-intent-storage.test.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { IDBFactory } from 'fake-indexeddb';
import { cancellationIntent } from '../src/components/horses/tournamentCancellationIntent.mjs';
const databases = new WeakMap();
const pendingIntents = [];
let readGate = null;
const trackedIntent = (...args) => { const promise = readGate && args[1] === 'read' ? readGate.then(() => cancellationIntent(...args)) : cancellationIntent(...args); pendingIntents.push(promise.catch(() => {})); return promise; };
const require = createRequire(import.meta.url);
const React = require('react');
const { create, act } = require('react-test-renderer');
const { transformSync } = require('@babel/core');
const sourcePath = 'src/components/horses/TournamentCancellationControls.jsx';
const source = process.env.STABLE_ADMIN_RECOVERY_BASELINE ? execFileSync('git', ['show', `HEAD:${sourcePath}`], { encoding: 'utf8' }) : fs.readFileSync(new URL(`../${sourcePath}`, import.meta.url), 'utf8');
const compiled = transformSync(source, { filename: sourcePath, babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
const compiledModule = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(name => name === 'react' ? React : name === './engineControlScope' ? { engineControlScope: (fetch, domain) => ({ storageKey: domain, options: { expectedOperatorId: fetch.actor }, isCurrent: () => true, assertCurrent() {} }) } : name === './tournamentCancellationIntent.mjs' ? { cancellationIntent: trackedIntent } : name.endsWith('.css') ? {} : require(name), compiledModule, compiledModule.exports);
const Controls = compiledModule.exports.default;
const actor = '11111111-1111-4111-8111-111111111111', eventId = '22222222-2222-4222-8222-222222222222', opId = '33333333-3333-4333-8333-333333333333';
const intent = { action: 'cancel_refund', tournamentId: eventId, opId, reason: 'Recorded operator review' };
const key = `stable-tournament-cancel:${actor}:${eventId}`;
const lockTails = new Map();
const locks = { request(name, options, callback) {
 assert.equal(options.mode, 'exclusive');
 const result = (lockTails.get(name) || Promise.resolve()).then(callback);
 lockTails.set(name, result.catch(() => {}));
 return result;
} };
async function mounted({ stored = JSON.stringify(intent), writable = true, outcome = { state: 'pending', op_id: opId, tournament_id: eventId }, failure, postFailure, postOutcome, onPost, sharedValues, lockManager = locks, pauseRead = false } = {}) {
 let releaseRead;
 if (pauseRead) readGate = new Promise(resolve => { releaseRead = resolve; });
 const values = sharedValues || new Map(stored === null ? [] : [[key, stored]]), calls = [];
 if (!databases.has(values)) databases.set(values, new IDBFactory());
 globalThis.indexedDB = databases.get(values);
 Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: lockManager } });
 globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
 const authFetch = async (url, options = {}) => { calls.push({ url, options }); if (options.method === 'POST') { await onPost?.(values, options); if (postFailure) throw postFailure; return { actorId: actor, operation: postOutcome || { pending: true, op_id: JSON.parse(options.body).opId, tournament_id: eventId } }; } if (url.includes('tournamentId=')) return { actorId: actor, writable, eligible: true }; if (failure) throw failure; return { actorId: actor, operation: await outcome }; }; authFetch.actor = actor;
 let view; await act(async () => { view = create(React.createElement(Controls, { authFetch, event: { id: eventId } })); });
 if (!pauseRead) await act(async () => { await Promise.all(pendingIntents.splice(0)); });
 const button = label => view.root.findAllByType('button').find(b => b.children.join('') === label);
 const click = async label => { const b = button(label); assert.ok(b, `missing ${label}`); assert.equal(b.props.disabled, false, `${label} disabled`); await act(async () => { await b.props.onClick(); }); };
 return { view, values, calls, button, click, releaseRead: async () => { const release = releaseRead; readGate = null; await act(async () => { release(); await Promise.all(pendingIntents.splice(0)); }); }, close: async () => act(async () => view.unmount()) };
}
test('retained completed outcome can be read after write permission is revoked without POST', async () => {
 const m = await mounted({ writable: false, outcome: { state: 'completed', op_id: opId, tournament_id: eventId, result: { receipt: { fully_settled: true, tournament_id: eventId } } } });
 try { await m.click('Read Outcome'); assert.equal(await cancellationIntent(key, 'read', null, () => true), null); assert.equal(m.values.get(key), JSON.stringify(intent)); assert.equal(m.calls.some(c => c.options.method === 'POST'), false); } finally { await m.close(); }
});
test('retained pending outcome can be read but cannot retry without write permission', async () => {
 const m = await mounted({ writable: false }); try { await m.click('Read Outcome'); assert.equal(m.values.get(key), JSON.stringify(intent)); assert.equal(m.button('Retry Same Operation').props.disabled, true); assert.equal(m.calls.some(c => c.options.method === 'POST'), false); } finally { await m.close(); }
});
for (const status of [400,403]) test(`GET ${status} preserves unknown identity and disables retry`, async () => {
 const m = await mounted({ failure: Object.assign(new Error('Read Refused'), { status }) }); try { const label = m.button('Read Outcome') ? 'Read Outcome' : 'Read Outcome And Retry Same Operation'; await m.click(label); assert.equal(m.values.get(key), JSON.stringify(intent)); assert.equal(m.calls.some(c => c.options.method === 'POST'), false); } finally { await m.close(); }
});
for (const stored of ['{broken', JSON.stringify({ ...intent, opId: 'invalid' })]) test(`invalid durable storage blocks new dispatch and preserves bytes ${stored.slice(0,10)}`, async () => {
 const m = await mounted({ stored }); try { const input = m.view.root.findByType('input'); await act(async () => input.props.onChange({ target: { value: intent.reason } })); const b = m.button('Cancel And Refund This Event'); assert.equal(b.props.disabled, true); assert.equal(m.values.get(key), stored); assert.equal(m.calls.some(c => c.options.method === 'POST'), false); } finally { await m.close(); }
});
test('read pending then explicit retry reuses the original identity and persists before dispatch', async () => {
 const m = await mounted(); try { assert.equal(m.button('Retry Same Operation').props.disabled, true); await m.click('Read Outcome'); await m.click('Retry Same Operation'); const post = m.calls.find(c => c.options.method === 'POST'); assert.deepEqual(JSON.parse(post.options.body), intent); assert.equal(m.values.get(key), JSON.stringify(intent)); } finally { await m.close(); }
});

test('fresh dispatch persists identity before POST and retains pending approval', async () => {
 let submitted;
 const m = await mounted({ stored: null, onPost: async (values, options) => { submitted = JSON.parse(options.body); assert.deepEqual(await cancellationIntent(key, 'read', null, () => true), submitted); } });
 try { await act(async () => m.view.root.findByType('input').props.onChange({ target: { value: intent.reason } })); await m.click('Cancel And Refund This Event'); assert.equal(submitted.tournamentId, eventId); assert.equal((await cancellationIntent(key, 'read', null, () => true)).opId, submitted.opId); assert.equal(m.button('Retry Same Operation').props.disabled, true); } finally { await m.close(); }
});
for (const status of [400,403,503]) test(`POST ${status} preserves retained identity for outcome recovery`, async () => {
 const m = await mounted({ postFailure: Object.assign(new Error('Write Outcome Unknown'), { status }) });
 try { await m.click('Read Outcome'); await m.click('Retry Same Operation'); assert.equal(m.values.get(key), JSON.stringify(intent)); assert.equal(m.button('Retry Same Operation').props.disabled, true); assert.equal(m.button('Read Outcome').props.disabled, false); } finally { await m.close(); }
});

for (const replacement of [
 { ...intent, opId: '44444444-4444-4444-8444-444444444444' },
 { ...intent, reason: 'A changed payload with the same operation ID' },
]) test(`late completed read preserves a different durable request: ${replacement.opId === opId ? 'payload' : 'identity'}`, async () => {
 let resolve;
 const outcome = new Promise(r => { resolve = r; });
 const m = await mounted({ outcome });
 try {
  let pending;
  await act(async () => { pending = m.button('Read Outcome').props.onClick(); });
  const newer = JSON.stringify(replacement);
  m.values.set(key, newer);
  await act(async () => {
   resolve({ state: 'completed', op_id: opId, tournament_id: eventId, result: { receipt: { fully_settled: true, tournament_id: eventId } } });
   await pending;
  });
  assert.equal(m.values.get(key), newer);
  assert.equal(m.calls.some(c => c.options.method === 'POST'), false);
 } finally { await m.close(); }
});
for (const terminal of ['completed', 'refused']) test(`old ${terminal} POST preserves a newer durable request`, async () => {
 const newer = JSON.stringify({ ...intent, opId: '44444444-4444-4444-8444-444444444444' });
 const m = await mounted({
  onPost: values => values.set(key, newer),
  postOutcome: { state: 'completed', op_id: opId, tournament_id: eventId, receipt: { fully_settled: true, tournament_id: eventId } },
  postFailure: terminal === 'refused' ? Object.assign(new Error('Event Already Started'), { code: 'cancel_ineligible' }) : undefined,
 });
 try {
  await m.click('Read Outcome');
  await m.click('Retry Same Operation');
  assert.equal(m.values.get(key), newer);
  assert.equal(m.calls.filter(c => c.options.method === 'POST').length, 1);
 } finally { await m.close(); }
});

test('a stale fresh mounted view cannot overwrite another mounted view request', async () => {
 const sharedValues = new Map();
 const a = await mounted({ sharedValues, stored: null });
 const b = await mounted({ sharedValues, stored: null });
 try {
  for (const m of [a, b]) await act(async () => m.view.root.findByType('input').props.onChange({ target: { value: intent.reason } }));
  await b.click('Cancel And Refund This Event');
  const retained = await cancellationIntent(key, 'read', null, () => true);
  await a.click('Cancel And Refund This Event');
  assert.deepEqual(await cancellationIntent(key, 'read', null, () => true), retained);
  assert.equal(a.calls.some(c => c.options.method === 'POST'), false);
  assert.equal(b.calls.filter(c => c.options.method === 'POST').length, 1);
 } finally { await a.close(); await b.close(); }
});
test('an old retry cannot overwrite another durable request before dispatch', async () => {
 const m = await mounted();
 try {
  await m.click('Read Outcome');
  const newer = JSON.stringify({ ...intent, opId: '44444444-4444-4444-8444-444444444444' });
  m.values.set(key, newer);
  await m.click('Retry Same Operation');
  assert.equal(m.values.get(key), newer);
  assert.equal(m.calls.some(c => c.options.method === 'POST'), false);
 } finally { await m.close(); }
});
test('unavailable transactional storage refuses dispatch while preserving the original intent', async () => {
 const m = await mounted({ lockManager: null });
 try {
  await m.click('Read Outcome');
  globalThis.indexedDB = undefined;
  await m.click('Retry Same Operation');
  assert.equal(m.values.get(key), JSON.stringify(intent));
  assert.equal(m.calls.some(c => c.options.method === 'POST'), false);
 } finally { await m.close(); }
});
test('failed transactional storage refuses a fresh financial dispatch', async () => {
 const m = await mounted({ stored: null });
 try {
  await act(async () => m.view.root.findByType('input').props.onChange({ target: { value: intent.reason } }));
  globalThis.indexedDB = undefined;
  await m.click('Cancel And Refund This Event');
  assert.equal(m.calls.some(c => c.options.method === 'POST'), false);
  assert.equal(m.values.has(key), false);
 } finally { await m.close(); }
});

test('initial authoritative storage read keeps dispatch disabled until its transaction resolves', async () => {
 const m = await mounted({ stored: null, pauseRead: true });
 try {
  await act(async () => m.view.root.findByType('input').props.onChange({ target: { value: intent.reason } }));
  assert.equal(m.button('Cancel And Refund This Event').props.disabled, true);
  assert.equal(m.calls.length, 0);
  await m.releaseRead();
  assert.equal(m.button('Cancel And Refund This Event').props.disabled, false);
  await m.click('Cancel And Refund This Event');
  assert.equal(m.calls.filter(c => c.options.method === 'POST').length, 1);
 } finally { await m.close(); }
});

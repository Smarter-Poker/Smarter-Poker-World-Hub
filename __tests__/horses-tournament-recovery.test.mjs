import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const React = require('react');
const { create, act } = require('react-test-renderer');
const { transformSync } = require('@babel/core');
const sourcePath = 'src/components/horses/TournamentCancellationControls.jsx';
const source = process.env.STABLE_ADMIN_RECOVERY_BASELINE ? execFileSync('git', ['show', `HEAD:${sourcePath}`], { encoding: 'utf8' }) : fs.readFileSync(new URL(`../${sourcePath}`, import.meta.url), 'utf8');
const compiled = transformSync(source, { filename: sourcePath, babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
const compiledModule = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(name => name === 'react' ? React : name === './engineControlScope' ? { engineControlScope: (fetch, domain) => ({ storageKey: domain, options: { expectedOperatorId: fetch.actor }, isCurrent: () => true, assertCurrent() {} }) } : name.endsWith('.css') ? {} : require(name), compiledModule, compiledModule.exports);
const Controls = compiledModule.exports.default;
const actor = '11111111-1111-4111-8111-111111111111', eventId = '22222222-2222-4222-8222-222222222222', opId = '33333333-3333-4333-8333-333333333333';
const intent = { action: 'cancel_refund', tournamentId: eventId, opId, reason: 'Recorded operator review' };
const key = `stable-tournament-cancel:${actor}:${eventId}`;
async function mounted({ stored = JSON.stringify(intent), writable = true, outcome = { state: 'pending', op_id: opId, tournament_id: eventId }, failure, postFailure, onPost } = {}) {
 const values = new Map(stored === null ? [] : [[key, stored]]), calls = [];
 globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
 const authFetch = async (url, options = {}) => { calls.push({ url, options }); if (options.method === 'POST') { onPost?.(values, options); if (postFailure) throw postFailure; return { actorId: actor, operation: { pending: true, op_id: JSON.parse(options.body).opId, tournament_id: eventId } }; } if (url.includes('tournamentId=')) return { actorId: actor, writable, eligible: true }; if (failure) throw failure; return { actorId: actor, operation: outcome }; }; authFetch.actor = actor;
 let view; await act(async () => { view = create(React.createElement(Controls, { authFetch, event: { id: eventId } })); });
 const button = label => view.root.findAllByType('button').find(b => b.children.join('') === label);
 const click = async label => { const b = button(label); assert.ok(b, `missing ${label}`); assert.equal(b.props.disabled, false, `${label} disabled`); await act(async () => { await b.props.onClick(); }); };
 return { view, values, calls, button, click, close: async () => act(async () => view.unmount()) };
}
test('retained completed outcome can be read after write permission is revoked without POST', async () => {
 const m = await mounted({ writable: false, outcome: { state: 'completed', op_id: opId, tournament_id: eventId, result: { receipt: { fully_settled: true, tournament_id: eventId } } } });
 try { await m.click('Read Outcome'); assert.equal(m.values.has(key), false); assert.equal(m.calls.some(c => c.options.method === 'POST'), false); } finally { await m.close(); }
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
 const m = await mounted({ stored: null, onPost: (values, options) => { submitted = JSON.parse(options.body); assert.deepEqual(JSON.parse(values.get(key)), submitted); } });
 try { await act(async () => m.view.root.findByType('input').props.onChange({ target: { value: intent.reason } })); await m.click('Cancel And Refund This Event'); assert.equal(submitted.tournamentId, eventId); assert.equal(JSON.parse(m.values.get(key)).opId, submitted.opId); assert.equal(m.button('Retry Same Operation').props.disabled, true); } finally { await m.close(); }
});
for (const status of [400,403,503]) test(`POST ${status} preserves retained identity for outcome recovery`, async () => {
 const m = await mounted({ postFailure: Object.assign(new Error('Write Outcome Unknown'), { status }) });
 try { await m.click('Read Outcome'); await m.click('Retry Same Operation'); assert.equal(m.values.get(key), JSON.stringify(intent)); assert.equal(m.button('Retry Same Operation').props.disabled, true); assert.equal(m.button('Read Outcome').props.disabled, false); } finally { await m.close(); }
});

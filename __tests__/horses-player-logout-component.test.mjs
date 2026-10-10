import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as recovery from '../src/components/horses/playerLogoutRecovery.js';
import * as builder from '../src/components/horses/playerAdmin.js';
import { engineControlScope } from '../src/components/horses/engineControlScope.js';
const require = createRequire(import.meta.url), React = require('react');
const { act, create } = require('react-test-renderer');
const source = fs.readFileSync(new URL('../src/components/horses/PlayerLogoutControls.jsx', import.meta.url), 'utf8');
const compiled = require('@babel/core').transformSync(source, { filename: 'PlayerLogoutControls.jsx', babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(name => name === 'react' ? React : name === './playerLogoutRecovery' ? recovery : name === './playerAdmin' ? builder : name === './engineControlScope' ? { engineControlScope } : name.endsWith('.css') ? {} : require(name), module, module.exports);
const Controls = module.exports.default;
const actor = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222';
const intent = { actorId: actor, userId: user, opId: 'original-logout', note: 'Authorized existing sessions' };
async function mount({ stored = JSON.stringify(intent), writable = false, operation = null, failure } = {}) {
  const key = recovery.logoutIntentKey(actor, user), values = new Map(stored === null ? [] : [[key, stored]]), calls = [];
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  const authFetch = async (url, options = {}) => { calls.push({ url, options }); if (failure) throw failure; if (options.method === 'POST') return { ok: true, opId: JSON.parse(options.body).opId, enforced: true }; return { actorId: actor, writable, operation }; };
  authFetch.captureScope = () => ({ operatorId: actor, isCurrent: () => true });
  let view; await act(async () => { view = create(React.createElement(Controls, { authFetch, userId: user, enforced: false, canModerate: writable })); });
  const button = name => view.root.findAllByType('button').find(b => b.children.join('') === name);
  const click = async name => { assert.equal(button(name)?.props.disabled, false); await act(async () => { await button(name).props.onClick(); }); };
  return { view, calls, key, values, button, click, close: () => act(async () => view.unmount()) };
}
test('revoked write permission still recovers a completed logout without POST', async () => {
  const m = await mount({ operation: { op_id: intent.opId, action: 'force_logout', payload: { userId: user, reason: intent.note }, result: { ok: true, opId: intent.opId, enforced: false } } });
  try { await m.click('Read Logout Receipt'); assert.equal(m.values.has(m.key), false); assert.equal(m.calls.length, 1); assert.equal(m.calls[0].options.method, undefined); } finally { await m.close(); }
});
test('an absent receipt under revoked write permission retains identity and cannot retry', async () => {
  const m = await mount(); try { await m.click('Read Logout Receipt'); assert.equal(m.button('Retry Same Logout').props.disabled, true); assert.equal(m.values.get(m.key), JSON.stringify(intent)); assert.equal(m.calls.length, 1); } finally { await m.close(); }
});
test('a retained decision requires explicit read then retry with the original operation', async () => {
  const m = await mount({ writable: true }); try { assert.equal(m.button('Retry Same Logout').props.disabled, true); await m.click('Read Logout Receipt'); assert.equal(m.calls.length, 1); await m.click('Retry Same Logout'); const post = m.calls.find(c => c.options.method === 'POST'); assert.equal(JSON.parse(post.options.body).opId, intent.opId); assert.equal(m.values.has(m.key), false); } finally { await m.close(); }
});
for (const stored of ['null', 'false', '{broken']) test(`malformed durable bytes block new decisions (${stored})`, async () => {
  const m = await mount({ stored, writable: true }); try { assert.equal(m.button('End Existing Sessions').props.disabled, true); assert.equal(m.values.get(m.key), stored); assert.equal(m.calls.length, 0); } finally { await m.close(); }
});
for (const status of [403,503]) test(`unknown/refused reads preserve identity (${status})`, async () => {
  const m = await mount({ writable: true, failure: Object.assign(new Error('unavailable'), { status }) }); try { await m.click('Read Logout Receipt'); assert.equal(m.button('Retry Same Logout').props.disabled, true); assert.equal(m.values.get(m.key), JSON.stringify(intent)); } finally { await m.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { engineControlScope } from '../src/components/horses/engineControlScope.js';

const require = createRequire(import.meta.url), React = require('react');
const { act, create } = require('react-test-renderer');
const source = fs.readFileSync(new URL('../src/components/horses/EmergencyStopControls.jsx', import.meta.url), 'utf8');
const compiled = require('@babel/core').transformSync(source, { filename: 'EmergencyStopControls.jsx', babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(name => name === 'react' ? React : name === './engineControlScope' ? { engineControlScope } : name.endsWith('.css') ? {} : require(name), module, module.exports);
const Controls = module.exports.default;
const actor = '11111111-1111-4111-8111-111111111111';
const intent = { path: 'positive_issuance', stopped: true, expectedVersion: 7, reason: 'Original issuance safety decision', opId: '22222222-2222-4222-8222-222222222222' };
const key = `stable-emergency-stop:${actor}`;

async function mount({ outcome = { actorId: actor, operation: null }, readFailure, postFailure } = {}) {
  const values = new Map([[key, JSON.stringify(intent)]]), calls = [];
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  const authFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST') {
      if (postFailure) throw postFailure;
      return { actorId: actor, operation: { ok: true, op_id: intent.opId } };
    }
    if (url.includes('?opId=')) { if (readFailure) throw readFailure; return outcome; }
    return { actorId: actor, stops: [{ path: intent.path, label: 'Positive Issuance', stopped: false, version: 8, writable: true }] };
  };
  authFetch.captureScope = () => ({ operatorId: actor, isCurrent: () => true });
  let view;
  await act(async () => { view = create(React.createElement(Controls, { authFetch })); });
  const button = label => view.root.findAllByType('button').find(b => b.children.join('') === label);
  const recover = async () => { const b = button('Read Receipt And Retry Same Operation'); assert.equal(b.props.disabled, false); await act(async () => { await b.props.onClick(); }); };
  return { values, calls, button, recover, close: async () => { await act(async () => view.unmount()); globalThis.localStorage = originalStorage; } };
}

for (const status of [400, 403, 503]) test(`refused/unknown outcome read ${status} preserves the original stop identity without POST`, async () => {
  const m = await mount({ readFailure: Object.assign(new Error('Receipt unavailable'), { status }) });
  try {
    await m.recover();
    assert.equal(m.values.get(key), JSON.stringify(intent));
    assert.equal(m.calls.filter(c => c.options.method === 'POST').length, 0);
    assert.ok(m.button('Read Receipt And Retry Same Operation'));
  } finally { await m.close(); }
});

for (const operation of [undefined, false, 0]) test(`malformed outcome ${String(operation)} never supplies absence authority`, async () => {
  const outcome = operation === undefined ? { actorId: actor } : { actorId: actor, operation };
  const m = await mount({ outcome });
  try { await m.recover(); assert.equal(m.calls.filter(c => c.options.method === 'POST').length, 0); assert.equal(m.values.get(key), JSON.stringify(intent)); }
  finally { await m.close(); }
});

test('an explicit absent receipt retries the exact original payload once', async () => {
  const m = await mount();
  try { await m.recover(); const posts = m.calls.filter(c => c.options.method === 'POST'); assert.equal(posts.length, 1); assert.deepEqual(JSON.parse(posts[0].options.body), intent); assert.equal(m.values.has(key), false); }
  finally { await m.close(); }
});

test('a completed receipt clears retained identity without another mutation', async () => {
  const m = await mount({ outcome: { actorId: actor, operation: { op_id: intent.opId, path: intent.path, stopped: intent.stopped, result: { ok: true } } } });
  try { await m.recover(); assert.equal(m.calls.filter(c => c.options.method === 'POST').length, 0); assert.equal(m.values.has(key), false); }
  finally { await m.close(); }
});

test('confirmed absence followed by atomic version conflict permits a new reviewed operation', async () => {
  const m = await mount({ postFailure: Object.assign(new Error('Version changed'), { code: 'stop_version_changed', status: 409 }) });
  try { await m.recover(); assert.equal(m.calls.filter(c => c.options.method === 'POST').length, 1); assert.equal(m.values.has(key), false); assert.equal(m.button('Apply Stop').props.disabled, false); }
  finally { await m.close(); }
});

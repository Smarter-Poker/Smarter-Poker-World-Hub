import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { create, act } from 'react-test-renderer';
import ts from 'typescript';
import { hasPermission, PERMISSIONS } from '../src/lib/horses/permissions.js';
import { engineControlScope } from '../src/components/horses/engineControlScope.js';
const source = readFileSync(new URL('../src/components/horses/EngineControlPanel.jsx', import.meta.url), 'utf8');
function harness(fetchImpl) {
  const match = source.match(/const refreshCapabilities = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[authFetch, domain, accountScope\]\);/);
  assert.ok(match, 'The owning component must expose an explicit bounded capability refresh');
  let current = true;
  const authFetch = Object.assign(fetchImpl, { captureScope: () => ({ operatorId: 'operator-a', isCurrent: () => current }) });
  const accountScope = engineControlScope(authFetch, 'floor');
  const state = { available: false, capabilityBusy: false };
  const sequence = { current: 0 }, alive = { current: true };
  const refresh = new Function('accountScope', 'authFetch', 'domain', 'engineControlScope', 'capabilitySequence', 'alive', 'setAvailable', 'setCapabilityBusy', 'ACTIONS', `return async () => {${match[1]}}`)(accountScope, authFetch, 'floor', engineControlScope, sequence, alive, v => { state.available = v; }, v => { state.capabilityBusy = v; }, { floor: [['pause']] });
  return { refresh, state, alive, switchAccount: () => { current = false; } };
}
test('initial capability outage recovers through the same component explicit refresh', async () => {
  let calls = 0;
  const h = harness(async () => { if (++calls === 1) throw Error('engine unavailable'); return { capabilities: { floor: ['pause'] } }; });
  await h.refresh(); assert.equal(h.state.available, false);
  await h.refresh(); assert.equal(h.state.available, true); assert.equal(h.state.capabilityBusy, false); assert.equal(calls, 2);
  assert.match(source, /onClick=\{refreshCapabilities\}/);
  assert.match(source, /Refresh Engine Contract/);
});
test('an old successful refresh cannot supersede a newer refusal', async () => {
  let calls = 0, finish;
  const h = harness(async () => { if (++calls === 1) return new Promise(r => { finish = r; }); throw Error('contract unavailable'); });
  const old = h.refresh(); await h.refresh(); finish({ capabilities: { floor: ['pause'] } }); await old;
  assert.equal(h.state.available, false); assert.equal(h.state.capabilityBusy, false);
});
test('refresh cannot apply capability results after account switch or unmount', async () => {
  for (const action of ['switchAccount', 'unmount']) {
    let finish;
    const h = harness(async () => new Promise(r => { finish = r; }));
    const pending = h.refresh(); if (action === 'switchAccount') h.switchAccount(); else h.alive.current = false;
    finish({ capabilities: { floor: ['pause'] } }); await pending; assert.equal(h.state.available, false);
  }
});
test('contract refresh does not create, clear or mutate the retained command identity', () => {
  const body = source.match(/const refreshCapabilities = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[authFetch, domain, accountScope\]\);/)?.[1];
  assert.ok(body); assert.doesNotMatch(body, /setOperationId|setUnknown|sessionStorage|method:\s*['"]POST/);
});

function renderedComponent() {
  const input = source.replace(/^import .*;\n/gm, '').replace('export default function', 'function');
  const compiled = ts.transpileModule(input, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function('React', 'useCallback', 'useEffect', 'useRef', 'useState', 'styles', 'hasPermission', 'PERMISSIONS', 'engineControlScope', `${compiled}\nreturn EngineControlPanel;`)(React, React.useCallback, React.useEffect, React.useRef, React.useState, {}, hasPermission, PERMISSIONS, engineControlScope);
}
test('rendered control recovers a failed contract without remounting or issuing a command', async () => {
  const previousWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  let view, calls = 0;
  const authFetch = Object.assign(async (url, options) => {
    assert.match(url, /capabilities=1/); assert.notEqual(options.method, 'POST');
    if (++calls === 1) throw Error('temporary owner outage');
    return { capabilities: { floor: ['pause'] } };
  }, { captureScope: () => ({ operatorId: 'operator-a', isCurrent: () => true }) });
  try {
    await act(async () => { view = create(React.createElement(renderedComponent(), { authFetch, domain: 'floor', permissions: ['clubs.write'] })); });
    const submit = () => view.root.findAllByType('button').find(button => button.props.type === 'submit');
    assert.equal(submit().props.disabled, true);
    await act(async () => { view.root.findByType('textarea').props.onChange({ target: { value: 'Reason for safe owner operation' } }); });
    await act(async () => { await view.root.findAllByType('button').find(button => button.children.includes('Refresh Engine Contract')).props.onClick(); });
    assert.equal(calls, 2); assert.equal(submit().props.disabled, false); assert.equal(storage.size, 0);
  } finally { if (view) act(() => view.unmount()); globalThis.window = previousWindow; }
});

for (const value of [{}, { command: false }, { command: null }, { command: null, absent: true, operationId: 'other' }, { command: { id: 'other', domain: 'floor', status: 'completed' } }]) test('malformed outcome cannot release the original engine operation', async () => {
  const prior = globalThis.window;
  const id = '11111111-1111-4111-8111-111111111111', key = 'stable-admin-engine-operation:operator-a:floor';
  const storage = new Map([[key, id]]);
  globalThis.window = { sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } };
  let view, posts = 0;
  const authFetch = Object.assign(async (url, options = {}) => { if (options.method === 'POST') posts++; return url.includes('capabilities=1') ? { capabilities: { floor: ['pause'] } } : value; }, { captureScope: () => ({ operatorId: 'operator-a', isCurrent: () => true }) });
  try {
    await act(async () => { view = create(React.createElement(renderedComponent(), { authFetch, domain: 'floor', permissions: ['clubs.write'] })); });
    await act(async () => { await view.root.findAllByType('button').find(b => b.children.includes('Read Durable Outcome')).props.onClick(); });
    assert.equal(view.root.findAllByType('button').find(b => b.children.includes('New Operation')).props.disabled, true);
    assert.equal(storage.get(key), id); assert.equal(posts, 0);
  } finally { if (view) await act(async () => view.unmount()); globalThis.window = prior; }
});

for (const absent of [true, false]) test('confirmed engine absence or matching terminal receipt permits an explicit new operation', async () => {
  const prior = globalThis.window;
  const id = '11111111-1111-4111-8111-111111111111', key = 'stable-admin-engine-operation:operator-a:floor';
  const storage = new Map([[key, id]]);
  globalThis.window = { sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } };
  let view, posts = 0;
  const value = absent ? { command: null, absent: true, operationId: id } : { command: { id, domain: 'floor', status: 'completed', action: 'pause' } };
  const authFetch = Object.assign(async (url, options = {}) => { if (options.method === 'POST') posts++; return url.includes('capabilities=1') ? { capabilities: { floor: ['pause'] } } : value; }, { captureScope: () => ({ operatorId: 'operator-a', isCurrent: () => true }) });
  try {
    await act(async () => { view = create(React.createElement(renderedComponent(), { authFetch, domain: 'floor', permissions: ['clubs.write'] })); });
    await act(async () => { await view.root.findAllByType('button').find(b => b.children.includes('Read Durable Outcome')).props.onClick(); });
    const next = view.root.findAllByType('button').find(b => b.children.includes('New Operation'));
    assert.equal(next.props.disabled, false); assert.equal(storage.get(key), id); assert.equal(posts, 0);
    await act(async () => next.props.onClick()); assert.equal(storage.has(key), false); assert.equal(posts, 0);
  } finally { if (view) await act(async () => view.unmount()); globalThis.window = prior; }
});

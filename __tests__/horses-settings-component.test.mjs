import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), React = require('react');
const { create, act } = require('react-test-renderer');
const path = 'src/components/horses/SettingsPanel.jsx';
const compiled = require('@babel/core').transformSync(process.env.STABLE_SETTINGS_BASELINE ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8'), { filename: path, babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
const module = { exports: {} };
const patchContext = () => {};
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(name => {
  if (name === 'react') return React;
  if (name.includes('horsesAdminTokens')) return { T: {}, when: String };
  if (name.includes('broadcastSync')) return { broadcastSync() {}, listenBroadcast: () => () => {}, BROADCAST_TAB_ID: 'test' };
  if (name.includes('stableAdminStore')) return { selectSocialSettings: 'settings', selectPatchOperatorContext: 'patch', useStableAdminStore: selector => selector === 'settings' ? null : patchContext };
  if (name.includes('operatorPermissions')) return { hasPermission: () => true };
  if (name.endsWith('.css')) return {};
  if (!name.startsWith('.')) return require(name);
  throw new Error(name);
}, module, module.exports);
test('actual Settings serializes edits so an older Running save cannot follow the latest Stop', async () => {
  const priorWindow = globalThis.window, priorEvent = globalThis.CustomEvent;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  globalThis.CustomEvent = class {};
  const writes = [], completions = []; let persisted = false;
  const fetch = async (_url, options = {}) => {
    if (!options.method) return _url.includes('read_post_modes') ? { modes: [] } : { settings: { engine_enabled: persisted } };
    const payload = JSON.parse(options.body).settings; writes.push(payload);
    return new Promise(resolve => completions.push(() => { persisted = payload.engine_enabled; resolve({ settings: payload }); }));
  };
  let view;
  const timers = new Map(); let id = 0;
  const priorSet = globalThis.setTimeout, priorClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, delay, ...args) => { if (delay !== 700) return priorSet(fn, delay, ...args); const key = `setting-${++id}`; timers.set(key, fn); return key; };
  globalThis.clearTimeout = key => timers.has(key) ? timers.delete(key) : priorClear(key);
  const tick = async () => { await act(async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }); };
  try {
    await act(async () => { view = create(React.createElement(module.exports.default, { authFetch: fetch, permissions: ['content.write'] })); });
    const toggle = () => view.root.findByProps({ id: 'setting-engine' });
    await act(async () => toggle().props.onChange({ target: { checked: true } })); await tick();
    await act(async () => toggle().props.onChange({ target: { checked: false } })); await tick();
    assert.equal(writes.length, 1, 'newer Stop must wait until original save settles');
    await act(async () => completions[0]());
    assert.equal(writes.length, 2); assert.equal(writes[1].engine_enabled, false);
    await act(async () => completions[1]());
    assert.equal(persisted, false); assert.equal(toggle().props.checked, false);
  } finally {
    if (view) await act(async () => view.unmount());
    globalThis.window = priorWindow; globalThis.CustomEvent = priorEvent;
    globalThis.setTimeout = priorSet; globalThis.clearTimeout = priorClear;
  }
});

async function mountedCase(fetch, run) {
  const original = { window: globalThis.window, CustomEvent: globalThis.CustomEvent, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const listeners = new Map(), timers = new Map(); let key = 0, view;
  globalThis.window = { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); }, dispatchEvent() {} };
  globalThis.CustomEvent = class {};
  globalThis.setTimeout = (fn, delay, ...args) => { if (delay !== 700) return original.setTimeout(fn, delay, ...args); const id = `focused-${++key}`; timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.has(id) ? timers.delete(id) : original.clearTimeout(id);
  try {
    await act(async () => { view = create(React.createElement(module.exports.default, { authFetch: fetch, permissions: ['content.write'] })); });
    await run({ view, event: async () => act(async () => listeners.get('horses-settings-updated')?.()), tick: async () => act(async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }) });
  } finally {
    if (view) await act(async () => view.unmount());
    Object.assign(globalThis, original);
  }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const textOf = view => JSON.stringify(view.toJSON());
test('editing during a pending background settings read releases Reload after save', async () => {
  const stale = deferred(); let reads = 0;
  await mountedCase(async (url, options = {}) => {
    if (options.method) return { settings: { engine_enabled: true } };
    if (url.includes('read_post_modes')) return { modes: [] };
    return ++reads === 1 ? { settings: { engine_enabled: false } } : stale.promise;
  }, async ({ view, event, tick }) => {
    await event();
    await act(async () => view.root.findByProps({ id: 'setting-engine' }).props.onChange({ target: { checked: true } }));
    await tick();
    await act(async () => stale.resolve({ settings: { engine_enabled: false } }));
    const reload = view.root.findAllByType('button').find(node => node.children.includes('Reload'));
    assert.equal(reload.props.disabled, false, 'invalidated background read must not leave Reload busy forever');
    assert.equal(view.root.findByProps({ id: 'setting-engine' }).props.checked, true);
  });
});
test('posting mode save fences an older pending mode read', async () => {
  const stale = deferred(); let modeReads = 0;
  await mountedCase(async (url, options = {}) => {
    if (options.method) return { modes: [{ mode: 'puzzle', enabled: true }] };
    if (url.includes('read_post_modes')) return ++modeReads === 1 ? { modes: [{ mode: 'puzzle', enabled: false }] } : stale.promise;
    return { settings: { engine_enabled: false } };
  }, async ({ view, event }) => {
    await event();
    const toggle = () => view.root.findByProps({ 'aria-label': 'Puzzle Posting Mode' });
    await act(async () => toggle().props.onChange({ target: { checked: true } }));
    await act(async () => stale.resolve({ modes: [{ mode: 'puzzle', enabled: false }] }));
    assert.equal(toggle().props.checked, true, 'older read must not reverse confirmed mode save');
  });
});
test('malformed successful settings save is an error and re-reads the saved row', async () => {
  let reads = 0;
  await mountedCase(async (url, options = {}) => {
    if (options.method) return { success: true };
    if (url.includes('read_post_modes')) return { modes: [] };
    reads++; return { settings: { engine_enabled: false } };
  }, async ({ view, tick }) => {
    await act(async () => view.root.findByProps({ id: 'setting-engine' }).props.onChange({ target: { checked: true } }));
    await tick();
    assert.ok(textOf(view).includes('Settings Not Saved:'), 'missing committed row is not a save receipt');
    assert.equal(reads, 2);
    assert.equal(view.root.findByProps({ id: 'setting-engine' }).props.checked, false);
    assert.ok(!textOf(view).includes('Saved At'));
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const { transformSync } = require('@babel/core');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const text = view => JSON.stringify(view.toJSON());
const emptyComponent = () => null;

function load(name, overrides = {}) {
  const filename = path.join(root, 'src/components/horses', name);
  const source = process.env.STABLE_CONSOLE_BASELINE
    ? execFileSync('git', ['show', `HEAD:src/components/horses/${name}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(filename, 'utf8');
  const code = transformSync(source, { filename, babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
  const module = { exports: {} };
  const mocks = {
    react: React,
    '../../lib/horsesAdminTokens': { T: {}, num: v => v ?? 'Unknown', when: v => v ?? 'Unknown' },
    '../../lib/broadcastSync': { listenBroadcast: () => () => {} },
    '../../stores/stableAdminStore': { selectNavigationBadges: x => x, useStableAdminStore: () => ({}) },
    './KpiTile': { __esModule: true, default: ({ label, value }) => React.createElement('div', null, label, ':', value) },
    './EconomyExport': { __esModule: true, default: emptyComponent },
    './useOperatorFetch': { OPERATOR_TIMEOUT_MS: 20000 },
    './DataTable': { __esModule: true, default: ({ rows, loading, empty }) => React.createElement('div', null, loading ? 'Loading Audit Log' : rows.length ? rows.map(r => r.action).join('|') : empty) },
    './Pager': { __esModule: true, default: emptyComponent },
    './Modal': { __esModule: true, default: ({ children }) => React.createElement('div', null, children) },
    './exportAllCsv': { __esModule: true, default: emptyComponent },
    ...overrides,
  };
  function dependency(n) {
    if (Object.hasOwn(mocks, n)) return mocks[n];
    if (n.endsWith('.css')) return {};
    if (n.startsWith('.')) {
      const file = path.resolve(path.dirname(filename), n.endsWith('.js') ? n : `${n}.js`);
      const value = { exports: {} };
      const compiled = transformSync(fs.readFileSync(file, 'utf8'), { filename: file, babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
      vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(dependency, value, value.exports);
      return value.exports;
    }
    return require(n);
  }
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(dependency, module, module.exports);
  return module.exports.default;
}
const Stats = load('StatsPanel.jsx');
const Economy = load('EconomyPanel.jsx');
const Audit = load('AuditPanel.jsx');
const browser = () => { const events = {}; const old = globalThis.window; globalThis.window = { addEventListener: (k, v) => { events[k] = v; }, removeEventListener: k => { delete events[k]; }, setTimeout: fn => { fn(); return 1; }, clearTimeout() {} }; return { events, restore: () => { globalThis.window = old; } }; };

test('Statistics ignores an older refresh after newer evidence arrives', async () => {
  const env = browser(); const first = [defer(), defer()], second = [defer(), defer()]; let calls = 0, view;
  try {
    await act(async () => { view = create(React.createElement(Stats, { authFetch: () => (calls++ < 2 ? first : second)[calls % 2 === 1 ? 0 : 1].promise })); });
    await act(async () => {
      const original = globalThis.setTimeout;
      try { globalThis.setTimeout = callback => { callback(); return 1; }; env.events['horses-updated'](); }
      finally { globalThis.setTimeout = original; }
    });
    await act(async () => { second[0].resolve({ platform: { liveTables: 222 } }); second[1].resolve({ data: {} }); });
    assert.match(text(view), /222/);
    await act(async () => { first[0].resolve({ platform: { liveTables: 111 } }); first[1].reject(Error('Old Analytics Failure')); });
    assert.match(text(view), /222/); assert.doesNotMatch(text(view), /111|Old Analytics Failure/);
  } finally { if (view) await act(async () => view.unmount()); env.restore(); }
});

test('Economy retains the selected section when an older section finishes late', async () => {
  const first = [defer(), defer()]; let calls = 0, view;
  try {
    await act(async () => { view = create(React.createElement(Economy, { authFetch: url => url.includes('economy-stats') ? Promise.resolve({ stats: { diamondPurchaseRevenueUsd: 4321 } }) : first[calls++].promise })); });
    await act(async () => view.root.findAllByType('button').find(b => b.children.join('') === 'Diamonds').props.onClick());
    assert.match(text(view), /4321|4,321/);
    await act(async () => { first[0].resolve({ data: { snapshot: { total: 111 } } }); first[1].resolve({ data: {} }); });
    assert.match(text(view), /4321|4,321/);
  } finally { if (view) await act(async () => view.unmount()); }
});

test('Audit failure clears rows belonging to a different filter and stays visibly failed', async () => {
  const env = browser(); let calls = 0, view;
  try {
    await act(async () => { view = create(React.createElement(Audit, { showNotification() {}, authFetch: async () => { if (calls++ === 0) return { rows: [{ id: 'old', action: 'unfiltered.old_record' }], total: 1 }; throw Error('Selected Target Unavailable'); } })); });
    assert.match(text(view), /unfiltered.old_record/);
    await act(async () => view.root.findByProps({ 'aria-label': 'Action Group' }).props.onChange({ target: { value: 'fleet' } }));
    assert.doesNotMatch(text(view), /unfiltered.old_record|No Audit Entries Match/);
    assert.match(text(view), /Selected Target Unavailable/);
    assert.ok(view.root.findAll(n => n.props.role === 'alert').length > 0);
  } finally { if (view) await act(async () => view.unmount()); env.restore(); }
});

test('An unread Audit Log is a persistent failure rather than a successful empty result', async () => {
  const env = browser(); let view;
  try {
    await act(async () => { view = create(React.createElement(Audit, { showNotification() {}, authFetch: async () => { throw Error('Audit Source Unavailable'); } })); });
    assert.match(text(view), /Audit Source Unavailable/); assert.doesNotMatch(text(view), /No Audit Entries Match/);
  } finally { if (view) await act(async () => view.unmount()); env.restore(); }
});

test('Audit Retry replaces a visible failure with its confirmed empty result', async () => {
  const env = browser(); let calls = 0, view;
  try {
    await act(async () => { view = create(React.createElement(Audit, { showNotification() {}, authFetch: async () => { if (calls++ === 0) throw Error('Audit Source Unavailable'); return { rows: [], total: 0 }; } })); });
    assert.match(text(view), /Audit Source Unavailable/);
    await act(async () => view.root.findAllByType('button').find(b => b.children.join('') === 'Retry').props.onClick());
    assert.doesNotMatch(text(view), /Audit Source Unavailable/);
    assert.match(text(view), /No Audit Entries Match/);
  } finally { if (view) await act(async () => view.unmount()); env.restore(); }
});

test('An older Statistics completion cannot mark a pending newer refresh settled', async () => {
  const env = browser(); const first = [defer(), defer()], second = [defer(), defer()]; let calls = 0, view;
  try {
    await act(async () => { view = create(React.createElement(Stats, { authFetch: () => (calls++ < 2 ? first : second)[calls % 2 === 1 ? 0 : 1].promise })); });
    await act(async () => { const original = globalThis.setTimeout; try { globalThis.setTimeout = callback => { callback(); return 1; }; env.events['horses-updated'](); } finally { globalThis.setTimeout = original; } });
    await act(async () => { first[0].resolve({ platform: { liveTables: 111 } }); first[1].resolve({ data: {} }); });
    assert.equal(view.root.findByType('button').props.disabled, true);
    assert.doesNotMatch(text(view), /111/);
    await act(async () => { second[0].resolve({ platform: { liveTables: 222 } }); second[1].resolve({ data: {} }); });
    assert.equal(view.root.findByType('button').props.disabled, false);
    assert.match(text(view), /222/);
  } finally { if (view) await act(async () => view.unmount()); env.restore(); }
});


test('Audit rejects malformed successful reads instead of inventing an empty list', async () => {
  for (const answer of [{ success: true }, { rows: null }, { rows: {} }]) {
    const env = browser(); let view;
    try {
      await act(async () => { view = create(React.createElement(Audit, { showNotification() {}, authFetch: async () => answer })); });
      assert.match(text(view), /Audit Log Unavailable:/);
      assert.doesNotMatch(text(view), /No Audit Entries Match/);
      assert.ok(view.root.findAll(n => n.props.role === 'alert').length > 0);
    } finally { if (view) await act(async () => view.unmount()); env.restore(); }
  }
});

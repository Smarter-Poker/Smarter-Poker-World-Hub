import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { expandRangeToCombos } from '../src/lib/sandbox/EquityEngine.js';
import { normalizePersonalAssistantCopy } from '../src/lib/personal-assistant/copyPolicy.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

test('native Sandbox telemetry keeps singular and plural opponent words intact under the copy policy', () => {
  const source = read('pages/hub/personal-assistant/sandbox.js');
  const telemetry = source.match(/<span className="metric-sub">\s*SPR[\s\S]*?<\/span>/)?.[0];
  assert.ok(telemetry, 'Exercise The Actual Pot And SPR Telemetry JSX');
  const code = ts.transpileModule(`module.exports = (villains, tableSpr) => (${telemetry});`, {
    fileName: 'telemetry.jsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, React });
  for (const [count, word] of [[1, 'Villain'], [2, 'Villains'], [5, 'Villains']]) {
    const element = module.exports(Array(count).fill({}), 4.8);
    // React keeps interpolated children as separate text nodes. The installed
    // policy normalizes each node, so a detached lowercase suffix becomes S.
    const copy = React.Children.toArray(element.props.children)
      .map(child => normalizePersonalAssistantCopy(String(child))).join('');
    assert.equal(copy, `SPR 4.8 · ${count} ${word}`);
  }
});

test('the template route exposes all 30 permitted owner templates and still refuses template 31', async () => {
  const rows = [OWNER, OTHER].flatMap(user_id => Array.from({ length: 30 }, (_, index) => ({
    id: `${user_id}-${index}`, user_id, name: `Template ${index + 1}`, created_at: index,
  })));
  let authenticated = true;
  let databaseCalls = 0;
  const db = {
    from(table) {
      databaseCalls += 1;
      assert.equal(table, 'sandbox_templates');
      let owner;
      let limit = Infinity;
      let head = false;
      const query = {
        select(_columns, options) { head = options?.head === true; return query; },
        eq(column, value) { assert.equal(column, 'user_id'); owner = value; return query; },
        order(column, options) { assert.equal(column, 'created_at'); assert.equal(options.ascending, false); return query; },
        limit(value) { limit = value; return query; },
        insert() { assert.fail('The Existing 30 Template Write Limit Must Still Block Inserts'); },
        then(resolve, reject) {
          const owned = rows.filter(row => row.user_id === owner).sort((a, b) => b.created_at - a.created_at);
          return Promise.resolve({ data: head ? null : owned.slice(0, limit), count: owned.length, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const code = ts.transpileModule(read('pages/api/assistant/sandbox/sandbox-templates.js'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = {
    serverAuth: { getServerUserWithFallback: async () => ({ user: authenticated ? { id: OWNER } : null, status: 401 }) },
    supabaseServerClient: { createClient: () => db },
    apiErrorHandler: { reportApiError() {} },
    apiRateLimit: { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    persistenceContract: { persistedResult: value => value, persistenceFailure: error => ({ success: false, error }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-only' } },
    console,
    require: name => {
      const dependency = dependencies[name.split('/').at(-1)];
      assert.ok(dependency, `Unexpected Dependency ${name}`);
      return dependency;
    },
  });
  const invoke = async method => {
    const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await module.exports.default({ method, query: { userId: OTHER }, body: { name: 'Template 31', scenario: { heroHand: { card1: 'As', card2: 'Ad' } } } }, response);
    return response;
  };
  const list = await invoke('GET');
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.templates.length, 30, 'Every Template The Owner Is Permitted To Save Must Remain Reachable');
  assert.ok(list.body.templates.every(row => row.user_id === OWNER));
  assert.equal(list.body.templates.at(-1).name, 'Template 1');
  const capped = await invoke('POST');
  assert.equal(capped.statusCode, 409);
  assert.match(capped.body.error, /30/);
  const priorCalls = databaseCalls;
  authenticated = false;
  assert.equal((await invoke('GET')).statusCode, 401);
  assert.equal(databaseCalls, priorCalls);
});

function selectPreflop(handLabel, board = [], blocked = false) {
  const source = read('pages/hub/personal-assistant/sandbox.js');
  const callback = source.match(/onPickHand=\{\(handLabel\) => \{([\s\S]*?)\n                    \}\}/);
  assert.ok(callback, 'Exercise The Actual PreflopChartOverlay Callback');
  const result = { selected: null, undoCount: 0, errors: [] };
  const context = {
    handLabel, communityCards: board, activePlayBlock: blocked,
    expandRangeToCombos,
    pushUndo: () => { result.undoCount += 1; },
    setHeroHand: hand => { result.selected = hand; },
    toast: { error: message => result.errors.push(message) },
  };
  vm.runInNewContext(`(() => {${callback[1]}\n})()`, context);
  return result;
}

test('preflop selection preserves pairs, suitedness and ranks without duplicating board cards', () => {
  for (const [label, board] of [
    ['AA', ['As', 'Kd', '3c', '9h', '2c']],
    ['AKs', ['As', 'Ks', 'Qh', 'Td', '2c']],
    ['AKo', ['As', 'Kd', 'Kh', '9h', '2c']],
  ]) {
    const result = selectPreflop(label, board);
    assert.ok(result.selected);
    const cards = [result.selected.card1, result.selected.card2];
    assert.equal(new Set([...board, ...cards]).size, board.length + 2, `${label} Cannot Reuse A Board Card`);
    assert.equal(cards[0][0], label[0]);
    assert.equal(cards[1][0], label[1]);
    if (label.endsWith('s')) assert.equal(cards[0][1], cards[1][1]);
    if (label.endsWith('o')) assert.notEqual(cards[0][1], cards[1][1]);
    assert.equal(result.undoCount, 1);
    assert.deepEqual(result.errors, []);
  }
});

test('impossible blocked preflop combinations leave the current hand and undo state intact', () => {
  for (const [label, board] of [
    ['AA', ['As', 'Ah', 'Ad', '9s', '2h']],
    ['AKs', ['As', 'Kh', 'Ad', 'Kc', 'Qh']],
  ]) {
    const result = selectPreflop(label, board);
    assert.equal(result.selected, null);
    assert.equal(result.undoCount, 0);
    assert.equal(result.errors.length, 1);
  }
  const blocked = selectPreflop('AA', [], true);
  assert.equal(blocked.selected, null);
  assert.equal(blocked.undoCount, 0);
  assert.deepEqual(blocked.errors, []);
});

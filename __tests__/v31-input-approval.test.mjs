import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { approveReviewedV31Input, reviewV31InputApproval } from '../src/components/horses/v31InputApproval.js';
import { hasPermission } from '../src/components/horses/operatorPermissions.js';

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const BUNDLE = '22222222-2222-5222-8222-222222222222';
const payload = () => ({
  bundle_key: 'v31.test.inputs', bundle_version: 'v1', approval_note: 'Reviewed immutable inputs',
  range_bundle_checksum: 'a'.repeat(64), source_combo_order_checksum: 'b'.repeat(64), icm_model_checksum: 'c'.repeat(64),
  files: [['range', 'inputs/ranges.json', 'a'], ['combo_order', 'inputs/order.txt', 'b'],
    ['icm_model', 'inputs/icm.json', 'c'], ['scenario_manifest', 'manifests/solver.json', 'd']]
    .map(([kind, path, hash]) => ({ kind, path, checksum: hash.repeat(64) })),
});
const reviewed = () => reviewV31InputApproval(JSON.stringify(payload()));
const client = (rpc) => ({ auth: { getUser: async () => ({ data: { user: { id: OPERATOR } }, error: null }) }, rpc });

test('review reconciles the manifest and all pinned input receipts without rewriting the payload', () => {
  const original = payload();
  original.policy_export_schema = 'smarter-poker.pio-policy.v4';
  original.feature_contract_version = 'holdem-board-relative-v2';
  const result = reviewV31InputApproval(JSON.stringify(original));
  assert.deepEqual(result.bundle, original);
  assert.equal(result.scenarioManifest.checksum, 'd'.repeat(64));
  for (const mutate of [
    (p) => { p.files[0].checksum = 'e'.repeat(64); },
    (p) => { p.files = p.files.filter((f) => f.kind !== 'scenario_manifest'); },
    (p) => { p.files[0].path = '../other.json'; },
    (p) => { p.files.push({ ...p.files[0] }); },
    (p) => { p.credential = 'not-an-approval-field'; },
  ]) {
    const invalid = payload(); mutate(invalid);
    assert.throws(() => reviewV31InputApproval(JSON.stringify(invalid)));
  }
  assert.throws(() => reviewV31InputApproval('{bad json'));
  assert.throws(() => reviewV31InputApproval(' '.repeat(262145)));
});

test('approval invokes only the original RPC using the verified current browser operator', async () => {
  const calls = [];
  const input = reviewed();
  const result = await approveReviewedV31Input(client(async (...args) => {
    calls.push(args); return { data: BUNDLE, error: null };
  }), OPERATOR, input);
  assert.equal(result, BUNDLE);
  assert.deepEqual(calls, [['ca_gto_v31_approve_input_bundle', { p_bundle: input.bundle }]]);
});

test('a changed or unverifiable caller cannot submit approval', async () => {
  let calls = 0;
  const c = client(async () => { calls += 1; });
  c.auth.getUser = async () => ({ data: { user: { id: BUNDLE } }, error: null });
  await assert.rejects(approveReviewedV31Input(c, OPERATOR, reviewed()), /Operator Changed/);
  c.auth.getUser = async () => ({ data: null, error: { message: 'unavailable' } });
  await assert.rejects(approveReviewedV31Input(c, OPERATOR, reviewed()), /Operator Changed/);
  await assert.rejects(approveReviewedV31Input(c, null, reviewed()), /Could Not Be Verified/);
  assert.equal(calls, 0);
});

test('database refusal and malformed receipts never produce an approval success', async () => {
  await assert.rejects(approveReviewedV31Input(client(async () => ({ error: { message: 'admin approval required' } })), OPERATOR, reviewed()), /admin approval required/);
  await assert.rejects(approveReviewedV31Input(client(async () => ({ data: null, error: null })), OPERATOR, reviewed()), /Verify Stored State/);
});

const require = createRequire(import.meta.url);
const React = require('react');
const { create, act } = require('react-test-renderer');
let activeClient;
const source = 'src/components/horses/V31InputsPanel.jsx';
const compiled = require('@babel/core').transformSync(fs.readFileSync(source, 'utf8'), {
  filename: source, babelrc: false, configFile: false, presets: [require.resolve('next/babel')],
}).code;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)((name) => {
  if (name === 'react') return React;
  if (name.includes('lib/supabase')) return { get supabase() { return activeClient; } };
  if (name.includes('operatorPermissions')) return { hasPermission };
  if (name.includes('v31InputApproval')) return { approveReviewedV31Input, reviewV31InputApproval };
  if (name.endsWith('.css')) return {};
  if (!name.startsWith('.')) return require(name);
  throw new Error(name);
}, module, module.exports);
const Panel = module.exports.default;
const textOf = (view) => JSON.stringify(view.toJSON());
const button = (view, label) => view.root.findAllByType('button').find((b) => b.children.join('') === label);
async function mount(permissions = ['fleet.write']) {
  let view;
  await act(async () => { view = create(React.createElement(Panel, { permissions, operatorId: OPERATOR })); });
  await act(async () => view.root.findByType('textarea').props.onChange({ target: { value: JSON.stringify(payload()) } }));
  await act(async () => button(view, 'Review Input Bundle').props.onClick());
  return view;
}

test('the actual panel serializes approval, retains reviewed bytes and shows only the database receipt', async () => {
  const calls = []; let finish;
  activeClient = client(async (name, body) => {
    calls.push({ name, body });
    return new Promise((resolve) => { finish = resolve; });
  });
  const view = await mount();
  try {
    assert.ok(textOf(view).includes('d'.repeat(64)));
    await act(async () => { button(view, 'Approve Input Bundle').props.onClick(); });
    assert.equal(view.root.findByType('textarea').props.disabled, true);
    await act(async () => {
      button(view, 'Approving Inputs...').props.onClick();
      view.root.findByType('textarea').props.onChange({ target: { value: '{}' } });
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { name: 'ca_gto_v31_approve_input_bundle', body: { p_bundle: payload() } });
    await act(async () => finish({ data: BUNDLE, error: null }));
    assert.ok(textOf(view).includes('Input Approval Confirmed'));
    assert.ok(textOf(view).includes(BUNDLE));
    assert.equal(button(view, 'Approve Input Bundle').props.disabled, true);
  } finally { await act(async () => view.unmount()); }
});

test('the actual panel preserves a failed payload for an explicit same-input retry', async () => {
  let calls = 0;
  activeClient = client(async () => {
    calls += 1;
    return calls === 1 ? { error: { message: 'gateway response unavailable' } } : { data: BUNDLE, error: null };
  });
  const view = await mount();
  try {
    await act(async () => button(view, 'Approve Input Bundle').props.onClick());
    assert.ok(textOf(view).includes('No Approval Confirmation Was Received'));
    assert.ok(!textOf(view).includes('Input Approval Confirmed'));
    assert.equal(view.root.findByType('textarea').props.value, JSON.stringify(payload()));
    await act(async () => button(view, 'Approve Input Bundle').props.onClick());
    assert.equal(calls, 2);
    assert.ok(textOf(view).includes('Input Approval Confirmed'));
  } finally { await act(async () => view.unmount()); }
});

test('read-only and unresolved operator permissions cannot expose the submit action', async () => {
  activeClient = client(async () => { throw new Error('must not be called'); });
  for (const permissions of [['fleet.read'], [], null]) {
    const view = await mount(permissions);
    try { assert.equal(button(view, 'Approve Input Bundle'), undefined); }
    finally { await act(async () => view.unmount()); }
  }
});

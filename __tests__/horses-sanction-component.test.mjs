import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import * as recovery from '../src/components/horses/sanctionRecovery.js';
import * as builders from '../src/components/horses/playerAdmin.js';
import * as restrictions from '../src/lib/horses/playerRestrictions.js';
import * as permissions from '../src/components/horses/operatorPermissions.js';
import { engineControlScope } from '../src/components/horses/engineControlScope.js';
const require = createRequire(import.meta.url), React = require('react');
const { create, act } = require('react-test-renderer');
const sourcePath = 'src/components/horses/PlayersPanel.jsx';
let source = process.env.STABLE_ADMIN_SANCTION_BASELINE ? execFileSync('git', ['show', `HEAD:${sourcePath}`], { encoding: 'utf8' }) : fs.readFileSync(new URL(`../${sourcePath}`, import.meta.url), 'utf8');
if (process.env.STABLE_ADMIN_SANCTION_UNMOUNT_BASELINE) source = source.replace("engineControlScope(authFetch, 'player-sanctions', () => sanctionAlive.current)", "engineControlScope(authFetch, 'player-sanctions')");
const compiled = require('@babel/core').transformSync(source, { filename: sourcePath, babelrc: false, configFile: false, presets: [require.resolve('next/babel')] }).code;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(name => {
  if (name === 'react') return React;
  if (name === './playerAdmin') return builders;
  if (name === './operatorPermissions') return permissions;
  if (name === './sanctionRecovery') return recovery;
  if (name === './engineControlScope') return { engineControlScope };
  if (name === '../../lib/horses/playerRestrictions') return restrictions;
  if (name === '../../lib/horsesAdminTokens') return { num: n => String(n || 0), when: v => String(v || '') };
  if (name === './usePagedList') return { __esModule: true, default: () => ({ rows: [], filters: {}, loaded: false, refresh() {}, setFilters() {} }) };
  if (name.endsWith('.css')) return {};
  if (!name.startsWith('.')) return require(name);
  return { __esModule: true, default: () => null };
}, module, module.exports);
const Panel = module.exports.default;
const actor = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222';
const draft = { userId: user, scope: 'account', reasonCode: 'security_compromise', note: 'Owner review', expiresAt: null, opId: 'sanction-original' };
test('actual Players panel recovers an approval decision after unmount and reload', async () => {
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
  recovery.retainSanction(storage, actor, draft, { approvalId: 'original-approval' }); globalThis.localStorage = storage;
  const calls = [];
  const authFetch = async (url, options = {}) => { calls.push({ url, options }); return { actorId: actor, operation: null, writable: false }; };
  authFetch.captureScope = () => ({ operatorId: actor, isCurrent: () => true });
  let view; await act(async () => { view = create(React.createElement(Panel, { authFetch, operatorId: actor, permissions: ['players.read'], showNotification() {} })); });
  try {
    const read = view.root.findAllByType('button').find(b => b.children.join('') === 'Read Sanction Outcome');
    assert.ok(read, 'the original approval execution handle must survive reloading the real Players panel');
    await act(async () => { await read.props.onClick(); });
    const retry = view.root.findAllByType('button').find(b => b.children.join('') === 'Apply It Now');
    assert.equal(retry.props.disabled, true); assert.equal(calls.length, 1); assert.equal(calls[0].options.method, undefined);
    assert.equal(recovery.readSanctions(storage, actor)[draft.opId].approvalId, 'original-approval');
  } finally { await act(async () => view.unmount()); }
});

test('late sanction receipt after the original panel unmount cannot notify or clear retained intent', async () => {
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
  recovery.retainSanction(storage, actor, draft); globalThis.localStorage = storage;
  let finish; const notifications = [];
  const authFetch = () => new Promise(resolve => { finish = resolve; });
  authFetch.captureScope = () => ({ operatorId: actor, isCurrent: () => true });
  let view; await act(async () => { view = create(React.createElement(Panel, { authFetch, operatorId: actor, permissions: ['players.read'], showNotification: (...args) => notifications.push(args) })); });
  let pending; await act(async () => { pending = view.root.findAllByType('button').find(b => b.children.join('') === 'Read Sanction Outcome').props.onClick(); });
  await act(async () => view.unmount());
  await act(async () => { finish({ actorId: actor, operation: { op_id: draft.opId, action: 'restrict', payload: builders.restrictBody(draft), result: { ok: true, restriction: { user_id: user } } } }); await pending; });
  assert.deepEqual(notifications, []); assert.ok(recovery.readSanctions(storage, actor)[draft.opId]);
});

test('real panel releases expired unapplied intent only after explicit renewed proof', async () => {
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
  recovery.retainSanction(storage, actor, { ...draft, expiresAt: '2020-01-01T00:00:00.000Z' }); globalThis.localStorage = storage;
  let posts = 0, approvalReads = 0;
  const authFetch = async (url, options = {}) => {
    if (options.method) { posts++; throw Object.assign(new Error('Expired'), { status: 400, code: 'expiry_in_the_past' }); }
    if (url.includes('includeApproval=1')) { approvalReads++; return { actorId: actor, operation: null, approval: null }; }
    return { actorId: actor, operation: null, writable: true };
  };
  authFetch.captureScope = () => ({ operatorId: actor, isCurrent: () => true });
  let view; await act(async () => { view = create(React.createElement(Panel, { authFetch, operatorId: actor, permissions: ['players.read','players.write','moderation.write'], showNotification() {} })); });
  const click = async label => { await act(async () => { await view.root.findAllByType('button').find(b => b.children.join('') === label).props.onClick(); }); };
  try {
    await click('Read Sanction Outcome'); await click('Apply It Now');
    assert.ok(recovery.readSanctions(storage, actor)[draft.opId]);
    await click('Release Expired Decision'); assert.equal(recovery.readSanctions(storage, actor)[draft.opId], undefined);
    assert.equal(posts, 2); assert.equal(approvalReads, 2);
  } finally { await act(async () => view.unmount()); }
});

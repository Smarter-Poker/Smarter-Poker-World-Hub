import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverPlayerLogout, validLogoutIntent, logoutIntentKey } from '../src/components/horses/playerLogoutRecovery.js';
import { handle } from '../pages/api/horses/player-admin.js';
const actor = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const intent = { actorId: actor, userId: user, note: 'Authorized session termination', opId: 'logout-original' };
const scope = { assertCurrent() {}, options: { expectedOperatorId: actor } };
const receipt = { op_id: intent.opId, action: 'force_logout', payload: { userId: user, reason: intent.note }, result: { ok: true, enforced: true, opId: intent.opId } };
test('a committed response loss recovers its receipt without terminating a new login', async () => {
  const calls = [];
  const result = await recoverPlayerLogout(async (url, options) => { calls.push({ url, options }); return { actorId: actor, operation: receipt }; }, scope, intent);
  assert.equal(result.ok, true); assert.equal(calls.length, 1); assert.equal(calls[0].options.method, undefined);
});
test('an absent receipt retries the identical decision, never a fresh operation', async () => {
  const calls = [];
  await recoverPlayerLogout(async (url, options) => { calls.push({ url, options }); return calls.length === 1 ? { actorId: actor, operation: null, writable: true } : receipt.result; }, scope, intent, true);
  assert.equal(calls.length, 2); assert.equal(JSON.parse(calls[1].options.body).opId, intent.opId);
});
test('unknown receipt reads and mismatched decisions cannot issue a logout', async () => {
  for (const response of [null, { actorId: 'another', operation: receipt }, { actorId: actor, operation: { ...receipt, payload: { userId: 'another', reason: intent.note } } }]) {
    let count = 0;
    await assert.rejects(recoverPlayerLogout(async () => { count++; if (!response) throw new Error('unavailable'); return response; }, scope, intent));
    assert.equal(count, 1);
  }
});
test('late account change cannot retry and retained keys isolate operator and target', async () => {
  let current = true, count = 0;
  await assert.rejects(recoverPlayerLogout(async () => { count++; current = false; return { actorId: actor, operation: null }; }, { ...scope, assertCurrent() { if (!current) throw new Error('changed'); } }, intent));
  assert.equal(count, 1); assert.notEqual(logoutIntentKey(actor, user), logoutIntentKey(user, actor));
  assert.equal(validLogoutIntent(intent, actor, user), true); assert.equal(validLogoutIntent(intent, user, user), false);
});
test('control receipt reader scopes lookup to fresh authorized requester and logout action', async () => {
  const filters = [];
  const db = { from() { return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, async maybeSingle() { return { data: receipt, error: null }; } }; } };
  const result = await handle({ method: 'GET', query: { section: 'control_outcome', opId: intent.opId }, op: { user: { id: actor }, permissions: ['moderation.write'] }, db });
  assert.equal(result.actorId, actor); assert.deepEqual(filters, [['op_id', intent.opId], ['actor_id', actor], ['action', 'force_logout']]);
  assert.equal(result.writable, false);
});
test('receipt reader hides another actor decision and reports database uncertainty', async () => {
  const db = (error) => ({ from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error }; } }; } });
  const args = { method: 'GET', query: { section: 'control_outcome', opId: intent.opId }, op: { user: { id: user }, permissions: ['players.read'] } };
  assert.equal((await handle({ ...args, db: db(null) })).operation, null);
  await assert.rejects(handle({ ...args, db: db({ message: 'offline' }) }), (error) => error.code === 'outcome_unknown' && error.status === 503);
});
test('sanction recovery reader uses its explicit action under read-only permission', async () => {
  const filters = [];
  const db = { from() { return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, async maybeSingle() { return { data: null, error: null }; } }; } };
  const result = await handle({ method: 'GET', query: { section: 'control_outcome', action: 'restrict', opId: intent.opId }, op: { user: { id: actor }, permissions: ['players.read'] }, db });
  assert.equal(result.operation, null); assert.equal(result.writable, false); assert.deepEqual(filters.at(-1), ['action', 'restrict']);
});

test('expired sanction approval proof is requester/op/kind bound and unavailable reads fail closed', async () => {
  for (const failure of [false, true]) {
    const reads = []; const db = { from(table) { const filters = []; reads.push({ table, filters }); return { select() { return this; }, eq(key,value) { filters.push([key,value]); return this; }, async maybeSingle() { return { data: null, error: table === 'ca_operator_approvals' && failure ? { message: 'offline' } : null }; } }; } };
    const args = { method: 'GET', query: { section: 'control_outcome', action: 'restrict', opId: intent.opId, includeApproval: '1' }, op: { user: { id: actor }, permissions: ['players.read'] }, db };
    if (failure) await assert.rejects(handle(args), e => e.code === 'outcome_unknown' && e.status === 503);
    else assert.equal((await handle(args)).approval, null);
    assert.deepEqual(reads[1], { table: 'ca_operator_approvals', filters: [['op_id', intent.opId], ['requested_by', actor], ['kind', 'sanction']] });
  }
});

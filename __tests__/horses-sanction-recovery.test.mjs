import test from 'node:test';
import assert from 'node:assert/strict';
import { readSanctions, retainSanction, completeSanction, recoverSanction } from '../src/components/horses/sanctionRecovery.js';
const actor = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222';
const draft = { userId: user, scope: 'account', reasonCode: 'security_compromise', note: 'Owner review', expiresAt: null, opId: 'sanction-original' };
const scope = { options: { expectedOperatorId: actor }, assertCurrent() {} };
const storage = () => { const values = new Map(); return { values, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) }; };
test('lost response followed by remount preserves the sole approved sanction execution key', async () => {
  const saved = storage(); retainSanction(saved, actor, draft);
  let count = 0;
  await assert.rejects(recoverSanction(async (_url, options) => {
    count++; assert.equal(readSanctions(saved, actor)[draft.opId].draft.opId, draft.opId);
    if (!options.method) return { actorId: actor, operation: null, writable: true };
    throw new Error('response lost');
  }, scope, { actorId: actor, draft }, true));
  const remounted = readSanctions(saved, actor);
  assert.equal(remounted[draft.opId].draft.opId, draft.opId); assert.equal(count, 2);
});
test('multiple pending approvals survive reload and completing one preserves the others', () => {
  const saved = storage(); retainSanction(saved, actor, draft, { approvalId: 'approval-one' });
  const another = { ...draft, opId: 'sanction-other' }; retainSanction(saved, actor, another, { approvalId: 'approval-two' });
  assert.equal(Object.keys(readSanctions(saved, actor)).length, 2);
  completeSanction(saved, actor, draft.opId);
  assert.equal(readSanctions(saved, actor)[another.opId].approvalId, 'approval-two');
});
test('retained original payload cannot change and is isolated by operator', () => {
  const saved = storage(); retainSanction(saved, actor, draft);
  assert.throws(() => retainSanction(saved, actor, { ...draft, note: 'a new decision' }), /Must Not Change/);
  assert.deepEqual(readSanctions(saved, user), {});
});
test('completed original receipt can be recovered after write permission is revoked', async () => {
  let calls = 0;
  const result = await recoverSanction(async () => { calls++; return { actorId: actor, writable: false, operation: { op_id: draft.opId, action: 'restrict', payload: { ...draft, expiresAt: null }, result: { ok: true, restriction: { id: 'original', user_id: user } } } }; }, scope, { actorId: actor, draft });
  assert.equal(result.replayed, true); assert.equal(calls, 1);
});
test('reading a pending decision never posts and revoked write permission refuses retry', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return { actorId: actor, writable: false, operation: null }; };
  assert.deepEqual(await recoverSanction(fetch, scope, { actorId: actor, draft }), { pending: true, writable: false });
  await assert.rejects(recoverSanction(fetch, scope, { actorId: actor, draft }, true), /Write Permission/); assert.equal(calls, 2);
});
test('approved retry carries the original immutable decision and preserves pending result', async () => {
  let posted;
  const result = await recoverSanction(async (_url, options) => { if (!options.method) return { actorId: actor, writable: true, operation: null }; posted = JSON.parse(options.body); return { pending: true, opId: draft.opId, approvalId: 'approval-one' }; }, scope, { actorId: actor, draft }, true);
  assert.equal(result.pending, true); assert.equal(posted.opId, draft.opId); assert.equal(posted.userId, user);
});
test('malformed durable sanction bytes are refused without deletion', () => {
  for (const raw of ['null','false','[]','{bad', JSON.stringify({ wrong: { actorId: actor, draft } })]) {
    const saved = storage(); const key = `stable-player-sanctions:${actor}`; saved.setItem(key, raw);
    assert.throws(() => readSanctions(saved, actor)); assert.equal(saved.getItem(key), raw);
  }
});

test('expired original can be released only after named pre-write refusal and fresh absence/terminal approval proof', async () => {
  for (const status of [null, 'rejected', 'expired', 'pending', 'approved', 'executed', 'unknown']) {
    const entry = { actorId: actor, draft: { ...draft, expiresAt: '2020-01-01T00:00:00.000Z' } };
    let calls = 0;
    const authFetch = async (_url, options) => {
      calls++;
      if (options.method) throw Object.assign(new Error('Expired'), { code: 'expiry_in_the_past', status: 400 });
      if (calls === 1) return { actorId: actor, operation: null, writable: true };
      return { actorId: actor, operation: null, approval: status === null ? null : { op_id: draft.opId, requested_by: actor, kind: 'sanction', status, payload: entry.draft } };
    };
    if ([null,'rejected','expired'].includes(status)) assert.equal((await recoverSanction(authFetch, scope, entry, true)).abandonable, true);
    else await assert.rejects(recoverSanction(authFetch, scope, entry, true));
    assert.equal(calls, 3);
  }
});
test('unknown approval reads, new committed receipts and mismatched identities cannot release expired intent', async () => {
  for (const proof of [{ actorId: actor, operation: null }, { actorId: user, operation: null, approval: null }, { actorId: actor, operation: { op_id: draft.opId }, approval: null }]) {
    let count = 0; await assert.rejects(recoverSanction(async (_url, options) => {
      count++; if (options.method) throw Object.assign(new Error('Expired'), { code: 'expiry_in_the_past', status: 400 });
      return count === 1 ? { actorId: actor, operation: null, writable: true } : proof;
    }, scope, { actorId: actor, draft }, true));
  }
});

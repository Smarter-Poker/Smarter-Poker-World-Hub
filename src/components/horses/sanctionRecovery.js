import { PLAYER_ADMIN, restrictBody } from './playerAdmin.js';
import { RESTRICTION_SCOPES, RESTRICTION_REASON_CODES } from '../../lib/horses/playerRestrictions.js';

export const sanctionStorageKey = actorId => `stable-player-sanctions:${actorId}`;
export function readSanctions(storage, actorId) {
  const raw = storage.getItem(sanctionStorageKey(actorId));
  if (raw === null) return {};
  const entries = JSON.parse(raw);
  if (!entries || Array.isArray(entries) || typeof entries !== 'object'
    || Object.entries(entries).some(([key, entry]) => entry?.actorId !== actorId
      || entry?.draft?.opId !== key || !key || key.length > 200
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.draft.userId || '')
      || !RESTRICTION_SCOPES.includes(entry.draft.scope) || !RESTRICTION_REASON_CODES.includes(entry.draft.reasonCode)
      || (entry.draft.note != null && (typeof entry.draft.note !== 'string' || entry.draft.note.length > 2000))
      || (entry.draft.expiresAt != null && (typeof entry.draft.expiresAt !== 'string' || !Number.isFinite(Date.parse(entry.draft.expiresAt)))))) {
    throw new Error('The Stored Sanction Decisions Could Not Be Confirmed');
  }
  return entries;
}
export function retainSanction(storage, actorId, draft, metadata = {}) {
  const entries = readSanctions(storage, actorId);
  const existing = entries[draft.opId];
  if (existing && JSON.stringify(restrictBody(existing.draft)) !== JSON.stringify(restrictBody(draft))) throw new Error('The Original Sanction Decision Must Not Change');
  const entry = { ...existing, ...metadata, actorId, draft: { ...draft, expiresAt: restrictBody(draft).expiresAt } };
  entries[draft.opId] = entry;
  storage.setItem(sanctionStorageKey(actorId), JSON.stringify(entries));
  return entries;
}
export function completeSanction(storage, actorId, opId) {
  const entries = readSanctions(storage, actorId); delete entries[opId];
  storage.setItem(sanctionStorageKey(actorId), JSON.stringify(entries)); return entries;
}
export async function recoverSanction(authFetch, scope, entry, retry = false) {
  scope.assertCurrent();
  const expected = restrictBody(entry.draft);
  const prior = await authFetch(`${PLAYER_ADMIN}?section=control_outcome&action=restrict&opId=${encodeURIComponent(expected.opId)}`, scope.options);
  scope.assertCurrent();
  if (prior.actorId !== entry.actorId) throw new Error('The Original Sanction Account Could Not Be Confirmed');
  if (prior.operation) {
    const row = prior.operation;
    if (row.action !== 'restrict' || row.op_id !== expected.opId || row.result?.ok !== true
      || ['userId','scope','reasonCode','note','expiresAt'].some(key => row.payload?.[key] !== expected[key])) throw new Error('The Original Sanction Receipt Did Not Match');
    return { ...row.result, replayed: true };
  }
  if (!retry) return { pending: true, writable: prior.writable === true };
  if (prior.writable !== true) throw new Error('Sanction Write Permission Is Not Available. The Original Decision Is Retained');
  let result;
  try { result = await authFetch(PLAYER_ADMIN, { ...scope.options, method: 'POST', body: JSON.stringify(expected) }); }
  catch (error) {
    scope.assertCurrent();
    if (error?.code !== 'expiry_in_the_past' || error?.status !== 400 || !expected.expiresAt
      || !Number.isFinite(Date.parse(expected.expiresAt)) || Date.parse(expected.expiresAt) > Date.now()) throw error;
    const proof = await authFetch(`${PLAYER_ADMIN}?section=control_outcome&action=restrict&includeApproval=1&opId=${encodeURIComponent(expected.opId)}`, scope.options);
    scope.assertCurrent();
    if (proof?.actorId !== entry.actorId || proof.operation !== null || !Object.hasOwn(proof, 'approval')) throw error;
    const approval = proof.approval;
    if (approval !== null && (approval?.op_id !== expected.opId || approval?.requested_by !== entry.actorId || approval?.kind !== 'sanction'
      || !['rejected', 'expired'].includes(approval?.status)
      || ['userId','scope','reasonCode','note','expiresAt'].some(key => approval.payload?.[key] !== expected[key]))) throw error;
    return { unapplied: true, abandonable: true, message: 'The Original Decision Expired Without Being Applied' };
  }
  scope.assertCurrent();
  if (result?.pending === true ? result.opId !== expected.opId : result?.restriction?.user_id !== expected.userId) {
    throw new Error('The Sanction Outcome Is Unknown. Keep The Original Decision');
  }
  return result;
}

import { PLAYER_ADMIN } from './playerAdmin.js';

export function logoutIntentKey(actorId, userId) {
  return `stable-player-logout:${actorId}:${userId}`;
}
export function validLogoutIntent(value, actorId, userId) {
  return value?.actorId === actorId && value?.userId === userId
    && typeof value.opId === 'string' && value.opId.length > 0 && value.opId.length <= 200
    && typeof value.note === 'string' && value.note.trim().length > 0 && value.note.length <= 2000;
}
/** A lost response must recover the original decision before retrying its exact key. */
export async function recoverPlayerLogout(authFetch, scope, intent, retry = false) {
  scope.assertCurrent();
  const prior = await authFetch(`${PLAYER_ADMIN}?section=control_outcome&opId=${encodeURIComponent(intent.opId)}`, scope.options);
  scope.assertCurrent();
  if (prior.actorId !== intent.actorId) throw new Error('The Logout Receipt Account Could Not Be Confirmed');
  if (prior.operation) {
    const row = prior.operation;
    if (row.op_id !== intent.opId || row.action !== 'force_logout'
      || row.payload?.userId !== intent.userId || row.payload?.reason !== intent.note.trim()
      || row.result?.ok !== true || row.result?.opId !== intent.opId) {
      throw new Error('The Original Logout Receipt Did Not Match. Keep This Operation Id.');
    }
    return row.result;
  }
  if (prior.operation !== null) throw new Error('The Logout Outcome Is Unknown. Keep The Original Operation Id');
  if (!retry) return { pending: true, writable: prior.writable === true };
  if (prior.writable !== true) throw new Error('Logout Write Permission Is Not Available. The Original Operation Is Retained');
  const result = await authFetch(PLAYER_ADMIN, { ...scope.options, method: 'POST',
    body: JSON.stringify({ action: 'force_logout', userId: intent.userId, note: intent.note, opId: intent.opId }) });
  scope.assertCurrent();
  if (result?.ok !== true || result.opId !== intent.opId) throw new Error('The Logout Outcome Is Unknown. Keep This Operation Id.');
  return result;
}

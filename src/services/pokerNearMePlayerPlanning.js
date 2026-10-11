import { getAuthUser, getFreshAccessToken } from '../lib/authUtils';

export function newPlanningOperationId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('A secure request ID is unavailable. Refresh before saving.');
  return globalThis.crypto.randomUUID();
}
async function planningToken() {
  const user = getAuthUser();
  const access_token = await getFreshAccessToken();
  if (!user?.id || !access_token || getAuthUser()?.id !== user.id) throw Object.assign(new Error('Sign in to use account planning.'), { status: 401, confirmedRefusal: true });
  return { user, access_token };
}
export async function readPlanningJson(response) {
  let payload;
  try { payload = await response.json(); } catch (_) { throw new Error('The planning response was unreadable. Check the original request before retrying.'); }
  if (!response.ok || payload?.success !== true) throw Object.assign(new Error(payload?.error || 'Planning request unavailable.'), { status: response.status, confirmedRefusal: response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status), operation_id: payload?.operation_id, outcome: payload?.outcome });
  return payload;
}
export async function planningRequest(url, options = {}, fetcher = fetch, expectedUserId = null) {
  const session = await planningToken();
  if (expectedUserId && session.user.id !== expectedUserId) throw Object.assign(new Error('The signed-in account changed before this request.'), { status: 401, confirmedRefusal: true });
  const response = await fetcher(url, { ...options, cache: 'no-store', credentials: 'include', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } });
  const payload = await readPlanningJson(response);
  if (getAuthUser()?.id !== session.user.id) throw Object.assign(new Error('The signed-in account changed. Check the original request after returning to that account.'), { outcome: 'unknown' });
  return payload;
}
export async function listPlayerPlans(kind, fetcher = fetch, expectedUserId = null) {
  return (await planningRequest(`/api/poker/player-plans${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`, {}, fetcher, expectedUserId)).plans;
}
export async function mutatePlayerPlan(request, fetcher = fetch, expectedUserId = null) {
  try {
    const receipt = await planningRequest('/api/poker/player-plans', { method: 'POST', body: JSON.stringify(request) }, fetcher, expectedUserId);
    if (receipt.operation_id !== request.operation_id || receipt.action !== request.action || (request.action === 'delete' ? receipt.id !== request.id : receipt.plan?.id !== request.id)) throw new Error('The original planning receipt could not be verified. Check its request ID before saving again.');
    return receipt;
  } catch (error) {
    error.operation_id = request.operation_id;
    if (!error.confirmedRefusal) error.outcome = 'unknown';
    throw error;
  }
}
export async function checkPlanningOperation(operationId, { kind = 'plan', fetcher = fetch, expectedUserId = null } = {}) {
  const endpoint = kind === 'preferences' ? 'player-preferences' : 'player-plans';
  const operation = (await planningRequest(`/api/poker/${endpoint}?operation_id=${encodeURIComponent(operationId)}`, {}, fetcher, expectedUserId)).operation;
  if (operation && (operation.operation_id !== operationId || !['create', 'update', 'delete', 'preferences'].includes(operation.action))) throw new Error('The original planning receipt could not be verified.');
  return operation;
}
export async function patchPlayerPreferences(request, fetcher = fetch, expectedUserId = null) {
  try {
    const receipt = await planningRequest('/api/poker/player-preferences', { method: 'PATCH', body: JSON.stringify(request) }, fetcher, expectedUserId);
    if (receipt.operation_id !== request.operation_id || receipt.action !== 'preferences' || !receipt.preferences || typeof receipt.preferences !== 'object') throw new Error('The original preference receipt could not be verified.');
    return receipt;
  } catch (error) {
    error.operation_id = request.operation_id;
    if (!error.confirmedRefusal) error.outcome = 'unknown';
    throw error;
  }
}

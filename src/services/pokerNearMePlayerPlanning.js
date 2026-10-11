import { getAuthUser, getFreshAccessToken } from '../lib/authUtils';
import { planningSameUuid } from '../lib/poker-near-me/playerPlanning';

export const PLANNING_REQUEST_TIMEOUT_MS = 30000;

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
  const controller = new AbortController();
  let rejectTransport;
  const interrupted = new Promise((_resolve, reject) => { rejectTransport = reject; });
  const abort = () => {
    const error = new Error('The planning request was interrupted. Check the original request before retrying.');
    controller.abort(error); rejectTransport(error);
  };
  const timer = setTimeout(() => {
    const error = new Error('The planning request timed out. Check the original request before retrying.');
    controller.abort(error); rejectTransport(error);
  }, PLANNING_REQUEST_TIMEOUT_MS);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    return await Promise.race([interrupted, (async () => {
      const session = await planningToken();
      // A late token refresh must never send a write after its owner timed out.
      if (controller.signal.aborted) throw controller.signal.reason;
      if (expectedUserId && session.user.id !== expectedUserId) throw Object.assign(new Error('The signed-in account changed before this request.'), { status: 401, confirmedRefusal: true });
      const response = await fetcher(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'include', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } });
      const payload = await readPlanningJson(response);
      if (controller.signal.aborted) throw controller.signal.reason;
      if (getAuthUser()?.id !== session.user.id) throw Object.assign(new Error('The signed-in account changed. Check the original request after returning to that account.'), { outcome: 'unknown' });
      return payload;
    })()]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
export async function listPlayerPlans(kind, fetcher = fetch, expectedUserId = null) {
  return (await planningRequest(`/api/poker/player-plans${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`, {}, fetcher, expectedUserId)).plans;
}
export async function mutatePlayerPlan(request, fetcher = fetch, expectedUserId = null) {
  try {
    const receipt = await planningRequest('/api/poker/player-plans', { method: 'POST', body: JSON.stringify(request) }, fetcher, expectedUserId);
    if (!planningSameUuid(receipt.operation_id, request.operation_id) || receipt.action !== request.action || (request.action === 'delete' ? !planningSameUuid(receipt.id, request.id) : !planningSameUuid(receipt.plan?.id, request.id))) throw new Error('The original planning receipt could not be verified. Check its request ID before saving again.');
    return receipt;
  } catch (error) {
    error.operation_id = request.operation_id;
    if (!error.confirmedRefusal) error.outcome = 'unknown';
    throw error;
  }
}
export async function checkPlanningOperation(operationId, { kind = 'plan', fetcher = fetch, expectedUserId = null } = {}) {
  const endpoint = kind === 'preferences' ? '/api/poker/player-preferences' : '/api/poker/player-plans';
  const operation = (await planningRequest(`${endpoint}?operation_id=${encodeURIComponent(operationId)}`, {}, fetcher, expectedUserId)).operation;
  if (operation && (!planningSameUuid(operation.operation_id, operationId) || !['create', 'update', 'delete', 'preferences'].includes(operation.action))) throw new Error('The original planning receipt could not be verified.');
  return operation;
}
export async function patchPlayerPreferences(request, fetcher = fetch, expectedUserId = null) {
  try {
    const receipt = await planningRequest('/api/poker/player-preferences', { method: 'PATCH', body: JSON.stringify(request) }, fetcher, expectedUserId);
    if (!planningSameUuid(receipt.operation_id, request.operation_id) || receipt.action !== 'preferences' || !receipt.preferences || typeof receipt.preferences !== 'object') throw new Error('The original preference receipt could not be verified.');
    return receipt;
  } catch (error) {
    error.operation_id = request.operation_id;
    if (!error.confirmedRefusal) error.outcome = 'unknown';
    throw error;
  }
}

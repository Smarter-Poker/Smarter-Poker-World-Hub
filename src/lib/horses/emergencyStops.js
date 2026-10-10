import { badRequest, forbidden, ApiError } from './apiEnvelope.js';
import { uuid, text, int } from './validate.js';
import { hasPermission } from './permissions.js';

export const STOP_PATHS = Object.freeze({
  tournament_registration: { permission: 'settings.write', label: 'New Tournament Registration, Rebuys And Add-Ons', exemption: 'Unregistration, Cancellation, Refunds And Existing Play Continue.' },
  positive_issuance: { permission: 'money.write', label: 'Positive Chip And Diamond Issuance', exemption: 'Burns And Transfers Of Existing Funds Continue. Refunds And Reversals Use Their Existing Funded Ledger Rails.' },
  cashout: { permission: 'cashier.write', label: 'Cashout Requests And Approval Execution', exemption: 'Cancellation, Decline, Expiry Refunds And Table Departures Continue.' },
});
export function stopInput(body) {
  const path = typeof body.path === 'string' && STOP_PATHS[body.path] ? body.path : null;
  const opId = uuid(body.opId), reason = text(body.reason, { min: 10, max: 500 });
  const expectedVersion = int(body.expectedVersion, { min: 0 });
  if (!path || !opId || !reason || typeof body.stopped !== 'boolean' || expectedVersion === null)
    throw badRequest('A Known Path, Reason, Operation ID And Current Version Are Required', 'invalid_stop_operation');
  return { path, opId, reason, stopped: body.stopped, expectedVersion };
}
export async function emergencyStopsHandler({ db, op, body, method, query, requestId }) {
  if (method === 'GET') {
    if (query.opId) {
      const opId = uuid(query.opId);
      if (!opId) throw badRequest('Invalid Operation ID', 'invalid_operation');
      const r = await db.from('ca_emergency_stop_operations').select('op_id,path,stopped,version,result,created_at').eq('op_id', opId).eq('actor_id', op.user.id).maybeSingle();
      if (r.error) throw new ApiError(503, 'Operation Outcome Is Unknown. Keep The Same Operation ID', 'stop_outcome_unknown');
      return { actorId: op.user.id, operation: r.data || null };
    }
    const r = await db.from('ca_emergency_stops').select('path,stopped,version,reason,updated_at').order('path');
    if (r.error || !Array.isArray(r.data) || r.data.length !== 3)
      throw new ApiError(503, 'Emergency Stop State Is Unknown', 'stop_state_unknown');
    return { actorId: op.user.id, stops: r.data.map((row) => ({ ...row, ...STOP_PATHS[row.path], writable: hasPermission(op.permissions, STOP_PATHS[row.path]?.permission) })) };
  }
  const input = stopInput(body);
  if (!hasPermission(op.permissions, STOP_PATHS[input.path].permission)) throw forbidden('This Stop Requires Its Source Permission', 'permission_denied');
  const r = await db.rpc('fn_ca_set_emergency_stop', { p_path: input.path, p_stopped: input.stopped, p_expected_version: input.expectedVersion, p_reason: input.reason, p_op_id: input.opId, p_actor_id: op.user.id, p_request_id: requestId });
  if (r.error) {
    if (r.error.code === '40001') throw new ApiError(409, 'The Stop Changed. Refresh Before Starting A New Operation', 'stop_version_changed');
    if (r.error.code === '22023') throw new ApiError(409, 'This Operation ID Names A Different Request', 'stop_operation_conflict');
    if (r.error.code === '42501') throw forbidden('Emergency Stop Permission Was Refused', 'permission_denied');
    throw new ApiError(503, 'Stop Outcome Is Unknown. Read Its Receipt Before Retrying The Same Operation', 'stop_outcome_unknown');
  }
  if (r.data?.ok !== true || r.data?.op_id !== input.opId || r.data?.path !== input.path || r.data?.stopped !== input.stopped)
    throw new ApiError(503, 'Stop Receipt Was Not Confirmed. Keep The Same Operation ID', 'stop_outcome_unknown');
  return { actorId: op.user.id, operation: r.data };
}

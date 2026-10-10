import { ApiError, badRequest, forbidden } from './apiEnvelope.js';
import { uuid, text } from './validate.js';
import { hasPermission } from './permissions.js';

export function cancellationEligible(event) {
  return !!event?.id && !event.started_at && ['scheduled', 'registering', 'upcoming', 'waiting', 'pending'].includes(String(event.status || '').toLowerCase());
}
export async function tournamentOperationsHandler({ db, op, body, query, method, res, requestId }) {
  if (!hasPermission(op.permissions, 'clubs.read') || !hasPermission(op.permissions, 'money.read')) throw forbidden('Tournament And Money Read Permission Required', 'permission_denied');
  if (method === 'GET') {
    if (query.opId) {
      const opId = uuid(query.opId);
      if (!opId) throw badRequest('Invalid Operation ID', 'invalid_operation');
      const r = await db.from('ca_operator_tournament_operations').select('op_id,tournament_id,reason,approval_id,state,result,amount,asset,created_at').eq('op_id', opId).eq('actor_id', op.user.id).maybeSingle();
      if (r.error) throw new ApiError(503, 'Cancellation Outcome Is Unknown. Keep Its Operation ID', 'cancel_outcome_unknown');
      return { actorId: op.user.id, operation: r.data || null };
    }
    const id = uuid(query.tournamentId);
    if (!id) throw badRequest('Invalid Tournament ID', 'invalid_tournament');
    const r = await db.from('tournaments').select('id,name,status,started_at,prize_pool,bounty_pool,total_rake,club_id').eq('id', id).maybeSingle();
    if (r.error) throw new ApiError(503, 'Cancellation Eligibility Is Unknown', 'cancel_eligibility_unknown');
    if (!r.data) throw new ApiError(404, 'Tournament Was Not Found', 'tournament_not_found');
    return { actorId: op.user.id, event: r.data, eligible: cancellationEligible(r.data), writable: ['clubs.write', 'money.write'].every((p) => hasPermission(op.permissions, p)), refusal: cancellationEligible(r.data) ? null : 'Started Or Terminal Events Must Be Resumed Or Settled. The Refund Authority Rechecks All Award And Hand Evidence.' };
  }
  if (!hasPermission(op.permissions, 'clubs.write') || !hasPermission(op.permissions, 'money.write')) throw forbidden('Tournament Cancellation Requires Club And Money Write Permission', 'permission_denied');
  const id = uuid(body.tournamentId), opId = uuid(body.opId), reason = text(body.reason, { min: 10, max: 500 });
  if (!id || !opId || !reason || body.action !== 'cancel_refund') throw badRequest('A Tournament, Reason And Retained Operation ID Are Required', 'invalid_tournament_operation');
  const r = await db.rpc('fn_ca_operator_cancel_tournament', { p_tournament_id: id, p_op_id: opId, p_reason: reason, p_actor_id: op.user.id, p_request_id: requestId });
  if (r.error) {
    if (r.error.code === '42501') throw forbidden('Cancellation Permission Was Refused', 'permission_denied');
    if (r.error.code === 'P0002') throw new ApiError(404, 'Tournament Was Not Found', 'tournament_not_found');
    if (r.error.code === '55000') throw new ApiError(409, 'The Tournament Has Started Or Reached A Terminal State. Resume Or Settle It Through Its Owner', 'cancel_ineligible');
    if (r.error.code === '40001') throw new ApiError(409, 'The Reviewed Event Changed. Refresh And Start A New Cancellation Review', 'cancel_review_changed');
    if (r.error.code === '22023') throw new ApiError(409, 'This Operation ID Names A Different Request', 'cancel_operation_conflict');
    throw new ApiError(503, 'Cancellation Outcome Is Unknown. Read Its Receipt Before Retrying The Same Operation', 'cancel_outcome_unknown');
  }
  const result = r.data;
  if (result?.refused === true) throw new ApiError(409, 'Cancellation Approval Was Refused Or Expired. Review Its Recorded Decision', 'cancel_approval_refused');
  if (result?.ok !== true || result.op_id !== opId || result.tournament_id !== id) throw new ApiError(503, 'Cancellation Receipt Was Not Confirmed. Keep Its Operation ID', 'cancel_outcome_unknown');
  if (result.pending === true) return res.status(202).json({ success: true, actorId: op.user.id, operation: result, pending: true, requestId });
  if (result.state !== 'completed' || result.receipt?.fully_settled !== true || result.receipt?.tournament_id !== id) throw new ApiError(503, 'Refund Settlement Evidence Was Not Confirmed', 'cancel_outcome_unknown');
  return { actorId: op.user.id, operation: result };
}

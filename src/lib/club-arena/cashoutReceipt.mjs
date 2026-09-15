import { parseCashierEvent } from '../accountingMessage.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const cashoutUUID = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
  value !== '00000000-0000-0000-0000-000000000000';
export const cashoutNote = value => typeof value === 'string' ? value.trim() || null : null;

// Transport validation, not a spending limit. Preserve fixed decimal strings.
export function cashoutDecimal(value, allowZero = false) {
  if (typeof value !== 'string' || value.length > 128 || !/^(0|[1-9]\d*)\.\d{2}$/.test(value)) return null;
  return allowZero || value !== '0.00' ? value : null;
}

function timestamp(value) {
  if (typeof value !== 'string' || value.length > 32) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [y, month, day, h, minute, second] = m.slice(1).map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return y > 0 && month > 0 && month <= 12 && day > 0 &&
    day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] &&
    h < 24 && minute < 60 && second < 60;
}

export class CashoutBridgeError extends Error {
  constructor(message, status = 503, code = 'cashout_unavailable', operationId) {
    super(message); this.status = status; this.code = code; this.operationId = operationId;
  }
}
export function cashoutUnknown(operationId) {
  return new CashoutBridgeError('Cashout outcome is unconfirmed. Refresh its status and retain the same operation ID.',
    503, 'cashout_outcome_unknown', operationId);
}

// Accept only the exact server RPC envelope for this original authenticated
// operation. No ordinary message metadata, scalar ID or bare success qualifies.
export function validateCashoutReceipt(data, context) {
  const refuse = () => { throw cashoutUnknown(context.operationId); };
  if (!object(data) || data.success !== true || data.contract_version !== 1 ||
      typeof data.replayed !== 'boolean' || !object(data.request)) return refuse();
  const cashier = parseCashierEvent(data.cashier);
  if (!cashier || Object.keys(cashier).some(key => !Object.hasOwn(data, key) || data[key] !== cashier[key])) return refuse();
  const status = { hold: 'pending', approval: 'approved', cancellation: 'cancelled', decline: 'rejected' }[context.kind];
  if (!status || data.event_kind !== context.kind || data.request_status !== status ||
      data.op_id !== context.operationId || !cashoutUUID(data.op_id) ||
      data.actor_user_id !== context.actorId || data.club_id !== context.clubId ||
      data.player_id !== context.playerId || data.amount !== context.amount ||
      data.accepted_note !== context.note ||
      (context.cashoutId && data.cashout_id !== context.cashoutId)) return refuse();
  if (context.kind === 'decline' ? data.actor_wallet_after !== null : cashoutDecimal(data.actor_wallet_after, true) === null) return refuse();
  const row = data.request, hold = context.kind === 'hold';
  if (row.id !== data.cashout_id || row.club_id !== context.clubId || row.player_id !== context.playerId ||
      row.agent_id !== data.assigned_agent_id || row.amount !== context.amount ||
      !timestamp(row.created_at) || !timestamp(row.updated_at) ||
      !['pending','approved','cancelled','rejected','expired'].includes(row.status) ||
      (!hold && row.status !== status) || (hold && data.replayed === false && row.status !== 'pending') ||
      (hold && data.occurred_at !== row.created_at) || (!hold && data.occurred_at !== row.updated_at)) return refuse();
  for (const key of ['acknowledged_at','completed_at','cancelled_at']) {
    if (!Object.hasOwn(row, key) || (row[key] !== null && !timestamp(row[key]))) return refuse();
  }
  for (const key of ['player_note','agent_note']) {
    if (!Object.hasOwn(row, key) || (row[key] !== null && typeof row[key] !== 'string')) return refuse();
  }
  if ((row.status === 'pending' && row.updated_at !== row.created_at) ||
      row.acknowledged_at !== (['approved','rejected'].includes(row.status) ? row.updated_at : null) ||
      row.completed_at !== (row.status === 'approved' ? row.updated_at : null) ||
      row.cancelled_at !== (['cancelled','rejected','expired'].includes(row.status) ? row.updated_at : null) ||
      (hold && row.player_note !== context.note) ||
      (['approval','decline'].includes(context.kind) && row.agent_note !== context.note)) return refuse();
  // No actor/counterparty wallet balance escapes through the shared route DTO.
  return { contractVersion: 1, operationId: data.op_id, replayed: data.replayed, cashier,
    request: { id: row.id, clubId: row.club_id, playerId: row.player_id, agentId: row.agent_id,
      amount: row.amount, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
      acknowledgedAt: row.acknowledged_at, completedAt: row.completed_at, cancelledAt: row.cancelled_at,
      playerNote: row.player_note, agentNote: row.agent_note } };
}

function assertCashoutIntent(context) {
  const ids = [context.actorId, context.clubId, context.playerId, context.operationId,
    ...(context.cashoutId ? [context.cashoutId] : [])];
  if (!cashoutUUID(context.actorId) || !cashoutUUID(context.clubId) || !cashoutUUID(context.playerId) ||
      ids.some(value => typeof value !== 'string' || value !== value.toLowerCase()) ||
      !cashoutUUID(context.operationId) || cashoutDecimal(context.amount) === null ||
      (context.kind !== 'hold' && !cashoutUUID(context.cashoutId)) ||
      !['hold','approval','cancellation','decline'].includes(context.kind) ||
      (['hold','cancellation'].includes(context.kind) ? context.actorId !== context.playerId : context.actorId === context.playerId) ||
      (context.kind === 'hold' && context.cashoutId !== undefined && context.cashoutId !== null) ||
      (context.note !== null && typeof context.note !== 'string')) {
    throw new CashoutBridgeError('Cashout intent could not be verified.', 400, 'cashout_invalid_intent');
  }
}
export async function dispatchCashout(client, context) {
  assertCashoutIntent(context);
  const rpc = context.kind === 'hold' ? 'fn_cashout_request_v2' :
    context.kind === 'approval' ? 'fn_cashout_approve_v2' : 'fn_cashout_release_v2';
  let response;
  try {
    response = await client.rpc(rpc, { p_club_id: context.clubId, p_amount: context.amount,
      p_expected_actor_id: context.actorId, p_op_id: context.operationId, p_note: context.note,
      ...(context.cashoutId ? { p_cashout_id: context.cashoutId } : {}) });
  } catch { throw cashoutUnknown(context.operationId); }
  if (!object(response) || response.error) throw cashoutUnknown(context.operationId);
  return validateCashoutReceipt(response.data, context);
}

// Exact operation lookup writes no business records; its SQL locks require a
// normal transaction. Missing/error/malformed results never mean absent.
export async function lookupCashoutReceipt(client, context) {
  assertCashoutIntent(context);
  const action = context.kind === 'hold' ? 'hold' : context.kind === 'approval' ? 'approval' : 'release';
  let response;
  try { response = await client.rpc('fn_cashout_operation_receipt_v2', {
    p_expected_actor_id: context.actorId, p_op_id: context.operationId, p_action: action,
    p_club_id: context.clubId, p_amount: context.amount, p_cashout_id: context.cashoutId || null,
    p_note: context.note,
  }); } catch { throw cashoutUnknown(context.operationId); }
  const data = response?.data;
  if (!object(response) || response.error || !object(data) || data.contract_version !== 1 ||
      typeof data.found !== 'boolean' || data.actor_user_id !== context.actorId || data.op_id !== context.operationId ||
      data.action !== action || data.club_id !== context.clubId || data.amount !== context.amount ||
      data.cashout_id !== (context.cashoutId || null) || data.accepted_note !== context.note) {
    throw cashoutUnknown(context.operationId);
  }
  if (data.found === false) {
    if (data.receipt !== null) throw cashoutUnknown(context.operationId);
    return null;
  }
  if (!object(data.receipt) || data.receipt.replayed !== true) throw cashoutUnknown(context.operationId);
  return validateCashoutReceipt(data.receipt, context);
}

export function cashoutReplayResponse(receipt, kind) {
  return { success: true, receipt, cashoutId: receipt.request.id, amount: receipt.request.amount,
    status: receipt.request.status, playerId: receipt.request.playerId,
    ...(kind === 'approval' ? { action: 'approved' } : kind === 'decline'
      ? { action: 'cancelled', chipsReturned: receipt.request.amount } : kind === 'cancellation'
        ? { returned: receipt.request.amount } : {}),
    trailStatus: 'not_checked', trailClosed: null, legacyAuditStatus: 'unconfirmed',
    ...(kind === 'approval' ? { approvalStatus: 'unconfirmed' } : {}),
    message: 'The original chip transaction is confirmed. Its audit follow-up has not been rechecked.' };
}

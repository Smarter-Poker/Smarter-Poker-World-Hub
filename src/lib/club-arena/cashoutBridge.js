import { createClient } from '@supabase/supabase-js';
import { getServerUserWithFallback } from '../serverAuth';
import { CashoutBridgeError, cashoutUUID, cashoutDecimal } from './cashoutReceipt.mjs';

// Raw client: never retry a financial dispatch automatically. Database replay
// uses the caller's retained operation ID on an explicit later retry.
export function cashoutUserClient(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new CashoutBridgeError('Cashout service is unavailable.');
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } } });
}

export async function authenticateCashout(req, admin) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !/^Bearer [^\s]+$/.test(header)) {
    throw new CashoutBridgeError('Sign in to continue.', 401, 'cashout_unauthenticated');
  }
  const { user, error } = await getServerUserWithFallback(req, admin);
  if (error || !cashoutUUID(user?.id)) throw new CashoutBridgeError('Sign in to continue.', 401, 'cashout_unauthenticated');
  if (!cashoutUUID(req.body?.expectedActorId) || req.body.expectedActorId.toLowerCase() !== user.id.toLowerCase()) {
    throw new CashoutBridgeError('The cashout account changed. Return to the original account.', 409, 'cashout_actor_changed');
  }
  const operationId = req.headers['x-idempotency-key'];
  if (!cashoutUUID(operationId)) throw new CashoutBridgeError('A retained UUID operation ID is required.', 400, 'cashout_operation_required');
  return { actorId: user.id.toLowerCase(), user, operationId: operationId.toLowerCase(), token: header.slice(7) };
}

export async function readCashout(admin, cashoutId) {
  const { data, error } = await admin.from('cashout_requests')
    .select('id,club_id,player_id,agent_id,amount::text,status').eq('id', cashoutId).maybeSingle();
  if (error) throw new CashoutBridgeError('Cashout details are unavailable.');
  if (!data) throw new CashoutBridgeError('Cashout request not found.', 404, 'cashout_not_found');
  if (data.id !== cashoutId || !cashoutUUID(data.club_id) || !cashoutUUID(data.player_id) ||
      !cashoutUUID(data.agent_id) || cashoutDecimal(data.amount) === null ||
      !['pending','approved','cancelled','rejected','expired'].includes(data.status)) {
    throw new CashoutBridgeError('Cashout details could not be verified.');
  }
  return data;
}

// Preserve the existing settlement gate without its best-effort lock-clearing
// writes. An asserted lock is released by the settlement authority itself.
export async function requireCashoutSettlementOpen(admin, clubId) {
  const { data, error } = await admin.from('clubs').select('settlement_locked,settlement_locked_until')
    .eq('id', clubId).maybeSingle();
  if (error || !data || typeof data.settlement_locked !== 'boolean') {
    throw new CashoutBridgeError('Settlement availability could not be confirmed.');
  }
  if (data.settlement_locked) throw new CashoutBridgeError('Club is locked for settlement. Try again after settlement completes.',
    423, 'cashout_settlement_locked');
}

export function sendCashoutError(res, error) {
  const known = error instanceof CashoutBridgeError;
  return res.status(known ? error.status : 503).json({ success: false,
    error: known ? error.message : 'Cashout outcome is unconfirmed. Retain the same operation ID and refresh its status.',
    code: known ? error.code : 'cashout_outcome_unknown',
    ...(known && error.operationId ? { operationId: error.operationId } : {}) });
}

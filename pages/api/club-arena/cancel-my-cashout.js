/** Requester cancellation through the same actor-bound Club Arena authority. */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { refuseWhileFrozen } from '../../../src/lib/club-arena/platformFreeze';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { authenticateCashout, cashoutUserClient, readCashout, requireCashoutSettlementOpen, sendCashoutError } from '../../../src/lib/club-arena/cashoutBridge';
import { CashoutBridgeError, dispatchCashout, lookupCashoutReceipt, cashoutReplayResponse } from '../../../src/lib/club-arena/cashoutReceipt.mjs';
const { isUUID, rejectBadPayload } = require('../../../src/lib/club-arena/validate');

let admin;
function getAdmin() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new CashoutBridgeError('Cashout service is unavailable.');
    admin = createClient(url, key);
  }
  return admin;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    if (rejectBadPayload(req, res, ['cashoutId','clubId','expectedActorId'])) return;
    const db = getAdmin(), auth = await authenticateCashout(req, db);
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    if (!isUUID(req.body.cashoutId)) throw new CashoutBridgeError('Invalid cashoutId format.', 400);
    if (req.body.clubId !== undefined && !isUUID(req.body.clubId)) throw new CashoutBridgeError('Invalid clubId format.', 400);
    const cashoutId = req.body.cashoutId.toLowerCase(), clubId = req.body.clubId?.toLowerCase();
    const cashout = await readCashout(db, cashoutId);
    if (cashout.player_id !== auth.actorId) throw new CashoutBridgeError('Not your cashout.', 403);
    if (clubId !== undefined && clubId !== cashout.club_id) throw new CashoutBridgeError('Cashout club changed.', 409);
    const client = cashoutUserClient(auth.token);
    const context = { actorId: auth.actorId, operationId: auth.operationId, clubId: cashout.club_id,
      cashoutId, playerId: cashout.player_id, amount: cashout.amount, kind: 'cancellation', note: 'Cancelled by player' };
    const previous = await lookupCashoutReceipt(client, context);
    if (previous) return res.status(200).json(cashoutReplayResponse(previous, 'cancellation'));
    await requireCashoutSettlementOpen(db, cashout.club_id);
    if (await refuseWhileFrozen(db, res, { route: 'cancel-my-cashout' })) return;
    // Let SQL verify matching terminal replay; status alone is not a receipt.
    const receipt = await dispatchCashout(client, context);
    return res.status(200).json({ success: true, returned: receipt.request.amount,
      status: receipt.request.status, receipt, message: 'Cashout cancelled. Chips returned.' });
  } catch (error) { return sendCashoutError(res, error); }
}

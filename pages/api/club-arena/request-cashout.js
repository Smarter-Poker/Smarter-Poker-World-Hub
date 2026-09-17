/** Player cashout caller. The Club Arena V2 RPC owns money and documents. */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { refuseWhileFrozen } from '../../../src/lib/club-arena/platformFreeze';
import { authenticateCashout, cashoutUserClient, requireCashoutSettlementOpen, sendCashoutError } from '../../../src/lib/club-arena/cashoutBridge';
import { CashoutBridgeError, cashoutNote, dispatchCashout, lookupCashoutReceipt, cashoutReplayResponse } from '../../../src/lib/club-arena/cashoutReceipt.mjs';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { sanitizeNote } = require('../../../src/lib/club-arena/sanitize');
const { isUUID, validateAmount, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');

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
    if (rejectBadPayload(req, res, ['clubId','amount','note','expectedActorId'])) return;
    const db = getAdmin(), auth = await authenticateCashout(req, db);
    const { amount: rawAmount, note: rawNote } = req.body;
    if (!isUUID(req.body.clubId)) throw new CashoutBridgeError('Invalid clubId format.', 400);
    const clubId = req.body.clubId.toLowerCase();
    // Preserve this HTTP route's whole-chip range. SQL remains authoritative.
    const validation = validateAmount(rawAmount, 100, 100_000_000);
    if (!validation.valid) throw new CashoutBridgeError(validation.error, 400);
    if (rawNote !== undefined && typeof rawNote !== 'string') throw new CashoutBridgeError('Note must be text.', 400);
    const note = cashoutNote(sanitizeNote(rawNote, 200));
    if (!applyRateLimit(req, res, 'club-arena/request-cashout')) return;
    const client = cashoutUserClient(auth.token);
    const context = { actorId: auth.actorId, operationId: auth.operationId, clubId, playerId: auth.actorId,
      kind: 'hold', amount: validation.value.toFixed(2), note };
    const previous = await lookupCashoutReceipt(client, context);
    if (previous) return res.status(200).json(cashoutReplayResponse(previous, 'hold'));
    await requireCashoutSettlementOpen(db, clubId);
    const { data: seats, error: seatError } = await db.from('table_sessions').select('id,table_id')
      .eq('club_id', clubId).eq('player_id', auth.actorId).eq('is_active', true).limit(1);
    if (seatError || !Array.isArray(seats)) throw new CashoutBridgeError('Active table status could not be confirmed.');
    if (seats.length) throw new CashoutBridgeError('Leave the active table before requesting a cashout.', 409, 'cashout_in_play');
    if (await refuseWhileFrozen(db, res, { route: 'request-cashout' })) return;
    const receipt = await dispatchCashout(client, context);
    try { await logAudit(db, { actionType: 'cashout_requested', userId: auth.actorId, clubId,
      amount: validation.value, ip: extractIP(req), details: { cashoutId: receipt.request.id,
        operationId: receipt.operationId, replayed: receipt.replayed, invoiceId: receipt.cashier.invoice_id,
        actor_role: receipt.cashier.actor_role } });
    } catch { /* The canonical receipt is already confirmed; legacy audit has no success receipt. */ }
    return res.status(200).json({ success: true, cashoutId: receipt.request.id,
      amount: receipt.request.amount, status: receipt.request.status, receipt, legacyAuditStatus: 'unconfirmed',
      message: receipt.request.status === 'pending' ? 'Chips held for cashout review.' : 'The original cashout receipt is confirmed.' });
  } catch (error) { return sendCashoutError(res, error); }
}

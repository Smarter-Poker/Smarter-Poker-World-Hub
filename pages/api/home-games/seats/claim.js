/**
 * HOME GAMES — CLAIM SEAT
 *   POST /api/home-games/seats/claim
 *   Body: { tableId, seatNumber, isGuest? }
 *
 * Per Dan's product spec:
 *   - Every RSVP is a seat claim (#2)
 *   - One guest seat per player per table, name auto-set to "{caller} + Guest" (#3)
 * Delegates all authz + time-cutoff logic to rpc_hg_claim_seat.
 */
import { bridgeRequest, mapRpcError, LIMITS } from '../../../../src/lib/home-games/rpcBridge';
import { reportApiError } from '../../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
    const bridge = await bridgeRequest(req, res, { method: 'POST', limit: LIMITS.write });
    if (!bridge.ok) {
      if (bridge._alreadyResponded) return;
      return res.status(bridge.status).json(bridge.body);
    }
    const { supabase } = bridge;

    const body = req.body || {};
    const tableId = String(body.tableId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(tableId)) {
      return res.status(400).json({ success: false, error: 'INVALID_TABLE_ID' });
    }
    const seatNumber = parseInt(body.seatNumber, 10);
    if (!Number.isFinite(seatNumber) || seatNumber < 1 || seatNumber > 10) {
      return res.status(400).json({ success: false, error: 'INVALID_SEAT_NUMBER' });
    }
    const isGuest = body.isGuest === true;

    const { data, error } = await supabase.rpc('rpc_hg_claim_seat', {
      p_table_id:    tableId,
      p_seat_number: seatNumber,
      p_is_guest:    isGuest
    });
    if (error) {
      const m = mapRpcError(error);
      return res.status(m.status).json({ success: false, ...m });
    }
    return res.status(201).json({ success: true, reservationId: data });
  } catch (err) {
    reportApiError?.(err, req);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

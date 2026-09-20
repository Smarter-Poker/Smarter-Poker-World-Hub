/**
 * HOME GAMES — CHANGE SEAT
 *   POST /api/home-games/seats/[reservationId]/change
 *   Body: { newSeatNumber }
 *
 * Dan's spec #4: players can request a seat change.
 * The underlying RPC does an atomic UPDATE — if the target seat is taken,
 * the unique index rejects with SEAT_ALREADY_TAKEN (409). No "best-effort
 * release then claim" gap where a bot could snipe the original seat.
 */
import { bridgeRequest, mapRpcError, LIMITS } from '../../../../../src/lib/home-games/rpcBridge';
import { reportApiError } from '../../../../../src/lib/apiErrorHandler';

export default async function handler(req, res) {
  try {
    const bridge = await bridgeRequest(req, res, { method: 'POST', limit: LIMITS.write });
    if (!bridge.ok) {
      if (bridge._alreadyResponded) return;
      return res.status(bridge.status).json(bridge.body);
    }
    const { supabase } = bridge;

    const reservationId = String(req.query.reservationId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(reservationId)) {
      return res.status(400).json({ success: false, error: 'INVALID_RESERVATION_ID' });
    }
    const newSeat = parseInt((req.body || {}).newSeatNumber, 10);
    if (!Number.isFinite(newSeat) || newSeat < 1 || newSeat > 10) {
      return res.status(400).json({ success: false, error: 'INVALID_SEAT_NUMBER' });
    }

    const { data, error } = await supabase.rpc('rpc_hg_change_seat', {
      p_reservation_id:   reservationId,
      p_new_seat_number:  newSeat
    });
    if (error) {
      const m = mapRpcError(error);
      return res.status(m.status).json({ success: false, ...m });
    }
    return res.status(200).json({ success: true, reservationId: data });
  } catch (err) {
    reportApiError?.(err, req);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

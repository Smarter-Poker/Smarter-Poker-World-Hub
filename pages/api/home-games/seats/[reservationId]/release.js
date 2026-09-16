/**
 * HOME GAMES — RELEASE SEAT
 *   POST /api/home-games/seats/[reservationId]/release
 *
 * Releases the caller's own reservation. Host-initiated releases go through
 * a separate admin flow (not this endpoint) — this one is strictly self-serve.
 * Delegates authz to rpc_hg_release_seat (checks user_id = auth.uid()).
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

    const { error } = await supabase.rpc('rpc_hg_release_seat', {
      p_reservation_id: reservationId
    });
    if (error) {
      const m = mapRpcError(error);
      return res.status(m.status).json({ success: false, ...m });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    reportApiError?.(err, req);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

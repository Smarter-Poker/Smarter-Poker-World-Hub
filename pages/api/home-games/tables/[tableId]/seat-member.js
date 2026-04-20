/**
 * HOME GAMES — HOST SEATS MEMBER
 *   POST /api/home-games/tables/[tableId]/seat-member
 *   Body: { memberId }
 *
 * Host-only. Claims a seat for a group member — either a real Smarter.Poker
 * user or a roster-only entry (non-user, Dan's spec #7). The RPC enforces
 * staff-level authz and that the member belongs to the same group.
 *
 * Companion flow: POST /api/home-games/roster (seat-member's prerequisite
 * when the person isn't on the platform yet).
 */
import { bridgeRequest, mapRpcError, LIMITS } from '../../../../../src/lib/home-games/rpcBridge';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
    const bridge = await bridgeRequest(req, res, { method: 'POST', limit: LIMITS.write });
    if (!bridge.ok) {
      if (bridge._alreadyResponded) return;
      return res.status(bridge.status).json(bridge.body);
    }
    const { supabase } = bridge;

    const tableId = String(req.query.tableId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(tableId)) {
      return res.status(400).json({ success: false, error: 'INVALID_TABLE_ID' });
    }
    const body = req.body || {};
    const seatNumber = parseInt(body.seatNumber, 10);
    const memberId = String(body.memberId || '').trim();
    if (!Number.isFinite(seatNumber) || seatNumber < 1 || seatNumber > 10) {
      return res.status(400).json({ success: false, error: 'INVALID_SEAT_NUMBER' });
    }
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
      return res.status(400).json({ success: false, error: 'INVALID_MEMBER_ID' });
    }

    const { data, error } = await supabase.rpc('rpc_hg_host_claim_for_member', {
      p_table_id:     tableId,
      p_seat_number:  seatNumber,
      p_member_id:    memberId
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

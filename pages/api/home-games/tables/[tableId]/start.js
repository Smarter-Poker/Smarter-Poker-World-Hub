/**
 * HOME GAMES — START TABLE
 *   POST /api/home-games/tables/[tableId]/start
 *
 * Host-only. Flips status open_for_rsvp → running and materialises
 * commander_home_seats rows so the existing Commander tablet view can
 * render live seated players. Dan's spec #5/#6 — once running, Commander
 * owns seating.
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

    const tableId = String(req.query.tableId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(tableId)) {
      return res.status(400).json({ success: false, error: 'INVALID_TABLE_ID' });
    }

    const { error } = await supabase.rpc('rpc_hg_start_table', { p_table_id: tableId });
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

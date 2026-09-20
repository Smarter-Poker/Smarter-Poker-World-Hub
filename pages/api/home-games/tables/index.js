/**
 * HOME GAMES — TABLES
 *   GET  /api/home-games/tables?gameId=<uuid>   → list tables + reservations
 *   POST /api/home-games/tables                 → host creates additional table
 *
 * Calls rpc_hg_list_tables_and_reservations / rpc_hg_create_table.
 * Both enforce authz inside the RPC (member for read, staff for write).
 */
import { bridgeRequest, mapRpcError, LIMITS } from '../../../../src/lib/home-games/rpcBridge';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';

export default async function handler(req, res) {
  try {
    const method = req.method;
    const limit = method === 'GET' ? LIMITS.read : LIMITS.write;

    const bridge = await bridgeRequest(req, res, { method: ['GET', 'POST'], limit });
    if (!bridge.ok) {
      if (bridge._alreadyResponded) return;
      return res.status(bridge.status).json(bridge.body);
    }
    const { supabase } = bridge;

    if (method === 'GET') {
      const gameId = String(req.query.gameId || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(gameId)) {
        return res.status(400).json({ success: false, error: 'INVALID_GAME_ID' });
      }
      const { data, error } = await supabase.rpc('rpc_hg_list_tables_and_reservations', {
        p_game_id: gameId
      });
      if (error) {
        const m = mapRpcError(error);
        return res.status(m.status).json({ success: false, ...m });
      }
      return res.status(200).json({ success: true, data });
    }

    // POST — create a table
    const body = req.body || {};
    const gameId = String(body.gameId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(gameId)) {
      return res.status(400).json({ success: false, error: 'INVALID_GAME_ID' });
    }
    const maxSeats = parseInt(body.maxSeats, 10);
    if (!Number.isFinite(maxSeats) || maxSeats < 2 || maxSeats > 10) {
      return res.status(400).json({ success: false, error: 'INVALID_MAX_SEATS' });
    }
    const gameType = String(body.gameType || 'NLH').slice(0, 50);
    const stakes   = body.stakes ? String(body.stakes).slice(0, 100) : null;
    const format   = ['cash', 'tournament', 'sitngo', 'mixed'].includes(body.format) ? body.format : 'cash';
    const buyinMin = body.buyinMin != null ? parseInt(body.buyinMin, 10) : null;
    const buyinMax = body.buyinMax != null ? parseInt(body.buyinMax, 10) : null;
    const name     = body.name ? String(body.name).slice(0, 60) : null;

    const { data, error } = await supabase.rpc('rpc_hg_create_table', {
      p_game_id:   gameId,
      p_game_type: gameType,
      p_stakes:    stakes,
      p_format:    format,
      p_buyin_min: Number.isFinite(buyinMin) ? buyinMin : null,
      p_buyin_max: Number.isFinite(buyinMax) ? buyinMax : null,
      p_max_seats: maxSeats,
      p_name:      name
    });
    if (error) {
      const m = mapRpcError(error);
      return res.status(m.status).json({ success: false, ...m });
    }
    return res.status(201).json({ success: true, tableId: data });
  } catch (err) {
    reportApiError?.(err, req);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

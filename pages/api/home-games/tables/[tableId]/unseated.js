/**
 * HOME GAMES — UNSEATED CONFIRMED PLAYERS
 *   GET /api/home-games/tables/[tableId]/unseated
 *
 * Staff-only. Returns players who RSVP'd yes to this table's parent GAME but
 * hold no seat at any of that game's tables.
 *
 * WHY THIS EXISTS (audit 2026-08-12)
 * rpc_hg_start_table deliberately seats only players who hold a seat
 * reservation. That is correct: an RSVP ("I am coming", per game) and a seat
 * reservation ("I am in seat 4", per table) are separate steps by design —
 * either the player claims a seat or the host places them from the roster.
 * Auto-seating every yes-RSVP would invent policy the product does not
 * define, since a game can have several tables.
 *
 * The risk is a UX one, and it is live rather than theoretical: production
 * currently holds 8 yes-RSVPs and 0 seat reservations. Without this check a
 * host can start a table believing everyone who confirmed is seated, and
 * silently begin without them. Starting is irreversible.
 *
 * The host dashboard calls this immediately before POSTing .../start and
 * folds the count into the confirmation prompt. It is ADVISORY — a failure
 * here must never block the host from starting.
 *
 * Authorisation is enforced inside fn_home_game_unseated_confirmed (migration
 * phase57), which raises NOT_GROUP_STAFF for non-staff, so the attendee list
 * is not readable by ordinary members.
 */
import { bridgeRequest, mapRpcError, LIMITS } from '../../../../../src/lib/home-games/rpcBridge';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
    const bridge = await bridgeRequest(req, res, { method: 'GET', limit: LIMITS.read });
    if (!bridge.ok) {
      if (bridge._alreadyResponded) return;
      return res.status(bridge.status).json(bridge.body);
    }
    const { supabase } = bridge;

    const tableId = String(req.query.tableId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(tableId)) {
      return res.status(400).json({ success: false, error: 'INVALID_TABLE_ID' });
    }

    // Resolve the table's parent game. RSVPs are per-game, seats are
    // per-table, so the question "who confirmed but is not seated" is only
    // answerable at game scope.
    const { data: table, error: tableErr } = await supabase
      .from('commander_home_game_tables')
      .select('id, game_id')
      .eq('id', tableId)
      .maybeSingle();

    if (tableErr) {
      const m = mapRpcError(tableErr);
      return res.status(m.status).json({ success: false, ...m });
    }
    if (!table) {
      return res.status(404).json({ success: false, error: 'TABLE_NOT_FOUND' });
    }

    const { data, error } = await supabase.rpc('fn_home_game_unseated_confirmed', {
      p_game_id: table.game_id,
    });
    if (error) {
      const m = mapRpcError(error);
      return res.status(m.status).json({ success: false, ...m });
    }

    // Private per-user data — never cache at a shared edge.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ success: true, gameId: table.game_id, unseated: data || [] });
  } catch (err) {
    reportApiError?.(err, req);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

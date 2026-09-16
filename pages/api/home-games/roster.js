/**
 * HOME GAMES — ROSTER
 *   GET  /api/home-games/roster?groupId=<uuid>   → list approved members (user + roster-only)
 *   POST /api/home-games/roster                  → host adds a non-user roster member
 *   Body: { groupId, displayName, phone? }
 *
 * Dan's spec #7: hosts can add people who aren't on Smarter.Poker by name.
 * Those entries persist to the group's roster ("save to the list once added once")
 * and can subsequently be seated via /seat-member.
 */
import { bridgeRequest, mapRpcError, LIMITS } from '../../../src/lib/home-games/rpcBridge';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
      const groupId = String(req.query.groupId || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(groupId)) {
        return res.status(400).json({ success: false, error: 'INVALID_GROUP_ID' });
      }
      const { data, error } = await supabase.rpc('rpc_hg_list_roster', { p_group_id: groupId });
      if (error) {
        const m = mapRpcError(error);
        return res.status(m.status).json({ success: false, ...m });
      }
      return res.status(200).json({ success: true, data });
    }

    // POST — add roster member
    const body = req.body || {};
    const groupId = String(body.groupId || '').trim();
    const displayName = String(body.displayName || '').trim();
    const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
    if (!/^[0-9a-f-]{36}$/i.test(groupId)) {
      return res.status(400).json({ success: false, error: 'INVALID_GROUP_ID' });
    }
    if (!displayName || displayName.length > 120) {
      return res.status(400).json({ success: false, error: 'INVALID_DISPLAY_NAME' });
    }

    const { data, error } = await supabase.rpc('rpc_hg_host_add_roster_member', {
      p_group_id:     groupId,
      p_display_name: displayName,
      p_phone:        phone
    });
    if (error) {
      const m = mapRpcError(error);
      return res.status(m.status).json({ success: false, ...m });
    }
    return res.status(201).json({ success: true, memberId: data });
  } catch (err) {
    reportApiError?.(err, req);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

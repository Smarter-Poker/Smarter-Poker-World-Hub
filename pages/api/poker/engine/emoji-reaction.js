import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Emoji Reaction API — Auth-Hardened
 * POST /api/poker/engine/emoji-reaction
 * Body: { tableId, seatIndex, emoji }
 *
 * Allows a player to send a floating emoji reaction visible to all spectators.
 * Requires Bearer auth token.
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}





export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'POST only' });
    }

    // ═══ AUTH GATE ═══
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Missing token' });

    let userId;
    try {
      
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });
      userId = user.id;
    } catch {
      return res.status(401).json({ error: 'Auth failed' });
    }

    const { tableId, seatIndex, emoji } = req.body || {};

    if (!tableId || seatIndex === undefined) {
      return res.status(400).json({ error: 'tableId and seatIndex required' });
    }

    const ALLOWED_EMOJIS = ['🔥', '👏', '😤', '😂', '💎', '🏆', '❤️', '👀', '🤔', '😎'];
    const safeEmoji = ALLOWED_EMOJIS.includes(emoji) ? emoji : '🔥';

    try {
      const { getController } = require('../../../../src/lib/poker-engine/GameController');
      let controller;
      try {
        controller = await getController();
      } catch {
        return res.status(503).json({ error: 'Engine not initialized' });
      }

      const entry = controller.lobby?.tables?.get(tableId);
      if (!entry || !entry.table) {
        return res.status(404).json({ error: 'Table not found' });
      }

      // Verify user is at the table
      const state = entry.table.getState(null);
      const isSeated = (state.seats || []).some(s => String(s.player?.id) === String(userId));
      if (!isSeated) {
        return res.status(403).json({ error: 'Not seated at table' });
      }

      entry.table.emit('emoji_reaction', { emoji: safeEmoji, seatIndex, userId });

      return res.status(200).json({ ok: true, emoji: safeEmoji });
    } catch (err) {
      console.warn('[emoji-reaction] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

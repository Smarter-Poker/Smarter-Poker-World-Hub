import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
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
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // ═══ POST: Persist a hand ═══
    if (req.method === 'POST') {
      const { tableId, hand } = req.body || {};
      if (!tableId || !hand) return res.status(400).json({ error: 'tableId and hand required' });
      try {
        // 2026-08-15 CHECK 13: the old upsert wrote hand_id/user_id/hand_data/
        // pot_total — none exist on hand_history (and there is no
        // (hand_id,user_id) unique constraint), so every POST 42703'd and no
        // hand was ever recorded here. Now writes the real row shape used by
        // src/lib/poker-engine/HandHistory.js (players/winners carry userId
        // keys; the full hand record is preserved as JSON in summary).
        const players = Array.isArray(hand.players)
          ? hand.players.map(p => ({
              userId: p.userId || p.id || p.playerId,
              username: p.username || p.displayName || p.name || null,
              seat: p.seat ?? p.seatIndex ?? null,
              stack: p.stack ?? p.endStack ?? p.startStack ?? null,
            }))
          : [];
        const winners = Array.isArray(hand.winners)
          ? hand.winners.map(w => ({
              userId: w.userId || w.id || w.playerId,
              amount: w.amount ?? 0,
            }))
          : [];
        const { error: err_hand_history_8sdl8 } = await getSupabase().from('hand_history').insert({
          table_id: tableId,
          hand_number: hand.handNumber ?? hand.hand_number ?? null,
          game_variant: hand.gameVariant || hand.variant || 'nlhe',
          players,
          winners,
          board: hand.board || [],
          summary: JSON.stringify(hand),
          pot_size: hand.potTotal || 0,
          rake_amount: hand.rake || 0,
          source: 'engine-api',
          started_at: hand.startedAt || new Date().toISOString(),
          ended_at: hand.endedAt || new Date().toISOString(),
        });
        if (err_hand_history_8sdl8) console.warn('[Supabase] Silent mutation failed in hand_history:', err_hand_history_8sdl8.message);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.warn('[hand-history] POST error:', err);
        return res.status(500).json({ error: 'Failed to save hand' });
      }
    }

    // ═══ GET: Fetch hands ═══

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const tableId = safeQ(req.query.tableId);
    const page = safeQ(req.query.page) || '0';
    const limit = safeQ(req.query.limit) || '20';
    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    const offset = parseInt(page) * parseInt(limit);
    const lim = Math.min(parseInt(limit) || 20, 50);

    try {
      const { data, error, count } = await getSupabase()
        .from('hand_history')
        .select('*', { count: 'exact' })
        .eq('table_id', tableId)
        .order('created_at', { ascending: false })
        .range(offset, offset + lim - 1);

      if (error) {
        console.warn('[hand-history] Query error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch hand history' });
      }

      // Filter to only include hands where this player participated
      const playerHands = (data || []).filter(h => {
        const players = h.players || [];
        return players.some(p => String(p.userId) === String(user.id) || String(p.id) === String(user.id) || String(p.playerId) === String(user.id));
      });

      return res.status(200).json({
        hands: playerHands,
        total: count || 0,
        page: parseInt(page),
        limit: lim,
      });
    } catch (err) {
      console.warn('[hand-history] Error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

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

    const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // ═══ POST: Persist a hand ═══
    if (req.method === 'POST') {
      const { tableId, hand } = req.body || {};
      if (!tableId || !hand) return res.status(400).json({ error: 'tableId and hand required' });
      try {
        const { error: err_hand_history_8sdl8 } = await getSupabase().from('hand_history').upsert({
          hand_id: hand.handId || `${tableId}-${Date.now()}`,
          table_id: tableId,
          user_id: user.id,
          hand_data: hand,
          pot_total: hand.potTotal || 0,
          created_at: new Date().toISOString(),
        }, { onConflict: 'hand_id,user_id' });
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
        const players = h.players || h.hand_data?.players || [];
        return players.some(p => String(p.id) === String(user.id) || String(p.playerId) === String(user.id));
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

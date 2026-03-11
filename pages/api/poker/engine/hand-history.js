import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = supabaseAdmin;
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { tableId, page = '0', limit = '20' } = req.query;
  if (!tableId) return res.status(400).json({ error: 'tableId required' });

  const offset = parseInt(page) * parseInt(limit);
  const lim = Math.min(parseInt(limit) || 20, 50);

  try {
    const { data, error, count } = await supabase
      .from('hand_histories')
      .select('*', { count: 'exact' })
      .eq('table_id', tableId)
      .order('created_at', { ascending: false })
      .range(offset, offset + lim - 1);

    if (error) {
      console.error('[hand-history] Query error:', error.message);
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
    console.error('[hand-history] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

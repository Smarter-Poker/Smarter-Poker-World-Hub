/**
 * /api/club-arena/clubs/[clubId]/hands — Hand history queries
 * 
 * GET ?tableId=...&limit=50&offset=0  → List hands
 * GET ?handId=...                       → Single hand detail
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, handId, tableId, limit = 50, offset = 0 } = req.query;

  // Verify membership
  const { data: membership } = await supabase
    .from('club_members')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!membership) return res.status(403).json({ error: 'Not a member' });

  // Single hand detail
  if (handId) {
    const { data: hand, error } = await supabase
      .from('club_hand_histories')
      .select('*')
      .eq('id', handId)
      .eq('club_id', clubId)
      .single();

    if (error || !hand) return res.status(404).json({ error: 'Hand not found' });
    return res.json({ hand });
  }

  // List hands
  let query = supabase
    .from('club_hand_histories')
    .select('id, table_id, hand_number, game_variant, small_blind, big_blind, pot_total, rake, winners, played_at')
    .eq('club_id', clubId)
    .order('played_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (tableId) {
    query = query.eq('table_id', tableId);
  }

  const { data: hands, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ hands: hands || [] });
}

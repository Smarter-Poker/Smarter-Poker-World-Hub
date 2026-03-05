import { createClient } from '@supabase/supabase-js';
import { guardUser } from '../../../../src/lib/commander/auth';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const _u = await guardUser(req, res); if (!_u) return;

  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { data: standings, error } = await supabase
    .from('commander_league_standings')
    .select('*, commander_leagues!inner(id, name, venue_id, season, status)')
    .eq('player_id', _u.id)
    .order('created_at', { ascending: false })
        .limit(100);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, data: { leagues: standings } });
}

import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../../utils/supabase/mlb';

// Full player detail comes from one engine RPC (get_mlb_player_detail) that returns:
//   { type, player, season (full fg_season stat line), profile (sim_rates + streaks),
//     matchup (today's opponent, probable pitcher, batter-vs-pitcher / pitcher-vs-team) }
// All sourced from the engine's daily-refreshed tables.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  // player_id is a bigint. Reject non-numeric up front (400, not a 500 from a bad cast).
  if (!id || typeof id !== 'string' || !/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid player ID' });
  }

  try {
    const mlbDb = getMlbSupabase();
    const { data, error } = await mlbDb.rpc('get_mlb_player_detail', { p_id: Number(id) });

    if (error) {
      console.error('[MLB Player Detail] rpc error:', error);
      return res.status(500).json({ error: 'Internal server error fetching player' });
    }

    // RPC returns null (no row) when the id does not exist.
    if (!data || !data.player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching player detail:', err);
    return res.status(500).json({ error: 'Internal server error fetching player' });
  }
}

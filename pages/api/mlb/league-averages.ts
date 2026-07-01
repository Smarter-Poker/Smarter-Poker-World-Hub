import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

// League-average stat lines (qualified players) used by the player detail page to
// color each stat green/red vs the league. Non-critical: on any failure we return
// empty objects so the page simply renders without coloring. Cached 1h.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const mlbDb = getMlbSupabase();
    const { data, error } = await mlbDb.rpc('get_mlb_league_averages');
    if (error) {
      console.error('[MLB League Averages] rpc error:', error);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json({ hitter: {}, pitcher: {} });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data || { hitter: {}, pitcher: {} });
  } catch (err) {
    console.error('[MLB League Averages] error:', err);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ hitter: {}, pitcher: {} });
  }
}

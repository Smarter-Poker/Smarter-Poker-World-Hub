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
    // Read the cache table directly. The old get_mlb_league_averages RPC references the
    // dropped mlb_league_averages relation (42P01) so it ALWAYS errored and this route
    // silently served empty objects — killing stat coloring on every player page.
    const { data, error } = await mlbDb
      .from('mlb_league_avg_cache')
      .select('payload')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[MLB League Averages] query error:', error);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json({ hitter: {}, pitcher: {} });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json((data as any)?.payload || { hitter: {}, pitcher: {} });
  } catch (err) {
    console.error('[MLB League Averages] error:', err);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ hitter: {}, pitcher: {} });
  }
}

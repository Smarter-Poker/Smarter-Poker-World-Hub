import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

async function fetchAllRows(build: () => any, pageSize = 1000, maxRows = 20000): Promise<any[]> {
  let all: any[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. CORS Preflight & Method Check
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).json({ fetchError: true, data: [] });
  }

  try {
    const mlbDb = getMlbSupabase();
    // Use fetchAllRows and query the view directly to bypass the 1000-row PostgREST limit
    // and avoid overloaded RPC ambiguity. Exclude pure pitchers — the view contains
    // every player with a bat profile (575+ pitchers) which polluted the hitters
    // directory (Verlander listed as a hitter) and doubled the payload. Two-way
    // players (TWP) are kept.
<<<<<<< Updated upstream
    const data = await fetchAllRows(() => mlbDb.from('v_hitter_profile').select('*').neq('position', 'P'));
=======
    const data = await fetchAllRows(() =>
      mlbDb.from('v_hitter_profile').select('*').neq('position', 'P')
    );
>>>>>>> Stashed changes

    // Success: Cache heavily
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ fetchError: false, data: Array.isArray(data) ? data : [] });
  } catch (err: any) {
    console.error('API Error:', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ fetchError: true, data: [] });
  }
}

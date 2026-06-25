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
    const data = await fetchAllRows(() => mlbDb.from('v_pitcher_profile').select('*'));

    // Success: Compute K/IP and K/G for each pitcher
    const enrichedData = Array.isArray(data) ? data.map(p => {
      const ip = Number(p.ip || 0);
      const so = Number(p.k || p.so || 0);
      const gCount = Number(p.gs) > 0 ? Number(p.gs) : Number(p.g || 0);
      return {
        ...p,
        k_per_ip: ip > 0 ? (so / ip) : null,
        k_per_g: gCount > 0 ? (so / gCount) : null
      };
    }) : [];

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ fetchError: false, data: enrichedData });
  } catch (err: any) {
    console.error('API Error:', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ fetchError: true, data: [] });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

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
    // Pass query params explicitly to the RPC if pagination is eventually added
    const { data, error } = await mlbDb.rpc('get_mlb_pitcher_directory', {
      // Future-proofing for param passing: limit: req.query.limit, etc.
    });

    if (error) {
      console.error('[MLB Pitchers] directory failed:', error);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ fetchError: true, data: [] });
    }

    // Success: Compute K/IP and K/G for each pitcher
    const enrichedData = Array.isArray(data) ? data.map(p => {
      const ip = Number(p.ip || 0);
      const so = Number(p.k || p.so || 0);
      const gCount = Number(p.gs) > 0 ? Number(p.gs) : Number(p.g || 0);
      return {
        ...p,
        k_per_ip: ip > 0 ? Number((so / ip).toFixed(2)) : null,
        k_per_g: gCount > 0 ? Number((so / gCount).toFixed(2)) : null
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

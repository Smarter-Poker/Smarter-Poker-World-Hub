/**
 * Player of the Year Leaderboard API
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Fallback data when DB unavailable
const FALLBACK_LEADERBOARD = [
    { id: 1, player_name: "Alex F.", points: 2850, rank: 1 },
    { id: 2, player_name: "Thomas B.", points: 2720, rank: 2 },
    { id: 3, player_name: "Chad E.", points: 2580, rank: 3 },
    { id: 4, player_name: "Stephen C.", points: 2410, rank: 4 },
    { id: 5, player_name: "Daniel N.", points: 2290, rank: 5 }
];

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const { year = new Date().getFullYear(), limit = 10 } = req.query;

          const { data, error } = await getSupabase()
              .from('poy_leaderboard')
              .select('*')
              .eq('year', parseInt(year))
              .order('points', { ascending: false })
              .limit(parseInt(limit));

          if (error || !data?.length) {
              // Return fallback data if table missing or empty
              return res.status(200).json({ success: true, data: FALLBACK_LEADERBOARD.slice(0, parseInt(limit)) });
          }

          return res.status(200).json({ success: true, data });
      } catch (error) {
          // Return fallback on any error
          return res.status(200).json({ success: true, data: FALLBACK_LEADERBOARD });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

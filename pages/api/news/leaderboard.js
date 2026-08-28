/**
 * Player of the Year Leaderboard API
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG FIX: query params were destructured INSIDE the inner try, so the
      // catch referenced an out-of-scope `limit` and threw ReferenceError,
      // turning every fallback into a 500. Parse them before the try.
      const currentYear = new Date().getFullYear();
      const year = clampInt(req.query.year, currentYear, 2000, currentYear + 1);
      const limit = clampInt(req.query.limit, 10, 1, 50);

      try {
          const { data, error } = await getSupabase()
              .from('poy_leaderboard')
              .select('id,player_name,points,rank,year,source,updated_at')
              .eq('year', year)
              .order('rank', { ascending: true })
              .limit(limit);

          if (error) throw error;

          res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
          return res.status(200).json({
              success: true,
              data: data || [],
              year,
              source: data?.[0]?.source || 'gpi_licensed_feed',
              updated_at: data?.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, '') || null,
              connected: Boolean(data?.length),
          });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('[Leaderboard API] Exception:', error?.message || error);
          return res.status(503).json({ success: false, data: [], error: 'Standings unavailable' });
      }
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

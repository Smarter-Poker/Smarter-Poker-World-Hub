/**
 * Weekly Spot Challenge API
 * GET: Returns the current week's challenge scenario
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { getTodayCST } from '../../../../src/lib/trivia/getTodayCST';
import { CURATED_WEEKLY_SPOTS as CURATED_SPOTS } from '../../../../src/lib/personal-assistant/weeklySpotCatalog';

// NOTE: Removed edge runtime · this handler uses Node.js Pages Router API (req.query/res.status/etc)
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





export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Rate limit before any DB work. The edge cache below only protects the
      // DB for requests that actually hit the CDN · a unique query string per
      // request busts it and reaches this handler every time, so the read
      // bucket is the real floor for an unauthenticated endpoint.
      if (!applyRateLimit(req, res, LIMITS.read || { max: 60, windowMs: 60_000 })) return;

      const supabase = getSupabase();

      // Weekly spot is static, refreshed once/day · cache 1 hour at edge
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

      try {
          // Try to fetch from DB first · getSupabase() already falls back to the
          // anon key, so no env guard is needed (and referencing undefined env
          // consts here previously threw, killing the whole DB path).
          const today = getTodayCST(); // Phase 77 · CST anchor: weekly spot rotation matches user's local week boundary

          const { data, error } = await supabase
              .from('sandbox_weekly_spots')
              .select('*')
              .lte('week_start', today)
              .order('week_start', { ascending: false })
              .limit(1);

          if (error && error.code !== '42P01') {
              console.warn('[weekly-spot] Query error:', error.message);
          }

          if (!error && data && data.length > 0) {
              return res.status(200).json({ spot: data[0], source: 'database' });
          }

          // Fallback: use curated spots based on week number
          const weekNum = Math.floor((Date.now() - new Date('2026-01-01T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000));
          const spot = CURATED_SPOTS[((weekNum % CURATED_SPOTS.length) + CURATED_SPOTS.length) % CURATED_SPOTS.length];

          return res.status(200).json({ spot, source: 'curated' });
      } catch (err) {
          console.warn('Weekly spot error:', err);
          // Always return a spot, even on error
          return res.status(200).json({ spot: CURATED_SPOTS[0], source: 'fallback' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

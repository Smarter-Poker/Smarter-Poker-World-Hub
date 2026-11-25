/**
 * Weekly Spot Challenge API
 * GET: Returns the current week's challenge scenario (strictly omitting answer key)
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { getTodayCST } from '../../../../src/lib/trivia/getTodayCST';
import { CURATED_WEEKLY_SPOTS as CURATED_SPOTS } from '../../../../src/lib/personal-assistant/weeklySpotCatalog';

// NOTE: Removed edge runtime · this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/** Never expose the grading answer key (`correct_action`) before submission. */
function stripAnswerKey(spot) {
    if (!spot || typeof spot !== 'object') return spot;
    const { correct_action: _hiddenAnswer, correctAction: _hiddenCamel, ...publicSpot } = spot;
    return publicSpot;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          res.setHeader('Cache-Control', 'no-store');
          return res.status(405).json({ error: 'Method not allowed' });
      }

      if (!applyRateLimit(req, res, LIMITS.read || { max: 60, windowMs: 60_000 })) return;

      try {
          const supabase = getSupabase();
          const today = getTodayCST();

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
              res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
              return res.status(200).json({ spot: stripAnswerKey(data[0]), source: 'database' });
          }

          const weekNum = Math.floor((Date.now() - new Date('2026-01-01T00:00:00Z').getTime()) / (7 * 24 * 60 * 60 * 1000));
          const spot = CURATED_SPOTS[((weekNum % CURATED_SPOTS.length) + CURATED_SPOTS.length) % CURATED_SPOTS.length];

          res.setHeader(
              'Cache-Control',
              error ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=7200',
          );
          return res.status(200).json({ spot: stripAnswerKey(spot), source: error ? 'fallback' : 'curated' });
      } catch (err) {
          console.warn('Weekly spot error:', err);
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({ spot: stripAnswerKey(CURATED_SPOTS[0]), source: 'fallback' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
      console.warn('[API Error]', err);
      res.setHeader('Cache-Control', 'no-store');
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

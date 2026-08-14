/**
 * GET /api/user/profile — the signed-in user's own profile.
 *
 * WHY THIS EXISTS
 * `pages/hub/commander/player-card.js` has always done:
 *
 *     useSWR('/api/user/profile', ...)
 *
 * but no such handler existed. The player card therefore never loaded any
 * data — and because the SWR fetcher maps a failed response to `null` rather
 * than throwing, it rendered as a permanently empty card instead of an error.
 * Found by the api-routes-exist guard on 2026-08-12.
 *
 * COLUMN SAFETY
 * The player card reads a wider set of fields than `profiles` actually has.
 * Verified against the live schema on 2026-08-12, `profiles` contains:
 *   id, username, display_name, full_name, avatar_url, created_at, tier, is_vip
 *
 * It does NOT contain: comp_balance, play_hours, total_hours, session_count,
 * total_sessions, achievements_count, badges, membership_tier.
 *
 * Those are returned as explicit nulls/zeros rather than being selected.
 * Selecting a column that does not exist makes PostgREST fail the WHOLE query
 * with 42703, which would empty the card completely — the same failure mode
 * that silently emptied the public home-game pages (audit H-2). Do not add a
 * field to the select list without confirming it exists.
 *
 * `membership_tier` is aliased from the real `tier` column, which is what the
 * card falls back to anyway.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Only columns confirmed to exist on public.profiles.
const PROFILE_FIELDS = 'id, username, display_name, full_name, avatar_url, created_at, tier, is_vip';

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[api/user/profile] profile query failed:', error.message);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    if (!data) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Private to this user — never cache at a shared edge.
    res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        // Alias for the card's preferred field name.
        membership_tier: data.tier ?? null,
        // Not backed by columns on `profiles` today. Returned explicitly so
        // the card renders zero-state rather than `undefined`. If these ever
        // gain a real source, populate them here — do NOT add them to
        // PROFILE_FIELDS unless the column genuinely exists.
        comp_balance: null,
        play_hours: null,
        total_hours: null,
        session_count: 0,
        total_sessions: 0,
        achievements_count: 0,
        badges: [],
      },
    });
  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[api/user/profile]', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}

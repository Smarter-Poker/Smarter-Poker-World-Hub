/**
 * GET /api/profile/hand-stats?user_id=<uuid>
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 8 "Discovery and the feed": the numbers behind the "At The Tables"
 * card on every public profile (src/components/profile/HandStatsCard.jsx).
 *
 * One call to public.fn_profile_hand_stats(uuid) (migration
 * 20260930170300_profile_hand_stats_rpc.sql): hands, sessions, active days,
 * biggest pot won and month-to-date hands over the last 30 days of
 * club_member_daily_stats. The function is service_role only, so this route
 * is the only way the numbers reach a browser, and it is the same path for
 * every profile: no auth, no viewer data, no is_horse branch. Horses are
 * players. The answer is an aggregate as public as profiles.total_hands_played
 * already is, so it is cacheable for five minutes.
 *
 * Answers:
 *   200 { success: true, stats }           Cache-Control: public, max-age=300
 *   400 { success: false, error }          missing or malformed user_id
 *   404 { success: false, error: 'Profile not found' }
 *   405 { success: false, error }          not GET
 *   429                                    applyRateLimit(req, res, LIMITS.read)
 *   503 { success: false, error: 'Stats temporarily unavailable' }
 *                                          the RPC (or the profile read) failed;
 *                                          the card hides itself on this
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

export const HAND_STATS_RPC = 'fn_profile_hand_stats';
export const HAND_STATS_CACHE_CONTROL = 'public, max-age=300';
export const HAND_STATS_UNAVAILABLE = 'Stats temporarily unavailable';
export const PROFILE_NOT_FOUND = 'Profile not found';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/** One query value as a string, or null when it is absent or not a string. */
function queryString(value) {
  if (Array.isArray(value)) value = value[0];
  return typeof value === 'string' ? value.trim() : null;
}

const toCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
const toAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The stats object the card receives, with every key present and typed,
 * whatever the RPC returned. Exported so the test can pin the shape.
 */
export function normalizeHandStats(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    hands30d: toCount(source.hands30d),
    sessions30d: toCount(source.sessions30d),
    daysActive30d: toCount(source.daysActive30d),
    biggestPotWon30d: toAmount(source.biggestPotWon30d),
    handsThisMonth: toCount(source.handsThisMonth),
    lastPlayed: typeof source.lastPlayed === 'string' && source.lastPlayed ? source.lastPlayed : null,
    computedAt: typeof source.computedAt === 'string' && source.computedAt ? source.computedAt : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  const userId = queryString(req.query?.user_id);
  if (!userId || !UUID_RE.test(userId)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ success: false, error: 'Valid user_id required' });
  }

  try {
    const supabase = getSupabase();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ success: false, error: HAND_STATS_UNAVAILABLE });
    }
    if (!profile) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ success: false, error: PROFILE_NOT_FOUND });
    }

    const { data, error } = await supabase.rpc(HAND_STATS_RPC, { p_user_id: userId });
    if (error || data == null) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ success: false, error: HAND_STATS_UNAVAILABLE });
    }

    res.setHeader('Cache-Control', HAND_STATS_CACHE_CONTROL);
    return res.status(200).json({ success: true, stats: normalizeHandStats(data) });
  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) {}
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ success: false, error: HAND_STATS_UNAVAILABLE });
  }
}

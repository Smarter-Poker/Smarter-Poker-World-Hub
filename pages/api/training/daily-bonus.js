/**
 * DAILY TRAINING BONUS API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Reports only persisted historical settlements. New daily-goal currency is
 * paused until it can be settled by a verified Training completion.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (req.method === 'POST') {
          return res.status(410).json({
              success: false,
              error: 'Daily bonuses can only be settled by verified server-owned Training completion.',
              code: 'TRAINING_DAILY_BONUS_VERIFIED_ATTEMPT_REQUIRED',
          });
      }
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const supabase = getSupabase();
      // Phase 76 — anchor "today" to America/Chicago, not UTC. Without this, a CST
      // user could claim the daily bonus at 5:59pm CST (UTC day N) and again at
      // 6:01pm CST (UTC day N+1) — two free claims in 3 minutes of wall-clock
      // time, because UTC ticks over at 6pm CST. Same drift class as Phase 73.
      const today = getTodayCST(); // YYYY-MM-DD in America/Chicago

      // ●● Auth: verify JWT identity (patched server client — local HMAC fast-path, GoTrue fallback) ●●
      const { user, error: authErr } = await getServerUserWithFallback(req, supabase);
      if (!user) {
          if (authErr === 'No token') return res.status(401).json({ success: false, error: 'Auth required' });
          return res.status(401).json({ success: false, error: 'Invalid token' });
      }
      const userId = user.id; // From JWT, not request

      // GET: Check if daily bonus is available
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'private, no-store');

          try {
              const { data: streak, error: streakError } = await supabase
                  .from('training_streaks')
                  .select('current_streak:authority_current_streak')
                  .eq('user_id', userId)
                  .maybeSingle();
              if (streakError) throw streakError;
              const currentStreak = Number(streak?.current_streak) || 0;

              // Check if already claimed today
              const { data: claimed, error: claimedError } = await supabase
                  .from('training_daily_bonus')
                  // 2026-08-15 CHECK 13 fix: diamonds_awarded is not a column (real:
                  // total_awarded; aliased to keep the response field). bonus_date was
                  // also phantom — added by migration 20260815_training_daily_bonus_
                  // bonus_date with the unique (user_id, bonus_date) index the atomic
                  // claim design always assumed. The daily bonus was unclaimable
                  // before this (0 rows ever written).
                  .select('claimed_at, diamonds_awarded:total_awarded')
                  .eq('user_id', userId)
                  .eq('bonus_date', today)
                  .maybeSingle();
              if (claimedError) throw claimedError;

              if (claimed) {
                  return res.status(200).json({
                      success: true,
                      available: false,
                      alreadyClaimed: true,
                      claimedAt: claimed.claimed_at,
                      diamondsAwarded: claimed.diamonds_awarded,
                      streakDays: currentStreak,
                  });
              }

              return res.status(200).json({
                  success: true,
                  available: false,
                  claimEnabled: false,
                  settlementStatus: 'verified_completion_required',
                  streakDays: currentStreak,
                  message: 'Daily Bonus Settlement Is Paused Until It Is Bound To A Verified Training Completion.'
              });

          } catch (error) {
              console.warn('[DailyBonus] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to check daily bonus' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

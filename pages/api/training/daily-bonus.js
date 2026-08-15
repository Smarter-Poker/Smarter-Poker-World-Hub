/**
 * DAILY TRAINING BONUS API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Awards bonus diamonds for first training session each day
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyDailyBonus } from '../../../src/utils/trainingNotifications';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { safeAward } from '../../../src/lib/rewards/awardGuard';
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

// Base daily bonus amount
const BASE_DAILY_BONUS = 25;

// Streak bonuses (additional diamonds)
const STREAK_BONUSES = {
    3: 10,   // 3-day streak: +10 diamonds
    7: 25,   // 7-day streak: +25 diamonds
    14: 50,  // 14-day streak: +50 diamonds
    30: 100, // 30-day streak: +100 diamonds
};

export default async function handler(req, res) {
  try {
      withTiming(res);
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
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
          res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

          try {
              // Check if already claimed today
              const { data: claimed } = await supabase
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

              if (claimed) {
                  return res.status(200).json({
                      success: true,
                      available: false,
                      alreadyClaimed: true,
                      claimedAt: claimed.claimed_at,
                      diamondsAwarded: claimed.diamonds_awarded
                  });
              }

              // Get current streak for bonus calculation
              const { data: streak } = await supabase
                  .from('training_streaks')
                  .select('current_streak')
                  .eq('user_id', userId)
                  .maybeSingle();

              const currentStreak = streak?.current_streak || 0;

              // Calculate streak bonus
              let streakBonus = 0;
              for (const [threshold, bonus] of Object.entries(STREAK_BONUSES || {})) {
                  if (currentStreak >= parseInt(threshold, 10)) {
                      streakBonus = bonus;
                  }
              }

              const totalBonus = BASE_DAILY_BONUS + streakBonus;

              return res.status(200).json({
                  success: true,
                  available: true,
                  baseBonus: BASE_DAILY_BONUS,
                  streakBonus,
                  streakDays: currentStreak,
                  totalBonus,
                  nextStreakBonus: getNextStreakBonus(currentStreak)
              });

          } catch (error) {
              console.warn('[DailyBonus] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to check daily bonus' });
          }
      }

      // POST: Claim daily bonus (called after first session of the day)
      if (req.method === 'POST') {
          const bodySize = JSON.stringify(req.body || {}).length;
          if (bodySize > 5120) return res.status(413).json({ success: false, error: 'Request body too large' });
          const { claimNow } = req.body;

          try {
              // Check if already claimed today
              const { data: existing } = await supabase
                  .from('training_daily_bonus')
                  .select('id')
                  .eq('user_id', userId)
                  .eq('bonus_date', today)
                  .maybeSingle();

              if (existing) {
                  return res.status(200).json({
                      success: true,
                      alreadyClaimed: true,
                      message: 'Daily bonus already claimed for today'
                  });
              }

              // Get current streak for bonus calculation
              const { data: streak } = await supabase
                  .from('training_streaks')
                  .select('current_streak')
                  .eq('user_id', userId)
                  .maybeSingle();

              const currentStreak = streak?.current_streak || 0;

              // Calculate streak bonus
              let streakBonus = 0;
              for (const [threshold, bonus] of Object.entries(STREAK_BONUSES || {})) {
                  if (currentStreak >= parseInt(threshold, 10)) {
                      streakBonus = bonus;
                  }
              }

              const totalBonus = BASE_DAILY_BONUS + streakBonus;

              // BUG #269 FIX: Atomic insert with error check before awarding diamonds.
              // Previous code did check→insert→award without verifying insert succeeded,
              // allowing concurrent requests to both award diamonds.
              const { error: claimInsertErr } = await supabase
                  .from('training_daily_bonus')
                  .insert({
                      user_id: userId,
                      bonus_date: today,
                      total_awarded: totalBonus,
                      base_bonus: BASE_DAILY_BONUS,
                      streak_bonus: streakBonus,
                      streak_days: currentStreak
                  });

              if (claimInsertErr) {
                  if (claimInsertErr.code === '23505') {
                      return res.status(200).json({
                          success: true,
                          alreadyClaimed: true,
                          message: 'Daily bonus already claimed for today'
                      });
                  }
                  console.warn('[DailyBonus] Insert error:', claimInsertErr);
                  throw claimInsertErr;
              }

              // Award via award_diamonds_v2 (daily_bonus catalog key).
              // Variable amount is passed in metadata.bonus_diamonds.
              // The 3,750 ◆/month per-family ceiling and 2.5M platform breaker
              // are enforced by the SQL function; the old add_diamonds_to_balance
              // call bypassed both.
              const { ok: rpcOk, error: rpcErr } = await safeAward(supabase, {
                  p_user_id: userId,
                  p_action_key: 'daily_bonus',
                  p_reference_id: `daily_bonus_${userId}_${today}`,
                  p_metadata: {
                      bonus_diamonds: totalBonus,
                      base_bonus: BASE_DAILY_BONUS,
                      streak_bonus: streakBonus,
                      streak_day: currentStreak,
                      _source: 'api/training/daily-bonus',
                  },
              });

              if (!rpcOk) {
                  // Roll back the daily-bonus claim row so the user can retry. The unique
                  // constraint on (user_id, bonus_date) would otherwise lock them out.
                  try {
                      const { error: err_training_daily_bonus_vl5km } = await supabase
                        .from('training_daily_bonus')
                        .delete()
                          .eq('user_id', userId)
                          .eq('bonus_date', today);
                      if (err_training_daily_bonus_vl5km) console.warn('[Supabase] Silent mutation failed in training_daily_bonus:', err_training_daily_bonus_vl5km.message);
                  } catch (rbErr) {
                      console.warn('[DailyBonus] Rollback delete failed:', rbErr?.message || rbErr);
                  }
                  console.warn('[DailyBonus] Diamond RPC failed (rolled back so user can retry):', rpcErr);
                  return res.status(500).json({ success: false, error: 'Failed to credit daily bonus — please retry' });
              }

              // Send push notification if not called during session
              if (claimNow) {
                  await notifyDailyBonus(userId, totalBonus)
                      .catch(e => console.warn('[DailyBonus] Push failed:', e.message));
              }

              return res.status(200).json({
                  success: true,
                  claimed: true,
                  baseBonus: BASE_DAILY_BONUS,
                  streakBonus,
                  streakDays: currentStreak,
                  totalAwarded: totalBonus,
                  message: `+${totalBonus}diamonds Daily Bonus claimed!`
              });

          } catch (error) {
              console.warn('[DailyBonus] Claim error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to claim daily bonus' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// Helper to get next streak bonus milestone
function getNextStreakBonus(currentStreak) {
    for (const [threshold, bonus] of Object.entries(STREAK_BONUSES || {})) {
        if (currentStreak < parseInt(threshold, 10)) {
            return {
                daysUntil: parseInt(threshold, 10) - currentStreak,
                threshold: parseInt(threshold, 10),
                bonus
            };
        }
    }
    return null; // Already at max
}

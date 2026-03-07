/**
 * 🎁 DAILY TRAINING BONUS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards bonus diamonds for first training session each day
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyDailyBonus } from '../../../src/utils/trainingNotifications';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = user.id; // From JWT, not request

    // GET: Check if daily bonus is available
    if (req.method === 'GET') {

        try {
            // Check if already claimed today
            const { data: claimed } = await supabase
                .from('training_daily_bonus')
                .select('*')
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
            for (const [threshold, bonus] of Object.entries(STREAK_BONUSES)) {
                if (currentStreak >= parseInt(threshold)) {
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
            console.error('[DailyBonus] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to check daily bonus' });
        }
    }

    // POST: Claim daily bonus (called after first session of the day)
    if (req.method === 'POST') {
        const { claimNow } = req.body;

        try {
            // Check if already claimed today
            const { data: existing } = await supabase
                .from('training_daily_bonus')
                .select('*')
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
            for (const [threshold, bonus] of Object.entries(STREAK_BONUSES)) {
                if (currentStreak >= parseInt(threshold)) {
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
                    diamonds_awarded: totalBonus,
                    streak_bonus: streakBonus
                });

            if (claimInsertErr) {
                if (claimInsertErr.code === '23505') {
                    return res.status(200).json({
                        success: true,
                        alreadyClaimed: true,
                        message: 'Daily bonus already claimed for today'
                    });
                }
                console.error('[DailyBonus] Insert error:', claimInsertErr);
                throw claimInsertErr;
            }

            // Award diamonds via logging RPC
            await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: totalBonus,
                p_type: 'daily_bonus',
                p_description: streakBonus > 0
                    ? `Daily bonus (${BASE_DAILY_BONUS}💎) + ${currentStreak}-day streak bonus (${streakBonus}💎)`
                    : `Daily training bonus — ${totalBonus}💎`,
                p_reference_id: null
            });

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
                message: `+${totalBonus}💎 Daily Bonus claimed!`
            });

        } catch (error) {
            console.error('[DailyBonus] Claim error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to claim daily bonus' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

// Helper to get next streak bonus milestone
function getNextStreakBonus(currentStreak) {
    for (const [threshold, bonus] of Object.entries(STREAK_BONUSES)) {
        if (currentStreak < parseInt(threshold)) {
            return {
                daysUntil: parseInt(threshold) - currentStreak,
                threshold: parseInt(threshold),
                bonus
            };
        }
    }
    return null; // Already at max
}

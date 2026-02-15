/**
 * 📅 DAILY LOGIN REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 5-50💎 for daily site login (scales with streak)
 * Uses diamond_reward_claims table for dedup
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Reward config — matches DiamondRewardService.ts REWARD_RULES
const LOGIN_REWARD = {
    MIN: 5,
    MAX: 50,
    INCREMENT: 7, // +7 per streak day
};

function calculateLoginDiamonds(streakDays) {
    return Math.min(LOGIN_REWARD.MIN + Math.max(0, streakDays - 1) * LOGIN_REWARD.INCREMENT, LOGIN_REWARD.MAX);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    // Get today in CST (matches existing daily-bonus convention)
    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // ── 1. Check if already claimed today ──
        const { data: existing } = await supabase
            .from('diamond_reward_claims')
            .select('id, diamonds_awarded')
            .eq('user_id', userId)
            .eq('reward_type', 'daily_login')
            .eq('claim_date', today)
            .maybeSingle();

        if (existing) {
            return res.status(200).json({
                success: true,
                alreadyClaimed: true,
                diamondsAwarded: existing.diamonds_awarded,
                message: 'Daily login already claimed today'
            });
        }

        // ── 2. Get / update login streak ──
        const { data: streakRow } = await supabase
            .from('diamond_reward_claims')
            .select('claim_date')
            .eq('user_id', userId)
            .eq('reward_type', 'daily_login')
            .order('claim_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        let streak = 1;
        if (streakRow) {
            const lastDate = new Date(streakRow.claim_date + 'T12:00:00');
            const todayDate = new Date(today + 'T12:00:00');
            const diffDays = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                // Consecutive day — count total consecutive claims
                const { count } = await supabase
                    .from('diamond_reward_claims')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userId)
                    .eq('reward_type', 'daily_login')
                    .gte('claim_date', new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                streak = (count || 0) + 1;
            }
            // If diffDays > 1, streak resets to 1
        }

        const diamondsAwarded = calculateLoginDiamonds(streak);

        // ── 3. Record the claim ──
        const { error: insertError } = await supabase
            .from('diamond_reward_claims')
            .insert({
                user_id: userId,
                reward_type: 'daily_login',
                diamonds_awarded: diamondsAwarded,
                claim_date: today,
                metadata: { streak, base: LOGIN_REWARD.MIN }
            });

        if (insertError) {
            console.error('[DailyLogin] Insert error:', insertError);
            throw insertError;
        }

        // ── 4. Award diamonds ──
        const { error: rpcError } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: diamondsAwarded,
            p_type: 'daily_login',
            p_description: streak > 1
                ? `Daily login reward (${streak}-day streak) — ${diamondsAwarded}💎`
                : `Daily login reward — ${diamondsAwarded}💎`,
            p_reference_id: null
        });

        if (rpcError) {
            console.error('[DailyLogin] RPC error:', rpcError);
            throw rpcError;
        }

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded,
            streak,
            message: `+${diamondsAwarded}💎 Daily Login Reward!`
        });

    } catch (error) {
        console.error('[DailyLogin] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim daily login reward' });
    }
}

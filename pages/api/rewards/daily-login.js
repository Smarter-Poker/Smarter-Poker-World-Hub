/**
 * 📅 DAILY LOGIN REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 5-50💎 for daily site login (scales with streak)
 * Uses diamond_reward_claims table for dedup
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 1 reward per calendar day (CST) enforced by unique index
 * - Account must be 1+ hours old (prevents signup-spam)
 * - IP/session dedup via client-side sessionStorage
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LOGIN_REWARD = {
    MIN: 5,
    MAX: 50,
    INCREMENT: 7,
};

function calculateLoginDiamonds(streakDays) {
    return Math.min(LOGIN_REWARD.MIN + Math.max(0, streakDays - 1) * LOGIN_REWARD.INCREMENT, LOGIN_REWARD.MAX);
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseKey) {
        console.error('[DailyLogin] Missing env vars:', { url: !!supabaseUrl, key: !!supabaseKey });
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Auth: JWT required (awards diamonds) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const userId = user.id; // From JWT, not body

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // ── SAFEGUARD 1: Account age check (1 hour minimum) ──
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (userProfile?.created_at) {
            const accountAge = now - new Date(userProfile.created_at);
            if (accountAge < 60 * 60 * 1000) {
                return res.status(200).json({
                    success: false,
                    message: 'Welcome! Daily login rewards start after your first hour.'
                });
            }
        }

        // ── SAFEGUARD 2: Already claimed today (dedup) ──
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

        // ── Calculate streak ──
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
                const { count } = await supabase
                    .from('diamond_reward_claims')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userId)
                    .eq('reward_type', 'daily_login')
                    .gte('claim_date', new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                streak = (count || 0) + 1;
            }
        }

        const diamondsAwarded = calculateLoginDiamonds(streak);

        // ── Record claim (unique index prevents double-claims) ──
        // Try with metadata column first, fall back without if column doesn't exist
        let insertError;
        const claimRow = {
            user_id: userId,
            reward_type: 'daily_login',
            diamonds_awarded: diamondsAwarded,
            claim_date: today,
        };

        // Attempt insert with metadata
        const result1 = await supabase
            .from('diamond_reward_claims')
            .insert({ ...claimRow, metadata: { streak, base: LOGIN_REWARD.MIN } });

        if (result1.error && result1.error.message?.includes('metadata')) {
            // metadata column doesn't exist — retry without it
            console.warn('[DailyLogin] metadata column missing, inserting without it');
            const result2 = await supabase
                .from('diamond_reward_claims')
                .insert(claimRow);
            insertError = result2.error;
        } else {
            insertError = result1.error;
        }

        if (insertError) {
            // Unique constraint violation = already claimed (race condition safe)
            if (insertError.code === '23505') {
                return res.status(200).json({
                    success: true,
                    alreadyClaimed: true,
                    message: 'Daily login already claimed today'
                });
            }
            console.error('[DailyLogin] Insert error:', insertError);
            throw insertError;
        }

        // ── Award diamonds ──
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

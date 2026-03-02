/**
 * 🧠 DAILY TRIVIA CHALLENGE REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 15💎 for completing the daily trivia challenge (any score!)
 * Uses diamond_reward_claims table for dedup
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 1 reward per calendar day (CST) enforced by unique index
 * - Account must be 24+ hours old
 * - Global 500💎 daily cap check
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TRIVIA_REWARD = 15;
const DAILY_GLOBAL_CAP = 500;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // ── Auth: JWT required (awards diamonds) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });


    const userId = authUser.id; // Use JWT identity
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // ── SAFEGUARD 1: Account age check (24 hours minimum) ──
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .single();

        if (userProfile?.created_at) {
            const accountAge = now - new Date(userProfile.created_at);
            if (accountAge < 24 * 60 * 60 * 1000) {
                return res.status(200).json({ claimed: false, reason: 'Account too new' });
            }
        }

        // ── SAFEGUARD 2: Already claimed today? ──
        const { data: existingClaim } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', 'daily_trivia')
            .eq('claim_date', today)
            .maybeSingle();

        if (existingClaim) {
            return res.status(200).json({ claimed: false, reason: 'Already claimed today', diamondsAwarded: 0 });
        }

        // ── SAFEGUARD 3: Global daily cap ──
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today);

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
        if (todayTotal >= DAILY_GLOBAL_CAP) {
            return res.status(200).json({ claimed: false, reason: 'Daily cap reached', diamondsAwarded: 0 });
        }

        const diamonds = Math.min(TRIVIA_REWARD, DAILY_GLOBAL_CAP - todayTotal);

        // ── INSERT CLAIM ──
        const { error: claimError } = await supabase
            .from('diamond_reward_claims')
            .insert({
                user_id: userId,
                reward_type: 'daily_trivia',
                diamonds_awarded: diamonds,
                claim_date: today,
                metadata: { source: 'daily_trivia_challenge' }
            });

        if (claimError) {
            // Unique constraint = already claimed
            if (claimError.code === '23505') {
                return res.status(200).json({ claimed: false, reason: 'Already claimed', diamondsAwarded: 0 });
            }
            throw claimError;
        }

        // ── CREDIT DIAMONDS (atomic: balance + transaction in one RPC) ──
        const { error: rpcError } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: diamonds,
            p_type: 'daily_trivia',
            p_description: `Daily Trivia Challenge reward — ${diamonds}💎`,
            p_reference_id: null
        });

        if (rpcError) {
            console.error('[DailyTrivia] RPC error:', rpcError);
        }

        return res.status(200).json({
            claimed: true,
            diamondsAwarded: diamonds,
            reward: 'daily_trivia'
        });

    } catch (error) {
        console.error('Daily trivia reward error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

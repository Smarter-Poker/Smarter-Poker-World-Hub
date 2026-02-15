/**
 * 👥 FOLLOW REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 5💎 for following a user (max 3 per day)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 3 rewards per day max
 * - 1-minute cooldown between follows
 * - Connection must exist in social_connections table
 * - Can't re-follow same user in same day
 * - 24h account age
 * - 500💎 daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FOLLOW_REWARD = 5;
const MAX_PER_DAY = 3;
const DAILY_CAP = 500;
const COOLDOWN_MINUTES = 1;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId, followingId } = req.body;

    if (!userId || !followingId) {
        return res.status(400).json({ error: 'userId and followingId required' });
    }

    if (userId === followingId) {
        return res.status(200).json({ success: false, message: 'Cannot follow yourself' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // SAFEGUARD 1: Account age (24h)
        const { data: profile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (profile?.created_at && (now - new Date(profile.created_at)) < 24 * 60 * 60 * 1000) {
            return res.status(200).json({ success: false, message: 'Account must be 24h old' });
        }

        // SAFEGUARD 2: Verify connection exists
        const { data: connection } = await supabase
            .from('social_connections')
            .select('id')
            .eq('follower_id', userId)
            .eq('following_id', followingId)
            .maybeSingle();

        if (!connection) {
            return res.status(200).json({ success: false, message: 'Follow connection not found' });
        }

        // SAFEGUARD 3: No double-claiming same follow target today
        const { data: existingClaim } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', 'follow')
            .eq('claim_date', today)
            .contains('metadata', { following_id: followingId })
            .maybeSingle();

        if (existingClaim) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Already earned for this follow today' });
        }

        // SAFEGUARD 4: Daily limit
        const { count } = await supabase
            .from('diamond_reward_claims')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('reward_type', 'follow')
            .eq('claim_date', today);

        if ((count || 0) >= MAX_PER_DAY) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: `Follow limit (${MAX_PER_DAY}/day) reached` });
        }

        // SAFEGUARD 5: Cooldown (1 min)
        const { data: lastClaim } = await supabase
            .from('diamond_reward_claims')
            .select('claimed_at')
            .eq('user_id', userId)
            .eq('reward_type', 'follow')
            .order('claimed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastClaim?.claimed_at && (now - new Date(lastClaim.claimed_at)) < COOLDOWN_MINUTES * 60 * 1000) {
            return res.status(200).json({ success: false, cooldown: true });
        }

        // SAFEGUARD 6: Daily cap
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral');

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
        if (todayTotal + FOLLOW_REWARD > DAILY_CAP) {
            return res.status(200).json({ success: false, dailyCapReached: true });
        }

        // Record & award
        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'follow',
            diamonds_awarded: FOLLOW_REWARD,
            claim_date: today,
            metadata: { following_id: followingId }
        });

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: FOLLOW_REWARD,
            p_type: 'follow',
            p_description: `Follow reward — ${FOLLOW_REWARD}💎`,
            p_reference_id: followingId
        });

        return res.status(200).json({ success: true, claimed: true, diamondsAwarded: FOLLOW_REWARD });

    } catch (error) {
        console.error('[FollowReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim follow reward' });
    }
}

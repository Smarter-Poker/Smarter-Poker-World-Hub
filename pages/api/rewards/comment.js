/**
 * 💬 STRATEGY COMMENT REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 5💎 for strategy comments (max 3 per day)
 * Subject to 500💎 daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COMMENT_REWARD = 5;
const MAX_PER_DAY = 3;
const DAILY_CAP = 500;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId, commentId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // Count today's comment claims
        const { count } = await supabase
            .from('diamond_reward_claims')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('reward_type', 'strategy_comment')
            .eq('claim_date', today);

        if ((count || 0) >= MAX_PER_DAY) {
            return res.status(200).json({
                success: true,
                alreadyClaimed: true,
                message: `Comment reward limit reached (${MAX_PER_DAY}/day)`
            });
        }

        // Check daily cap
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral');

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);

        if (todayTotal + COMMENT_REWARD > DAILY_CAP) {
            return res.status(200).json({
                success: false,
                dailyCapReached: true,
                message: `Daily diamond cap (${DAILY_CAP}💎) reached`
            });
        }

        // Record claim
        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'strategy_comment',
            diamonds_awarded: COMMENT_REWARD,
            claim_date: today,
            metadata: { comment_id: commentId || null }
        });

        // Award diamonds
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: COMMENT_REWARD,
            p_type: 'strategy_comment',
            p_description: `Strategy comment reward — ${COMMENT_REWARD}💎`,
            p_reference_id: commentId || null
        });

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded: COMMENT_REWARD,
            claimsToday: (count || 0) + 1,
            maxPerDay: MAX_PER_DAY,
            message: `+${COMMENT_REWARD}💎 Comment Reward!`
        });

    } catch (error) {
        console.error('[CommentReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim comment reward' });
    }
}

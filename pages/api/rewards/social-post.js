/**
 * 📝 SOCIAL POST REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 15💎 for creating a social post (max 1 per day)
 * Subject to 500💎 daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const POST_REWARD = 15;
const DAILY_CAP = 500;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId, postId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // Check if already claimed today
        const { data: existing } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', 'social_post')
            .eq('claim_date', today)
            .maybeSingle();

        if (existing) {
            return res.status(200).json({
                success: true,
                alreadyClaimed: true,
                message: 'Social post reward already claimed today'
            });
        }

        // Check daily cap (sum all non-cap-bypassing rewards today)
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral'); // Referrals bypass cap

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);

        if (todayTotal + POST_REWARD > DAILY_CAP) {
            return res.status(200).json({
                success: false,
                dailyCapReached: true,
                message: `Daily diamond cap (${DAILY_CAP}💎) reached`
            });
        }

        // Record claim
        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'social_post',
            diamonds_awarded: POST_REWARD,
            claim_date: today,
            metadata: { post_id: postId || null }
        });

        // Award diamonds
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: POST_REWARD,
            p_type: 'social_post',
            p_description: `Social post reward — ${POST_REWARD}💎`,
            p_reference_id: postId || null
        });

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded: POST_REWARD,
            message: `+${POST_REWARD}💎 Post Reward!`
        });

    } catch (error) {
        console.error('[SocialPostReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim social post reward' });
    }
}

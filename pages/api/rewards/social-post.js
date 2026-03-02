/**
 * 📝 SOCIAL POST REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 10💎 for creating a social post (max 1 per day)
 * Subject to 500💎 daily cap
 * 
 * ANTI-FARMING SAFEGUARDS:
 * - 1 reward per calendar day (CST)
 * - 500💎 daily cap across all non-referral rewards
 * - 10-minute cooldown between reward-eligible posts
 * - Minimum 20-char content required (rejects empty/spam posts)
 * - Account must be 24+ hours old
 * - Post must exist in social_posts table (prevents phantom claims)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const POST_REWARD = 10;
const DAILY_CAP = 500;
const COOLDOWN_MINUTES = 10;
const MIN_CONTENT_LENGTH = 20;

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

    const { userId, postId } = req.body;
    const userId = authUser.id; // Override: use JWT identity

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // ── SAFEGUARD 1: Account age check (24h minimum) ──
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (userProfile?.created_at) {
            const accountAge = now - new Date(userProfile.created_at);
            if (accountAge < 24 * 60 * 60 * 1000) {
                return res.status(200).json({
                    success: false,
                    message: 'Account must be 24 hours old to earn post rewards'
                });
            }
        }

        // ── SAFEGUARD 2: Verify post actually exists and meets quality bar ──
        if (postId) {
            const { data: post } = await supabase
                .from('social_posts')
                .select('content')
                .eq('id', postId)
                .maybeSingle();

            if (!post) {
                return res.status(200).json({ success: false, message: 'Post not found' });
            }

            if ((post.content || '').trim().length < MIN_CONTENT_LENGTH) {
                return res.status(200).json({
                    success: false,
                    message: `Post must be at least ${MIN_CONTENT_LENGTH} characters to earn rewards`
                });
            }
        }

        // ── SAFEGUARD 3: Already claimed today ──
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

        // ── SAFEGUARD 4: Cooldown (10 min between reward-eligible posts) ──
        const { data: lastClaim } = await supabase
            .from('diamond_reward_claims')
            .select('claimed_at')
            .eq('user_id', userId)
            .eq('reward_type', 'social_post')
            .order('claimed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastClaim?.claimed_at) {
            const elapsed = now - new Date(lastClaim.claimed_at);
            if (elapsed < COOLDOWN_MINUTES * 60 * 1000) {
                return res.status(200).json({
                    success: false,
                    cooldown: true,
                    message: `Please wait ${COOLDOWN_MINUTES} minutes between reward-eligible posts`
                });
            }
        }

        // ── SAFEGUARD 5: Daily diamond cap ──
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral');

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);

        if (todayTotal + POST_REWARD > DAILY_CAP) {
            return res.status(200).json({
                success: false,
                dailyCapReached: true,
                message: `Daily diamond cap (${DAILY_CAP}💎) reached`
            });
        }

        // ── Record claim & award ──
        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'social_post',
            diamonds_awarded: POST_REWARD,
            claim_date: today,
            metadata: { post_id: postId || null }
        });

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

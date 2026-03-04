/**
 * ❤️ REACTION REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 2💎 for liking/reacting to a post (max 10 per day)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 10 rewards per day max
 * - 30-second cooldown between reward-eligible reactions
 * - Cannot like own posts
 * - Interaction must exist in social_interactions table
 * - 24h account age
 * - 500💎 daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REACTION_REWARD = 2;
const MAX_PER_DAY = 10;
const DAILY_CAP = 500;
const COOLDOWN_SECONDS = 30;

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

    const { postId, interactionType } = req.body;
    const userId = authUser.id; // Use JWT identity

    if (!userId || !postId) {
        return res.status(400).json({ error: 'userId and postId required' });
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

        // SAFEGUARD 2: Cannot like own posts
        const { data: post } = await supabase
            .from('social_posts')
            .select('author_id')
            .eq('id', postId)
            .maybeSingle();

        if (post?.author_id === userId) {
            return res.status(200).json({ success: false, message: 'Cannot earn diamonds from own posts' });
        }

        // SAFEGUARD 3: Verify interaction exists
        const { data: interaction } = await supabase
            .from('social_interactions')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!interaction) {
            return res.status(200).json({ success: false, message: 'Interaction not found' });
        }

        // SAFEGUARD 4: Daily limit
        const { count } = await supabase
            .from('diamond_reward_claims')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('reward_type', 'reaction')
            .eq('claim_date', today);

        if ((count || 0) >= MAX_PER_DAY) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: `Reaction limit (${MAX_PER_DAY}/day) reached` });
        }

        // SAFEGUARD 5: Cooldown (30s)
        const { data: lastClaim } = await supabase
            .from('diamond_reward_claims')
            .select('claimed_at')
            .eq('user_id', userId)
            .eq('reward_type', 'reaction')
            .order('claimed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastClaim?.claimed_at && (now - new Date(lastClaim.claimed_at)) < COOLDOWN_SECONDS * 1000) {
            return res.status(200).json({ success: false, cooldown: true, message: 'Please wait before liking again for rewards' });
        }

        // SAFEGUARD 6: Daily cap
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral');

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
        if (todayTotal + REACTION_REWARD > DAILY_CAP) {
            return res.status(200).json({ success: false, dailyCapReached: true });
        }

        // Record & award
        // BUG #271 FIX: Check insert result before awarding diamonds
        const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'reaction',
            diamonds_awarded: REACTION_REWARD,
            claim_date: today,
            metadata: { post_id: postId, type: interactionType || 'like' }
        });

        if (claimErr) {
            if (claimErr.code === '23505') {
                return res.status(200).json({ success: true, alreadyClaimed: true });
            }
            throw claimErr;
        }

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: REACTION_REWARD,
            p_type: 'reaction',
            p_description: `Reaction reward — ${REACTION_REWARD}💎`,
            p_reference_id: postId
        });

        return res.status(200).json({ success: true, claimed: true, diamondsAwarded: REACTION_REWARD });

    } catch (error) {
        console.error('[ReactionReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim reaction reward' });
    }
}

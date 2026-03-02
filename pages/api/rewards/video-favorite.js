/**
 * ⭐ VIDEO FAVORITE REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 2💎 for favoriting a video (max 3 per day)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 3 rewards per day max
 * - 1-minute cooldown
 * - Same video can only earn once (lifetime)
 * - Favorite must exist in video_favorites table
 * - 500💎 daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FAV_REWARD = 2;
const MAX_PER_DAY = 3;
const DAILY_CAP = 500;
const COOLDOWN_MINUTES = 1;

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

    const { videoId } = req.body;
    const userId = authUser.id; // Use JWT identity

    if (!userId || !videoId) {
        return res.status(400).json({ error: 'userId and videoId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // Verify favorite exists
        const { data: fav } = await supabase
            .from('video_favorites')
            .select('id')
            .eq('user_id', userId)
            .eq('video_id', videoId)
            .maybeSingle();

        if (!fav) {
            return res.status(200).json({ success: false, message: 'Favorite not found' });
        }

        // Already claimed for this video (lifetime)
        const { data: videoClaim } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', 'video_favorite')
            .contains('metadata', { video_id: videoId })
            .maybeSingle();

        if (videoClaim) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Already earned for this video' });
        }

        // Daily limit
        const { count } = await supabase
            .from('diamond_reward_claims')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('reward_type', 'video_favorite')
            .eq('claim_date', today);

        if ((count || 0) >= MAX_PER_DAY) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: `Favorite limit (${MAX_PER_DAY}/day) reached` });
        }

        // Cooldown (1 min)
        const { data: lastClaim } = await supabase
            .from('diamond_reward_claims')
            .select('claimed_at')
            .eq('user_id', userId)
            .eq('reward_type', 'video_favorite')
            .order('claimed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastClaim?.claimed_at && (now - new Date(lastClaim.claimed_at)) < COOLDOWN_MINUTES * 60 * 1000) {
            return res.status(200).json({ success: false, cooldown: true });
        }

        // Daily cap
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral');

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
        if (todayTotal + FAV_REWARD > DAILY_CAP) {
            return res.status(200).json({ success: false, dailyCapReached: true });
        }

        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'video_favorite',
            diamonds_awarded: FAV_REWARD,
            claim_date: today,
            metadata: { video_id: videoId }
        });

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: FAV_REWARD,
            p_type: 'video_favorite',
            p_description: `Video favorite reward — ${FAV_REWARD}💎`,
            p_reference_id: videoId
        });

        return res.status(200).json({ success: true, claimed: true, diamondsAwarded: FAV_REWARD });

    } catch (error) {
        console.error('[VideoFavoriteReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim video favorite reward' });
    }
}

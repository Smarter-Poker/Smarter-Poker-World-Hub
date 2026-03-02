/**
 * 📤 SHARE REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 10💎 for sharing content/scores (max 1 per day)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 1 reward per day max
 * - 24h account age
 * - 500💎 daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SHARE_REWARD = 10;
const DAILY_CAP = 500;

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

    const { userId, shareType, contentId } = req.body;
    const userId = authUser.id; // Override: use JWT identity

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // Account age check
        const { data: profile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (profile?.created_at && (now - new Date(profile.created_at)) < 24 * 60 * 60 * 1000) {
            return res.status(200).json({ success: false, message: 'Account must be 24h old' });
        }

        // Already claimed today
        const { data: existing } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', 'share')
            .eq('claim_date', today)
            .maybeSingle();

        if (existing) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Share reward already claimed today' });
        }

        // Daily cap
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral');

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
        if (todayTotal + SHARE_REWARD > DAILY_CAP) {
            return res.status(200).json({ success: false, dailyCapReached: true });
        }

        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'share',
            diamonds_awarded: SHARE_REWARD,
            claim_date: today,
            metadata: { share_type: shareType || 'score_card', content_id: contentId || null }
        });

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: SHARE_REWARD,
            p_type: 'share',
            p_description: `Share reward — ${SHARE_REWARD}💎`,
            p_reference_id: contentId || null
        });

        return res.status(200).json({ success: true, claimed: true, diamondsAwarded: SHARE_REWARD });

    } catch (error) {
        console.error('[ShareReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim share reward' });
    }
}

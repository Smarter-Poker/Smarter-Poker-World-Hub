/**
 * 👤 PROFILE COMPLETION REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 50💎 ONE TIME for completing profile (avatar + bio + username)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - One-time claim only (lifetime)
 * - All 3 fields must be populated in profiles table
 * - Server-side verification of actual profile data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COMPLETION_REWARD = 50;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    try {
        // SAFEGUARD 1: Already claimed (lifetime, one-time reward)
        const { data: existing } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', 'profile_complete')
            .maybeSingle();

        if (existing) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Profile completion reward already claimed' });
        }

        // SAFEGUARD 2: Verify profile is actually complete
        const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url, bio')
            .eq('id', userId)
            .maybeSingle();

        if (!profile) {
            return res.status(200).json({ success: false, message: 'Profile not found' });
        }

        const hasUsername = profile.username && profile.username.trim().length >= 3;
        const hasAvatar = profile.avatar_url && profile.avatar_url.trim().length > 0;
        const hasBio = profile.bio && profile.bio.trim().length >= 10;

        if (!hasUsername || !hasAvatar || !hasBio) {
            const missing = [];
            if (!hasUsername) missing.push('username (3+ chars)');
            if (!hasAvatar) missing.push('profile picture');
            if (!hasBio) missing.push('bio (10+ chars)');
            return res.status(200).json({
                success: false,
                message: `Complete your profile to earn ${COMPLETION_REWARD}💎! Missing: ${missing.join(', ')}`
            });
        }

        // Record & award
        const now = new Date();
        const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'profile_complete',
            diamonds_awarded: COMPLETION_REWARD,
            claim_date: today,
            metadata: { username: profile.username, has_avatar: true, bio_length: profile.bio.trim().length }
        });

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: COMPLETION_REWARD,
            p_type: 'profile_complete',
            p_description: `Profile completion reward — ${COMPLETION_REWARD}💎`,
            p_reference_id: null
        });

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded: COMPLETION_REWARD,
            message: `+${COMPLETION_REWARD}💎 Profile Complete!`
        });

    } catch (error) {
        console.error('[ProfileCompleteReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim profile completion reward' });
    }
}

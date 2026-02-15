/**
 * 🏆 HENDONMOB LINK REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 25💎 ONE TIME for linking HendonMob profile
 *
 * ANTI-FARMING SAFEGUARDS:
 * - One-time claim only (lifetime)
 * - HendonMob URL must be populated in user profile
 * - Server-side verification of actual profile data
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HENDONMOB_REWARD = 25;

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
            .eq('reward_type', 'hendonmob_link')
            .maybeSingle();

        if (existing) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: 'HendonMob link reward already claimed' });
        }

        // SAFEGUARD 2: Verify HendonMob URL actually exists in profile
        // Check multiple possible column names for HendonMob
        const { data: profile } = await supabase
            .from('profiles')
            .select('hendonmob_url, hendon_mob_url, hendonmob_id, social_links')
            .eq('id', userId)
            .maybeSingle();

        if (!profile) {
            return res.status(200).json({ success: false, message: 'Profile not found' });
        }

        // Check for HendonMob in any recognized field
        const hendonmobValue = profile.hendonmob_url
            || profile.hendon_mob_url
            || profile.hendonmob_id
            || (profile.social_links && (profile.social_links.hendonmob || profile.social_links.hendon_mob));

        if (!hendonmobValue || String(hendonmobValue).trim().length < 5) {
            return res.status(200).json({
                success: false,
                message: `Link your HendonMob profile to earn ${HENDONMOB_REWARD}💎!`
            });
        }

        // Record & award
        const now = new Date();
        const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

        await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'hendonmob_link',
            diamonds_awarded: HENDONMOB_REWARD,
            claim_date: today,
            metadata: { hendonmob: String(hendonmobValue).substring(0, 100) }
        });

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: HENDONMOB_REWARD,
            p_type: 'hendonmob_link',
            p_description: `HendonMob link reward — ${HENDONMOB_REWARD}💎`,
            p_reference_id: null
        });

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded: HENDONMOB_REWARD,
            message: `+${HENDONMOB_REWARD}💎 HendonMob Linked!`
        });

    } catch (error) {
        console.error('[HendonMobReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim HendonMob link reward' });
    }
}

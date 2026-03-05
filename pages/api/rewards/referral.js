/**
 * 👥 REFERRAL REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 500💎 for verified referrals — BYPASSES daily cap
 * One-time per referred user pair
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REFERRAL_REWARD = 500;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // ── Auth: JWT required (awards diamonds) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { referrerId, referredUserId } = req.body;
    // Enforce: referrer must be the authenticated user
    if (referrerId !== authUser.id) {
        return res.status(403).json({ success: false, error: 'Can only claim referral rewards for your own referrals' });
    }

    if (!referrerId || !referredUserId) {
        return res.status(400).json({ success: false, error: 'referrerId and referredUserId required' });
    }

    if (referrerId === referredUserId) {
        return res.status(400).json({ success: false, error: 'Cannot refer yourself' });
    }

    try {
        // Check if already awarded for this pair
        const { data: existing } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', referrerId)
            .eq('reward_type', 'referral')
            .contains('metadata', { referred_user_id: referredUserId })
            .maybeSingle();

        if (existing) {
            return res.status(200).json({
                success: true,
                alreadyClaimed: true,
                message: 'Referral reward already claimed for this user'
            });
        }

        const now = new Date();
        const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

        // BUG #265 FIX: Check insert result before awarding diamonds
        const { error: claimInsertErr } = await supabase.from('diamond_reward_claims').insert({
            user_id: referrerId,
            reward_type: 'referral',
            diamonds_awarded: REFERRAL_REWARD,
            claim_date: today,
            metadata: { referred_user_id: referredUserId, bypasses_cap: true }
        });

        if (claimInsertErr) {
            if (claimInsertErr.code === '23505') {
                return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Referral reward already claimed for this user' });
            }
            throw claimInsertErr;
        }

        // Award diamonds
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: referrerId,
            p_amount: REFERRAL_REWARD,
            p_type: 'referral',
            p_description: `Referral reward — ${REFERRAL_REWARD}💎 (bypasses daily cap)`,
            p_reference_id: referredUserId
        });

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded: REFERRAL_REWARD,
            message: `+${REFERRAL_REWARD}💎 Referral Reward!`
        });

    } catch (error) {
        console.error('[ReferralReward] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim referral reward' });
    }
}

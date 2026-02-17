/**
 * Promo Code Redemption API
 * POST /api/promo/redeem
 * Body: { code: string }
 * Auth: Bearer token required
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── AUTH CHECK ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    // ── VALIDATE INPUT ──
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Promo code is required' });
    }

    const normalizedCode = code.trim().toUpperCase();

    try {
        // ── LOOK UP CODE ──
        const { data: promo, error: lookupError } = await supabaseAdmin
            .from('promo_codes')
            .select('*')
            .eq('code', normalizedCode)
            .single();

        if (lookupError || !promo) {
            return res.status(404).json({ error: 'Invalid promo code' });
        }

        // ── VALIDATE CODE STATUS ──
        if (!promo.is_active) {
            return res.status(400).json({ error: 'This promo code is no longer active' });
        }

        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
            return res.status(400).json({ error: 'This promo code has expired' });
        }

        if (promo.max_uses !== null && promo.times_used >= promo.max_uses) {
            return res.status(400).json({ error: 'This promo code has reached its maximum redemptions' });
        }

        // ── CHECK DUPLICATE REDEMPTION ──
        const { data: existing } = await supabaseAdmin
            .from('promo_code_redemptions')
            .select('id')
            .eq('promo_code_id', promo.id)
            .eq('user_id', user.id)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'You have already redeemed this code' });
        }

        // ── APPLY REWARD ──
        const reward = {
            type: promo.reward_type,
            value: promo.reward_value,
            code: promo.code,
            description: promo.description
        };

        if (promo.reward_type === 'diamonds') {
            // Add diamonds to user's profile
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .single();

            const currentDiamonds = profile?.diamonds || 0;

            await supabaseAdmin
                .from('profiles')
                .update({ diamonds: currentDiamonds + promo.reward_value })
                .eq('id', user.id);

            reward.message = `${promo.reward_value} diamonds added to your account!`;
        } else if (promo.reward_type === 'vip_days') {
            // Extend or create VIP subscription
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('vip_expires_at')
                .eq('id', user.id)
                .single();

            const now = new Date();
            const currentExpiry = profile?.vip_expires_at ? new Date(profile.vip_expires_at) : now;
            const startDate = currentExpiry > now ? currentExpiry : now;
            const newExpiry = new Date(startDate.getTime() + promo.reward_value * 24 * 60 * 60 * 1000);

            await supabaseAdmin
                .from('profiles')
                .update({
                    is_vip: true,
                    vip_expires_at: newExpiry.toISOString()
                })
                .eq('id', user.id);

            reward.message = `${promo.reward_value} days of VIP access activated!`;
        } else if (promo.reward_type === 'free_trial') {
            // Grant free trial days
            const now = new Date();
            const trialEnd = new Date(now.getTime() + promo.reward_value * 24 * 60 * 60 * 1000);

            await supabaseAdmin
                .from('profiles')
                .update({
                    is_vip: true,
                    vip_expires_at: trialEnd.toISOString()
                })
                .eq('id', user.id);

            reward.message = `${promo.reward_value}-day free trial activated!`;
        } else if (promo.reward_type === 'commander_discount') {
            // Store the discount for Commander billing
            reward.message = `${promo.reward_value}% Commander discount applied!`;
        }

        // ── RECORD REDEMPTION ──
        await supabaseAdmin
            .from('promo_code_redemptions')
            .insert({
                promo_code_id: promo.id,
                user_id: user.id,
                reward_applied: reward
            });

        // ── INCREMENT USAGE COUNT ──
        await supabaseAdmin
            .from('promo_codes')
            .update({ times_used: promo.times_used + 1 })
            .eq('id', promo.id);

        return res.status(200).json({
            success: true,
            reward
        });

    } catch (err) {
        console.error('[Promo] Redemption error:', err);
        return res.status(500).json({ error: 'Failed to redeem promo code' });
    }
}

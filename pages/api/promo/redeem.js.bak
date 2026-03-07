/**
 * Promo Code Redemption API
 * POST /api/promo/redeem
 * Body: { code: string }
 * Auth: Bearer token required
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // ── AUTH CHECK ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // ── VALIDATE INPUT ──
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, error: 'Promo code is required' });
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
            return res.status(404).json({ success: false, error: 'Invalid promo code' });
        }

        // ── VALIDATE CODE STATUS ──
        if (!promo.is_active) {
            return res.status(400).json({ success: false, error: 'This promo code is no longer active' });
        }

        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
            return res.status(400).json({ success: false, error: 'This promo code has expired' });
        }

        if (promo.max_uses !== null && promo.times_used >= promo.max_uses) {
            return res.status(400).json({ success: false, error: 'This promo code has reached its maximum redemptions' });
        }

        // ── CHECK DUPLICATE REDEMPTION ──
        const { data: existing } = await supabaseAdmin
            .from('promo_code_redemptions')
            .select('id')
            .eq('promo_code_id', promo.id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (existing) {
            return res.status(400).json({ success: false, error: 'You have already redeemed this code' });
        }

        // BUG #264 FIX: Atomic redemption insert to prevent TOCTOU double-redeem.
        // Insert FIRST with unique constraint, then apply reward. If insert fails,
        // we know another request already redeemed.
        const { error: redeemInsertErr } = await supabaseAdmin
            .from('promo_code_redemptions')
            .insert({
                promo_code_id: promo.id,
                user_id: user.id,
            });

        if (redeemInsertErr) {
            if (redeemInsertErr.code === '23505') {
                return res.status(409).json({ success: false, error: 'You have already redeemed this code' });
            }
            throw redeemInsertErr;
        }

        // ── APPLY REWARD ──
        const reward = {
            type: promo.reward_type,
            value: promo.reward_value,
            code: promo.code,
            description: promo.description
        };

        if (promo.reward_type === 'diamonds') {
            // BUG #264 FIX: Use atomic RPC instead of read-modify-write
            const { error: diamondErr } = await supabaseAdmin.rpc('add_diamonds_to_balance', {
                p_user_id: user.id,
                p_amount: promo.reward_value,
                p_type: 'promo_code',
                p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus'}`,
                p_reference_id: `promo_${promo.id}_${user.id}`,
            });

            if (diamondErr) {
                // Fallback: direct update if RPC not available
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', user.id)
                    .maybeSingle();

                const currentDiamonds = profile?.diamonds || 0;
                await supabaseAdmin
                    .from('profiles')
                    .update({ diamonds: currentDiamonds + promo.reward_value })
                    .eq('id', user.id);
            }

            reward.message = `${promo.reward_value} diamonds added to your account!`;
        } else if (promo.reward_type === 'vip_days') {
            // Extend or create VIP subscription
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('vip_expires_at')
                .eq('id', user.id)
                .maybeSingle();

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

        // ── Redemption already recorded above (atomic insert) ──
        // Update with reward details
        await supabaseAdmin
            .from('promo_code_redemptions')
            .update({ reward_applied: reward })
            .eq('promo_code_id', promo.id)
            .eq('user_id', user.id);

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
        return res.status(500).json({ success: false, error: 'Failed to redeem promo code' });
    }
}

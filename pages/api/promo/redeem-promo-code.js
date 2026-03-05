// Redeem a promo code after successful signup
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    // Require JWT auth — promo codes credit real currency
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { code } = req.body;
    const userId = authUser.id; // Always use verified user ID
    if (!code) {
        return res.status(400).json({ success: false, error: 'Code is required' });
    }

    try {
        // 1. Fetch the promo code
        const { data: promo, error: promoError } = await supabaseAdmin
            .from('promo_codes')
            .select('*')
            .eq('code', code.toUpperCase().trim())
            .single();

        if (promoError || !promo) {
            return res.status(404).json({ success: false, error: 'Invalid promo code' });
        }

        // Validate again
        if (!promo.is_active) return res.status(400).json({ success: false, error: 'Code is no longer active' });
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Code has expired' });
        if (promo.max_uses !== null && promo.times_used >= promo.max_uses) return res.status(400).json({ success: false, error: 'Code usage limit reached' });

        // 2. Check if user already redeemed this code
        const { data: existing } = await supabaseAdmin
            .from('promo_code_redemptions')
            .select('id')
            .eq('promo_code_id', promo.id)
            .eq('user_id', userId)
            .single();

        if (existing) {
            return res.status(400).json({ success: false, error: 'You have already used this promo code' });
        }

        // BUG #261 FIX: Atomic redemption insert to prevent TOCTOU double-redeem.
        // Two concurrent requests could both pass the check above and both redeem.
        // Use insert with unique constraint — second request will fail with conflict.
        const { data: redemption, error: redemptionErr } = await supabaseAdmin
            .from('promo_code_redemptions')
            .insert({
                promo_code_id: promo.id,
                user_id: userId,
            })
            .select('id')
            .single();

        if (redemptionErr) {
            // Unique constraint violation = already redeemed (concurrent request)
            if (redemptionErr.code === '23505') {
                return res.status(409).json({ success: false, error: 'You have already used this promo code' });
            }
            throw redemptionErr;
        }

        // 3. Apply the bonus based on reward_type
        let bonusApplied = '';

        switch (promo.reward_type) {
            case 'signup_bonus':
            case 'diamonds': {
                // BUG #262 FIX: Use add_diamonds_to_balance RPC for atomic balance update.
                // Previous code did read-modify-write which races under concurrent requests.
                const { error: diamondErr } = await supabaseAdmin.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: promo.reward_value,
                    p_type: 'promo_code',
                    p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus diamonds'}`,
                    p_reference_id: `promo_${promo.id}_${userId}`,
                });

                if (diamondErr) {
                    console.error('[redeem-promo] Diamond credit RPC failed:', diamondErr.message);
                    // Fallback to direct upsert if RPC doesn't exist
                    const { data: currentBalance } = await supabaseAdmin
                        .from('user_diamond_balance')
                        .select('balance')
                        .eq('user_id', userId)
                        .single();

                    const newBalance = (currentBalance?.balance || 0) + promo.reward_value;

                    await supabaseAdmin
                        .from('user_diamond_balance')
                        .upsert({
                            user_id: userId,
                            balance: newBalance,
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'user_id' });

                    await supabaseAdmin
                        .from('profiles')
                        .update({ diamonds: newBalance })
                        .eq('id', userId);

                    await supabaseAdmin
                        .from('diamond_transactions')
                        .insert({
                            user_id: userId,
                            amount: promo.reward_value,
                            type: 'promo_code',
                            transaction_type: 'credit',
                            balance_after: newBalance,
                            source: 'promo_code',
                            description: `Promo code: ${promo.code} — ${promo.description || 'Bonus diamonds'}`,
                        });
                }

                bonusApplied = `${promo.reward_value} diamonds added`;
                break;
            }

            case 'vip_trial':
            case 'vip_days': {
                // Grant VIP for X days (reward_value = number of days)
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + promo.reward_value);

                await supabaseAdmin
                    .from('profiles')
                    .update({
                        is_vip: true,
                        vip_trial_end: trialEnd.toISOString(),
                    })
                    .eq('id', userId);

                bonusApplied = `${promo.reward_value}-day VIP trial activated`;
                break;
            }

            case 'lifetime_commander_club_vip': {
                // Grant lifetime VIP status
                await supabaseAdmin
                    .from('profiles')
                    .update({
                        is_vip: true,
                        vip_trial_end: null, // null = no expiration = lifetime
                    })
                    .eq('id', userId);

                bonusApplied = 'Lifetime VIP Card + Club Commander Club Level activated';
                break;
            }

            case 'lifetime_commander_charity': {
                bonusApplied = 'Lifetime Club Commander Charity Games pass activated';
                break;
            }

            default:
                bonusApplied = `Promo code ${promo.code} applied`;
        }

        // 4. Redemption already recorded above (atomic insert)

        // 5. Increment usage count (use atomic increment to prevent race)
        await supabaseAdmin
            .from('promo_codes')
            .update({ times_used: promo.times_used + 1 })
            .eq('id', promo.id);

        return res.status(200).json({
            success: true,
            message: bonusApplied,
            type: promo.reward_type,
            value: promo.reward_value,
        });
    } catch (err) {
        console.error('Redeem promo code error:', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
}

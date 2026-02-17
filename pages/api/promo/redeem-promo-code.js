// Redeem a promo code after successful signup
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { code, userId } = req.body;
    if (!code || !userId) {
        return res.status(400).json({ error: 'Code and userId are required' });
    }

    try {
        // 1. Fetch the promo code
        const { data: promo, error: promoError } = await supabaseAdmin
            .from('promo_codes')
            .select('*')
            .eq('code', code.toUpperCase().trim())
            .single();

        if (promoError || !promo) {
            return res.status(404).json({ error: 'Invalid promo code' });
        }

        // Validate again
        if (!promo.is_active) return res.status(400).json({ error: 'Code is no longer active' });
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ error: 'Code has expired' });
        if (promo.max_uses !== null && promo.times_used >= promo.max_uses) return res.status(400).json({ error: 'Code usage limit reached' });

        // 2. Check if user already redeemed this code
        const { data: existing } = await supabaseAdmin
            .from('promo_code_redemptions')
            .select('id')
            .eq('promo_code_id', promo.id)
            .eq('user_id', userId)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'You have already used this promo code' });
        }

        // 3. Apply the bonus based on reward_type
        let bonusApplied = '';

        switch (promo.reward_type) {
            case 'signup_bonus':
            case 'diamonds': {
                // Add diamonds to user's balance
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

                // Also update profiles.diamonds for consistency
                await supabaseAdmin
                    .from('profiles')
                    .update({ diamonds: newBalance })
                    .eq('id', userId);

                // Record transaction
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

        // 4. Record the redemption
        await supabaseAdmin
            .from('promo_code_redemptions')
            .insert({
                promo_code_id: promo.id,
                user_id: userId,
            });

        // 5. Increment usage count
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
        return res.status(500).json({ error: 'Server error' });
    }
}

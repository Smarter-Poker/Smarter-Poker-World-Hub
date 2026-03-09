/**
 * Purchase Daily VIP Pass
 * POST /api/store/purchase-daily-vip
 * Deducts 150 diamonds and grants 24 hours of VIP access
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    try {
        // Authenticate via token
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid session' });
        }

        // Configuration
        const COST = 150;
        const HOURS = 24;

        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('diamonds, is_vip, vip_expires_at')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError || !profile) {
            return res.status(500).json({ success: false, error: 'Failed to access profile' });
        }

        // Validation
        const currentBalance = profile.diamonds || 0;
        if (currentBalance < COST) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient diamonds',
                required: COST,
                current: currentBalance
            });
        }

        // Deduct diamonds atomically using the RPC
        const { error: deductError } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: user.id,
            p_amount: -COST,
            p_type: 'vip_daily',
            p_description: `1-Day VIP Access (${COST}💎)`,
            p_reference_id: null
        });

        if (deductError) {
            console.error('[Purchase Daily VIP] Deduction failed:', deductError);
            return res.status(500).json({ success: false, error: 'Failed to process payment' });
        }

        // Calculate new expiration
        let newExpiresAt = new Date();
        if (profile.is_vip && profile.vip_expires_at) {
            const currentExpiraton = new Date(profile.vip_expires_at);
            if (currentExpiraton > newExpiresAt) {
                // If they already have an active VIP pass, extend it
                newExpiresAt = currentExpiraton;
            }
        }
        newExpiresAt.setHours(newExpiresAt.getHours() + HOURS);

        // Update profile
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                is_vip: true,
                vip_tier: 'daily',
                vip_expires_at: newExpiresAt.toISOString()
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('[Purchase Daily VIP] Profile update failed:', updateError);
            // Non-fatal, they were charged but VIP not toggled. Should be rare.
            return res.status(500).json({ success: false, error: 'Payment succeeded, but VIP activation failed. Contact support.' });
        }

        return res.status(200).json({
            success: true,
            isVip: true,
            expiresAt: newExpiresAt.toISOString(),
            newBalance: currentBalance - COST
        });

    } catch (err) {
        console.error('[Purchase Daily VIP] Fatal Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

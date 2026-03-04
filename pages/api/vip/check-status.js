/**
 * VIP Status Check API
 * GET /api/vip/check-status
 * Server-side bridge for VIP verification using service role
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Authenticate user from token
        const authHeader = req.headers.authorization;
        let userId = null;

        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (!error && user) {
                userId = user.id;
            }
        }

        // BUG #243 FIX: Removed req.query.userId fallback — IDOR allowed checking anyone's VIP status
        if (!userId) {
            return res.status(401).json({ isVip: false, error: 'Authentication required' });
        }

        // Query profiles for VIP status
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('is_vip, vip_tier, vip_expires_at, diamonds')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            return res.status(200).json({
                isVip: false,
                vipTier: null,
                expiresAt: null,
                diamonds: 0
            });
        }

        // Check if VIP has expired (shouldn't happen with trigger, but defense-in-depth)
        let isVip = profile.is_vip === true;
        if (isVip && profile.vip_expires_at) {
            const expiresAt = new Date(profile.vip_expires_at);
            if (expiresAt < new Date()) {
                isVip = false;
                // Auto-cleanup expired VIP
                await supabase
                    .from('profiles')
                    .update({ is_vip: false, vip_tier: null })
                    .eq('id', userId);
            }
        }

        return res.status(200).json({
            isVip,
            vipTier: isVip ? profile.vip_tier : null,
            expiresAt: profile.vip_expires_at,
            diamonds: profile.diamonds || 0
        });

    } catch (err) {
        console.error('[VIP Check] Error:', err);
        return res.status(500).json({ isVip: false, error: 'Internal server error' });
    }
}

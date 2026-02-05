/**
 * 🔒 VIP STATUS CHECK API
 * Server-side VIP status verification to avoid client-side AbortError
 * This endpoint replaces direct supabase.rpc calls with a clean server-side check
 */

import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (no auth issues)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required', is_vip: false });
    }

    try {
        // Check VIP status using the RPC function
        const { data, error } = await supabase.rpc('get_user_vip_status', {
            p_user_id: user_id
        });

        if (error) {
            console.error('[VIP API] RPC error:', error.message);

            // Fallback: Check profiles table directly
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('is_vip')
                .eq('id', user_id)
                .single();

            if (!profileError && profile) {
                return res.status(200).json({ is_vip: profile.is_vip === true });
            }

            // Final fallback: not VIP
            return res.status(200).json({ is_vip: false });
        }

        return res.status(200).json({ is_vip: data === true });
    } catch (err) {
        console.error('[VIP API] Exception:', err.message);
        return res.status(200).json({ is_vip: false }); // Graceful degradation
    }
}

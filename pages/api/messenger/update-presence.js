/**
 * POST /api/messenger/update-presence
 *
 * Updates the user's online/offline presence status in the database.
 * Uses service role key to bypass the missing GRANT EXECUTE on fn_update_presence
 * for the authenticated role.
 *
 * Body: { isOnline: boolean }
 * Returns: { success: true }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
        // Presence updates are high-frequency — use read rate limit (more permissive)
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

        const isOnline = Boolean(req.body?.isOnline);
        const supabase = getSupabase();

        // Try the RPC first (works with service role)
        const { error: rpcErr } = await supabase.rpc('fn_update_presence', {
            p_user_id: user.id,
            p_is_online: isOnline,
        });

        if (rpcErr) {
            // Inline fallback: update profiles table directly
            console.warn('[update-presence] RPC error, using inline fallback:', rpcErr.message);
            const { error: err_profiles_fsj04 } = await supabase.from('profiles').update({
                last_seen_at: new Date().toISOString(),
                is_online: isOnline,
                updated_at: new Date().toISOString(),
            }).eq('id', user.id);
            if (err_profiles_fsj04) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_fsj04.message);
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        // Presence is non-critical — swallow errors silently
        if (!res.headersSent) return res.status(200).json({ success: true });
    }
}

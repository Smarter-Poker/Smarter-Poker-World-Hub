import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { metadata } = req.body;
        if (!metadata) {
            return res.status(400).json({ error: 'Missing metadata' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Auth token required' });
        }
        const token = authHeader.replace('Bearer ', '');
        
        // Verify caller
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        /* removed duplicate authUser */
        
        if (authErr || !authUser) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // [2026-07-25] ALLOWLIST — user_metadata feeds authorization-adjacent
        // logic (ensure-profile trusts metadata.phone for the phone gate;
        // other server code reads user_metadata). Without a filter, any
        // session could write ARBITRARY keys (phone_verified, vip_*, role…)
        // through the service-role admin API. Only profile-cosmetic keys the
        // profile-edit UI actually sends are permitted.
        const ALLOWED_KEYS = new Set([
            'full_name', 'first_name', 'last_name', 'avatar_url',
            'poker_alias', 'city', 'state', 'bio',
        ]);
        const rejectedKeys = Object.keys(metadata).filter((k) => !ALLOWED_KEYS.has(k));
        const filtered = Object.fromEntries(
            Object.entries(metadata).filter(([k]) => ALLOWED_KEYS.has(k))
        );
        if (Object.keys(filtered).length === 0) {
            return res.status(400).json({
                error: 'No permitted metadata keys in request',
                rejected: rejectedKeys,
            });
        }

        const mergedMetadata = { ...authUser.user_metadata, ...filtered };

        // Update the user's metadata using admin API
        const { error: updateError } = await getSupabase().auth.admin.updateUserById(authUser.id, {
            user_metadata: mergedMetadata
        });

        if (updateError) {
            console.error('[update-metadata] Error updating metadata:', updateError);
            return res.status(500).json({ error: 'Failed to update user metadata' });
        }

        return res.status(200).json({
            success: true,
            ...(rejectedKeys.length ? { rejected: rejectedKeys } : {}),
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[API Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

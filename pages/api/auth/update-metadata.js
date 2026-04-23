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
        const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
        const authUser = authData?.user;
        
        if (authError || !authUser) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Update the user's metadata using admin API
        const { error: updateError } = await getSupabase().auth.admin.updateUserById(authUser.id, {
            user_metadata: metadata
        });

        if (updateError) {
            console.error('[update-metadata] Error updating metadata:', updateError);
            return res.status(500).json({ error: 'Failed to update user metadata' });
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[API Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

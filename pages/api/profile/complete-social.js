/**
 * 👤 COMPLETE SOCIAL PROFILE
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/profile/complete-social
 * Body: { full_name: string, username: string, phone: string }
 * Returns: { success: true, profile: {...} } | { success: false, error, message? }
 *
 * Atomic completion of name + alias + phone for first-time Social Media entry.
 * Username uniqueness is enforced by the existing profiles_username_key
 * constraint; the RPC translates collisions into a clean "username_taken"
 * error so the modal can re-prompt with fresh suggestions.
 *
 * Auth: requires JWT bearer. The RPC uses auth.uid() so callers can only
 * complete THEIR OWN profile.
 *
 * RPC: public.claim_social_profile(text, text, text) → jsonb
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'method_not_allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { full_name, username, phone } = req.body || {};
        if (typeof full_name !== 'string' || typeof username !== 'string' || typeof phone !== 'string') {
            return res.status(400).json({ success: false, error: 'invalid_body',
                message: 'full_name, username, and phone are required strings.' });
        }

        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'auth_required' });
        }
        const token = auth.slice(7);

        // Per-user client so auth.uid() inside the RPC resolves to the caller.
        const sb = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData?.user) {
            return res.status(401).json({ success: false, error: 'invalid_token' });
        }

        const { data, error } = await sb.rpc('claim_social_profile', {
            p_full_name: full_name,
            p_username:  username,
            p_phone:     phone,
        });

        if (error) {
            console.warn('[complete-social] RPC error:', error);
            return res.status(500).json({ success: false, error: 'rpc_failed',
                message: error.message || 'Could not save profile.' });
        }

        // RPC returns either { success:true, profile } or { success:false, error, message }
        if (!data?.success) {
            // 409 for username_taken; 400 for any client-fixable validation error
            const status =
                data?.error === 'username_taken' ? 409 :
                data?.error === 'username_reserved' ? 400 :
                data?.error === 'profile_missing' ? 404 :
                data?.error === 'unauthenticated' ? 401 :
                data?.error?.startsWith('invalid_') ? 400 : 500;
            return res.status(status).json(data || { success: false, error: 'unknown' });
        }

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* ignore */ }
        console.warn('[complete-social] error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'internal_error' });
        }
    }
}

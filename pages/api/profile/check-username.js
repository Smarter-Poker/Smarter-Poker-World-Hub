/**
 * 🔍 USERNAME AVAILABILITY CHECK
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/profile/check-username
 * Body: { username: string }
 * Returns: { available: boolean, reason?: string, message?: string, suggestions: string[] }
 *
 * Used by <SocialProfileCompletionGate> for live availability + collision-aware
 * alternatives during first-time profile completion (Google OAuth signups).
 *
 * Auth: requires JWT bearer (the modal is only shown to authed users).
 * RPC: public.check_username_with_suggestions(text) → jsonb
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        const { username } = req.body || {};
        if (typeof username !== 'string' || !username.trim()) {
            return res.status(400).json({ error: 'username is required' });
        }
        if (username.length > 64) {
            return res.status(400).json({ error: 'username too long' });
        }

        // JWT auth (lightweight — anyone signed in can check)
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Auth token required' });
        }
        const token = auth.slice(7);
        const sb = getSupabase();
        const { data: u, error: uErr } = await sb.auth.getUser(token);
        if (uErr || !u?.user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { data, error } = await sb.rpc('check_username_with_suggestions', { p_username: username });
        if (error) {
            console.warn('[check-username] RPC error:', error);
            return res.status(500).json({ error: 'lookup_failed' });
        }

        // RPC returns jsonb; supabase-js gives it back as a JS object directly.
        return res.status(200).json(data || { available: false, suggestions: [] });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* ignore */ }
        console.warn('[check-username] error:', err);
        if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
    }
}

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

        // Phase 79 BUG-1 FIX: per-user client (anon key + Bearer header) so the
        // RPC's auth.uid() resolves to the caller. The previous service-role
        // client made auth.uid() return NULL inside the RPC, which neutralized
        // the self-exclusion logic added by the 6-bug fix (commit ba8bb37658):
        // every OAuth signup whose username was pre-filled by ensure-profile.js
        // (e.g. 'danbekavac' from Google email prefix) saw their own pre-filled
        // username reported as 'taken'. The RPC's `(v_self IS NULL OR id <> v_self)`
        // self-exclusion was dead code while the API called via service-role.
        // Mirror the per-user-client pattern complete-social.js already uses.
        const sb = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        });

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

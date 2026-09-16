import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🗑️ DELETE MESSAGE API - Service Role
 *
 * Deletes a message for everyone (soft-delete: sets is_deleted=true).
 * Verifies the caller is the message owner before deleting.
 * Uses service role to bypass RLS — ownership is enforced atomically in the UPDATE WHERE clause.
 *
 * Body: { messageId: string }
 * Returns: { success: true }
 *
 * Why this exists: the client was using anon supabase.rpc('fn_delete_message') directly.
 * If fn_delete_message lacks SECURITY DEFINER or EXECUTE grant, all deletes silently failed.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.write)) return;

        // ── Auth: verify JWT identity ──
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const userId = user.id; // From JWT, NOT body
        const { messageId } = req.body;

        if (!messageId || typeof messageId !== 'string') {
            return res.status(400).json({ success: false, error: 'messageId required' });
        }

        try {
            // Try the RPC first (preferred — atomic ownership check inside DB function)
            const { data: rpcResult, error: rpcErr } = await getSupabase().rpc('fn_delete_message', {
                p_message_id: messageId,
                p_user_id: userId,
            });

            if (!rpcErr) {
                if (!rpcResult) {
                    // RPC returned false — message not found or not owned by caller
                    return res.status(403).json({ success: false, error: 'Not authorized to delete this message' });
                }
                return res.json({ success: true });
            }

            // RPC failed — fall back to atomic ownership-scoped UPDATE
            console.warn('[delete-message] RPC failed, using fallback UPDATE:', rpcErr.message);
            const { data: updated, error: updateErr } = await getSupabase()
                .from('social_messages')
                .update({ is_deleted: true, content: '[Message deleted]', updated_at: new Date().toISOString() })
                .eq('id', messageId)
                .eq('sender_id', userId) // Atomic ownership check — only deletes OWN messages
                .select('id')
                .maybeSingle();

            if (updateErr) {
                console.warn('[delete-message] Fallback update error:', updateErr);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }

            if (!updated) {
                // No row updated — message not found or not owned by caller
                return res.status(403).json({ success: false, error: 'Not authorized to delete this message' });
            }

            return res.json({ success: true });

        } catch (e) {
            console.warn('[delete-message] Error:', e);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[delete-message] Outer error:', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /api/messenger/block-user
 *
 * Block, unblock, or list blocks for the signed-in user.
 *
 * WHY THIS EXISTS: send-message and start-conversation both enforce
 * messenger_blocked, and both have long comments explaining that enforcement
 * was added because "blocking was decoration". But nothing on this side ever
 * WROTE that table. The only writer in the codebase is
 * src/hooks/useMessengerService.js, which belongs to the in-game table
 * messenger mounted on the poker table - a different app surface with a
 * different inbox. /hub/messenger has no block control at all, so a user of
 * the social messenger could not block anyone: the table was empty
 * platform-wide and the enforcement had nothing to enforce.
 *
 * This is the missing half. Blocking is mutual in effect, matching how
 * send-message reads it (a block in either direction stops the conversation).
 *
 * Body: { action: 'block' | 'unblock' | 'list', targetUserId? }
 * Returns: { success: true, blocked?: string[] }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
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

const isUUID = (v) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const supabase = getSupabase();
        const { user, error: authErr } = await getServerUserWithFallback(req, supabase);
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const action = String(req.body?.action || 'list').toLowerCase();
        const targetUserId = req.body?.targetUserId;

        if (action === 'list') {
            const { data, error } = await supabase
                .from('messenger_blocked')
                .select('blocked_id')
                .eq('blocker_id', user.id);
            if (error) {
                console.warn('[block-user] list failed:', error.message);
                return res.status(500).json({ success: false, error: 'Could not load blocks' });
            }
            return res.status(200).json({
                success: true,
                blocked: (data || []).map((r) => r.blocked_id).filter(Boolean),
            });
        }

        if (!isUUID(targetUserId)) {
            return res.status(400).json({ success: false, error: 'targetUserId required' });
        }
        // blocker_id is always the JWT identity - a caller can never create or
        // remove a block on someone else's behalf.
        if (targetUserId === user.id) {
            return res.status(400).json({ success: false, error: 'Cannot block yourself' });
        }

        if (action === 'block') {
            const { error } = await supabase
                .from('messenger_blocked')
                .upsert(
                    { blocker_id: user.id, blocked_id: targetUserId },
                    { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
                );
            if (error) {
                console.warn('[block-user] block failed:', error.message);
                return res.status(500).json({ success: false, error: 'Could not block' });
            }
            return res.status(200).json({ success: true, action: 'block' });
        }

        if (action === 'unblock') {
            const { error } = await supabase
                .from('messenger_blocked')
                .delete()
                .eq('blocker_id', user.id)
                .eq('blocked_id', targetUserId);
            if (error) {
                console.warn('[block-user] unblock failed:', error.message);
                return res.status(500).json({ success: false, error: 'Could not unblock' });
            }
            return res.status(200).json({ success: true, action: 'unblock' });
        }

        return res.status(400).json({ success: false, error: 'Unknown action' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { console.warn('[block-user] sentry failed'); }
        console.error('[block-user] error:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}

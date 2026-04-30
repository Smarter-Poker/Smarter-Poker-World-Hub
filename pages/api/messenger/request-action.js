/**
 * Message Request Actions API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/messenger/request-action
 * Body: { requestId, action: 'accept' | 'decline' }
 * 
 * Uses service role to bypass RLS on social_conversations (no UPDATE/DELETE
 * policies exist for the authenticated role).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const supabase = getSupabase();
        const { user, error: authErr } = await getServerUserWithFallback(req, supabase);
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

        const { requestId, action } = req.body;
        if (!requestId) return res.status(400).json({ success: false, error: 'requestId required' });
        if (!['accept', 'decline'].includes(action)) return res.status(400).json({ success: false, error: 'action must be accept or decline' });

        // Verify the user is actually a participant in this conversation
        const { data: participant } = await supabase
            .from('social_conversation_participants')
            .select('id')
            .eq('conversation_id', requestId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!participant) {
            return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
        }

        // Verify this conversation IS a message request and user is the recipient (not the sender)
        const { data: conv } = await supabase
            .from('social_conversations')
            .select('id, is_request, request_sender_id')
            .eq('id', requestId)
            .maybeSingle();

        if (!conv) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        if (!conv.is_request) {
            return res.status(400).json({ success: false, error: 'This conversation is not a message request' });
        }

        if (conv.request_sender_id === user.id) {
            return res.status(403).json({ success: false, error: 'You cannot accept/decline your own message request' });
        }

        if (action === 'accept') {
            // Clear the request flag — conversation moves to main inbox
            const { error } = await supabase
                .from('social_conversations')
                .update({ is_request: false })
                .eq('id', requestId);

            if (error) {
                console.warn('[request-action] Accept error:', error);
                return res.status(500).json({ success: false, error: 'Failed to accept request' });
            }

            return res.status(200).json({ success: true, action: 'accepted' });
        }

        if (action === 'decline') {
            // Delete messages first (FK constraint)
            await supabase
                .from('social_messages')
                .delete()
                .eq('conversation_id', requestId);

            // Delete participants
            await supabase
                .from('social_conversation_participants')
                .delete()
                .eq('conversation_id', requestId);

            // Delete the conversation
            const { error } = await supabase
                .from('social_conversations')
                .delete()
                .eq('id', requestId);

            if (error) {
                console.warn('[request-action] Decline error:', error);
                return res.status(500).json({ success: false, error: 'Failed to decline request' });
            }

            return res.status(200).json({ success: true, action: 'declined' });
        }

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

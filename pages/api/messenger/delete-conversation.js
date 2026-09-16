import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🗑️ DELETE CONVERSATION API - Service Role
 * Removes the user's participation from a conversation (soft-delete).
 * The conversation data remains for the other participant.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// Use service role to bypass RLS
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
    const { conversationId } = req.body;

    if (!conversationId) {
        return res.status(400).json({ success: false, error: 'conversationId required' });
    }

    try {
        // Verify the user is actually a participant in this conversation
        const { data: participant, error: checkErr } = await getSupabase()
            .from('social_conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .maybeSingle();

        if (checkErr || !participant) {
            return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
        }

        // Soft-delete: Remove the user's participation row
        // This makes the conversation disappear for this user without affecting the other participant
        const { error: deleteErr } = await getSupabase()
            .from('social_conversation_participants')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (deleteErr) {
            console.warn('[DELETE-CONVERSATION] Delete error:', deleteErr);
            return res.status(500).json({ success: false, error: deleteErr.message });
        }

        // TOCTOU note: between the participant DELETE above and this remaining-count check,
        // another concurrent delete request may have also removed their participant row.
        // Both requests may see remaining=0 and attempt cascade — second DELETE is a no-op (idempotent).
        const { data: remaining, error: remainErr } = await getSupabase()
            .from('social_conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .limit(1);

        if (!remainErr && (!remaining || remaining.length === 0)) {
            // No participants left — safe to delete conversation and its messages
            // Delete messages first (FK dependency on conversation)
            const { error: msgDelErr } = await getSupabase()
                .from('social_messages')
                .delete()
                .eq('conversation_id', conversationId);

            if (msgDelErr) {
                console.warn('[DELETE-CONVERSATION] Messages cascade delete error:', msgDelErr);
                // Non-fatal: conversation record will remain with orphaned messages
                // which is preferable to partially deleting data
                return res.json({ success: true, warning: 'Conversation hidden but orphaned messages may remain' });
            }

            const { error: convDelErr } = await getSupabase()
                .from('social_conversations')
                .delete()
                .eq('id', conversationId);

            if (convDelErr) {
                console.warn('[DELETE-CONVERSATION] Conversation cascade delete error:', convDelErr);
                // Non-fatal: conversation record will be an empty shell
            }
        }

        return res.json({ success: true });

    } catch (error) {
        console.warn('[DELETE-CONVERSATION] Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

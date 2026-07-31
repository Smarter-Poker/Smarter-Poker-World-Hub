import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * 📬 MARK CONVERSATION AS READ API - Service Role
 * Bypasses RLS to ensure last_read_at is properly updated
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
          // Verify the user is a participant before marking read \u2014 defense-in-depth guard
          // (fn_mark_messages_read may not enforce membership internally)
          const { data: participant, error: partErr } = await getSupabase()
              .from('social_conversation_participants')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

          if (partErr || !participant) {
              return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
          }

          // PRIMARY: Call fn_mark_messages_read RPC — this populates social_message_reads (per-message)
          // AND updates last_read_at on social_conversation_participants in one atomic operation.
          // The fn_get_user_conversations RPC counts unread from social_message_reads, so this is required
          // for the unread badge to clear correctly.
          const { error: rpcErr } = await getSupabase().rpc('fn_mark_messages_read', {
              p_conversation_id: conversationId,
              p_user_id: userId,
          });

          if (rpcErr) {
              // Fallback: directly update last_read_at (keeps waterfall fallback working)
              console.warn('[MARK-READ] RPC failed, using direct update fallback:', rpcErr.message);
              const { data, error } = await getSupabase()
                  .from('social_conversation_participants')
                  .update({ last_read_at: new Date().toISOString() })
                  .eq('conversation_id', conversationId)
                  .eq('user_id', userId)
                  .select()
                  .maybeSingle();

              if (error) {
                  console.warn('[MARK-READ] Fallback update error:', error);
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }
              if (!data) {
                  console.warn('[MARK-READ] No participant found to mark as read');
                  return res.status(404).json({ success: false, error: 'Participant not found' });
              }
          }

          return res.json({ success: true });

      } catch (error) {
          console.warn('[MARK-READ] Error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

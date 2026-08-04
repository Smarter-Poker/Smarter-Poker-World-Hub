import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/* ═══════════════════════════════════════════════════════════════════════════
   API: Get Live Help Conversation
   Fetches conversation history with all messages
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
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
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ error: 'Unauthorized' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authErr || !user) {
              return res.status(401).json({ error: 'Invalid token' });
          }

          const { conversationId } = req.query;

          if (!conversationId) {
              return res.status(400).json({ error: 'Missing conversationId' });
          }

          // Get conversation with messages
          const { data: conversation, error: convError } = await getSupabase()
              .from('live_help_conversations')
              .select(`
                  *,
                  live_help_messages (*)
              `)
              .eq('id', conversationId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (convError || !conversation) {
              return res.status(404).json({ error: 'Conversation not found' });
          }

          // Sort messages by created_at
          const messages = (conversation.live_help_messages || []).sort((a, b) =>
              new Date(a.created_at) - new Date(b.created_at)
          );

          return res.status(200).json({
              conversation: {
                  id: conversation.id,
                  agentId: conversation.agent_id,
                  status: conversation.status,
                  startedAt: conversation.started_at,
                  endedAt: conversation.ended_at,
                  context: conversation.context
              },
              messages
          });

      } catch (error) {
          console.warn('Get conversation error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

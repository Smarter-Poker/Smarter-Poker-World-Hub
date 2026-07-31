import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/* ═══════════════════════════════════════════════════════════════════════════
   GET CONVERSATION MESSAGES — Load messages for a specific conversation
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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

          const { id } = req.query;

          if (!id) {
              return res.status(400).json({ error: 'Conversation ID is required' });
          }

          // Verify conversation belongs to user
          const { data: conversation, error: convError } = await getSupabase()
              .from('geeves_conversations')
              .select('id, title, user_id')
              .eq('id', id)
              .maybeSingle();

          if (convError || !conversation) {
              return res.status(404).json({ error: 'Conversation not found' });
          }

          if (conversation.user_id !== user.id) {
              return res.status(403).json({ error: 'Access denied' });
          }

          // Fetch messages
          const { data: messages, error: msgError } = await getSupabase()
              .from('geeves_messages')
              .select('id, content, is_user, cache_id, from_cache, created_at')
              .eq('conversation_id', id)
              .order('created_at', { ascending: true })
                  .limit(100);

          if (msgError) throw msgError;

          return res.status(200).json({
              conversation: {
                  id: conversation.id,
                  title: conversation.title
              },
              messages: messages?.map(msg => ({
                  id: msg.id,
                  content: msg.content,
                  isUser: msg.is_user,
                  cacheId: msg.cache_id,
                  fromCache: msg.from_cache,
                  timestamp: msg.created_at
              })) || []
          });

      } catch (error) {
          console.warn('[Geeves Get Conversation] Error:', error);
          return res.status(500).json({ error: 'Failed to fetch conversation' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

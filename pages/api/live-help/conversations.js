import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/* ═══════════════════════════════════════════════════════════════════════════
   API: Get Recent Conversations
   Returns list of user's recent Live Help conversations
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

          // Get last 5 conversations with first message
          const { data: conversations, error } = await getSupabase()
              .from('live_help_conversations')
              .select(`
                  id,
                  updated_at,
                  live_help_messages!inner (
                      content
                  )
              `)
              .eq('user_id', user.id)
              .order('updated_at', { ascending: false })
              .limit(5);

          if (error) {
              console.warn('Failed to fetch conversations:', error);
              return res.status(500).json({ error: 'Failed to fetch conversations' });
          }

          // Format response with first message
          const formattedConversations = conversations.map(conv => ({
              id: conv.id,
              first_message: conv.live_help_messages[0]?.content || 'New conversation',
              updated_at: conv.updated_at
          }));

          return res.status(200).json({ conversations: formattedConversations });

      } catch (error) {
          console.warn('Conversations API error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

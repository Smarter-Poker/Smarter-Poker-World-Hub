/* ═══════════════════════════════════════════════════════════════════════════
   GET GEEVES CONVERSATIONS — Fetch user's conversation history
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

          if (authError || !user) {
              return res.status(401).json({ error: 'Invalid token' });
          }

          const { limit = 10 } = req.query;

          // Fetch conversations (left join — don't crash if no messages)
          const { data: conversations, error } = await getSupabase()
              .from('geeves_conversations')
              .select(`
                  id,
                  title,
                  created_at,
                  updated_at
              `)
              .eq('user_id', user.id)
              .order('updated_at', { ascending: false })
              .limit(parseInt(limit));

          if (error) {
              console.warn('[Geeves Conversations] Query error:', error);
              // Return empty array instead of crashing
              return res.status(200).json({ conversations: [] });
          }

          // Format response
          const formattedConversations = conversations?.map(conv => ({
              id: conv.id,
              title: conv.title,
              createdAt: conv.created_at,
              updatedAt: conv.updated_at,
              messageCount: 0 // Count loaded separately if needed
          })) || [];

          return res.status(200).json({
              conversations: formattedConversations
          });

      } catch (error) {
          console.warn('[Geeves Conversations] Error:', error);
          return res.status(500).json({ error: 'Failed to fetch conversations' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

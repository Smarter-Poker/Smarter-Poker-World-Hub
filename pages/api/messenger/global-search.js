// API Route: Global Search across all conversations
// pages/api/messenger/global-search.js

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { query, clubId } = req.body;

      if (!query || typeof query !== 'string' || query.length < 2) {
          return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
      }

      const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_ROLE_KEY);

      try {
          // Auth
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          // Search messages — only from conversations the user is part of
          const { data: messages, error: searchErr } = await supabase
              .from('social_messages')
              .select('id, content, created_at, sender_id, conversation_id, is_deleted')
              .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
              .ilike('content', `%${query}%`)
              .eq('is_deleted', false)
              .order('created_at', { ascending: false })
              .limit(30);

          if (searchErr) throw searchErr;

          // Get unique sender IDs to fetch profiles
          const senderIds = [...new Set((messages || []).map(m => m.sender_id))];
          let profiles = {};
          if (senderIds.length > 0) {
              const { data: profs } = await supabase
                  .from('profiles')
                  .select('id, username, display_name, avatar_url')
                  .in('id', senderIds);
              (profs || []).forEach(p => { profiles[p.id] = p; });
          }

          const results = (messages || []).map(m => ({
              id: m.id,
              content: m.content,
              created_at: m.created_at,
              conversation_id: m.conversation_id,
              sender: profiles[m.sender_id] || { id: m.sender_id, username: 'Unknown' },
              isOwn: m.sender_id === user.id,
          }));

          return res.json({ success: true, results });
      } catch (e) {
          console.error('[ANTIGRAVITY] Global Search Exception:', e);
          return res.status(500).json({ success: false, error: e.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

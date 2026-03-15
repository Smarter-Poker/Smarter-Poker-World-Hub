// API Route: Get messages for a conversation (bypasses broken RLS)
// pages/api/messenger/get-messages.js

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export default async function handler(req, res) {
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}, SUPABASE_SERVICE_ROLE_KEY);

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = user.id; // From JWT, NOT body
      const { conversationId, before, limit: reqLimit } = req.body;

      if (!conversationId) {
          return res.status(400).json({ success: false, error: 'Missing conversationId' });
      }

      // Pagination: cap limit at 200
      const pageLimit = Math.min(parseInt(reqLimit) || 100, 200);

      try {
          // First verify user is a participant in this conversation (security check)
          const { data: participant, error: partError } = await getSupabase()
              .from('social_conversation_participants')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

          if (partError || !participant) {
              return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
          }

          // Fetch messages with sender profiles (with pagination support)
          let query = getSupabase()
              .from('social_messages')
              .select(`
                  id,
                  content,
                  created_at,
                  sender_id,
                  is_deleted,
                  profiles:sender_id (id, username, avatar_url, is_vip)
              `)
              .eq('conversation_id', conversationId)
              .eq('is_deleted', false)
              .order('created_at', { ascending: true })
              .limit(pageLimit);

          // Pagination: load messages before a given timestamp
          if (before) {
              query = query.lt('created_at', before);
          }

          const { data: messages, error } = await query;

          if (error) {
              console.error('[ANTIGRAVITY] Error fetching messages:', error);
              return res.status(500).json({ success: false, error: error.message });
          }

          return res.json({
              success: true,
              messages: messages || [],
              count: messages?.length || 0
          });
      } catch (e) {
          console.error('[ANTIGRAVITY] Exception:', e);
          return res.status(500).json({ success: false, error: e.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
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
      // get-messages is a read-only operation — apply the read limit (higher allowance)
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
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
                  message_type,
                  media_metadata,
                  created_at,
                  updated_at,
                  sender_id,
                  is_deleted,
                  is_edited,
                  profiles:sender_id (id, username, avatar_url, is_vip)
              `)
              .eq('conversation_id', conversationId)
              .eq('is_deleted', false);

          // Pagination: load messages before a given timestamp
          if (before) {
              // Backward pagination: descending to get the N most recent before cursor
              query = query.lt('created_at', before)
                  .order('created_at', { ascending: false })
                  .limit(pageLimit);
          } else {
              // Initial load: descending to get newest N, then reverse for display
              query = query.order('created_at', { ascending: false })
                  .limit(pageLimit);
          }

          const { data: messages, error } = await query;

          if (error) {
              console.warn('[ANTIGRAVITY] Error fetching messages:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          const normalized = sorted.map(m => {
              let prof = m.profiles;
              if (m.media_metadata && m.media_metadata.is_club_identity && m.media_metadata.club_id) {
                  prof = {
                      id: m.profiles?.id || m.sender_id,
                      username: m.media_metadata.club_name || m.profiles?.username,
                      avatar_url: m.media_metadata.club_avatar || m.profiles?.avatar_url,
                      is_club_identity: true,
                      club_id: m.media_metadata.club_id,
                      is_vip: m.profiles?.is_vip || false
                  };
              }
              return {
                  ...m,
                  profiles: prof,
                  text: m.content ?? null, // alias content → text for frontend compatibility
              };
          });

          return res.json({
              success: true,
              messages: normalized,
              count: normalized.length
          });
      } catch (e) {
          console.warn('[ANTIGRAVITY] Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

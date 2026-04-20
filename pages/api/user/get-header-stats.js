const { createClient } = require('../../../src/lib/supabaseServerClient');
const { getServerUser, getServerUserWithFallback } = require('../../../src/lib/serverAuth');
import { reportApiError } from '../../../src/lib/sentryWrap';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


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
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      if (!SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ error: 'Service key not configured' });
      }


      // Auth: try local HMAC first, fall back to GoTrue if JWT secret not configured
      const { user: localUser } = await getServerUserWithFallback(req, getSupabase());
      if (!localUser) return res.status(401).json({ error: 'Auth required' });
      const userId = localUser.id;

      try {
          // Fetch profile data for header
          const { data: profile, error } = await getSupabase()
              .from('profiles')
              .select('username, full_name, avatar_url, diamonds, is_vip')
              .eq('id', userId)
              .maybeSingle();

          if (error) {
              console.error('[get-header-stats] Profile error:', error);
              return res.status(500).json({ error: 'Internal server error' });
          }

          if (!profile) {
              return res.status(404).json({ error: 'Profile not found' });
          }

          // Level system removed - no longer using XP

          // Count unread notifications
          const { count: notificationCount } = await getSupabase()
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('read', false);

          // Count unread messages - using social messaging schema
          // Get user's conversations with their last_read_at timestamp
          const { data: conversations } = await getSupabase()
              .from('social_conversation_participants')
              .select('conversation_id, last_read_at')
              .eq('user_id', userId);

          let unreadMessages = 0;
          if (conversations && conversations.length > 0) {
              // OPTIMIZED: Single batch query instead of N+1 per-conversation queries
              const conversationIds = conversations.map(c => c.conversation_id);
              const earliestRead = conversations.reduce((earliest, c) => {
                  const ts = c.last_read_at || '1970-01-01';
                  return ts < earliest ? ts : earliest;
              }, conversations[0].last_read_at || '1970-01-01');

              const { data: allMessages } = await getSupabase()
                  .from('social_messages')
                  .select('conversation_id, created_at')
                  .in('conversation_id', conversationIds)
                  .neq('sender_id', userId)
                  .eq('is_deleted', false)
                  .gt('created_at', earliestRead);

              // Count locally per-conversation last_read_at
              const readMap = new Map(conversations.map(c => [c.conversation_id, c.last_read_at || '1970-01-01']));
              (allMessages || []).forEach(msg => {
                  const lastRead = readMap.get(msg.conversation_id);
                  if (lastRead && msg.created_at > lastRead) unreadMessages++;
              });
          }

          return res.json({
              success: true,
              profile: {
                  username: profile.username,
                  full_name: profile.full_name,
                  avatar_url: profile.avatar_url,
                  diamonds: profile.diamonds ?? 0,
                  is_vip: profile.is_vip || false
              },
              notificationCount: notificationCount || 0,
              unreadMessages
          });
      } catch (e) {
          console.error('[get-header-stats] Exception:', e);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

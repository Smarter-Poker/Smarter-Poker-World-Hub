import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.


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
          // Use a single client reference so all queries share the same connection pool slot
          const sb = getSupabase();

          // BUG-12 FIX: Run ALL 4 queries in parallel instead of sequential waterfall.
          // BUG-29 FIX: Capture single 'sb' reference — prevents re-resolving module singleton
          //             on each getSupabase() call inside Promise.all.
          const [profileResult, socialCountResult, followResult, convResult] = await Promise.all([
              // 1. Profile
              sb.from('profiles')
                  .select('username, full_name, avatar_url, diamonds, is_vip')
                  .eq('id', userId)
                  .maybeSingle(),
              // 2. Unread social notifications count — check both read AND is_read columns for consistency
              sb.from('notifications')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', userId)
                  .or('read.eq.false,is_read.eq.false'),
              // 3. Page followers for poker notifications
              sb.from('page_followers')
                  .select('page_type, page_id')
                  .eq('user_id', userId)
                  .limit(100),
              // 4. Conversations for unread messages count
              sb.from('social_conversation_participants')
                  .select('conversation_id, last_read_at')
                  .eq('user_id', userId),
          ]);

          const profile = profileResult.data;
          if (profileResult.error) {
              console.warn('[get-header-stats] Profile error:', profileResult.error);
              return res.status(500).json({ error: 'Internal server error' });
          }
          if (!profile) {
              return res.status(404).json({ error: 'Profile not found' });
          }

          let notificationCount = socialCountResult.count || 0;
          const conversations = convResult.data || [];

          // BUG-29 FIX: Run poker notif sub-query AND messages sub-query in parallel.
          // Previous: pageNotifs (sequential) → existingReads (sequential) → social_messages (sequential)
          // Now: both secondary fetch groups fire at the same time.
          const [pokerResult, messagesResult] = await Promise.all([
              // Poker notifications sub-flow (only if user follows pages)
              (async () => {
                  if (!followResult.data || followResult.data.length === 0) return 0;
                  const orConditions = followResult.data.map(
                      (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
                  ).join(',');
                  const { data: pageNotifs } = await sb
                      .from('page_notifications')
                      .select('id')
                      .or(orConditions)
                      .limit(100);
                  if (!pageNotifs || pageNotifs.length === 0) return 0;
                  const allIds = pageNotifs.map(n => n.id);
                  const { data: existingReads } = await sb
                      .from('notification_reads')
                      .select('notification_id')
                      .eq('user_id', userId)
                      .in('notification_id', allIds);
                  const readSet = new Set((existingReads || []).map(r => r.notification_id));
                  return allIds.filter(id => !readSet.has(id)).length;
              })(),
              // Unread messages sub-flow
              (async () => {
                  if (conversations.length === 0) return 0;
                  const conversationIds = conversations.map(c => c.conversation_id);
                  const earliestRead = conversations.reduce((earliest, c) => {
                      const ts = c.last_read_at || '1970-01-01';
                      return ts < earliest ? ts : earliest;
                  }, conversations[0].last_read_at || '1970-01-01');
                  const { data: allMessages } = await sb
                      .from('social_messages')
                      .select('conversation_id, created_at')
                      .in('conversation_id', conversationIds)
                      .neq('sender_id', userId)
                      .eq('is_deleted', false)
                      .gt('created_at', earliestRead);
                  const readMap = new Map(conversations.map(c => [c.conversation_id, c.last_read_at || '1970-01-01']));
                  let count = 0;
                  (allMessages || []).forEach(msg => {
                      const lastRead = readMap.get(msg.conversation_id);
                      if (lastRead && msg.created_at > lastRead) count++;
                  });
                  return count;
              })(),
          ]);

          notificationCount += pokerResult;
          const unreadMessages = messagesResult;

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
          console.warn('[get-header-stats] Exception:', e);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

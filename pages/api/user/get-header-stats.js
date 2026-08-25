import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.


const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Upper bound on the unread-message row scan (see the slow path below). The
// header badge saturates at "99+", so a larger scan cannot change the UI.
const MAX_UNREAD_SCAN = 2000;


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
      // AUDIT-FIX (header-audit #11): this is the single most-called endpoint in the
      // app — header mount, profile-updated, vip-status-changed, cross-tab broadcast
      // and every DIAMONDS_EARNED/SPENT event all land here, at up to ~8 DB round-trips
      // each. Sibling routes have always rate-limited; this one never did.
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'POST' && req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }
      
      if (req.method === 'GET') {
          // AUDIT-FIX (header-audit #12): `s-maxage` targets SHARED caches while
          // `private` forbids them — a contradiction. Any intermediary that honoured
          // s-maxage over private would serve one user's diamonds, VIP flag and
          // notification counts to another. This response is per-user; never store it.
          res.setHeader('Cache-Control', 'private, no-store');
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
                  .select('username, full_name, avatar_url, diamonds, is_vip, is_admin')
                  .eq('id', userId)
                  .maybeSingle(),
              // 2. Unread social notifications count.
              // BUGFIX (header-audit #1): this was an `.or(...)` over both legacy columns,
              // which means EITHER flag looking unread counted the row. A row with
              // read=true but is_read=NULL — exactly what every writer that touches only
              // one column produces — matched `is_read.is.null` and was counted as unread
              // forever, so "Mark all read" cleared the badge and the next poll restored
              // it. The intent stated in the old comment was "neither flag set to true";
              // this is that intent, expressed correctly.
              sb.from('notifications')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', userId)
                  .not('read', 'is', true)
                  .not('is_read', 'is', true),
              // 3. Page followers for poker notifications
              sb.from('page_followers')
                  .select('page_type, page_id')
                  .eq('user_id', userId)
                  .limit(100),
              // 4. Conversations for unread messages count
              // BOUNDED DELIBERATELY. conversationIds feeds a .in(...) below,
              // which PostgREST sends as a URL query parameter - a few thousand
              // conversations produces a 414 and this endpoint fails outright.
              // Newest-read first, so the 200 kept are the ones a badge can
              // plausibly be about. Do not remove the order/limit pair.
              sb.from('social_conversation_participants')
                  .select('conversation_id, last_read_at')
                  .eq('user_id', userId)
                  .order('last_read_at', { ascending: false, nullsFirst: false })
                  .limit(200),
          ]);

          const profile = profileResult.data;
          if (profileResult.error) {
              console.warn('[get-header-stats] Profile error:', profileResult.error);
              return res.status(500).json({ error: 'Internal server error' });
          }
          if (!profile) {
              return res.status(404).json({ error: 'Profile not found' });
          }

          // AUDIT-FIX (header-audit #8): socialCountResult.error was never inspected, so
          // any failure — dropped column, RLS change, malformed filter — became a clean
          // `0` with success:true. A broken notifications query then presented to the user
          // as "notifications work, you just have none", invisible to monitoring.
          if (socialCountResult.error) {
              console.warn('[get-header-stats] Notification count error:', socialCountResult.error);
              return res.status(500).json({ error: 'Internal server error' });
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
                  
                  // Chunk follows to avoid HTTP 414 URI Too Long errors.
                  // PERF (header-audit #11): the chunks used to be awaited INSIDE the loop,
                  // so 100 follows meant 5 sequential round-trips before the read-set query
                  // could even start. They are independent — fire them together.
                  const chunkSize = 20;
                  const chunks = [];
                  for (let i = 0; i < followResult.data.length; i += chunkSize) {
                      chunks.push(followResult.data.slice(i, i + chunkSize));
                  }
                  const chunkResults = await Promise.all(chunks.map((chunk) => {
                      const orConditions = chunk.map(
                          (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
                      ).join(',');
                      return sb.from('page_notifications')
                          .select('id')
                          .or(orConditions)
                          .limit(500);
                  }));
                  const allIds = [];
                  for (const { data: pageNotifs, error: chunkErr } of chunkResults) {
                      if (chunkErr) {
                          console.warn('[get-header-stats] page_notifications chunk error:', chunkErr);
                          continue;
                      }
                      if (pageNotifs) allIds.push(...pageNotifs.map(n => n.id));
                  }
                  
                  if (allIds.length === 0) return 0;
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
                  const readMap = new Map(conversations.map(c => [c.conversation_id, c.last_read_at || '1970-01-01']));
                  const earliestRead = conversations.reduce((earliest, c) => {
                      const ts = c.last_read_at || '1970-01-01';
                      return ts < earliest ? ts : earliest;
                  }, conversations[0].last_read_at || '1970-01-01');

                  // PERF (2026-08-24): this query had NO .limit() at all. A user
                  // with a busy inbox pulled every matching social_messages row
                  // across every conversation into this process on EVERY header
                  // refresh, purely to compute one integer.
                  //
                  // FAST PATH - when every conversation shares the same
                  // last_read_at floor (a single conversation, or a user who is
                  // fully caught up, which is the common case) the
                  // per-conversation comparison below is redundant: the global
                  // floor IS the per-conversation floor. Ask Postgres for the
                  // number and transfer zero rows.
                  const distinctFloors = new Set(readMap.values());
                  if (distinctFloors.size <= 1) {
                      const { count, error: countErr } = await sb
                          .from('social_messages')
                          // '*' with head:true transfers no rows and does not
                          // depend on any particular column existing - same
                          // form as the notifications count above.
                          .select('*', { count: 'exact', head: true })
                          .in('conversation_id', conversationIds)
                          .neq('sender_id', userId)
                          .eq('is_deleted', false)
                          .gt('created_at', earliestRead);
                      if (countErr) {
                          console.warn('[get-header-stats] unread message count error:', countErr);
                          return 0;
                      }
                      return count || 0;
                  }

                  // SLOW PATH - floors differ per conversation, so rows really
                  // are needed for the comparison. Now BOUNDED: the badge
                  // renders "99+" above 99, so scanning past MAX_UNREAD_SCAN
                  // cannot change what the user actually sees.
                  const { data: allMessages } = await sb
                      .from('social_messages')
                      .select('conversation_id, created_at')
                      .in('conversation_id', conversationIds)
                      .neq('sender_id', userId)
                      .eq('is_deleted', false)
                      .gt('created_at', earliestRead)
                      // ORDER BY is required, not cosmetic: a bare LIMIT in
                      // Postgres returns ARBITRARY rows. Newest-first
                      // guarantees the rows scanned are the ones actually
                      // unread, so the badge stays exact below the 99 cap.
                      .order('created_at', { ascending: false })
                      .limit(MAX_UNREAD_SCAN);
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
                  is_vip: profile.is_vip || false,
                  is_admin: profile.is_admin || false
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

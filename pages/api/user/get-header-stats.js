import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getMessengerUnreadSummary } from '../../../src/lib/messengerWorkspace.mjs';

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
          const [profileResult, socialCountResult, followResult, messengerSummary] = await Promise.all([
              // 1. Profile
              sb.from('profiles')
                  .select('username, full_name, avatar_url, arena_avatar_url, use_avatar_as_profile_pic, diamonds, is_vip, vip_expires_at, is_admin')
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
              sb.from('personal_notifications')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', userId)
                  .or('type.is.null,type.neq.accounting_invoice_detail')
                  .not('read', 'is', true)
                  .not('is_read', 'is', true),
              // 3. Page followers for poker notifications
              sb.from('page_followers')
                  .select('page_type, page_id')
                  .eq('user_id', userId)
                  .limit(100),
              getMessengerUnreadSummary(sb, userId),
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
          if (followResult.error) {
              console.warn('[get-header-stats] Notification follows error:', followResult.error);
              return res.status(500).json({ error: 'Internal server error' });
          }
          let notificationCount = socialCountResult.count || 0;
          // Page notification reads depend on the followed pages fetched above.
          const pokerResult = await (async () => {
                  // Use the feed's same validated followed-page boundary. Each page
                  // belongs to one chunk so its signals cannot be counted twice.
                  const follows = [...new Map((followResult.data || []).filter(f =>
                      /^[A-Za-z0-9_]{1,32}$/.test(String(f.page_type || '')) &&
                      /^[A-Za-z0-9_-]{1,64}$/.test(String(f.page_id || ''))
                  ).map(f => [`${f.page_type}:${f.page_id}`, f])).values()];
                  if (follows.length === 0) return 0;
                  
                  // Chunk follows to avoid HTTP 414 URI Too Long errors.
                  // PERF (header-audit #11): the chunks used to be awaited INSIDE the loop,
                  // so 100 follows meant 5 sequential round-trips before the read-set query
                  // could even start. They are independent — fire them together.
                  const chunkSize = 20;
                  const chunks = [];
                  for (let i = 0; i < follows.length; i += chunkSize) {
                      chunks.push(follows.slice(i, i + chunkSize));
                  }
                  const chunkCounts = await Promise.all(chunks.map(async (chunk) => {
                      const orConditions = chunk.map(
                          (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
                      ).join(',');
                      // Bound each request and its read-receipt filter, without
                      // cutting older reachable notifications out of the count.
                      const pageSize = 100;
                      let afterId = null, unread = 0;
                      for (;;) {
                          let query = sb.from('page_notifications').select('id').or(orConditions)
                              .order('id', { ascending: true }).limit(pageSize);
                          if (afterId) query = query.gt('id', afterId);
                          const { data: rows, error: pageError } = await query;
                          if (pageError) throw pageError;
                          const ids = (rows || []).map(row => row.id);
                          if (!ids.length) break;
                          const { data: reads, error: readError } = await sb.from('notification_reads')
                              .select('notification_id').eq('user_id', userId)
                              .in('notification_id', ids).limit(ids.length);
                          if (readError) throw readError;
                          const readSet = new Set((reads || []).map(row => row.notification_id));
                          unread += ids.filter(id => !readSet.has(id)).length;
                          if (ids.length < pageSize) break;
                          const nextId = ids.at(-1);
                          if (afterId && nextId <= afterId) throw new Error('Notification Cursor Did Not Advance');
                          afterId = nextId;
                      }
                      return unread;
                  }));
                  return chunkCounts.reduce((total, count) => total + count, 0);
          })();

          notificationCount += pokerResult;
          const unreadMessages = messengerSummary.total;

          return res.json({
              success: true,
              profile: {
                  username: profile.username,
                  full_name: profile.full_name,
                  avatar_url: profile.avatar_url,
                  arena_avatar_url: profile.arena_avatar_url,
                  use_avatar_as_profile_pic: profile.use_avatar_as_profile_pic === true,
                  diamonds: profile.diamonds ?? 0,
                  is_vip: profile.is_vip || false,
                  vip_expires_at: profile.vip_expires_at,
                  is_admin: profile.is_admin || false
              },
              notificationCount: notificationCount || 0,
              unreadMessages,
              messengerUnread: messengerSummary,
          });
      } catch (e) {
          console.warn('[get-header-stats] Exception:', e);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

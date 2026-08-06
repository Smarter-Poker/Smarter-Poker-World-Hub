import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
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



// page_id is arbitrary caller-chosen text (POST /api/poker/follow accepts any
// string). It is interpolated into a raw PostgREST .or() filter below, so a
// value containing ')' or ',' reshapes the filter — or simply 500s the feed.
// Only ids matching this charset are queryable; anything else is skipped.
const SAFE_PAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_PAGE_TYPE = /^[A-Za-z0-9_]{1,32}$/;

// page_activity.user_id is `uuid NOT NULL`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Helper: extract verified user ID from JWT, or null */
async function getVerifiedUserId(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: authData, error } = await getSupabase().auth.getUser(token);
  const user = authData?.user;
  return (!error && user) ? user.id : null;
}

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET, POST, PUT, DELETE, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {
    // CDN cache: fresh for 60s, serve stale up to 300s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }

    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // Set CORS headers

    // Handle preflight

    try {
      if (req.method === 'POST') {
        // Require JWT auth for writes or admin secret
        // SECURITY: admin bypass only counts when ADMIN_ROUTE_SECRET is actually configured,
        // otherwise `undefined !== undefined` would treat every caller as an admin.
        const adminSecret = req.headers['x-admin-secret'];
        const envAdminSecret = process.env.ADMIN_ROUTE_SECRET;
        const isAdmin = Boolean(envAdminSecret) && adminSecret === envAdminSecret;
        // page_activity.user_id is `uuid NOT NULL`. This used to fall back to the
        // literal string 'admin', which Postgres rejects with 22P02
        // ("invalid input syntax for type uuid") — so the admin-secret path, the
        // ONLY path that can publish page activity, failed on every request.
        // Resolve a real UUID instead: the caller's JWT, an explicit body
        // `user_id`, or a configured system account.
        let verifiedUserId = await getVerifiedUserId(req);
        if (isAdmin) {
          if (!verifiedUserId) {
            const bodyUserId = typeof req.body?.user_id === 'string' ? req.body.user_id.trim() : '';
            const systemUserId = (process.env.SYSTEM_ACTIVITY_USER_ID || '').trim();
            if (UUID_RE.test(bodyUserId)) verifiedUserId = bodyUserId;
            else if (UUID_RE.test(systemUserId)) verifiedUserId = systemUserId;
          }
          if (!verifiedUserId) {
            return res.status(400).json({
              success: false,
              error: 'page_activity.user_id must be a UUID — send an Authorization bearer token, a body user_id, or configure SYSTEM_ACTIVITY_USER_ID',
            });
          }
        } else {
          if (!verifiedUserId) {
            return res.status(401).json({ success: false, error: 'Authentication required for posting activity' });
          }
          // Only admins can post activities right now. User comments would go to a different table.
          return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required to post official page activities' });
        }

        const { page_type, page_id, content, activity_type } = req.body;

        if (!page_type || !page_id || !content || !activity_type) {
          return res.status(400).json({ success: false, error: 'Missing required fields: page_type, page_id, content, activity_type' });
        }

        const validTypes = ['update', 'announcement', 'promotion', 'result'];
        if (!validTypes.includes(activity_type)) {
          return res.status(400).json({ success: false, error: `Invalid activity_type. Must be one of: ${validTypes.join(', ')}` });
        }

        const { data, error } = await getSupabase()
          .from('page_activity')
          .insert({
            page_type,
            page_id,
            user_id: verifiedUserId,
            content,
            activity_type,
            created_at: new Date().toISOString(),
            likes_count: 0,
          })
          .select()
          .maybeSingle();

        if (error) {
          // Log the code + message: the previous opaque log hid a hard 22P02
          // uuid failure on every single insert.
          console.warn('Error creating activity:', error.code, error.message);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        return res.status(201).json({ success: true, activity: data });
      }

      if (req.method === 'GET') {
        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const page_type = safeQ(req.query.page_type);
        const page_id = safeQ(req.query.page_id);
        const user_id = safeQ(req.query.user_id);
        const feed = safeQ(req.query.feed);
        const rawLimit = safeQ(req.query.limit) || '20';
        const rawOffset = safeQ(req.query.offset) || '0';
        // BUG FIX: cap limit+offset to safe bounds to prevent runaway range queries
        const limitNum = Math.min(Math.max(parseInt(rawLimit, 10) || 20, 1), 100);
        const offsetNum = Math.min(Math.max(parseInt(rawOffset, 10) || 0, 0), 10000);

        // User feed mode: get activities from pages the user follows
        if (feed === 'true') {
          // IDENTITY: this is a per-user feed (what venues and clubs someone
          // follows). It used to take `user_id` straight off the query string
          // with no JWT check, so anyone holding a user id — they appear in
          // review and check-in payloads — could read another user's follow
          // graph. Identity now comes from the bearer token only.
          const verifiedUserId = await getVerifiedUserId(req);
          if (!verifiedUserId) {
            return res.status(401).json({ success: false, error: 'Authentication required for the personalised feed' });
          }
          if (user_id && user_id !== verifiedUserId) {
            return res.status(403).json({ success: false, error: 'Cannot read another user feed' });
          }
          // A per-user response must never sit in the shared edge cache.
          res.setHeader('Cache-Control', 'private, no-store');

          // First get pages the user follows
          const { data: follows, error: followError } = await getSupabase()
            .from('page_followers')
            .select('page_type, page_id')
            .eq('user_id', verifiedUserId)
                .limit(100);

          if (followError) {
            console.warn('Error fetching follows:', followError);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          if (!follows || follows.length === 0) {
            return res.status(200).json({ success: true, activities: [], total: 0 });
          }

          // Build OR filter for all followed pages — skipping any row whose
          // page_type/page_id cannot be safely interpolated (see SAFE_PAGE_ID).
          const safeFollows = follows.filter(
            (f) => SAFE_PAGE_TYPE.test(String(f.page_type || '')) && SAFE_PAGE_ID.test(String(f.page_id || ''))
          );
          if (safeFollows.length === 0) {
            return res.status(200).json({ success: true, activities: [], total: 0 });
          }
          const orConditions = safeFollows.map(
            (f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`
          ).join(',');

          const { data, error } = await getSupabase()
            .from('page_activity')
            .select('*')
            .or(orConditions)
            .order('created_at', { ascending: false })
            .range(offsetNum, offsetNum + limitNum - 1);

          if (error) {
            console.warn('Error fetching feed:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, activities: data || [] });
        }

        // Page activity mode
        if (page_type && page_id) {
          const { data, error } = await getSupabase()
            .from('page_activity')
            .select('*')
            .eq('page_type', page_type)
            .eq('page_id', page_id)
            .order('created_at', { ascending: false })
            .range(offsetNum, offsetNum + limitNum - 1);

          if (error) {
            console.warn('Error fetching activities:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, activities: data || [] });
        }

        return res.status(400).json({ success: false, error: 'Must provide page_type+page_id or user_id+feed=true' });
      }

      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    } catch (err) {
      console.warn('Activity API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

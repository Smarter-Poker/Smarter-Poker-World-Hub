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
        // page_activity.user_id is NOT NULL, so admins without a JWT are attributed to 'admin'.
        let verifiedUserId = await getVerifiedUserId(req);
        if (isAdmin) {
          verifiedUserId = verifiedUserId || 'admin';
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
          console.warn('Error creating activity:', error);
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
        if (user_id && feed === 'true') {
          // First get pages the user follows
          const { data: follows, error: followError } = await getSupabase()
            .from('page_followers')
            .select('page_type, page_id')
            .eq('user_id', user_id)
                .limit(100);

          if (followError) {
            console.warn('Error fetching follows:', followError);
            return res.status(500).json({ success: false, error: followError.message });
          }

          if (!follows || follows.length === 0) {
            return res.status(200).json({ success: true, activities: [], total: 0 });
          }

          // Build OR filter for all followed pages
          const orConditions = follows.map(
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

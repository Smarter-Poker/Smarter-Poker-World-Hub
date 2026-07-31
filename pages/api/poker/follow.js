import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Follow/Unfollow API for Poker Pages (venues, tours, series)
 *
 * POST /api/poker/follow
 *   body: { page_type: 'venue'|'tour'|'series', page_id: string, action: 'follow'|'unfollow' }
 *   header: user_id (from auth or x-user-id header for now)
 *
 * GET /api/poker/follow?user_id=X
 *   Returns all pages a user follows
 *
 * GET /api/poker/follow?page_type=venue&page_id=123
 *   Returns follower count for a page
 */

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

// UUID v4 format check — page_followers.user_id is UUID type
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET, POST, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      try {
          if (req.method === 'GET') {
              return handleGet(req, res);
          } else if (req.method === 'POST') {
              return handlePost(req, res);
          } else {
              return res.status(405).json({ success: false, error: 'Method not allowed' });
          }
      } catch (error) {
          console.warn('[Follow API] Execution error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleGet(req, res) {
    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const user_id = safeQ(req.query.user_id);
    const page_type = safeQ(req.query.page_type);
    const page_id = safeQ(req.query.page_id);
    const checkUserId = safeQ(req.query.check_user);

    // Get all follows for a user
    if (user_id) {
        // Anonymous/non-UUID user IDs can't be in page_followers (UUID column)
        if (!UUID_RE.test(user_id)) {
            return res.status(200).json({ success: true, data: [], total: 0 });
        }

        const { data, error } = await getSupabase()
            .from('page_followers')
            .select('*')
            .eq('user_id', user_id)
            .limit(100);

        if (error) {
            console.warn('Error fetching follows:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch follows' });
        }

        return res.status(200).json({
            success: true,
            data: data || [],
            total: (data || []).length,
        });
    }

    // Check if specific user follows a specific page — must come BEFORE the
    // follower-count branch because both require page_type + page_id.
    if (checkUserId && page_type && page_id) {
        if (!UUID_RE.test(checkUserId)) {
            return res.status(200).json({ success: true, is_following: false });
        }
        const { data, error } = await getSupabase()
            .from('page_followers')
            .select('id')
            .eq('user_id', checkUserId)
            .eq('page_type', page_type)
            .eq('page_id', String(page_id))
            .maybeSingle();

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to check follow status' });
        }

        return res.status(200).json({
            success: true,
            is_following: !!data,
        });
    }

    // Get follower count for a specific page
    if (page_type && page_id) {
        const { count, error } = await getSupabase()
            .from('page_followers')
            .select('*', { count: 'exact', head: true })
            .eq('page_type', page_type)
            .eq('page_id', String(page_id))
            .limit(100);

        if (error) {
            console.warn('Error fetching follower count:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch follower count' });
        }

        return res.status(200).json({
            success: true,
            page_type,
            page_id,
            follower_count: count || 0,
        });
    }

    return res.status(400).json({ success: false, error: 'Provide user_id or page_type+page_id' });
}


/**
 * Cross-sync follow/unfollow to social_page_followers when a linked social page exists.
 * Best-effort: failures here don't affect the main follow operation.
 * Only works for authenticated (UUID) user IDs - anonymous IDs are silently skipped.
 */
async function syncToSocialPageFollowers(userId, pageType, pageIdStr, action) {
    try {
        // Only sync entities that have social pages (venues, tours, series, home_groups, charity)
        if (!['venue', 'tour', 'series', 'home_group', 'charity'].includes(pageType)) return;
        // Skip anonymous user IDs (not valid UUIDs for social_page_followers FK)
        if (!userId || userId.startsWith('anon-')) return;

        const { data: socialPage } = await getSupabase()
            .from('social_pages')
            .select('id')
            .eq('linked_entity_type', pageType)
            .eq('linked_entity_id', pageIdStr)
            .maybeSingle();

        if (!socialPage) return;

        if (action === 'follow') {
            const { error: err_social_page_followers_phxnp } = await getSupabase()
              .from('social_page_followers')
              .upsert({
                    page_id: socialPage.id,
                    user_id: userId,
                    role: 'follower',
                    notifications_enabled: true,
                }, { onConflict: 'page_id,user_id' });
            if (err_social_page_followers_phxnp) console.warn('[Supabase] Silent mutation failed in social_page_followers:', err_social_page_followers_phxnp.message);
        } else {
            const { error: err_social_page_followers_toy5p } = await getSupabase()
              .from('social_page_followers')
              .delete()
                .eq('page_id', socialPage.id)
                .eq('user_id', userId);
            if (err_social_page_followers_toy5p) console.warn('[Supabase] Silent mutation failed in social_page_followers:', err_social_page_followers_toy5p.message);
        }
    } catch (e) {
        try { reportApiError(e, null); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        // Silent - cross-sync is best-effort
        console.warn('[Follow API] Social page cross-sync error:', e.message);
    }
}

async function handlePost(req, res) {
    const { page_type, page_id, action } = req.body;

    // Require JWT for follow/unfollow writes
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required for follow/unfollow' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    /* removed duplicate authUser */
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = authUser.id;

    if (!page_type || !page_id) {
        return res.status(400).json({ success: false, error: 'page_type and page_id are required' });
    }
    if (typeof page_type !== 'string' || (typeof page_id !== 'string' && typeof page_id !== 'number')) {
        return res.status(400).json({ success: false, error: 'Invalid input types' });
    }
    if (!['venue', 'tour', 'series', 'home_group', 'charity'].includes(page_type)) {
        return res.status(400).json({ success: false, error: 'invalid_page_type' });
    }
    if (!['follow', 'unfollow'].includes(action)) {
        return res.status(400).json({ success: false, error: 'action must be follow or unfollow' });
    }

    // Normalize tour page_id to uppercase (tour registry uses uppercase codes like WPT, WSOP)
    const pageIdStr = page_type === 'tour' ? String(page_id).toUpperCase() : String(page_id);

    if (action === 'follow') {
        // Upsert - insert if not exists
        const { data: existing } = await getSupabase()
            .from('page_followers')
            .select('id')
            .eq('user_id', userId)
            .eq('page_type', page_type)
            .eq('page_id', pageIdStr)
            .maybeSingle();

        if (existing) {
            // Already following
            return res.status(200).json({
                success: true,
                action: 'already_following',
                page_type,
                page_id: pageIdStr,
            });
        }

        const { error } = await getSupabase()
            .from('page_followers')
            .insert({
                user_id: userId,
                page_type,
                page_id: pageIdStr,
            });

        if (error) {
            // Handle race condition: concurrent requests can both pass the existing check,
            // and one will hit the unique constraint. Return already_following instead of 500.
            if (error.code === '23505') {
                return res.status(200).json({
                    success: true,
                    action: 'already_following',
                    page_type,
                    page_id: pageIdStr,
                });
            }
            console.warn('Error following page:', error);
            return res.status(500).json({ success: false, error: 'Failed to follow' });
        }

        // Cross-sync to social page followers (best-effort)
        await syncToSocialPageFollowers(userId, page_type, pageIdStr, 'follow');

        return res.status(200).json({
            success: true,
            action: 'followed',
            page_type,
            page_id: pageIdStr,
        });
    }

    if (action === 'unfollow') {
        const { error } = await getSupabase()
            .from('page_followers')
            .delete()
            .eq('user_id', userId)
            .eq('page_type', page_type)
            .eq('page_id', pageIdStr);

        if (error) {
            console.warn('Error unfollowing page:', error);
            return res.status(500).json({ success: false, error: 'Failed to unfollow' });
        }

        // Cross-sync to social page followers (best-effort)
        await syncToSocialPageFollowers(userId, page_type, pageIdStr, 'unfollow');

        return res.status(200).json({
            success: true,
            action: 'unfollowed',
            page_type,
            page_id: pageIdStr,
        });
    }
}

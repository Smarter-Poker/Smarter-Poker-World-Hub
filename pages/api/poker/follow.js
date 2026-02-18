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

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            return handleGet(req, res);
        } else if (req.method === 'POST') {
            return handlePost(req, res);
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Follow API error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

async function handleGet(req, res) {
    const { user_id, page_type, page_id } = req.query;

    // Get all follows for a user
    if (user_id) {
        const { data, error } = await supabase
            .from('page_followers')
            .select('*')
            .eq('user_id', user_id);

        if (error) {
            console.error('Error fetching follows:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({
            success: true,
            data: data || [],
            total: (data || []).length,
        });
    }

    // Get follower count for a specific page
    if (page_type && page_id) {
        const { count, error } = await supabase
            .from('page_followers')
            .select('*', { count: 'exact', head: true })
            .eq('page_type', page_type)
            .eq('page_id', String(page_id));

        if (error) {
            console.error('Error fetching follower count:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({
            success: true,
            page_type,
            page_id,
            follower_count: count || 0,
        });
    }

    // Check if specific user follows a specific page
    const checkUserId = req.query.check_user;
    if (checkUserId && page_type && page_id) {
        const { data, error } = await supabase
            .from('page_followers')
            .select('id')
            .eq('user_id', checkUserId)
            .eq('page_type', page_type)
            .eq('page_id', String(page_id))
            .maybeSingle();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({
            success: true,
            is_following: !!data,
        });
    }

    return res.status(400).json({ error: 'Provide user_id or page_type+page_id' });
}

/**
 * Cross-sync follow/unfollow to social_page_followers when a linked social page exists.
 * Best-effort: failures here don't affect the main follow operation.
 * Only works for authenticated (UUID) user IDs - anonymous IDs are silently skipped.
 */
async function syncToSocialPageFollowers(userId, pageType, pageIdStr, action) {
    try {
        // Only sync venue follows (social pages link via linked_venue_id)
        if (pageType !== 'venue') return;
        // Skip anonymous user IDs (not valid UUIDs for social_page_followers FK)
        if (!userId || userId.startsWith('anon-')) return;

        const { data: socialPage } = await supabase
            .from('social_pages')
            .select('id')
            .eq('linked_venue_id', pageIdStr)
            .maybeSingle();

        if (!socialPage) return;

        if (action === 'follow') {
            await supabase
                .from('social_page_followers')
                .upsert({
                    page_id: socialPage.id,
                    user_id: userId,
                    role: 'follower',
                    notifications_enabled: true,
                }, { onConflict: 'page_id,user_id' });
        } else {
            await supabase
                .from('social_page_followers')
                .delete()
                .eq('page_id', socialPage.id)
                .eq('user_id', userId);
        }
    } catch (e) {
        // Silent - cross-sync is best-effort
        console.warn('[Follow API] Social page cross-sync error:', e.message);
    }
}

async function handlePost(req, res) {
    const { page_type, page_id, action } = req.body;
    const userId = req.headers['x-user-id'] || req.body.user_id;

    // Validate inputs
    if (!page_type || !page_id) {
        return res.status(400).json({ error: 'page_type and page_id are required' });
    }
    if (!['venue', 'tour', 'series'].includes(page_type)) {
        return res.status(400).json({ error: 'page_type must be venue, tour, or series' });
    }
    if (!['follow', 'unfollow'].includes(action)) {
        return res.status(400).json({ error: 'action must be follow or unfollow' });
    }
    if (!userId) {
        return res.status(400).json({ error: 'user_id is required (body or x-user-id header)' });
    }

    const pageIdStr = String(page_id);

    if (action === 'follow') {
        // Upsert - insert if not exists
        const { data: existing } = await supabase
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

        const { error } = await supabase
            .from('page_followers')
            .insert({
                user_id: userId,
                page_type,
                page_id: pageIdStr,
            });

        if (error) {
            console.error('Error following page:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        // Cross-sync to social page followers (best-effort)
        syncToSocialPageFollowers(userId, page_type, pageIdStr, 'follow');

        return res.status(200).json({
            success: true,
            action: 'followed',
            page_type,
            page_id: pageIdStr,
        });
    }

    if (action === 'unfollow') {
        const { error } = await supabase
            .from('page_followers')
            .delete()
            .eq('user_id', userId)
            .eq('page_type', page_type)
            .eq('page_id', pageIdStr);

        if (error) {
            console.error('Error unfollowing page:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        // Cross-sync to social page followers (best-effort)
        syncToSocialPageFollowers(userId, page_type, pageIdStr, 'unfollow');

        return res.status(200).json({
            success: true,
            action: 'unfollowed',
            page_type,
            page_id: pageIdStr,
        });
    }
}

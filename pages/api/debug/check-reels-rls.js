/**
 * DEBUG ENDPOINT: Check RLS policies for reels
 * This endpoint helps diagnose why reels aren't loading for authenticated users
 */

import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';

export default async function handler(req, res) {
    // Block debug endpoints in production
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    try {
        const user = await getAuthUser(req);

        // Test 1: Query as authenticated user (with session)
        const { data: reelsWithAuth, error: authError } = await supabase
            .from('social_reels')
            .select('id, author_id, caption, video_url, view_count, created_at, is_public')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(10);

        // Test 2: Query as anonymous user (without session)
        const { data: reelsAnon, error: anonError } = await supabase.auth.signOut();
        const anonSupabase = supabase;
        const { data: reelsWithoutAuth, error: noAuthError } = await anonSupabase
            .from('social_reels')
            .select('id, author_id, caption, video_url, view_count, created_at, is_public')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(10);

        // Test 3: Query social_posts
        const { data: postsData, error: postsError } = await supabase
            .from('social_posts')
            .select('id, author_id, content, media_urls, like_count, created_at')
            .eq('content_type', 'video')
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(10);

        return res.status(200).json({
            user: user ? {
                id: user.id,
                email: user.email,
                username: user.username
            } : null,
            tests: {
                authenticatedReels: {
                    count: reelsWithAuth?.length || 0,
                    error: authError?.message || null,
                    sample: reelsWithAuth?.[0] || null
                },
                anonymousReels: {
                    count: reelsWithoutAuth?.length || 0,
                    error: noAuthError?.message || null,
                    sample: reelsWithoutAuth?.[0] || null
                },
                posts: {
                    count: postsData?.length || 0,
                    error: postsError?.message || null,
                    sample: postsData?.[0] || null
                }
            },
            diagnosis: {
                rlsBlocking: (reelsWithAuth?.length || 0) === 0 && (reelsWithoutAuth?.length || 0) > 0,
                noDataInDb: (reelsWithAuth?.length || 0) === 0 && (reelsWithoutAuth?.length || 0) === 0,
                workingCorrectly: (reelsWithAuth?.length || 0) > 0
            }
        });
    } catch (error) {
        return res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
}

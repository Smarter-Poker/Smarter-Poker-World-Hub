/**
 * 🚨 EMERGENCY CLEANUP API
 * Deletes all AI-generated photo posts from horses
 * This endpoint should be called once to clean up violating content
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Only allow POST with secret
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // BUG #239 FIX: Require real env var — no hardcoded fallback
    const authHeader = req.headers.authorization;
    if (!process.env.CLEANUP_SECRET || authHeader !== `Bearer ${process.env.CLEANUP_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );


    try {
        // Get all horse profile IDs
        const { data: horses } = await supabase
            .from('content_authors')
            .select('profile_id')
            .not('profile_id', 'is', null);

        const horseIds = (horses || []).map(h => h.profile_id);

        // Delete photo posts
        const { data: deletedPosts, error: postError } = await supabase
            .from('social_posts')
            .delete()
            .in('author_id', horseIds)
            .eq('content_type', 'photo')
            .select('id');

        if (postError) {
            console.error('Post delete error:', postError);
        }

        // Delete image stories
        const { data: deletedStories, error: storyError } = await supabase
            .from('stories')
            .delete()
            .in('author_id', horseIds)
            .eq('media_type', 'image')
            .select('id');

        if (storyError) {
            console.error('Story delete error:', storyError);
        }

        const result = {
            success: true,
            deleted_posts: deletedPosts?.length || 0,
            deleted_stories: deletedStories?.length || 0,
            timestamp: new Date().toISOString()
        };

        return res.status(200).json(result);

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

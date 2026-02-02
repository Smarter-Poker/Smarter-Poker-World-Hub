// Test endpoint to diagnose Reels RLS issue
import { supabase } from '../../../src/lib/supabase';

export default async function handler(req, res) {
    try {
        console.log('🔍 Testing Reels access...\n');

        // Test 1: Query social_reels
        const { data: reelsData, error: reelsError } = await supabase
            .from('social_reels')
            .select('id, caption, video_url, is_public, created_at')
            .eq('is_public', true)
            .limit(5);

        // Test 2: Query social_posts  
        const { data: postsData, error: postsError } = await supabase
            .from('social_posts')
            .select('id, content, media_urls, content_type, visibility')
            .eq('content_type', 'video')
            .eq('visibility', 'public')
            .limit(5);

        // Test 3: Check RLS policies
        const { data: policies, error: policiesError } = await supabase
            .from('pg_policies')
            .select('*')
            .or('tablename.eq.social_reels,tablename.eq.social_posts');

        const result = {
            timestamp: new Date().toISOString(),
            tests: {
                social_reels: {
                    success: !reelsError,
                    count: reelsData?.length || 0,
                    error: reelsError?.message || null,
                    sample: reelsData?.[0] || null
                },
                social_posts: {
                    success: !postsError,
                    count: postsData?.length || 0,
                    error: postsError?.message || null,
                    sample: postsData?.[0] || null
                },
                rls_policies: {
                    success: !policiesError,
                    count: policies?.length || 0,
                    error: policiesError?.message || null,
                    policies: policies || []
                }
            }
        };

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

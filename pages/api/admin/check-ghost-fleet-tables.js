/**
 * Comprehensive database table checker for Ghost Fleet
 * GET /api/admin/check-ghost-fleet-tables
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const tables = {};

        // Check posted_clips (poker clips)
        const { count: pokerClips, error: e1 } = await supabase
            .from('posted_clips')
            .select('*', { count: 'exact', head: true });
        tables.posted_clips = { exists: !e1, count: pokerClips, error: e1?.message };

        // Check sports_clips table
        const { count: sportsClipsCount, error: e2 } = await supabase
            .from('sports_clips')
            .select('*', { count: 'exact', head: true });
        tables.sports_clips = { exists: !e2, count: sportsClipsCount, error: e2?.message };

        // Check stories table
        const { count: storiesCount, error: e3 } = await supabase
            .from('stories')
            .select('*', { count: 'exact', head: true });
        tables.stories = { exists: !e3, count: storiesCount, error: e3?.message };

        // Check social_posts table
        const { count: postsCount, error: e4 } = await supabase
            .from('social_posts')
            .select('*', { count: 'exact', head: true });
        tables.social_posts = { exists: !e4, count: postsCount, error: e4?.message };

        // Check horse_source_assignments
        const { count: assignmentsCount, error: e5 } = await supabase
            .from('horse_source_assignments')
            .select('*', { count: 'exact', head: true });
        tables.horse_source_assignments = { exists: !e5, count: assignmentsCount, error: e5?.message };

        // Check content_authors (horses)
        const { count: horsesCount, error: e6 } = await supabase
            .from('content_authors')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
        tables.content_authors = { exists: !e6, count: horsesCount, error: e6?.message };

        return res.status(200).json({
            success: true,
            tables,
            summary: {
                all_tables_exist: Object.values(tables).every(t => t.exists),
                total_poker_clips: pokerClips || 0,
                total_sports_clips: sportsClipsCount || 0,
                total_stories: storiesCount || 0,
                total_posts: postsCount || 0,
                total_source_assignments: assignmentsCount || 0,
                active_horses: horsesCount || 0
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

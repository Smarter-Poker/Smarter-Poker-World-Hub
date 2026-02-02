/**
 * Cleanup Synthetic News API
 * Removes fake/synthetic news articles from the poker_news table
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Known synthetic news titles that should never exist
const SYNTHETIC_TITLES = [
    'Major Tournament Series Kicks Off This Weekend',
    'New Strategy Guide: Mastering Position Play',
    'Industry Update: Online Poker Continues Growth',
    'Pro Player Shares Insights on Bankroll Management',
    'Weekend Poker Roundup: Key Highlights'
];

export default async function handler(req, res) {
    try {
        console.log('[Cleanup] Starting synthetic news cleanup...');

        // Delete articles with known synthetic titles
        const { data: deletedByTitle, error: titleError } = await supabase
            .from('poker_news')
            .delete()
            .in('title', SYNTHETIC_TITLES)
            .select();

        if (titleError) {
            console.error('[Cleanup] Error deleting by title:', titleError);
        }

        // Delete articles with source_name = 'Smarter.Poker' (synthetic source)
        const { data: deletedBySource, error: sourceError } = await supabase
            .from('poker_news')
            .delete()
            .eq('source_name', 'Smarter.Poker')
            .select();

        if (sourceError) {
            console.error('[Cleanup] Error deleting by source:', sourceError);
        }

        // Also clean up any social posts that were created from synthetic news
        const { data: deletedPosts, error: postsError } = await supabase
            .from('social_posts')
            .delete()
            .eq('content_type', 'article')
            .like('content', '%#PokerNews #SmarterPoker%')
            .select();

        if (postsError) {
            console.error('[Cleanup] Error deleting social posts:', postsError);
        }

        const totalDeleted = (deletedByTitle?.length || 0) + (deletedBySource?.length || 0);
        const postsDeleted = deletedPosts?.length || 0;

        console.log(`[Cleanup] Complete. Deleted ${totalDeleted} synthetic news articles and ${postsDeleted} social posts.`);

        return res.status(200).json({
            success: true,
            message: 'Cleanup complete',
            deleted: {
                byTitle: deletedByTitle?.length || 0,
                bySource: deletedBySource?.length || 0,
                socialPosts: postsDeleted
            },
            totalNewsDeleted: totalDeleted,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Cleanup] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

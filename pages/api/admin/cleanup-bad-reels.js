/**
 * 🧹 CLEANUP BAD YOUTUBE TITLES
 * Removes social_reels entries with YouTube UI text as titles
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const INVALID_TITLE_PATTERNS = [
    'keyboard shortcuts',
    'sign in to youtube',
    'sign in',
    'watch on youtube',
    'share',
    'save',
    'report',
    'transcript',
    'show transcript',
    'more videos',
    'autoplay',
    'settings',
    'full screen',
    'theater mode',
    'miniplayer',
    'watch later',
    'subtitles and closed captions',
    'subtitles',
    'closed captions',
    'general',
    'playback',
    'spherical videos',
    'annotations',
    'cards',
    'end screens',
    'quality',
    'speed'
];

export default async function handler(req, res) {
    console.log('\n🧹 CLEANING UP BAD YOUTUBE TITLES');
    console.log('═'.repeat(60));

    try {
        // Get all reels
        const { data: reels, error: fetchError } = await supabase
            .from('social_reels')
            .select('id, caption, video_url');

        if (fetchError) {
            console.error('Error fetching reels:', fetchError);
            return res.status(500).json({ error: fetchError.message });
        }

        console.log(`\n📊 Found ${reels.length} total reels`);

        const toDelete = [];

        for (const reel of reels) {
            const caption = reel.caption?.toLowerCase() || '';

            // Check if caption contains any invalid title patterns
            const hasInvalidTitle = INVALID_TITLE_PATTERNS.some(pattern =>
                caption.includes(pattern)
            );

            if (hasInvalidTitle) {
                toDelete.push(reel.id);
                console.log(`   ❌ Flagged: ${reel.caption?.substring(0, 50)}...`);
            }
        }

        console.log(`\n🗑️  Found ${toDelete.length} reels with bad titles`);

        if (toDelete.length > 0) {
            const { error: deleteError } = await supabase
                .from('social_reels')
                .delete()
                .in('id', toDelete);

            if (deleteError) {
                console.error('Error deleting reels:', deleteError);
                return res.status(500).json({ error: deleteError.message });
            }

            console.log(`✅ Deleted ${toDelete.length} reels with invalid titles`);
        }

        console.log('\n' + '═'.repeat(60));
        console.log('✅ CLEANUP COMPLETE');

        return res.status(200).json({
            success: true,
            total_reels: reels.length,
            deleted: toDelete.length,
            remaining: reels.length - toDelete.length
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({ error: error.message });
    }
}

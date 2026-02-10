// HORSES SOCIAL ALL-IN-ONE CRON
// Consolidated endpoint: runs likes, comments, and replies in sequence.
// Replaces 3 separate crons (likes every 10min, comments every 7min, replies every 8min)
// New schedule: every 15 minutes, drops 530 invocations per day to 96

import { likePosts, commentOnPosts, replyToComments } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    // Security: validate cron secret for external callers
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
        // Also allow Vercel's built-in cron auth
        if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    console.log('Starting horses-social-all consolidated cron...');

    const results = { liked: 0, commented: 0, replied: 0 };

    try {
        // Step 1: Likes (smaller batch to fit in 60s total)
        const likeResult = await likePosts(15, true);
        results.liked = likeResult.liked || 0;
        console.log(`Likes: ${results.liked}`);

        // Step 2: Comments
        const commentResult = await commentOnPosts(10, true);
        results.commented = commentResult.commented || 0;
        console.log(`Comments: ${results.commented}`);

        // Step 3: Replies
        const replyResult = await replyToComments(10);
        results.replied = replyResult.replied || 0;
        console.log(`Replies: ${results.replied}`);

        console.log(`Consolidated social cron complete: ${JSON.stringify(results)}`);

        return res.status(200).json({
            success: true,
            ...results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Horses social all-in-one error:', error);
        return res.status(500).json({
            success: false,
            ...results,
            error: error.message
        });
    }
}

/**
 * 🐴 HORSES SOCIAL COMMENTS CRON
 * Runs every 3 hours - Horses comment on posts from other users
 */
import { commentOnPosts } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    // Verify cron secret in production
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        if (process.env.NODE_ENV === 'production') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    console.log('🐴 Starting horses-social-comments cron...');

    try {
        const result = await commentOnPosts(5, true); // 5 comments per run, include real users

        console.log(`✅ Horses posted ${result.commented} comments`);

        return res.status(200).json({
            success: true,
            commented: result.commented,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Horses social comments error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 🐴 HORSES SOCIAL LIKES CRON
 * Runs every 2 hours - Horses like posts from other users
 */
import { likePosts } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    // Verify cron secret in production
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        // Allow in development
        if (process.env.NODE_ENV === 'production') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    console.log('🐴 Starting horses-social-likes cron...');

    try {
        const result = await likePosts(15, true); // 15 likes, include real users

        console.log(`✅ Horses liked ${result.liked} posts`);

        return res.status(200).json({
            success: true,
            liked: result.liked,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Horses social likes error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 🐴 HORSES SOCIAL LIKES CRON
 * Runs every 2 hours - Horses like posts from other users
 */
import { likePosts } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    console.log('🐴 Starting horses-social-likes cron...');

    try {
        const result = await likePosts(25, true); // 25 likes per run (Pro plan: 60s timeout)

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

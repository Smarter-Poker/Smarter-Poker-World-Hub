/**
 * 🐴 HORSES SOCIAL COMMENTS CRON
 * Runs every 3 hours - Horses comment on posts from other users
 */
import { commentOnPosts } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    console.log('🐴 Starting horses-social-comments cron...');

    try {
        const result = await commentOnPosts(15, true); // 15 comments per run (Pro plan: 60s timeout)

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

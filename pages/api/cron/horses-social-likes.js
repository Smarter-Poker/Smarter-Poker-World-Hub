/**
 * 🐴 HORSES SOCIAL LIKES CRON
 * Runs every 2 hours - Horses like posts from other users
 */
import { likePosts } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await likePosts(25, true); // 25 likes per run (Pro plan: 60s timeout)


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

/**
 * 🐴 HORSES SOCIAL REPLIES CRON
 * Runs every 4 hours - Horses reply to comments on posts
 */
import { replyToComments } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    // Verify cron secret
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('🐴 Starting horses-social-replies cron...');

    try {
        const result = await replyToComments(15);

        console.log(`✅ Horses replied to ${result.replied} comments`);

        return res.status(200).json({
            success: true,
            replied: result.replied,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Horses social replies error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 🐴 HORSES SOCIAL FRIENDS CRON
 * Runs every 6 hours - Horses send and accept friend requests
 */
import { sendFriendRequests, acceptFriendRequests } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';

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

    console.log('🐴 Starting horses-social-friends cron...');

    try {
        const sendResult = await sendFriendRequests(10);
        const acceptResult = await acceptFriendRequests(15);

        console.log(`✅ Sent ${sendResult.sent} friend requests, accepted ${acceptResult.accepted}`);

        return res.status(200).json({
            success: true,
            sent: sendResult.sent,
            accepted: acceptResult.accepted,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Horses social friends error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify Vercel Cron Secret if triggered by cron
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized cron request' });
    }

    try {
        const now = new Date().toISOString();

        // Delete all expired passes from premium_feature_access
        const { data, error } = await supabase
            .from('premium_feature_access')
            .delete()
            .lt('expires_at', now);

        if (error) {
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: 'Cleaned up expired premium feature passes',
            timestamp: now
        });
    } catch (err) {
        console.error('[Cron Cleanup] Error deleting expired passes:', err);
        return res.status(500).json({ error: err.message });
    }
}

import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify cron secret
    const cronSecret = req.headers.authorization?.replace('Bearer ', '');
    if (cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('[Cron] Starting expired day pass cleanup...');

        const { data, error } = await supabase
            .from('premium_feature_access')
            .delete()
            .lt('expires_at', new Date().toISOString());

        if (error) throw error;

        console.log('[Cron] Expired day pass cleanup complete:', data);

        return res.status(200).json({
            success: true,
            message: 'Expired passes cleaned up',
            deleted: data?.length || 0
        });
    } catch (error) {
        console.error('[Cron] Error cleaning expired passes:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}

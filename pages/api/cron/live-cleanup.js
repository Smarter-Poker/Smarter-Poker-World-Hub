/**
 * GET /api/cron/live-cleanup
 * Zombie stream cleanup — marks stale live streams as ended.
 * Runs every 5 minutes via Open Claw dispatcher.
 *
 * Targets:
 *  1. Streams that have been "live" for > 6 hours (browser crash/disconnect)
 *  2. Cleans up viewer records for ended streams
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Auth: CRON_SECRET or service-level check
    const auth = req.headers.authorization?.replace('Bearer ', '');
    if (auth !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { data, error } = await supabase.rpc('cleanup_zombie_streams');
        if (error) throw error;

        return res.json({
            success: true,
            zombies_cleaned: data || 0,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.warn('[live-cleanup] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

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
import { withCronHealth } from '../../../src/lib/cronHealth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
    // SECURITY: a missing CRON_SECRET is a server misconfiguration, not a grant.
    // This previously FAILED OPEN: with CRON_SECRET unset the comparison below
    // was `undefined !== undefined` → false, so a request carrying no
    // Authorization header at all passed the gate and any caller could run the
    // zombie-stream cleanup.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        console.warn('[live-cleanup] CRON_SECRET is not configured — rejecting request');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    // Auth: CRON_SECRET or service-level check
    const auth = req.headers.authorization?.replace('Bearer ', '');
    if (auth !== cronSecret) {
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

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('live-cleanup', handler);

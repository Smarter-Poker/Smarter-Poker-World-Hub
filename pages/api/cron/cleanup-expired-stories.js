/**
 * GET /api/cron/cleanup-expired-stories
 *
 * STREAM-POLISH-R4 STORY-EXPIRY-1: hard-delete stories whose
 * expires_at is more than `grace_hours` in the past.
 *
 * Audit found 23,216 expired stories accumulated in production
 * because the 24h expiry was only enforced at SELECT (RLS hides them
 * from the feed) but nothing actually deleted them — the DB row +
 * media URL leaked forever. The first run of this job purged 22,950
 * rows via the Supabase MCP backfill.
 *
 * Called every 6 hours by Open Claw with
 * Authorization: Bearer ${CRON_SECRET}. Single RPC call, no per-row
 * work, no transaction state. Cascade FKs on social_story_views +
 * social_story_reactions clean up child rows automatically.
 *
 * Companion routes:
 *   /api/cron/cleanup-orphan-uploads — sweeps storage blobs that
 *      lost their referencing rows (catches story media)
 */
import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { data, error } = await supabase
            .rpc('fn_cleanup_expired_stories', { p_grace_hours: 24 });

        if (error) {
            console.warn('[cron/cleanup-expired-stories] RPC error:', error.message);
            return res.status(500).json({ error: error.message });
        }

        return res.json({
            success: true,
            ...data,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[cron/cleanup-expired-stories] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

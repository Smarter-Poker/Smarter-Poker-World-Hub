/**
 * VIDEO LIBRARY PURGE CRON ENDPOINT
 * ══════════════════════════════════════════════════════════════════════════
 * Status webhook for the weekly dead-video purge.
 * The actual purge runs via: python3 scripts/video_library_scraper.py --purge
 * Open Claw fires this script every Sunday 00:00 UTC.
 *
 * This endpoint:
 *   1. RECEIVE: Accepts a POST report from the Python purge script
 *   2. STATUS:  Returns current dead-video audit history
 * ══════════════════════════════════════════════════════════════════════════
 */

import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { validateCronAuth } from '../../../src/utils/cron-auth.js';

export default async function handler(req, res) {
    try {
        if (!validateCronAuth(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const supabase = getSupabaseAdmin();
        const { report } = req.query;

        // ── MODE 1: Receive purge report from Python script ─────────────────
        if (report === '1' && req.method === 'POST') {
            const body = req.body || {};
            try {
                await supabase.from('data_audit_log').insert({
                    record_id:    crypto.randomUUID(),
                    table_name:   'video_library_videos',
                    action:       'purge',
                    scrape_proof: JSON.stringify({
                        scraper:      'video_library_scraper_v3_purge',
                        checked:      body.checked || 0,
                        dead:         body.dead || 0,
                        purged:       body.purged || 0,
                        reported_at:  new Date().toISOString(),
                    }),
                });
                console.log('[VidPurge] Report received and logged.');
            } catch (auditErr) {
                console.warn('[VidPurge] Audit log failed:', auditErr.message);
            }
            return res.status(200).json({ success: true, message: 'Purge report logged' });
        }

        // ── MODE 2: Status check ─────────────────────────────────────────────
        const [countResult, lastPurgeResult] = await Promise.all([
            supabase.from('video_library_videos').select('id', { count: 'exact', head: true }),
            supabase.from('data_audit_log')
                .select('scrape_proof, created_at')
                .eq('table_name', 'video_library_videos')
                .eq('action', 'purge')
                .order('created_at', { ascending: false })
                .limit(5),
        ]);

        const lastPurges = (lastPurgeResult.data || []).map(row => {
            try { return JSON.parse(row.scrape_proof || '{}'); } catch (_) { return {}; }
        });

        return res.status(200).json({
            success:      true,
            timestamp:    new Date().toISOString(),
            total_videos: countResult.count ?? 0,
            last_purges:  lastPurges,
            note:         'Purge runs Sundays 00:00 UTC via: python3 scripts/video_library_scraper.py --purge',
        });

    } catch (err) {
        console.error('[VidPurge] Fatal:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
}

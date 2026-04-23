/**
 * VIDEO LIBRARY BACKFILL CRON ENDPOINT
 * ══════════════════════════════════════════════════════════════════════════
 * Status webhook for the weekly metadata backfill.
 * The actual backfill runs via: python3 scripts/video_library_scraper.py --backfill
 * Open Claw fires this script every Saturday 23:00 UTC.
 *
 * This endpoint:
 *   1. RECEIVE: Accepts a POST report from the Python backfill run
 *   2. STATUS:  Returns count of videos still needing backfill
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

        // ── MODE 1: Receive backfill report from Python script ───────────────
        if (report === '1' && req.method === 'POST') {
            const body = req.body || {};
            try {
                await supabase.from('data_audit_log').insert({
                    record_id:    crypto.randomUUID(),
                    table_name:   'video_library_videos',
                    action:       'backfill',
                    scrape_proof: JSON.stringify({
                        scraper:      'video_library_scraper_v3_backfill',
                        updated:      body.updated || 0,
                        failed:       body.failed || 0,
                        reported_at:  new Date().toISOString(),
                    }),
                });
                console.log('[VidBackfill] Report received and logged.');
            } catch (auditErr) {
                console.warn('[VidBackfill] Audit log failed:', auditErr.message);
            }
            return res.status(200).json({ success: true, message: 'Backfill report logged' });
        }

        // ── MODE 2: Status check ─────────────────────────────────────────────
        const TODAY = new Date().toISOString().slice(0, 10);

        const [needsFixResult, lastBackfillResult] = await Promise.all([
            // Count rows that still need backfill (zero views or today's date)
            supabase.from('video_library_videos')
                .select('id', { count: 'exact', head: true })
                .or(`views_count.eq.0,published_at.gte.${TODAY}T00:00:00Z`),
            supabase.from('data_audit_log')
                .select('scrape_proof, created_at')
                .eq('table_name', 'video_library_videos')
                .eq('action', 'backfill')
                .order('created_at', { ascending: false })
                .limit(3),
        ]);

        const lastBackfills = (lastBackfillResult.data || []).map(row => {
            try { return JSON.parse(row.scrape_proof || '{}'); } catch (_) { return {}; }
        });

        return res.status(200).json({
            success:              true,
            timestamp:            new Date().toISOString(),
            needs_backfill:       needsFixResult.count ?? 0,
            last_backfills:       lastBackfills,
            note:                 'Backfill runs Saturdays 23:00 UTC via: python3 scripts/video_library_scraper.py --backfill',
        });

    } catch (err) {
        console.error('[VidBackfill] Fatal:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
}

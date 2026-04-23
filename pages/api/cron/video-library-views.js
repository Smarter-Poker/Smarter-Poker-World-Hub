/**
 * VIDEO LIBRARY VIEW-COUNT REFRESH CRON ENDPOINT
 * ══════════════════════════════════════════════════════════════════════════
 * Status webhook for the weekly view-count refresh.
 * The actual refresh runs via: python3 scripts/video_library_scraper.py --refresh-views
 * Open Claw fires this script every Friday 22:00 UTC.
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

        // ── MODE 1: Receive refresh report from Python script ────────────────
        if (report === '1' && req.method === 'POST') {
            const body = req.body || {};
            try {
                await supabase.from('data_audit_log').insert({
                    record_id:    crypto.randomUUID(),
                    table_name:   'video_library_videos',
                    action:       'views_refresh',
                    scrape_proof: JSON.stringify({
                        scraper:      'video_library_scraper_v3_refresh',
                        updated:      body.updated || 0,
                        failed:       body.failed || 0,
                        reported_at:  new Date().toISOString(),
                    }),
                });
                console.log('[VidViewRefresh] Report received and logged.');
            } catch (auditErr) {
                console.warn('[VidViewRefresh] Audit log failed:', auditErr.message);
            }
            return res.status(200).json({ success: true, message: 'View refresh report logged' });
        }

        // ── MODE 2: Status check ─────────────────────────────────────────────
        const [topVideosResult, lastRefreshResult] = await Promise.all([
            supabase.from('video_library_videos')
                .select('youtube_video_id, source_id, title, views_count, updated_at')
                .order('views_count', { ascending: false })
                .limit(5),
            supabase.from('data_audit_log')
                .select('scrape_proof, created_at')
                .eq('table_name', 'video_library_videos')
                .eq('action', 'views_refresh')
                .order('created_at', { ascending: false })
                .limit(3),
        ]);

        const lastRefreshes = (lastRefreshResult.data || []).map(row => {
            try { return JSON.parse(row.scrape_proof || '{}'); } catch (_) { return {}; }
        });

        return res.status(200).json({
            success:       true,
            timestamp:     new Date().toISOString(),
            top_5_videos:  topVideosResult.data || [],
            last_refreshes: lastRefreshes,
            note:          'View refresh runs Fridays 22:00 UTC via: python3 scripts/video_library_scraper.py --refresh-views',
        });

    } catch (err) {
        console.error('[VidViewRefresh] Fatal:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
}

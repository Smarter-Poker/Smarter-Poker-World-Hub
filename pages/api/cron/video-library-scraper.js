/**
 * 🎬 VIDEO LIBRARY CRON ENDPOINT v2
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   - The REAL scraper is scripts/video_library_scraper.py (runs on this machine)
 *     It uses yt-dlp --flat-playlist which works locally but NOT on Vercel.
 *   - This endpoint serves two purposes:
 *     1. STATUS: Reports current DB state (video counts, last scrape, health)
 *     2. TRIGGER: If called with ?trigger=1, records a manual-run request to
 *        the audit log so Open Claw can pick it up.
 *
 * The Python scraper posts its own result to this endpoint when done
 * (with ?report=1 + body) so the audit log is always up to date.
 *
 * SCHEDULE: Daily 6am UTC via Open Claw → runs python3 scripts/video_library_scraper.py
 * ROUTE:    GET /api/cron/video-library-scraper
 * AUTH:     Bearer CRON_SECRET header
 * ══════════════════════════════════════════════════════════════════════════
 */

import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { validateCronAuth } from '../../../src/utils/cron-auth.js';

export default async function handler(req, res) {
    try {
        if (!validateCronAuth(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const supabase = getSupabaseAdmin();
        const { trigger, report } = req.query;

        // ── MODE 1: Receive a scrape report from the Python script ─────────
        if (report === '1' && req.method === 'POST') {
            const body = req.body || {};
            try {
                await supabase.from('data_audit_log').insert({
                    record_id:   crypto.randomUUID(),
                    table_name:  'video_library_videos',
                    action:      'scrape',
                    scrape_proof: JSON.stringify({
                        scraper:            'video_library_scraper_v2_py',
                        ...body,
                        reported_at:        new Date().toISOString(),
                    }),
                });
                console.log('[VidScraper] Report received and logged.');
            } catch (auditErr) {
                console.warn('[VidScraper] Audit log failed:', auditErr.message);
            }
            return res.status(200).json({ success: true, message: 'Report logged' });
        }

        // ── MODE 2: Status check + optional trigger log ────────────────────
        const [countResult, bySourceResult, lastAuditResult] = await Promise.all([
            // Total video count
            supabase.from('video_library_videos').select('id', { count: 'exact', head: true }),
            // Per-source counts
            supabase.from('video_library_videos').select('source_id'),
            // Last scrape audit entry
            supabase.from('data_audit_log')
                .select('scrape_proof, created_at')
                .eq('table_name', 'video_library_videos')
                .eq('action', 'scrape')
                .order('created_at', { ascending: false })
                .limit(1),
        ]);

        const totalVideos = countResult.count ?? 0;

        // Build per-source breakdown
        const bySource = {};
        for (const row of (bySourceResult.data || [])) {
            bySource[row.source_id] = (bySource[row.source_id] || 0) + 1;
        }

        const lastAudit = lastAuditResult.data?.[0] || null;
        let lastScrape = null;
        if (lastAudit) {
            try {
                const proof = JSON.parse(lastAudit.scrape_proof || '{}');
                lastScrape = {
                    ran_at:             proof.ran_at || lastAudit.created_at,
                    creators_processed: proof.creators_processed,
                    creators_failed:    proof.creators_failed,
                    total_found:        proof.total_found,
                    total_new:          proof.total_new || proof.total_imported,
                    elapsed_s:          proof.elapsed_s,
                };
            } catch (_) {
                lastScrape = { ran_at: lastAudit.created_at };
            }
        }

        // Log trigger request if asked
        if (trigger === '1') {
            try {
                await supabase.from('data_audit_log').insert({
                    record_id:    crypto.randomUUID(),
                    table_name:   'video_library_videos',
                    action:       'scrape_trigger',
                    scrape_proof: JSON.stringify({
                        triggered_by: 'manual_api_call',
                        triggered_at: new Date().toISOString(),
                        note:         'Python scraper should be triggered separately via Open Claw',
                    }),
                });
            } catch (_) {}
            console.log('[VidScraper] Manual trigger logged — run: python3 scripts/video_library_scraper.py');
        }

        return res.status(200).json({
            success:      true,
            timestamp:    new Date().toISOString(),
            total_videos: totalVideos,
            creators:     Object.keys(bySource).length,
            by_source:    bySource,
            last_scrape:  lastScrape,
            note:         'Real ingestion runs via python3 scripts/video_library_scraper.py (yt-dlp engine). This endpoint reports status only.',
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_) {}
        console.error('[VidScraper] Fatal:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
}

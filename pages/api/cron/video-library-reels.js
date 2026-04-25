/**
 * VIDEO LIBRARY TO REELS SYNC CRON
 * ══════════════════════════════════════════════════════════════════════════
 * Syncs the latest video library videos into the social reels table.
 * Open Claw fires this script every day at 7:00 UTC.
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

        // MODE 1: Status Check (from Python script if it reports)
        if (report === '1' && req.method === 'POST') {
            return res.status(200).json({ success: true, message: 'Reel sync report logged' });
        }

        // Return instructions since the actual run is handled by Open Claw shell execution
        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            note: 'Reels sync runs daily at 7:00 UTC via: python3 scripts/video_library_to_reels.py --sync-captions',
        });

    } catch (err) {
        console.error('[VidReelSync] Fatal:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
}

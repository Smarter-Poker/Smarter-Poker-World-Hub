/**
 * Hard Stop Cron — Auto-close all cash games at scheduled time
 * Called by Vercel Cron every minute
 * 
 * For each venue with hard_stop_enabled:
 *   1. Check if current time (CST) >= hard_stop_time
 *   2. Close all open tables
 *   3. End all active sessions
 *   4. Set room_open = false
 *   5. Log the event
 * 
 * Double-trigger prevention: checks last_hard_stop_date to avoid
 * re-triggering if the cron fires multiple times in the same minute
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get current time in CST (America/Chicago)
 * Matches convention used by other crons in the codebase
 */
function getCSTTime() {
    const now = new Date();
    const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    return {
        hour: cst.getHours(),
        minute: cst.getMinutes(),
        dateStr: cst.toISOString().slice(0, 10), // "YYYY-MM-DD"
        timeStr: `${String(cst.getHours()).padStart(2, '0')}:${String(cst.getMinutes()).padStart(2, '0')}`,
        isoNow: now.toISOString()
    };
}

export default async function handler(req, res) {
    // Only allow GET (Vercel Cron) or POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify cron secret in production
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get all venues with hard stop enabled
        const { data: venues, error: fetchError } = await supabase
            .from('commander_venue_settings')
            .select('venue_id, hard_stop_time, room_open, last_hard_stop_date')
            .eq('hard_stop_enabled', true)
            .not('hard_stop_time', 'is', null);

        if (fetchError) {
            console.error('Hard stop fetch error:', fetchError);
            return res.status(500).json({ error: fetchError.message });
        }

        if (!venues || venues.length === 0) {
            return res.status(200).json({ message: 'No venues with hard stop enabled', triggered: 0 });
        }

        const cst = getCSTTime();
        let triggered = 0;
        const results = [];

        for (const venue of venues) {
            const stopTime = venue.hard_stop_time; // e.g. "23:00"
            if (!stopTime) continue;

            // Check if current CST time matches stop time
            if (cst.timeStr !== stopTime) continue;

            // Double-trigger prevention: skip if already triggered today
            if (venue.last_hard_stop_date === cst.dateStr) {
                results.push({ venue_id: venue.venue_id, status: 'already_triggered_today' });
                continue;
            }

            console.log(`[HARD STOP] Triggering for venue ${venue.venue_id} at ${stopTime} CST`);

            // 1. Close all open tables for this venue
            const { data: openTables } = await supabase
                .from('commander_tables')
                .select('id')
                .eq('venue_id', venue.venue_id)
                .in('status', ['active', 'open']);

            if (openTables && openTables.length > 0) {
                await supabase
                    .from('commander_tables')
                    .update({ status: 'closed', updated_at: cst.isoNow })
                    .eq('venue_id', venue.venue_id)
                    .in('status', ['active', 'open']);

                console.log(`[HARD STOP] Closed ${openTables.length} tables for venue ${venue.venue_id}`);
            }

            // 2. End all active sessions for this venue
            const { data: activeSessions } = await supabase
                .from('commander_time_sessions')
                .select('id')
                .eq('venue_id', venue.venue_id)
                .eq('status', 'active');

            if (activeSessions && activeSessions.length > 0) {
                await supabase
                    .from('commander_time_sessions')
                    .update({
                        status: 'ended',
                        end_time: cst.isoNow,
                        end_reason: 'hard_stop',
                        updated_at: cst.isoNow
                    })
                    .eq('venue_id', venue.venue_id)
                    .eq('status', 'active');

                console.log(`[HARD STOP] Ended ${activeSessions.length} sessions for venue ${venue.venue_id}`);
            }

            // 3. Set room to closed + record trigger date for double-trigger prevention
            await supabase
                .from('commander_venue_settings')
                .update({
                    room_open: false,
                    last_hard_stop_date: cst.dateStr,
                    updated_at: cst.isoNow
                })
                .eq('venue_id', venue.venue_id);

            // 4. Log activity (non-blocking — don't fail if table missing)
            try {
                await supabase
                    .from('commander_activity_log')
                    .insert({
                        venue_id: venue.venue_id,
                        action: 'hard_stop',
                        details: `Hard stop triggered at ${stopTime} CST. Closed ${openTables?.length || 0} tables, ended ${activeSessions?.length || 0} sessions.`,
                        created_at: cst.isoNow
                    });
            } catch { /* activity log table may not exist yet */ }

            triggered++;
            results.push({
                venue_id: venue.venue_id,
                status: 'triggered',
                tables_closed: openTables?.length || 0,
                sessions_ended: activeSessions?.length || 0
            });
        }

        return res.status(200).json({
            message: `Hard stop check complete`,
            current_time_cst: cst.timeStr,
            venues_checked: venues.length,
            triggered,
            results
        });
    } catch (err) {
        console.error('Hard stop cron error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

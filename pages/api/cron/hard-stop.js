/**
 * Hard Stop Cron — Auto-close all cash games at scheduled time
 * Called by Vercel Cron every minute
 * 
 * For each venue with hard_stop_enabled:
 *   1. Check if current time >= hard_stop_time
 *   2. Close all open tables
 *   3. End all active sessions
 *   4. Set room_open = false
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
            .select('venue_id, hard_stop_time, room_open')
            .eq('hard_stop_enabled', true)
            .not('hard_stop_time', 'is', null);

        if (fetchError) {
            console.error('Hard stop fetch error:', fetchError);
            return res.status(500).json({ error: fetchError.message });
        }

        if (!venues || venues.length === 0) {
            return res.status(200).json({ message: 'No venues with hard stop enabled', triggered: 0 });
        }

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

        let triggered = 0;
        const results = [];

        for (const venue of venues) {
            const stopTime = venue.hard_stop_time; // e.g. "23:00"
            if (!stopTime) continue;

            // Check if current time matches stop time (within 1 minute window)
            if (currentTimeStr !== stopTime) continue;

            // Skip if room is already closed
            if (venue.room_open === false) {
                results.push({ venue_id: venue.venue_id, status: 'already_closed' });
                continue;
            }

            console.log(`[HARD STOP] Triggering for venue ${venue.venue_id} at ${stopTime}`);

            // 1. Close all open tables for this venue
            const { data: openTables } = await supabase
                .from('commander_tables')
                .select('id')
                .eq('venue_id', venue.venue_id)
                .eq('status', 'active');

            if (openTables && openTables.length > 0) {
                for (const table of openTables) {
                    await supabase
                        .from('commander_tables')
                        .update({ status: 'closed', updated_at: now.toISOString() })
                        .eq('id', table.id);
                }
                console.log(`[HARD STOP] Closed ${openTables.length} tables for venue ${venue.venue_id}`);
            }

            // 2. End all active sessions for this venue
            const { data: activeSessions } = await supabase
                .from('commander_time_sessions')
                .select('id')
                .eq('venue_id', venue.venue_id)
                .eq('status', 'active');

            if (activeSessions && activeSessions.length > 0) {
                for (const session of activeSessions) {
                    await supabase
                        .from('commander_time_sessions')
                        .update({
                            status: 'ended',
                            end_time: now.toISOString(),
                            end_reason: 'hard_stop',
                            updated_at: now.toISOString()
                        })
                        .eq('id', session.id);
                }
                console.log(`[HARD STOP] Ended ${activeSessions.length} sessions for venue ${venue.venue_id}`);
            }

            // 3. Set room to closed
            await supabase
                .from('commander_venue_settings')
                .update({
                    room_open: false,
                    updated_at: now.toISOString()
                })
                .eq('venue_id', venue.venue_id);

            // 4. Log activity
            await supabase
                .from('commander_activity_log')
                .insert({
                    venue_id: venue.venue_id,
                    action: 'hard_stop',
                    details: `Hard stop triggered at ${stopTime}. Closed ${openTables?.length || 0} tables, ended ${activeSessions?.length || 0} sessions.`,
                    created_at: now.toISOString()
                })
                .catch(() => { }); // Don't fail if activity log table doesn't exist yet

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
            current_time: currentTimeStr,
            venues_checked: venues.length,
            triggered,
            results
        });
    } catch (err) {
        console.error('Hard stop cron error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

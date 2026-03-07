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
import { createClient } from '../../../src/lib/supabaseServerClient';

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
    const year = cst.getFullYear();
    const month = String(cst.getMonth() + 1).padStart(2, '0');
    const day = String(cst.getDate()).padStart(2, '0');
    const hour = cst.getHours();
    const minute = cst.getMinutes();
    return {
        hour,
        minute,
        dateStr: `${year}-${month}-${day}`, // "YYYY-MM-DD" in CST
        timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
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
            .select('venue_id, hard_stop_time, room_open, last_hard_stop_date, auto_comp_rate')
            .eq('hard_stop_enabled', true)
            .not('hard_stop_time', 'is', null)
                .limit(100);

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


            // 1. Close all open CASH tables for this venue (NEVER close tournament tables)
            const { data: openTables } = await supabase
                .from('commander_tables')
                .select('id')
                .eq('venue_id', venue.venue_id)
                .in('status', ['active', 'open'])
                .neq('mode', 'tournament')
                    .limit(100);

            if (openTables && openTables.length > 0) {
                await supabase
                    .from('commander_tables')
                    .update({ status: 'closed', updated_at: cst.isoNow })
                    .eq('venue_id', venue.venue_id)
                    .in('status', ['active', 'open'])
                    .neq('mode', 'tournament');

            }

            // 2. End all active CASH table sessions (dealer-scanned) + auto-comp awards
            // Tournament sessions are NEVER ended by hard-stop
            let compsAwarded = 0;

            // Get tournament table numbers to exclude
            const { data: tournTables } = await supabase
                .from('commander_tables')
                .select('table_number')
                .eq('venue_id', venue.venue_id)
                .eq('mode', 'tournament')
                    .limit(100);
            const tournTableNums = (tournTables || []).map(t => t.table_number);

            let sessionQuery = supabase
                .from('commander_table_sessions')
                .select('id, member_id, started_at, table_number')
                .eq('venue_id', venue.venue_id)
                .eq('status', 'active')
                    .limit(100);

            // Exclude tournament table sessions if any exist
            if (tournTableNums.length > 0) {
                // Use NOT filter — sessions at tournament tables are untouched
                sessionQuery = sessionQuery.not('table_number', 'in', `(${tournTableNums.join(',')})`)
                    .limit(100);
            }

            const { data: tableSessions } = await sessionQuery;

            if (tableSessions && tableSessions.length > 0) {
                // Check if venue has auto-comp enabled
                const autoCompRate = parseFloat(venue.auto_comp_rate || 0);

                // Award auto-comps before closing
                if (autoCompRate > 0) {
                    for (const ts of tableSessions) {
                        if (!ts.member_id || !ts.started_at) continue;
                        try {
                            const elapsedMin = Math.floor((new Date(cst.isoNow) - new Date(ts.started_at)) / 60000);
                            const compEarned = Math.round((elapsedMin / 60) * autoCompRate * 100) / 100;
                            if (compEarned <= 0) continue;

                            const { data: member } = await supabase
                                .from('commander_members')
                                .select('comp_balance, comp_lifetime_earned')
                                .eq('id', ts.member_id)
                                .single();

                            if (member) {
                                await supabase
                                    .from('commander_members')
                                    .update({
                                        comp_balance: Math.round(((member.comp_balance || 0) + compEarned) * 100) / 100,
                                        comp_lifetime_earned: Math.round(((member.comp_lifetime_earned || 0) + compEarned) * 100) / 100,
                                        updated_at: cst.isoNow
                                    })
                                    .eq('id', ts.member_id);

                                await supabase
                                    .from('commander_member_comp_log')
                                    .insert({
                                        venue_id: venue.venue_id,
                                        member_id: ts.member_id,
                                        amount: compEarned,
                                        type: 'auto_hourly',
                                        reason: `Auto comp (hard stop): ${elapsedMin} min × $${autoCompRate}/hr`,
                                        balance_after: Math.round(((member.comp_balance || 0) + compEarned) * 100) / 100
                                    });

                                compsAwarded += compEarned;
                            }
                        } catch (compErr) {
                            console.error(`[HARD STOP] Auto-comp error for member ${ts.member_id}:`, compErr);
                        }
                    }
                }

                // End CASH table sessions only (by ID, not bulk venue update)
                const sessionIds = tableSessions.map(s => s.id);
                await supabase
                    .from('commander_table_sessions')
                    .update({
                        status: 'ended',
                        ended_at: cst.isoNow,
                        updated_at: cst.isoNow
                    })
                    .in('id', sessionIds);

                // Clear CASH seats only (exclude tournament table numbers)
                let seatQuery = supabase
                    .from('commander_table_seats')
                    .update({
                        status: 'empty',
                        player_name: null,
                        member_id: null,
                        seated_at: null
                    })
                    .eq('venue_id', venue.venue_id)
                    .eq('status', 'occupied');

                if (tournTableNums.length > 0) {
                    seatQuery = seatQuery.not('table_number', 'in', `(${tournTableNums.join(',')})`);
                }
                await seatQuery;

            }

            // 3. End all active time billing sessions for this venue
            const { data: activeSessions } = await supabase
                .from('commander_table_sessions')
                .select('id')
                .eq('venue_id', venue.venue_id)
                .eq('status', 'active')
                    .limit(100);

            if (activeSessions && activeSessions.length > 0) {
                await supabase
                    .from('commander_table_sessions')
                    .update({
                        status: 'ended',
                        end_time: cst.isoNow,
                        end_reason: 'hard_stop',
                        updated_at: cst.isoNow
                    })
                    .eq('venue_id', venue.venue_id)
                    .eq('status', 'active');

            }

            // 4. Set room to closed + record trigger date for double-trigger prevention
            await supabase
                .from('commander_venue_settings')
                .update({
                    room_open: false,
                    last_hard_stop_date: cst.dateStr,
                    updated_at: cst.isoNow
                })
                .eq('venue_id', venue.venue_id);

            // 5. Log activity (non-blocking — don't fail if table missing)
            try {
                await supabase
                    .from('commander_activity_log')
                    .insert({
                        venue_id: venue.venue_id,
                        action: 'hard_stop',
                        details: `Hard stop triggered at ${stopTime} CST. Closed ${openTables?.length || 0} tables, ended ${tableSessions?.length || 0} table sessions + ${activeSessions?.length || 0} time sessions. Auto-comps: $${compsAwarded.toFixed(2)}.`,
                        created_at: cst.isoNow
                    });
            } catch { /* activity log table may not exist yet */ }

            triggered++;
            results.push({
                venue_id: venue.venue_id,
                status: 'triggered',
                tables_closed: openTables?.length || 0,
                table_sessions_ended: tableSessions?.length || 0,
                time_sessions_ended: activeSessions?.length || 0,
                comps_awarded: compsAwarded
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

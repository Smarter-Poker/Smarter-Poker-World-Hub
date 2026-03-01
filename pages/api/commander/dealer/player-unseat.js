/**
 * Player Unseat API — Unauthenticated tablet endpoint
 * POST /api/commander/dealer/player-unseat
 * 
 * Removes a player from a table. Returns unused time to member balance (Texas mode).
 * Awards auto-comps based on session duration.
 * 
 * Body: { session_id } OR { table_number, seat_number }
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { session_id, table_number, seat_number } = req.body;

    if (!session_id && (!table_number || !seat_number)) {
        return res.status(400).json({
            success: false,
            error: 'session_id or (table_number + seat_number) required'
        });
    }

    try {
        // Find the active session
        let sessionQuery = supabase
            .from('commander_table_sessions')
            .select('*')
            .in('status', ['active', 'paused', 'meal_break']);

        if (session_id) {
            sessionQuery = sessionQuery.eq('id', session_id);
        } else {
            sessionQuery = sessionQuery
                .eq('table_number', parseInt(table_number))
                .eq('seat_number', parseInt(seat_number));
        }

        const { data: sessions, error: fetchError } = await sessionQuery.limit(1);
        if (fetchError) throw fetchError;

        const session = sessions?.[0];
        if (!session) {
            return res.status(404).json({ success: false, error: 'No active session found' });
        }

        const now = new Date();
        const totalAllocatedSeconds = ((session.time_allocated_minutes || 0) + (session.time_added_minutes || 0)) * 60;
        const elapsedSeconds = Math.floor((now - new Date(session.started_at)) / 1000);
        const unusedSeconds = Math.max(0, totalAllocatedSeconds - elapsedSeconds);
        const unusedMinutes = Math.floor(unusedSeconds / 60);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);

        // End the session
        const { error: endError } = await supabase
            .from('commander_table_sessions')
            .update({
                status: 'ended',
                ended_at: now.toISOString(),
                ended_by: 'tablet',
                updated_at: now.toISOString()
            })
            .eq('id', session.id);

        if (endError) throw endError;

        // Return unused time to member balance (Texas mode)
        if (session.member_id && unusedMinutes > 0 && session.time_allocated_minutes > 0) {
            try {
                const { data: member } = await supabase
                    .from('commander_members')
                    .select('time_balance_minutes')
                    .eq('id', session.member_id)
                    .single();

                if (member) {
                    await supabase
                        .from('commander_members')
                        .update({
                            time_balance_minutes: (member.time_balance_minutes || 0) + unusedMinutes,
                            updated_at: now.toISOString()
                        })
                        .eq('id', session.member_id);
                }
            } catch (e) {
                console.warn('Time return failed (non-fatal):', e.message);
            }
        }

        // Auto-comp: award hourly comps based on play duration
        let compEarned = 0;
        if (session.member_id && session.venue_id) {
            try {
                const { data: venueSettings } = await supabase
                    .from('commander_venue_settings')
                    .select('auto_comp_rate')
                    .eq('venue_id', session.venue_id)
                    .single();

                const rate = parseFloat(venueSettings?.auto_comp_rate || 0);
                if (rate > 0) {
                    compEarned = Math.round((elapsedMinutes / 60) * rate * 100) / 100;
                    if (compEarned > 0) {
                        const { data: member } = await supabase
                            .from('commander_members')
                            .select('comp_balance, comp_lifetime_earned')
                            .eq('id', session.member_id)
                            .single();

                        if (member) {
                            await supabase
                                .from('commander_members')
                                .update({
                                    comp_balance: Math.round(((member.comp_balance || 0) + compEarned) * 100) / 100,
                                    comp_lifetime_earned: Math.round(((member.comp_lifetime_earned || 0) + compEarned) * 100) / 100,
                                    updated_at: now.toISOString()
                                })
                                .eq('id', session.member_id);

                            try {
                                await supabase
                                    .from('commander_member_comp_log')
                                    .insert({
                                        venue_id: session.venue_id,
                                        member_id: session.member_id,
                                        amount: compEarned,
                                        type: 'auto_hourly',
                                        reason: `Auto comp: ${elapsedMinutes} min play`,
                                        balance_after: Math.round(((member.comp_balance || 0) + compEarned) * 100) / 100
                                    });
                            } catch (e) { /* comp log table might not exist */ }
                        }
                    }
                }
            } catch (e) {
                console.warn('Auto-comp award failed (non-fatal):', e.message);
            }
        }

        // Clear the seat
        try {
            await supabase
                .from('commander_table_seats')
                .update({
                    status: 'empty',
                    player_name: null,
                    member_id: null,
                    seated_at: null
                })
                .eq('venue_id', session.venue_id)
                .eq('table_number', session.table_number)
                .eq('seat_number', session.seat_number);
        } catch (e) {
            console.warn('Seat clear failed (non-fatal):', e.message);
        }

        return res.status(200).json({
            success: true,
            data: {
                session_id: session.id,
                player_name: session.player_name,
                elapsed_minutes: elapsedMinutes,
                unused_minutes_returned: unusedMinutes,
                comp_earned: compEarned
            }
        });
    } catch (err) {
        console.error('Player unseat error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

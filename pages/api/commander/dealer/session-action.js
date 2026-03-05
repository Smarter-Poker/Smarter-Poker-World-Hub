/**
 * Session Action API — Unified player action endpoint
 * POST /api/commander/dealer/session-action
 * 
 * Actions: pause, resume, meal_break, missed_blinds, move
 * Body: { table_number, seat_number, action, target_seat? }
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { table_number, seat_number, action, target_seat, venue_id } = req.body;

    if (!table_number && action !== 'tournament_chip_update') {
        return res.status(400).json({ success: false, error: 'table_number required' });
    }
    if (!action) {
        return res.status(400).json({ success: false, error: 'action required' });
    }

    // ── Tournament chip update — bypasses session lookup ──
    if (action === 'tournament_chip_update') {
        const { tournament_id, entry_id, chip_count } = req.body;
        if (!tournament_id || !entry_id || (chip_count === undefined && chip_count !== 0)) {
            return res.status(400).json({ success: false, error: 'tournament_id, entry_id, and chip_count required' });
        }
        try {
            const { data: entry, error: eErr } = await supabase
                .from('commander_tournament_entries')
                .update({ current_chips: parseInt(chip_count) })
                .eq('id', entry_id)
                .eq('tournament_id', tournament_id)
                .select('id, player_name, current_chips')
                .single();
            if (eErr) throw eErr;
            return res.status(200).json({ success: true, data: { action: 'tournament_chip_update', player_name: entry.player_name, entry_id: entry.id, chip_count: entry.current_chips } });
        } catch (err) {
            console.error('Tournament chip update error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    if (!seat_number) {
        return res.status(400).json({ success: false, error: 'seat_number required' });
    }

    try {
        // Find the active session
        const { data: sessions, error: fetchError } = await supabase
            .from('commander_table_sessions')
            .select('*')
            .eq('table_number', parseInt(table_number))
            .eq('seat_number', parseInt(seat_number))
            .in('status', ['active', 'paused', 'meal_break'])
            .limit(1);

        if (fetchError) throw fetchError;
        const session = sessions?.[0];

        if (!session) {
            return res.status(404).json({ success: false, error: 'No active session at this seat' });
        }

        // TOURNAMENT GUARD: Block timer-based actions for tournament sessions
        // Move is still allowed — dealers need to move tournament players between tables
        if (['pause', 'resume', 'meal_break', 'missed_blinds'].includes(action)) {
            const { data: tableRow } = await supabase
                .from('commander_tables')
                .select('mode')
                .eq('table_number', parseInt(table_number))
                .eq('venue_id', session.venue_id)
                .single();

            if (tableRow?.mode === 'tournament') {
                return res.status(400).json({
                    success: false,
                    error: 'Timer actions are not available for tournament sessions — tournaments have no individual timers'
                });
            }
        }

        switch (action) {
            /* ─── PAUSE TIMER ──────────────────────────── */
            case 'pause': {
                if (session.status === 'paused') {
                    return res.status(200).json({ success: true, data: { action: 'pause', player_name: session.player_name, session_id: session.id, note: 'Already paused' } });
                }
                if (session.status === 'meal_break') {
                    return res.status(400).json({ success: false, error: `${session.player_name} is on meal break — resume first` });
                }
                const { error } = await supabase
                    .from('commander_table_sessions')
                    .update({ status: 'paused', updated_at: new Date().toISOString() })
                    .eq('id', session.id);
                if (error) throw error;
                return res.status(200).json({
                    success: true,
                    data: { action: 'pause', player_name: session.player_name, session_id: session.id }
                });
            }

            /* ─── RESUME TIMER ─────────────────────────── */
            case 'resume': {
                if (session.status === 'active') {
                    return res.status(200).json({ success: true, data: { action: 'resume', player_name: session.player_name, session_id: session.id, note: 'Already active' } });
                }
                const { error } = await supabase
                    .from('commander_table_sessions')
                    .update({ status: 'active', updated_at: new Date().toISOString() })
                    .eq('id', session.id);
                if (error) throw error;
                return res.status(200).json({
                    success: true,
                    data: { action: 'resume', player_name: session.player_name, session_id: session.id }
                });
            }

            /* ─── MEAL BREAK (30 min) ──────────────────── */
            case 'meal_break': {
                if (session.status === 'meal_break') {
                    return res.status(200).json({ success: true, data: { action: 'meal_break', player_name: session.player_name, session_id: session.id, duration_minutes: 30, note: 'Already on meal break' } });
                }
                const { error } = await supabase
                    .from('commander_table_sessions')
                    .update({ status: 'meal_break', updated_at: new Date().toISOString() })
                    .eq('id', session.id);
                if (error) throw error;
                return res.status(200).json({
                    success: true,
                    data: {
                        action: 'meal_break',
                        player_name: session.player_name,
                        session_id: session.id,
                        duration_minutes: 30
                    }
                });
            }

            /* ─── MISSED BLINDS ────────────────────────── */
            case 'missed_blinds': {
                // Increment missed blinds counter
                const currentMissed = session.missed_blinds || 0;
                const { error } = await supabase
                    .from('commander_table_sessions')
                    .update({
                        missed_blinds: currentMissed + 1,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', session.id);

                if (error) throw error;

                return res.status(200).json({
                    success: true,
                    data: {
                        action: 'missed_blinds',
                        player_name: session.player_name,
                        session_id: session.id,
                        missed_blinds_count: currentMissed + 1
                    }
                });
            }

            /* ─── MOVE PLAYER ──────────────────────────── */
            case 'move': {
                if (!target_seat) {
                    return res.status(400).json({ success: false, error: 'target_seat required for move action' });
                }

                const targetSeatNum = parseInt(target_seat);

                // Check target seat is empty
                const { data: occupied } = await supabase
                    .from('commander_table_sessions')
                    .select('id, player_name')
                    .eq('table_number', parseInt(table_number))
                    .eq('seat_number', targetSeatNum)
                    .in('status', ['active', 'paused', 'meal_break'])
                    .limit(1);

                if (occupied?.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: `Seat ${targetSeatNum} is occupied by ${occupied[0].player_name}`
                    });
                }

                // Move: update session seat_number
                const { error: moveError } = await supabase
                    .from('commander_table_sessions')
                    .update({
                        seat_number: targetSeatNum,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', session.id);

                if (moveError) throw moveError;

                // Update seat records
                const venueIdVal = venue_id || session.venue_id;
                // Clear old seat
                await supabase
                    .from('commander_table_seats')
                    .update({ status: 'empty', player_name: null, member_id: null, seated_at: null })
                    .eq('venue_id', venueIdVal)
                    .eq('table_number', parseInt(table_number))
                    .eq('seat_number', parseInt(seat_number));

                // Occupy new seat
                await supabase
                    .from('commander_table_seats')
                    .upsert({
                        venue_id: venueIdVal,
                        table_number: parseInt(table_number),
                        seat_number: targetSeatNum,
                        status: 'occupied',
                        player_name: session.player_name,
                        member_id: session.member_id,
                        seated_at: new Date().toISOString()
                    }, { onConflict: 'venue_id,table_number,seat_number' });

                return res.status(200).json({
                    success: true,
                    data: {
                        action: 'move',
                        player_name: session.player_name,
                        from_seat: parseInt(seat_number),
                        to_seat: targetSeatNum,
                        session_id: session.id
                    }
                });
            }

            /* ─── UPDATE CHIP COUNT (Tournament) ─── */
            case 'update_chip_count': {
                const chipCount = req.body?.chip_count;
                if (!chipCount && chipCount !== 0) {
                    return res.status(400).json({ success: false, error: 'chip_count required' });
                }
                const { error } = await supabase
                    .from('commander_table_sessions')
                    .update({
                        chip_count: parseInt(chipCount),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', session.id);
                if (error) throw error;
                return res.status(200).json({
                    success: true,
                    data: {
                        action: 'update_chip_count',
                        player_name: session.player_name,
                        session_id: session.id,
                        chip_count: parseInt(chipCount),
                    }
                });
            }

            default:
                return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error('Session action error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

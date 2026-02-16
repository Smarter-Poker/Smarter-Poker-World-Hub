/**
 * Tablet Data API - Unified endpoint for table tablet displays
 * GET /api/commander/dealer/tablet-data?table=N&venue_id=Y
 * 
 * Returns all data the tablet needs in a single call:
 * - Table details (game type, stakes, max seats)
 * - Active player sessions with time remaining
 * - Current dealer assignment
 * 
 * No auth required — tablet is unauthenticated.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { table, venue_id } = req.query;

    if (!table) {
        return res.status(400).json({ success: false, error: 'table parameter is required' });
    }

    const tableNum = parseInt(table);

    try {
        // 1. Get table details
        let tableQuery = supabase
            .from('commander_tables')
            .select('id, venue_id, table_number, table_name, max_seats, status, mode, game_type, stakes')
            .eq('table_number', tableNum);

        if (venue_id) {
            tableQuery = tableQuery.eq('venue_id', venue_id);
        }

        const { data: tableData, error: tableError } = await tableQuery.limit(1).maybeSingle();
        if (tableError) throw tableError;

        // Resolve venue_id from table if not provided
        const resolvedVenueId = venue_id || tableData?.venue_id || null;

        // 2. Get active player sessions — try both table names for migration compatibility
        let sessions = [];
        try {
            let sessionsQuery = supabase
                .from('commander_table_sessions')
                .select('*')
                .eq('table_number', tableNum)
                .eq('status', 'active')
                .order('seat_number', { ascending: true });

            if (resolvedVenueId) {
                sessionsQuery = sessionsQuery.eq('venue_id', resolvedVenueId);
            }

            const { data, error } = await sessionsQuery;
            if (error) {
                // Table doesn't exist — try fallback
                if (error.message?.includes('schema cache')) {
                    let fallbackQuery = supabase
                        .from('commander_time_sessions')
                        .select('*')
                        .eq('table_number', tableNum)
                        .eq('status', 'active')
                        .order('seat_number', { ascending: true });

                    if (resolvedVenueId) {
                        fallbackQuery = fallbackQuery.eq('venue_id', resolvedVenueId);
                    }

                    const { data: fbData } = await fallbackQuery;
                    sessions = fbData || [];
                }
            } else {
                sessions = data || [];
            }
        } catch (e) {
            console.warn('Sessions query failed, continuing with empty:', e.message);
        }

        // Calculate time remaining for each session
        const now = new Date();
        const playersWithTime = (sessions || []).map(s => {
            const totalAllocatedSeconds = ((s.time_allocated_minutes || 0) + (s.time_added_minutes || 0)) * 60;
            const elapsedSeconds = Math.floor((now - new Date(s.started_at)) / 1000);
            const timeRemaining = Math.max(0, totalAllocatedSeconds - elapsedSeconds);

            return {
                session_id: s.id,
                member_id: s.member_id,
                player_name: s.player_name,
                table_number: s.table_number,
                seat_number: s.seat_number,
                membership_tier: s.membership_tier,
                member_number: s.member_number,
                time_allocated_minutes: s.time_allocated_minutes,
                time_added_minutes: s.time_added_minutes,
                started_at: s.started_at,
                time_remaining: timeRemaining,
                is_low: timeRemaining <= 900 && timeRemaining > 0,
                is_critical: timeRemaining <= 300 && timeRemaining > 0,
                is_expired: timeRemaining <= 0
            };
        });

        // 3. Get current dealer
        let dealerQuery = supabase
            .from('commander_dealer_rotations')
            .select('id, dealer_id, dealer_name, table_number, started_at')
            .eq('table_number', tableNum)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1);

        if (resolvedVenueId) {
            dealerQuery = dealerQuery.eq('venue_id', resolvedVenueId);
        }

        const { data: rotationData, error: rotationError } = await dealerQuery;
        if (rotationError) throw rotationError;

        const rotation = rotationData?.[0] || null;

        let dealer = null;
        if (rotation) {
            // Fetch dealer member details for photo
            let dealerDetails = null;
            if (rotation.dealer_id) {
                const { data: member } = await supabase
                    .from('commander_members')
                    .select('id, first_name, last_name, photo_url, member_number')
                    .eq('id', rotation.dealer_id)
                    .single();
                dealerDetails = member;
            }

            dealer = {
                id: rotation.dealer_id,
                name: rotation.dealer_name,
                photo_url: dealerDetails?.photo_url || null,
                member_number: dealerDetails?.member_number || null,
                started_at: rotation.started_at,
                rotation_id: rotation.id
            };
        }

        return res.status(200).json({
            success: true,
            data: {
                table: tableData || {
                    table_number: tableNum,
                    max_seats: 9,
                    game_type: 'NLH',
                    stakes: '',
                    venue_id: resolvedVenueId
                },
                players: playersWithTime,
                dealer: dealer
            }
        });
    } catch (err) {
        console.error('Tablet data error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

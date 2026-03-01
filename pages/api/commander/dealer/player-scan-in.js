/**
 * Player Scan-In API — Unauthenticated tablet endpoint
 * POST /api/commander/dealer/player-scan-in
 * 
 * Combined scan + seat in one call for the tablet.
 * Dual mode:
 *   - Texas clubs: checks membership, checks time_balance, deducts time
 *   - Charity/Home games: just logs player + tracks duration (no time billing)
 * 
 * Body: { qr_code, table_number, seat_number?, venue_id? }
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

    const { qr_code, table_number, seat_number, venue_id } = req.body;

    if (!qr_code || !table_number) {
        return res.status(400).json({ success: false, error: 'qr_code and table_number are required' });
    }

    const tableNum = parseInt(table_number);

    try {
        // ── 1. Look up member by QR code (safe sequential, no .or()) ──
        let lookupCode = qr_code;
        if (qr_code.includes('/check-in/')) {
            const parts = qr_code.split('/');
            lookupCode = parts[parts.length - 1];
        }

        // Try QR code first
        let { data: members } = await supabase
            .from('commander_members')
            .select('*')
            .eq('qr_code', lookupCode)
            .limit(1);

        // Fallback to member_number
        if (!members?.length) {
            const { data: byNumber } = await supabase
                .from('commander_members')
                .select('*')
                .eq('member_number', lookupCode)
                .limit(1);
            members = byNumber;
        }

        const member = members?.[0];
        if (!member) {
            return res.status(404).json({ success: false, error: 'Member not found. QR code not recognized.' });
        }

        // ── 2. Get venue settings to determine mode ──
        // Priority: explicit venue_id > table's venue_id > member's venue_id
        let resolvedVenueId = venue_id || null;

        // Always look up the table's venue to ensure session venue_id matches tablet queries
        if (!resolvedVenueId) {
            const { data: tableInfo } = await supabase
                .from('commander_tables')
                .select('venue_id')
                .eq('table_number', tableNum)
                .limit(1)
                .maybeSingle();
            resolvedVenueId = tableInfo?.venue_id || member.venue_id;
        }

        let venueType = 'texas'; // default

        if (resolvedVenueId) {
            const { data: settings } = await supabase
                .from('commander_venue_settings')
                .select('venue_type, time_billing_rate')
                .eq('venue_id', resolvedVenueId)
                .single();

            if (settings?.venue_type) {
                venueType = settings.venue_type;
            }
        }

        const isTimeBilled = venueType === 'texas';

        // ── 3. Check membership (Texas mode only) ──
        if (isTimeBilled) {
            const membershipActive =
                member.membership_status !== 'suspended' &&
                member.membership_status !== 'banned' &&
                member.membership_status !== 'expired' &&
                member.membership_status !== 'inactive';

            const isExpiredByDate = member.membership_expires &&
                new Date(member.membership_expires) < new Date();

            if (!membershipActive || isExpiredByDate) {
                return res.status(400).json({
                    success: false,
                    error: 'Membership is not active or has expired.',
                    member_name: `${member.first_name} ${member.last_name}`.trim()
                });
            }

            // Check time balance
            const timeBalance = member.time_balance_minutes || 0;
            if (timeBalance <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No time remaining. Player must purchase time first.',
                    error_code: 'NO_TIME',
                    member_name: `${member.first_name} ${member.last_name}`.trim(),
                    member_id: member.id
                });
            }
        }

        // ── 4. Check if already seated ──
        try {
            const { data: existing } = await supabase
                .from('commander_table_sessions')
                .select('id, table_number, seat_number')
                .eq('member_id', member.id)
                .in('status', ['active', 'paused', 'meal_break'])
                .limit(1);

            if (existing?.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Already seated at Table ${existing[0].table_number} Seat ${existing[0].seat_number}`,
                    error_code: 'ALREADY_SEATED',
                    member_name: `${member.first_name} ${member.last_name}`.trim()
                });
            }
        } catch (e) {
            // Table might not exist yet, continue
            console.warn('Session check failed:', e.message);
        }

        // ── 5. Determine seat number ──
        let seatNum = seat_number ? parseInt(seat_number) : null;

        if (!seatNum) {
            // Auto-assign: find first available seat at this table
            const { data: table } = await supabase
                .from('commander_tables')
                .select('max_seats')
                .eq('table_number', tableNum)
                .limit(1)
                .maybeSingle();

            const maxSeats = table?.max_seats || 9;

            // Get occupied seats
            let occupiedSeats = [];
            try {
                const { data: activeSessions } = await supabase
                    .from('commander_table_sessions')
                    .select('seat_number')
                    .eq('table_number', tableNum)
                    .in('status', ['active', 'paused', 'meal_break']);
                occupiedSeats = (activeSessions || []).map(s => s.seat_number);
            } catch (e) { /* table might not exist */ }

            // Find first open seat
            for (let s = 1; s <= maxSeats; s++) {
                if (!occupiedSeats.includes(s)) {
                    seatNum = s;
                    break;
                }
            }

            if (!seatNum) {
                return res.status(400).json({ success: false, error: 'Table is full — no seats available.' });
            }
        } else {
            // Check if requested seat is occupied
            try {
                const { data: seatTaken } = await supabase
                    .from('commander_table_sessions')
                    .select('id, player_name')
                    .eq('table_number', tableNum)
                    .eq('seat_number', seatNum)
                    .in('status', ['active', 'paused', 'meal_break'])
                    .limit(1);

                if (seatTaken?.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: `Seat ${seatNum} is occupied by ${seatTaken[0].player_name}`
                    });
                }
            } catch (e) { /* table might not exist */ }
        }

        // ── 6. Create session ──
        const playerName = `${member.first_name} ${member.last_name}`.trim();
        const timeToAllocate = isTimeBilled ? (member.time_balance_minutes || 0) : 0;

        const { data: session, error: sessionError } = await supabase
            .from('commander_table_sessions')
            .insert({
                venue_id: resolvedVenueId,
                member_id: member.id,
                player_name: playerName,
                table_number: tableNum,
                seat_number: seatNum,
                time_allocated_minutes: timeToAllocate,
                time_added_minutes: 0,
                membership_tier: member.membership_tier || 'standard',
                member_number: member.member_number,
                status: 'active',
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (sessionError) throw sessionError;

        // ── 7. Deduct time from member balance (Texas only) ──
        if (isTimeBilled && timeToAllocate > 0) {
            await supabase
                .from('commander_members')
                .update({
                    time_balance_minutes: 0,
                    last_visit: new Date().toISOString(),
                    total_visits: (member.total_visits || 0) + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', member.id);
        } else {
            // Charity/home: just update visit tracking
            await supabase
                .from('commander_members')
                .update({
                    last_visit: new Date().toISOString(),
                    total_visits: (member.total_visits || 0) + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', member.id);
        }

        // ── 8. Update table seat status ──
        try {
            await supabase
                .from('commander_table_seats')
                .upsert({
                    venue_id: resolvedVenueId,
                    table_number: tableNum,
                    seat_number: seatNum,
                    status: 'occupied',
                    player_name: playerName,
                    member_id: member.id,
                    seated_at: new Date().toISOString()
                }, { onConflict: 'venue_id,table_number,seat_number' });
        } catch (e) {
            console.warn('Seat upsert failed (non-fatal):', e.message);
        }

        // ── 9. Log check-in ──
        try {
            await supabase
                .from('commander_checkins')
                .insert({
                    member_id: member.id,
                    venue_id: resolvedVenueId,
                    checked_in_at: new Date().toISOString()
                });
        } catch (e) {
            console.warn('Check-in log failed (non-fatal):', e.message);
        }

        return res.status(200).json({
            success: true,
            data: {
                session_id: session.id,
                player_name: playerName,
                member_id: member.id,
                table_number: tableNum,
                seat_number: seatNum,
                time_allocated_minutes: timeToAllocate,
                venue_type: venueType,
                membership_tier: member.membership_tier || 'standard',
                photo_url: member.photo_url || null,
                started_at: session.started_at
            }
        });
    } catch (err) {
        console.error('Player scan-in error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

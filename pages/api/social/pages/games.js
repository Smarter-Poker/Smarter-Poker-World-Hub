/**
 * Club Live Games API
 * 
 * GET    /api/social/pages/games?page_id=xxx           - List games for a page
 * GET    /api/social/pages/games?game_id=xxx            - Get single game with seats
 * POST   /api/social/pages/games                        - Create a live game (owner only)
 * PUT    /api/social/pages/games                        - Update game status/details
 * DELETE /api/social/pages/games?id=xxx&owner_id=xxx    - Delete a game
 * 
 * POST   /api/social/pages/games (action=take_seat)     - Reserve a seat
 * POST   /api/social/pages/games (action=join_waitlist) - Join waitlist
 * POST   /api/social/pages/games (action=leave)         - Leave seat/waitlist
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ===== GET =====
    if (req.method === 'GET') {
        const { page_id, game_id } = req.query;

        if (game_id) {
            // Single game with all seats
            const { data: game, error: gErr } = await supabase
                .from('club_live_games').select('*').eq('id', game_id).single();
            if (gErr) return res.status(404).json({ error: 'Game not found' });

            const { data: seats } = await supabase
                .from('club_game_seats').select('*').eq('game_id', game_id)
                .order('seat_number', { ascending: true, nullsFirst: false });

            return res.status(200).json({ success: true, data: { ...game, seats: seats || [] } });
        }

        if (page_id) {
            // All games for a page (open + running)
            const { data: games, error } = await supabase
                .from('club_live_games').select('*')
                .eq('page_id', page_id)
                .in('status', ['open', 'running'])
                .order('created_at', { ascending: false });

            if (error) return res.status(500).json({ error: error.message });

            // Fetch all seats for these games
            const gameIds = (games || []).map(g => g.id);
            let allSeats = [];
            if (gameIds.length > 0) {
                const { data: seatData } = await supabase
                    .from('club_game_seats').select('*').in('game_id', gameIds)
                    .order('seat_number', { ascending: true, nullsFirst: false });
                allSeats = seatData || [];
            }

            // Enrich social seats with profile pictures
            const socialPlayerIds = allSeats.map(s => s.player_id).filter(Boolean);
            let socialProfilePicMap = {};
            if (socialPlayerIds.length > 0) {
                try {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, avatar_url')
                        .in('id', socialPlayerIds);
                    (profiles || []).forEach(p => { socialProfilePicMap[p.id] = p.avatar_url; });
                } catch (e) { /* no profile pics */ }
            }

            const enriched = (games || []).map(g => ({
                ...g,
                seats: allSeats.filter(s => s.game_id === g.id).map(s => ({
                    ...s,
                    avatar_url: s.player_id ? (socialProfilePicMap[s.player_id] || null) : null,
                })),
                seated_count: allSeats.filter(s => s.game_id === g.id && s.status !== 'waitlist').length,
                waitlist_count: allSeats.filter(s => s.game_id === g.id && s.status === 'waitlist').length,
            }));

            // If no club_live_games, bridge from Commander games via linked_venue_id
            if (enriched.length === 0) {
                const { data: pageData } = await supabase
                    .from('social_pages')
                    .select('linked_venue_id, metadata')
                    .eq('id', page_id)
                    .single();

                const rawVenueId = pageData?.linked_venue_id || pageData?.metadata?.linked_venue_id;
                const venueId = rawVenueId ? parseInt(rawVenueId, 10) : null;
                if (venueId && !isNaN(venueId)) {
                    const { data: cmdGames } = await supabase
                        .from('commander_games')
                        .select('id, game_type, stakes, current_players, max_players, status, started_at, table_id')
                        .eq('venue_id', venueId)
                        .in('status', ['running', 'waiting'])
                        .order('started_at', { ascending: false });

                    if (cmdGames && cmdGames.length > 0) {
                        // Fetch all commander_seats for these games in one batch
                        const cmdGameIds = cmdGames.map(g => g.id);
                        const { data: cmdSeats } = await supabase
                            .from('commander_seats')
                            .select('id, game_id, seat_number, player_name, player_id, status')
                            .in('game_id', cmdGameIds)
                            .order('seat_number', { ascending: true });
                        const allCmdSeats = cmdSeats || [];

                        // Fetch profile pictures for players with Smarter.Poker accounts
                        const playerIds = allCmdSeats.map(s => s.player_id).filter(Boolean);
                        let profilePicMap = {};
                        if (playerIds.length > 0) {
                            try {
                                const { data: profiles } = await supabase
                                    .from('profiles')
                                    .select('id, avatar_url')
                                    .in('id', playerIds);
                                (profiles || []).forEach(p => { profilePicMap[p.id] = p.avatar_url; });
                            } catch (e) { /* no profile pics */ }
                        }

                        // Fetch table names for display
                        const tableIds = cmdGames.map(g => g.table_id).filter(Boolean);
                        let tableMap = {};
                        if (tableIds.length > 0) {
                            const { data: tables } = await supabase
                                .from('commander_tables')
                                .select('id, table_name, table_number')
                                .in('id', tableIds);
                            (tables || []).forEach(t => { tableMap[t.id] = t; });
                        }

                        // Fetch venue type for timer mode
                        let venueType = 'texas';
                        try {
                            const { data: venueSettings } = await supabase
                                .from('commander_venue_settings')
                                .select('venue_type')
                                .eq('venue_id', venueId)
                                .single();
                            if (venueSettings?.venue_type) venueType = venueSettings.venue_type;
                        } catch (e) { /* default to texas */ }

                        // Fetch active dealer rotations for all tables in one batch
                        // Rotations may have table_id, table_number, or both — query by both
                        const tableNumbers = Object.values(tableMap).map(t => t.table_number).filter(Boolean);
                        let dealerRotationMap = {};
                        if (tableIds.length > 0 || tableNumbers.length > 0) {
                            try {
                                // Query 1: by table_id (if rotations have it)
                                if (tableIds.length > 0) {
                                    const { data: rotById } = await supabase
                                        .from('commander_dealer_rotations')
                                        .select('table_id, table_number, dealer_name, commander_dealers:dealer_id (id, name)')
                                        .in('table_id', tableIds)
                                        .is('ended_at', null);
                                    (rotById || []).forEach(r => {
                                        const name = r.dealer_name || r.commander_dealers?.name || null;
                                        if (name) dealerRotationMap[r.table_id] = name;
                                    });
                                }
                                // Query 2: by table_number (if rotations only have table_number, no table_id)
                                if (tableNumbers.length > 0) {
                                    const { data: rotByNum } = await supabase
                                        .from('commander_dealer_rotations')
                                        .select('table_id, table_number, dealer_name, commander_dealers:dealer_id (id, name)')
                                        .eq('venue_id', venueId)
                                        .in('table_number', tableNumbers)
                                        .is('ended_at', null);
                                    // Build a reverse map: table_number → table_id
                                    const numToId = {};
                                    Object.entries(tableMap).forEach(([tid, t]) => { numToId[t.table_number] = tid; });
                                    (rotByNum || []).forEach(r => {
                                        const name = r.dealer_name || r.commander_dealers?.name || null;
                                        const resolvedTableId = r.table_id || numToId[r.table_number];
                                        if (name && resolvedTableId && !dealerRotationMap[resolvedTableId]) {
                                            dealerRotationMap[resolvedTableId] = name;
                                        }
                                    });
                                }
                            } catch (e) { /* no dealer data */ }
                        }

                        // Fetch active table sessions for time tracking
                        let allSessions = [];
                        if (tableNumbers.length > 0) {
                            try {
                                const { data: sessions } = await supabase
                                    .from('commander_table_sessions')
                                    .select('*')
                                    .in('table_number', tableNumbers)
                                    .eq('status', 'active')
                                    .order('seat_number', { ascending: true });
                                allSessions = sessions || [];
                            } catch (e) { /* no session data */ }
                        }

                        const now = new Date();

                        const mapped = cmdGames.map(g => {
                            const gameSeats = allCmdSeats.filter(s => s.game_id === g.id);
                            const occupiedSeats = gameSeats.filter(s => s.status === 'occupied');
                            const table = g.table_id ? tableMap[g.table_id] : null;
                            const tableName = table ? (table.table_name || `Table ${table.table_number}`) : null;
                            const tableNum = table?.table_number;

                            // Dealer for this table
                            const dealerName = g.table_id ? (dealerRotationMap[g.table_id] || null) : null;

                            // Sessions for this table (time tracking)
                            const tableSessions = tableNum ? allSessions.filter(s => s.table_number === tableNum) : [];
                            const mappedSessions = tableSessions.map(s => {
                                const totalAllocatedSeconds = ((s.time_allocated_minutes || 0) + (s.time_added_minutes || 0)) * 60;
                                const elapsedSeconds = Math.floor((now - new Date(s.started_at)) / 1000);
                                const timeRemaining = Math.max(0, totalAllocatedSeconds - elapsedSeconds);
                                return {
                                    seat_number: s.seat_number,
                                    player_name: s.player_name,
                                    started_at: s.started_at,
                                    time_allocated_minutes: s.time_allocated_minutes || 0,
                                    time_added_minutes: s.time_added_minutes || 0,
                                    time_remaining: timeRemaining,
                                    elapsed_seconds: elapsedSeconds,
                                    is_low: timeRemaining <= 900 && timeRemaining > 0,
                                    is_critical: timeRemaining <= 300 && timeRemaining > 0,
                                    is_expired: totalAllocatedSeconds > 0 && timeRemaining <= 0,
                                };
                            });

                            // Map commander_seats to match club_game_seats shape
                            const mappedSeats = gameSeats.map(s => ({
                                id: s.id,
                                game_id: s.game_id,
                                seat_number: s.seat_number,
                                player_name: s.player_name || null,
                                player_id: s.player_id || null,
                                avatar_url: s.player_id ? (profilePicMap[s.player_id] || null) : null,
                                status: s.status === 'occupied' ? 'reserved' : s.status === 'empty' ? null : s.status,
                            })).filter(s => s.status === 'reserved'); // Only include occupied seats

                            return {
                                id: g.id,
                                game_name: `${(g.game_type || 'NLH').toUpperCase()} ${g.stakes || ''}`.trim(),
                                game_type: g.game_type || 'NLH',
                                stakes: g.stakes || '',
                                max_seats: g.max_players || 9,
                                status: g.status === 'running' ? 'running' : 'open',
                                started_at: g.started_at,
                                source: 'commander',
                                table_number: tableName,
                                seats: mappedSeats,
                                seated_count: occupiedSeats.length,
                                waitlist_count: 0,
                                dealer_name: dealerName,
                                venue_type: venueType,
                                sessions: mappedSessions,
                            };
                        });
                        return res.status(200).json({ success: true, data: mapped, source: 'commander', venue_id: venueId });
                    }
                }
            }

            return res.status(200).json({ success: true, data: enriched });
        }

        return res.status(400).json({ error: 'page_id or game_id required' });
    }

    // ===== POST =====
    if (req.method === 'POST') {
        const { action } = req.body;

        // === SEAT ACTIONS ===
        // Helper: check follow status before allowing seat/waitlist actions
        const checkFollowStatus = async (game_id, player_id) => {
            if (!player_id) return { allowed: false, reason: 'You must be logged in to join a game' };
            // Get the page_id for this game
            const { data: game } = await supabase
                .from('club_live_games').select('page_id').eq('id', game_id).single();
            if (!game) return { allowed: false, reason: 'Game not found' };
            // Check if player follows the page
            const { data: follow } = await supabase
                .from('social_page_followers')
                .select('status')
                .eq('page_id', game.page_id).eq('user_id', player_id)
                .single();
            if (!follow) return { allowed: false, reason: 'You must follow this page to join a game', code: 'NOT_FOLLOWING' };
            if (follow.status === 'pending') return { allowed: false, reason: 'Your follow request is pending approval', code: 'PENDING_APPROVAL' };
            return { allowed: true };
        };

        if (action === 'take_seat') {
            const { game_id, seat_number, player_id, player_name } = req.body;
            if (!game_id || !seat_number || !player_name) {
                return res.status(400).json({ error: 'game_id, seat_number, and player_name required' });
            }

            // Follow-gate: must be an approved follower
            const followCheck = await checkFollowStatus(game_id, player_id);
            if (!followCheck.allowed) {
                return res.status(403).json({ error: followCheck.reason, code: followCheck.code });
            }

            // Check seat is available
            const { data: existing } = await supabase
                .from('club_game_seats').select('id')
                .eq('game_id', game_id).eq('seat_number', seat_number).single();

            if (existing) {
                return res.status(409).json({ error: 'Seat already taken', code: 'SEAT_TAKEN' });
            }

            // Check player isn't already in this game
            const { data: playerSeat } = await supabase
                .from('club_game_seats').select('id')
                .eq('game_id', game_id).eq('player_name', player_name)
                .neq('status', 'waitlist').single();

            if (playerSeat) {
                return res.status(409).json({ error: 'You already have a seat in this game', code: 'ALREADY_SEATED' });
            }

            const { data, error } = await supabase
                .from('club_game_seats').insert({
                    game_id, seat_number, player_id: player_id || null,
                    player_name, status: 'reserved'
                }).select().single();

            if (error) {
                if (error.code === '23505') return res.status(409).json({ error: 'Seat already taken', code: 'SEAT_TAKEN' });
                return res.status(500).json({ error: error.message });
            }
            return res.status(201).json({ success: true, data });
        }

        if (action === 'join_waitlist') {
            const { game_id, player_id, player_name } = req.body;
            if (!game_id || !player_name) {
                return res.status(400).json({ error: 'game_id and player_name required' });
            }

            // Follow-gate: must be an approved follower
            const followCheck = await checkFollowStatus(game_id, player_id);
            if (!followCheck.allowed) {
                return res.status(403).json({ error: followCheck.reason, code: followCheck.code });
            }

            // Get current max waitlist position
            const { data: maxPos } = await supabase
                .from('club_game_seats').select('waitlist_position')
                .eq('game_id', game_id).eq('status', 'waitlist')
                .order('waitlist_position', { ascending: false }).limit(1).single();

            const nextPos = (maxPos?.waitlist_position || 0) + 1;

            const { data, error } = await supabase
                .from('club_game_seats').insert({
                    game_id, seat_number: null, player_id: player_id || null,
                    player_name, status: 'waitlist', waitlist_position: nextPos
                }).select().single();

            if (error) return res.status(500).json({ error: error.message });
            return res.status(201).json({ success: true, data, position: nextPos });
        }

        if (action === 'leave') {
            const { game_id, player_name, seat_id } = req.body;
            if (!game_id) return res.status(400).json({ error: 'game_id required' });

            let query = supabase.from('club_game_seats').delete().eq('game_id', game_id);
            if (seat_id) query = query.eq('id', seat_id);
            else if (player_name) query = query.eq('player_name', player_name);
            else return res.status(400).json({ error: 'player_name or seat_id required' });

            const { error } = await query;
            if (error) return res.status(500).json({ error: error.message });
            return res.status(200).json({ success: true });
        }

        // === CREATE GAME ===
        const { page_id, game_name, game_type, stakes, max_seats, table_number, notes, created_by } = req.body;
        if (!page_id || !game_name) {
            return res.status(400).json({ error: 'page_id and game_name required' });
        }

        const { data, error } = await supabase
            .from('club_live_games').insert({
                page_id, game_name, game_type: game_type || 'NLH',
                stakes: stakes || '1/2', max_seats: max_seats || 9,
                table_number: table_number || null, notes: notes || null,
                created_by: created_by || null, status: 'open'
            }).select().single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json({ success: true, data });
    }

    // ===== PUT =====
    if (req.method === 'PUT') {
        const { id, owner_id, status, game_name, stakes, max_seats, notes, table_number } = req.body;
        if (!id) return res.status(400).json({ error: 'id required' });

        const updates = {};
        if (status) {
            updates.status = status;
            if (status === 'running') updates.started_at = new Date().toISOString();
            if (status === 'closed') updates.closed_at = new Date().toISOString();
        }
        if (game_name) updates.game_name = game_name;
        if (stakes) updates.stakes = stakes;
        if (max_seats) updates.max_seats = max_seats;
        if (notes !== undefined) updates.notes = notes;
        if (table_number !== undefined) updates.table_number = table_number;

        const { data, error } = await supabase
            .from('club_live_games').update(updates).eq('id', id).select().single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true, data });
    }

    // ===== DELETE =====
    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });

        const { error } = await supabase.from('club_live_games').delete().eq('id', id);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

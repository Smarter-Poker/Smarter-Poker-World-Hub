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

            const enriched = (games || []).map(g => ({
                ...g,
                seats: allSeats.filter(s => s.game_id === g.id),
                seated_count: allSeats.filter(s => s.game_id === g.id && s.status !== 'waitlist').length,
                waitlist_count: allSeats.filter(s => s.game_id === g.id && s.status === 'waitlist').length,
            }));

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

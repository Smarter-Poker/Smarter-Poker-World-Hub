/**
 * Live Games API - Public endpoint for viewing live games
 *
 * GET: List live games (optionally filtered by location, game type, stakes)
 * POST: Report a new live game (requires auth)
 */

import { supabase } from '../../../../src/lib/supabase';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

// Admin client for RPC calls
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CDN cache: fresh for 60s, serve stale up to 300s
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  }

  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method === 'GET') {
        return handleGet(req, res);
    } else if (req.method === 'POST') {
        return handlePost(req, res);
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleGet(req, res) {
    try {
        const {
            lat,
            lng,
            radius = 50,
            game_type,
            stakes,
            venue_id,
            limit = 50,
            offset = 0
        } = req.query;

        // If location provided, use PostGIS function
        if (lat && lng) {
            const { data, error } = await supabaseAdmin.rpc('find_live_games_nearby', {
                p_lat: parseFloat(lat),
                p_lng: parseFloat(lng),
                p_radius_miles: parseFloat(radius),
                p_game_type: game_type || null,
                p_stakes: stakes || null
            });

            if (error) {
                console.error('Error fetching nearby live games:', error);
                return res.status(500).json({ success: false, error: 'Failed to fetch live games' });
            }

            return res.status(200).json({
                games: data?.slice(parseInt(offset), parseInt(offset) + parseInt(limit)) || [],
                total: data?.length || 0,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                radius: parseFloat(radius)
            });
        }

        // Otherwise, fetch all active live games
        let query = supabaseAdmin
            .from('live_games')
            .select(`
                *,
                venue:poker_venues(id, name, city, state, latitude, longitude)
            `)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('reported_at', { ascending: false })
                .limit(100);

        if (venue_id) {
            query = query.eq('venue_id', parseInt(venue_id))
                .limit(100);
        }

        if (game_type) {
            query = query.eq('game_type', game_type);
        }

        if (stakes) {
            query = query.eq('stakes', stakes);
        }

        const { data, error, count } = await query
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (error) {
            console.error('Error fetching live games:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch live games' });
        }

        return res.status(200).json({
            games: data || [],
            total: count || data?.length || 0
        });

    } catch (error) {
        console.error('Live games GET error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function handlePost(req, res) {
    try {
        // Get user from auth header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        const {
            venue_id,
            game_type,
            stakes,
            seats_open = 0,
            waitlist_size = 0,
            table_count = 1,
            notes,
            game_quality
        } = req.body;

        // Validate required fields
        if (!venue_id || !game_type || !stakes) {
            return res.status(400).json({
                success: false, error: 'Missing required fields',
                required: ['venue_id', 'game_type', 'stakes']
            });
        }

        // Validate game type
        const validGameTypes = ['nlh', 'plo', 'plo8', 'mixed', 'stud', 'razz', 'omaha', 'other'];
        if (!validGameTypes.includes(game_type)) {
            return res.status(400).json({
                success: false, error: 'Invalid game type',
                valid: validGameTypes
            });
        }

        // Verify venue exists
        const { data: venue, error: venueError } = await supabaseAdmin
            .from('poker_venues')
            .select('id, name')
            .eq('id', parseInt(venue_id))
            .maybeSingle();

        if (venueError || !venue) {
            return res.status(404).json({ success: false, error: 'Venue not found' });
        }

        // Use the report_live_game function
        const { data: gameId, error: reportError } = await supabaseAdmin.rpc('report_live_game', {
            p_venue_id: parseInt(venue_id),
            p_user_id: user.id,
            p_game_type: game_type,
            p_stakes: stakes,
            p_seats_open: parseInt(seats_open),
            p_waitlist_size: parseInt(waitlist_size),
            p_table_count: parseInt(table_count),
            p_notes: notes || null,
            p_game_quality: game_quality || null
        });

        if (reportError) {
            console.error('Error reporting live game:', reportError);
            return res.status(500).json({ success: false, error: 'Failed to report game' });
        }

        // Fetch the created/updated game
        const { data: game, error: fetchError } = await supabaseAdmin
            .from('live_games')
            .select(`
                *,
                venue:poker_venues(id, name, city, state)
            `)
            .eq('id', gameId)
            .maybeSingle();

        if (fetchError) {
            console.error('Error fetching reported game:', fetchError);
        }

        return res.status(201).json({
            success: true,
            game: game || { id: gameId },
            message: 'Game reported successfully'
        });

    } catch (error) {
        console.error('Live games POST error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

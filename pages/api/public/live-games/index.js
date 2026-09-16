import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * Live Games API - Public endpoint for viewing live games
 *
 * GET: List live games (optionally filtered by location, game type, stakes)
 * POST: Report a new live game (requires auth + geo-verification)
 */

import { supabase } from '../../../../src/lib/supabase';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

// ─── Haversine distance (miles) ────────────────────────────────────────────────
function haversineServerMiles(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 3958.8;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Server-side geo tolerance (slightly more generous than client 0.5 mi, to handle GPS jitter)
const GEO_SERVER_RADIUS_MILES = 1.0;

// Admin client for RPC calls
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
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

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleGet(req, res) {
    try {
        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const lat = safeQ(req.query.lat);
        const lng = safeQ(req.query.lng);
        const radius = safeQ(req.query.radius) || 50;
        const game_type = safeQ(req.query.game_type);
        const stakes = safeQ(req.query.stakes);
        const venue_id = safeQ(req.query.venue_id);
        const limit = safeQ(req.query.limit) || 50;
        const offset = safeQ(req.query.offset) || 0;

        // If location provided, use PostGIS function
        if (lat && lng) {
            const { data, error } = await getSupabase().rpc('find_live_games_nearby', {
                p_lat: parseFloat(lat),
                p_lng: parseFloat(lng),
                p_radius_miles: parseFloat(radius),
                p_game_type: game_type || null,
                p_stakes: stakes || null
            });

            if (error) {
                console.warn('Error fetching nearby live games:', error);
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
        let query = getSupabase()
            .from('live_games')
            .select('*')
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
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
            console.warn('Error fetching live games:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch live games' });
        }

        // Enrich with venue data (no FK relationship exists for PostgREST join)
        let enrichedGames = data || [];
        if (enrichedGames.length > 0) {
            const venueIds = [...new Set(enrichedGames.map(g => g.venue_id).filter(Boolean))];
            if (venueIds.length > 0) {
                const { data: venues } = await getSupabase()
                    .from('poker_venues')
                    .select('id, name, city, state, latitude, longitude')
                    .in('id', venueIds);
                const venueMap = {};
                (venues || []).forEach(v => { venueMap[String(v.id)] = v; });
                enrichedGames = enrichedGames.map(g => ({
                    ...g,
                    reported_at: g.reported_at || g.created_at,
                    venue: venueMap[String(g.venue_id)] || null
                }));
            }
        }

        return res.status(200).json({
            games: enrichedGames,
            total: count || enrichedGames.length || 0
        });

    } catch (error) {
        console.warn('Live games GET error:', error);
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
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;

        if (authErr || !user) {
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
            game_quality,
            // Geo evidence from client
            reporter_lat,
            reporter_lng,
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

        // Verify venue exists (also fetch coordinates for geo-check)
        const { data: venue, error: venueError } = await getSupabase()
            .from('poker_venues')
            .select('id, name, latitude, longitude')
            .eq('id', parseInt(venue_id))
            .maybeSingle();

        if (venueError || !venue) {
            return res.status(404).json({ success: false, error: 'Venue not found' });
        }

        // ── SERVER-SIDE GEO-VERIFICATION ─────────────────────────────────────────
        // If the client sends reporter coordinates, verify they are within 1 mile.
        // This is the server-side backstop; the client already enforces 0.5 mi.
        // We skip the check if the venue itself has no coordinates (rare edge case).
        if (reporter_lat != null && reporter_lng != null && venue.latitude && venue.longitude) {
            const dist = haversineServerMiles(
                parseFloat(reporter_lat), parseFloat(reporter_lng),
                venue.latitude, venue.longitude
            );
            if (dist > GEO_SERVER_RADIUS_MILES) {
                console.warn(`[GEO_RESTRICTED] User ${user.id} tried to report at ${venue.name} from ${dist.toFixed(2)} mi away`);
                return res.status(403).json({
                    success: false,
                    error: 'GEO_RESTRICTED',
                    message: `You must be at the venue to report a live game. You are ${dist.toFixed(1)} miles away from ${venue.name}.`,
                    distance_miles: dist,
                    required_miles: GEO_SERVER_RADIUS_MILES,
                });
            }
        }

        // Use the report_live_game function
        const { data: gameId, error: reportError } = await getSupabase().rpc('report_live_game', {
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
            console.warn('Error reporting live game:', reportError);
            return res.status(500).json({ success: false, error: 'Failed to report game' });
        }

        // Fetch the created/updated game
        const { data: game, error: fetchError } = await getSupabase()
            .from('live_games')
            .select('*')
            .eq('id', gameId)
            .maybeSingle();

        if (fetchError) {
            console.warn('Error fetching reported game:', fetchError);
        }

        return res.status(201).json({
            success: true,
            game: game || { id: gameId },
            message: 'Game reported successfully'
        });

    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('Live games POST error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

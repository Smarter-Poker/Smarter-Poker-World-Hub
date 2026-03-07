/**
 * Nearby Live Games API
 * Find live games near a location using PostGIS
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CDN cache: fresh for 60s, serve stale up to 300s
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            lat,
            lng,
            radius = 50,
            game_type,
            stakes,
            limit = 50
        } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                error: 'Location required',
                required: ['lat', 'lng']
            });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const radiusMiles = parseFloat(radius);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ error: 'Invalid coordinates' });
        }

        // Call PostGIS function
        const { data, error } = await supabaseAdmin.rpc('find_live_games_nearby', {
            p_lat: latitude,
            p_lng: longitude,
            p_radius_miles: radiusMiles,
            p_game_type: game_type || null,
            p_stakes: stakes || null
        });

        if (error) {
            console.error('Error fetching nearby games:', error);
            return res.status(500).json({ error: 'Failed to fetch nearby games' });
        }

        // Group games by venue for better display
        const gamesByVenue = {};
        (data || []).forEach(game => {
            if (!gamesByVenue[game.venue_id]) {
                gamesByVenue[game.venue_id] = {
                    venue_id: game.venue_id,
                    venue_name: game.venue_name,
                    venue_city: game.venue_city,
                    venue_state: game.venue_state,
                    distance_miles: game.distance_miles,
                    games: []
                };
            }
            gamesByVenue[game.venue_id].games.push({
                id: game.id,
                game_type: game.game_type,
                stakes: game.stakes,
                seats_open: game.seats_open,
                waitlist_size: game.waitlist_size,
                table_count: game.table_count,
                reported_at: game.reported_at,
                confirmation_count: game.confirmation_count,
                game_quality: game.game_quality
            });
        });

        const venues = Object.values(gamesByVenue)
            .sort((a, b) => a.distance_miles - b.distance_miles)
            .slice(0, parseInt(limit));

        return res.status(200).json({
            venues,
            total_games: data?.length || 0,
            total_venues: venues.length,
            search: {
                lat: latitude,
                lng: longitude,
                radius_miles: radiusMiles
            }
        });

    } catch (error) {
        console.error('Nearby games error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

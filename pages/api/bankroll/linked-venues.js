/**
 * Linked Venues API
 * Returns the user's bankroll_locations that have a poker_venue_id,
 * enriched with lat/lng from the poker_venues table.
 * Used by GeofenceService to watch for proximity to known venues.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.query;
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    try {
        // Get user's bankroll_locations that have a poker_venue_id
        const { data: linkedLocations, error } = await supabase
            .from('bankroll_locations')
            .select('id, name, venue_type, latitude, longitude, poker_venue_id')
            .eq('user_id', userId)
            .not('poker_venue_id', 'is', null);

        if (error) throw error;

        // If no linked locations, also check poker_venues directly for venues near user's history
        if (!linkedLocations || linkedLocations.length === 0) {
            // Fall back to all poker_venues (for geofence watching)
            const { data: allVenues } = await supabase
                .from('poker_venues')
                .select('id, name, venue_type, latitude, longitude')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .limit(500);

            return res.status(200).json({
                success: true,
                venues: (allVenues || []).map(v => ({
                    id: v.id,
                    name: v.name,
                    venue_type: v.venue_type,
                    latitude: v.latitude,
                    longitude: v.longitude,
                    linked: false,
                })),
                total: allVenues?.length || 0,
            });
        }

        return res.status(200).json({
            success: true,
            venues: linkedLocations.map(loc => ({
                id: loc.poker_venue_id,
                bankroll_location_id: loc.id,
                name: loc.name,
                venue_type: loc.venue_type,
                latitude: loc.latitude,
                longitude: loc.longitude,
                linked: true,
            })),
            total: linkedLocations.length,
        });
    } catch (err) {
        console.error('Linked venues error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

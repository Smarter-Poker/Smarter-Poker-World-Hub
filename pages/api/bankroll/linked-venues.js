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
  // BUG #249 FIX: Require JWT auth — prevent IDOR on bankroll data
  const _token = req.headers.authorization?.replace('Bearer ', '');
  if (!_token) return res.status(401).json({ error: 'Auth required' });
  const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
  if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // BUG #240 FIX: Use JWT identity, not client-submitted userId
    const userId = _authUser.id;

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

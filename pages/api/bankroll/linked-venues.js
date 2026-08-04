import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Linked Venues API
 * Returns the user's bankroll_locations that have a poker_venue_id,
 * enriched with lat/lng from the poker_venues table.
 * Used by GeofenceService to watch for proximity to known venues.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
    // CDN cache: fresh for 120s, serve stale up to 600s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    }

    // BUG #249 FIX: Require JWT auth — prevent IDOR on bankroll data
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const _authUser = authData?.user;
    if (authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG #240 FIX: Use JWT identity, not client-submitted userId
      const userId = _authUser.id;

      try {
          // Get user's bankroll_locations that have a poker_venue_id
          const { data: linkedLocations, error } = await getSupabase()
              .from('bankroll_locations')
              .select('id, name, venue_type, latitude, longitude, poker_venue_id')
              .eq('user_id', userId)
              .not('poker_venue_id', 'is', null)
                  .limit(100);

          if (error) throw error;

          // If no linked locations, also check poker_venues directly for venues near user's history
          if (!linkedLocations || linkedLocations.length === 0) {
              // Fall back to all poker_venues (for geofence watching)
              const { data: allVenues } = await getSupabase()
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
          console.warn('Linked venues error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

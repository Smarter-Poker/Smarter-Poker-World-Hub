/**
 * Captain Venues API - GET /api/captain/venues
 * Lists venues with Captain enabled
 * Reference: API_REFERENCE.md - Venues section
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Haversine formula for distance calculation (km)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    const {
      captain_enabled,
      state,
      city,
      lat,
      lng,
      radius = 100,
      limit = 50
    } = req.query;

    let query = supabase
      .from('poker_venues')
      .select('*')
      .order('trust_score', { ascending: false })
      .limit(parseInt(limit));

    // Filter by Captain enabled status
    if (captain_enabled === 'true') {
      query = query.eq('captain_enabled', true);
    }

    // Filter by state
    if (state) {
      query = query.eq('state', state.toUpperCase());
    }

    // Filter by city
    if (city) {
      query = query.ilike('city', `%${city}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Captain venues query error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to fetch venues' }
      });
    }

    let venues = data || [];

    // GPS-based distance calculation and filtering
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadius = parseFloat(radius);

      venues = venues.map(venue => {
        if (venue.lat && venue.lng) {
          const distance = calculateDistance(userLat, userLng, venue.lat, venue.lng);
          return {
            ...venue,
            distance_km: Math.round(distance * 10) / 10,
            distance_mi: Math.round(distance * 0.621371 * 10) / 10
          };
        }
        return venue;
      });

      // Filter by radius
      venues = venues.filter(v => !v.distance_km || v.distance_km <= maxRadius);

      // Sort by distance
      venues.sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999));
    }

    return res.status(200).json({
      success: true,
      data: {
        venues: venues,
        total: venues.length
      }
    });
  } catch (error) {
    console.error('Captain venues API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

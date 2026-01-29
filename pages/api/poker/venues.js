/**
 * Poker Venues API - Get casinos, clubs, and card rooms
 * Serves all 483+ verified venues from all-venues.json
 * Supports GPS-based search with distance calculation
 */
import { createClient } from '@supabase/supabase-js';
import allVenuesData from '../../../data/all-venues.json';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Haversine formula for distance calculation (km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// All 483 venues from verified data
const ALL_VENUES = allVenuesData.venues;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            id,             // Get venue by numeric ID
            slug,           // Get venue by slug
            state,
            city,
            type,
            lat,
            lng,
            radius = 100, // km
            limit = 100,
            featured,
            tournaments,    // Filter venues with tournaments
            search          // manual location/name search
        } = req.query;

        // --- Single venue lookup by ID ---
        if (id) {
            const venue = ALL_VENUES.find(v => String(v.id) === String(id));
            if (venue) {
                return res.status(200).json({ success: true, data: [venue], total: 1 });
            }
            return res.status(404).json({ success: false, error: 'Venue not found' });
        }

        // --- Single venue lookup by slug ---
        if (slug) {
            const venue = ALL_VENUES.find(v => v.slug === slug);
            if (venue) {
                return res.status(200).json({ success: true, data: [venue], total: 1 });
            }
            return res.status(404).json({ success: false, error: 'Venue not found' });
        }

        // --- Try database first, fallback to JSON ---
        let venues = [];
        let fromDb = false;

        try {
            let query = supabase
                .from('poker_venues')
                .select('*')
                .order('trust_score', { ascending: false })
                .limit(parseInt(limit));

            if (state) query = query.eq('state', state.toUpperCase());
            if (city) query = query.ilike('city', `%${city}%`);
            if (type) query = query.eq('venue_type', type);
            if (featured === 'true') query = query.eq('is_featured', true);
            if (search) query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%`);

            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                venues = data;
                fromDb = true;
            }
        } catch (e) {
            // DB not available, use JSON fallback
        }

        // --- Fallback: filter from all-venues.json ---
        if (!fromDb) {
            venues = [...ALL_VENUES];

            if (state) {
                venues = venues.filter(v => v.state === state.toUpperCase());
            }
            if (city) {
                const cityLower = city.toLowerCase();
                venues = venues.filter(v => v.city.toLowerCase().includes(cityLower));
            }
            if (type) {
                venues = venues.filter(v => v.venue_type === type);
            }
            if (featured === 'true') {
                venues = venues.filter(v => v.is_featured);
            }
            if (tournaments === 'true') {
                venues = venues.filter(v => v.has_tournaments);
            }
            if (search) {
                const searchLower = search.toLowerCase();
                venues = venues.filter(v =>
                    v.name.toLowerCase().includes(searchLower) ||
                    v.city.toLowerCase().includes(searchLower) ||
                    v.state.toLowerCase().includes(searchLower) ||
                    (v.slug && v.slug.includes(searchLower))
                );
            }

            // Sort: featured first, then by trust score
            venues.sort((a, b) => {
                if (a.is_featured !== b.is_featured) return b.is_featured ? 1 : -1;
                return (b.trust_score || 0) - (a.trust_score || 0);
            });
        }

        // GPS-based distance calculation and filtering
        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            const maxRadius = parseFloat(radius);

            venues = venues.map(venue => {
                const venueLat = venue.lat || 39.8283;
                const venueLng = venue.lng || -98.5795;
                const distance = calculateDistance(userLat, userLng, venueLat, venueLng);
                return {
                    ...venue,
                    distance_km: Math.round(distance * 10) / 10,
                    distance_mi: Math.round(distance * 0.621371 * 10) / 10
                };
            });

            // Filter by radius
            venues = venues.filter(v => v.distance_km <= maxRadius);

            // Sort by distance
            venues.sort((a, b) => a.distance_km - b.distance_km);
        }

        const total = venues.length;
        const limitedVenues = venues.slice(0, parseInt(limit));

        return res.status(200).json({
            success: true,
            data: limitedVenues,
            total,
            hasGpsData: !!(lat && lng),
            source: fromDb ? 'database' : 'json'
        });
    } catch (error) {
        console.error('Venues API error:', error);
        return res.status(200).json({
            success: true,
            data: ALL_VENUES.slice(0, 100),
            total: ALL_VENUES.length,
            source: 'json-fallback'
        });
    }
}

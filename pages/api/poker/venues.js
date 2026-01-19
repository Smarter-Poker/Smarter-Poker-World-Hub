/**
 * Poker Venues API - Get casinos, clubs, and card rooms
 * Supports GPS-based search with distance calculation
 */
import { createClient } from '@supabase/supabase-js';

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

// Approximate coordinates for major cities/states (for venues without exact coords)
const STATE_COORDS = {
    'NV': { lat: 36.1699, lng: -115.1398 }, // Las Vegas
    'CA': { lat: 34.0522, lng: -118.2437 }, // Los Angeles
    'FL': { lat: 26.1224, lng: -80.1373 },  // Hollywood
    'TX': { lat: 30.2672, lng: -97.7431 },  // Austin
    'NJ': { lat: 39.3643, lng: -74.4229 },  // Atlantic City
    'PA': { lat: 40.1105, lng: -74.8526 },  // Bensalem
    'CT': { lat: 41.4741, lng: -71.9604 },  // Mashantucket
    'OK': { lat: 33.9137, lng: -96.3707 },  // Durant
    'AZ': { lat: 33.4942, lng: -111.9261 }, // Scottsdale
    'CO': { lat: 39.7985, lng: -105.5044 }, // Black Hawk
    'MD': { lat: 39.1637, lng: -76.7247 },  // Hanover
    'NY': { lat: 43.0760, lng: -89.3987 },  // Verona
    'LA': { lat: 29.9511, lng: -90.0715 },  // New Orleans
    'MS': { lat: 30.3960, lng: -88.8853 },  // Biloxi
    'NC': { lat: 35.4676, lng: -83.3149 },  // Cherokee
    'WI': { lat: 43.0389, lng: -87.9065 },  // Milwaukee
    'MI': { lat: 42.3100, lng: -85.1658 },  // Battle Creek
    'OH': { lat: 41.4993, lng: -81.6944 },  // Cleveland
    'MN': { lat: 44.7866, lng: -93.4877 },  // Shakopee
    'IA': { lat: 41.4460, lng: -91.0751 },  // Riverside
    'WA': { lat: 47.2868, lng: -122.2029 }, // Auburn
    'OR': { lat: 44.9916, lng: -123.9615 }, // Lincoln City
};

// Fallback venues when DB unavailable
const FALLBACK_VENUES = [
    { id: 1, name: "Bellagio", venue_type: "casino", city: "Las Vegas", state: "NV", phone: "702-693-7111", website: "https://bellagio.mgmresorts.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10"], poker_tables: 40, trust_score: 4.8, is_featured: true, lat: 36.1127, lng: -115.1767 },
    { id: 2, name: "Commerce Casino", venue_type: "card_room", city: "Commerce", state: "CA", phone: "323-721-2100", website: "https://commercecasino.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 200, trust_score: 4.3, is_featured: true, lat: 33.9958, lng: -118.1517 },
    { id: 3, name: "Seminole Hard Rock", venue_type: "casino", city: "Hollywood", state: "FL", phone: "866-502-7529", website: "https://seminolehardrockhollywood.com", games_offered: ["NLH", "PLO"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 45, trust_score: 4.7, is_featured: true, lat: 26.0501, lng: -80.2115 },
    { id: 4, name: "Borgata", venue_type: "casino", city: "Atlantic City", state: "NJ", phone: "609-317-1000", website: "https://theborgata.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$2", "$2/$5", "$5/$10"], poker_tables: 85, trust_score: 4.6, is_featured: true, lat: 39.3773, lng: -74.4379 },
    { id: 5, name: "Lodge Poker Club", venue_type: "poker_club", city: "Austin", state: "TX", phone: "737-232-5243", website: "https://thelodgeaustin.com", games_offered: ["NLH", "PLO", "Mixed"], stakes_cash: ["$1/$3", "$2/$5", "$5/$10"], poker_tables: 40, trust_score: 4.8, is_featured: true, lat: 30.4065, lng: -97.7148 },
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            state,
            city,
            type,
            lat,
            lng,
            radius = 100, // km
            limit = 100,
            featured,
            search // manual location/name search
        } = req.query;

        let query = supabase
            .from('poker_venues')
            .select('*')
            .order('trust_score', { ascending: false })
            .limit(parseInt(limit));

        // Filter by state
        if (state) {
            query = query.eq('state', state.toUpperCase());
        }

        // Filter by city
        if (city) {
            query = query.ilike('city', `%${city}%`);
        }

        // Filter by venue type
        if (type) {
            query = query.eq('venue_type', type);
        }

        // Filter featured only
        if (featured === 'true') {
            query = query.eq('is_featured', true);
        }

        // Manual search (name or city)
        if (search) {
            query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%`);
        }

        const { data, error } = await query;
        let venues = data || [];

        if (error || !venues.length) {
            venues = FALLBACK_VENUES;
            if (state) venues = venues.filter(v => v.state === state.toUpperCase());
            if (type) venues = venues.filter(v => v.venue_type === type);
            if (search) venues = venues.filter(v =>
                v.name.toLowerCase().includes(search.toLowerCase()) ||
                v.city.toLowerCase().includes(search.toLowerCase())
            );
        }

        // GPS-based distance calculation and filtering
        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            const maxRadius = parseFloat(radius);

            venues = venues.map(venue => {
                // Use venue coords if available, otherwise use state coords
                const venueLat = venue.lat || STATE_COORDS[venue.state]?.lat || 39.8283;
                const venueLng = venue.lng || STATE_COORDS[venue.state]?.lng || -98.5795;
                const distance = calculateDistance(userLat, userLng, venueLat, venueLng);
                return { ...venue, distance_km: Math.round(distance * 10) / 10, distance_mi: Math.round(distance * 0.621371 * 10) / 10 };
            });

            // Filter by radius
            venues = venues.filter(v => v.distance_km <= maxRadius);

            // Sort by distance
            venues.sort((a, b) => a.distance_km - b.distance_km);
        }

        return res.status(200).json({
            success: true,
            data: venues.slice(0, parseInt(limit)),
            total: venues.length,
            hasGpsData: !!(lat && lng)
        });
    } catch (error) {
        console.error('Venues API error:', error);
        return res.status(200).json({ success: true, data: FALLBACK_VENUES });
    }
}


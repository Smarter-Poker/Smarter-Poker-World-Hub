/**
 * Poker Venues API - Serves all 483 verified poker venues
 * Supports filtering, GPS-based search, and daily tournament schedule lookups
 *
 * Query params:
 *   id         - return single venue by numeric ID
 *   state      - filter by state code (e.g., NV, CA)
 *   city       - filter by city (case-insensitive partial match)
 *   type       - filter by venue_type (casino, card_room, charity, poker_club)
 *   tournaments - if 'true', only venues with has_tournaments=true
 *   search     - search by name or city (case-insensitive partial match)
 *   lat + lng + radius (default 100km) - GPS-based search with Haversine distance
 *   limit      - max results (default 500)
 *   featured   - if 'true', only featured venues
 */
import { createClient } from '@supabase/supabase-js';
import allVenuesData from '../../../data/all-venues.json';
import dailyTournamentData from '../../../data/daily-tournament-schedules.json';

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

/**
 * Fuzzy match a venue name against tournament schedule venue names.
 * Returns the best matching tournament entry or null.
 */
function findDailyTournaments(venueName, venueCity, venueState) {
    if (!venueName || !dailyTournamentData?.tournaments) return null;

    const normalizedName = venueName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const tournaments = dailyTournamentData.tournaments;

    // Pass 1: Exact name match (case-insensitive)
    let match = tournaments.find(
        t => t.venue_name.toLowerCase().trim() === venueName.toLowerCase().trim()
    );
    if (match) return match;

    // Pass 2: Normalized match (strip punctuation)
    match = tournaments.find(t => {
        const normalized = t.venue_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        return normalized === normalizedName;
    });
    if (match) return match;

    // Pass 3: One name contains the other (same state)
    match = tournaments.find(t => {
        if (venueState && t.state && t.state.toUpperCase() !== venueState.toUpperCase()) return false;
        const tName = t.venue_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        return tName.includes(normalizedName) || normalizedName.includes(tName);
    });
    if (match) return match;

    // Pass 4: Significant word overlap (same state, at least 2 shared words of length >= 3)
    const venueWords = normalizedName.split(/\s+/).filter(w => w.length >= 3);
    if (venueWords.length > 0) {
        let bestScore = 0;
        let bestMatch = null;
        for (const t of tournaments) {
            if (venueState && t.state && t.state.toUpperCase() !== venueState.toUpperCase()) continue;
            const tWords = t.venue_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(w => w.length >= 3);
            const shared = venueWords.filter(w => tWords.includes(w)).length;
            const score = shared / Math.max(venueWords.length, tWords.length);
            if (shared >= 2 && score > bestScore) {
                bestScore = score;
                bestMatch = t;
            }
        }
        if (bestMatch) return bestMatch;
    }

    return null;
}

/**
 * Load venues from JSON file data
 */
function getJsonVenues() {
    return allVenuesData?.venues || [];
}

/**
 * Apply filters to a venues array (used for JSON fallback path)
 */
function applyFilters(venues, { id, state, city, type, tournaments, search, featured }) {
    let filtered = [...venues];

    if (id) {
        filtered = filtered.filter(v => v.id === parseInt(id));
    }

    if (state) {
        filtered = filtered.filter(v => v.state && v.state.toUpperCase() === state.toUpperCase());
    }

    if (city) {
        const cityLower = city.toLowerCase();
        filtered = filtered.filter(v => v.city && v.city.toLowerCase().includes(cityLower));
    }

    if (type) {
        filtered = filtered.filter(v => v.venue_type === type);
    }

    if (tournaments === 'true') {
        filtered = filtered.filter(v => v.has_tournaments === true);
    }

    if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(v =>
            (v.name && v.name.toLowerCase().includes(searchLower)) ||
            (v.city && v.city.toLowerCase().includes(searchLower))
        );
    }

    if (featured === 'true') {
        filtered = filtered.filter(v => v.is_featured === true);
    }

    return filtered;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            id,
            state,
            city,
            type,
            tournaments,
            search,
            lat,
            lng,
            radius = 100,
            limit = 500,
            featured,
        } = req.query;

        const maxResults = parseInt(limit) || 500;
        let venues = [];
        let usedFallback = false;

        // --- Try Supabase first ---
        try {
            let query = supabase
                .from('poker_venues')
                .select('*');

            if (id) {
                query = query.eq('id', parseInt(id));
            } else {
                if (state) {
                    query = query.eq('state', state.toUpperCase());
                }
                if (city) {
                    query = query.ilike('city', `%${city}%`);
                }
                if (type) {
                    query = query.eq('venue_type', type);
                }
                if (tournaments === 'true') {
                    query = query.eq('has_tournaments', true);
                }
                if (search) {
                    query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%`);
                }
                if (featured === 'true') {
                    query = query.eq('is_featured', true);
                }

                query = query.order('trust_score', { ascending: false });
            }

            const { data, error } = await query;

            if (!error && data && data.length > 0) {
                venues = data;
            } else {
                throw new Error(error?.message || 'No data from Supabase');
            }
        } catch (dbError) {
            // --- Fall back to JSON data ---
            console.warn('Supabase unavailable, using JSON fallback:', dbError.message);
            usedFallback = true;
            const jsonVenues = getJsonVenues();
            venues = applyFilters(jsonVenues, { id, state, city, type, tournaments, search, featured });

            // Sort by trust_score descending for JSON fallback
            if (!id) {
                venues.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
            }
        }

        // --- GPS-based distance calculation and filtering ---
        const hasGps = !!(lat && lng);
        if (hasGps) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            const maxRadius = parseFloat(radius);

            venues = venues.map(venue => {
                const venueLat = venue.latitude ?? venue.lat;
                const venueLng = venue.longitude ?? venue.lng;

                if (venueLat == null || venueLng == null) {
                    return { ...venue, distance_km: null, distance_mi: null };
                }

                const distance = calculateDistance(userLat, userLng, parseFloat(venueLat), parseFloat(venueLng));
                return {
                    ...venue,
                    distance_km: Math.round(distance * 10) / 10,
                    distance_mi: Math.round(distance * 0.621371 * 10) / 10,
                };
            });

            // Filter by radius (exclude venues with no coordinates)
            venues = venues.filter(v => v.distance_km != null && v.distance_km <= maxRadius);

            // Sort by distance when GPS is provided
            venues.sort((a, b) => a.distance_km - b.distance_km);
        }

        // --- Single venue by ID: attach daily tournament schedules ---
        if (id && venues.length > 0) {
            const venue = venues[0];
            const tournamentMatch = findDailyTournaments(venue.name, venue.city, venue.state);

            if (tournamentMatch) {
                venue.daily_tournaments = tournamentMatch.schedules || [];
                venue.daily_tournaments_source = tournamentMatch.source_url || null;
            } else {
                venue.daily_tournaments = [];
            }

            return res.status(200).json({
                success: true,
                data: venue,
                total: 1,
                hasGpsData: hasGps,
            });
        }

        // --- Apply limit and return ---
        const total = venues.length;
        const limited = venues.slice(0, maxResults);

        return res.status(200).json({
            success: true,
            data: limited,
            total,
            hasGpsData: hasGps,
        });
    } catch (error) {
        console.error('Venues API error:', error);

        // Last resort: return JSON data unfiltered
        const fallbackVenues = getJsonVenues();
        return res.status(200).json({
            success: true,
            data: fallbackVenues.slice(0, 500),
            total: fallbackVenues.length,
            hasGpsData: false,
        });
    }
}

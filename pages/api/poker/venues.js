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
        filtered = filtered.filter(v => String(v.id) === String(id));
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

        const maxResults = parseInt(limit, 10) || 500;
        let venues = [];

        if (id) {
            // --- Single venue lookup: validate integer ID ---
            const numericId = parseInt(id, 10);
            if (isNaN(numericId) || numericId < 1) {
                return res.status(400).json({ success: false, error: 'Invalid venue id' });
            }

            // Try Supabase first (has real-time data)
            try {
                const { data, error } = await supabase
                    .from('poker_venues')
                    .select('*')
                    .eq('id', numericId)
                    .single();

                if (!error && data) {
                    venues = [data];
                } else {
                    throw new Error(error?.message || 'Not found in Supabase');
                }
            } catch (dbError) {
                // Fall back to JSON for single venue
                venues = applyFilters(getJsonVenues(), { id });
            }
        } else {
            // --- Venue listing: use JSON (complete 483-venue dataset) ---
            venues = applyFilters(getJsonVenues(), { state, city, type, tournaments, search, featured });
            venues.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));

            // --- Merge public social pages (clubs, charities, home games) ---
            // Linked pages enrich their parent JSON venue; unlinked pages create new entries
            try {
                let spQuery = supabase
                    .from('social_pages')
                    .select('id, name, description, avatar_url, page_type, location_city, location_state, follower_count, metadata, linked_venue_id, owner_id')
                    .eq('is_public', true)
                    .not('location_city', 'is', null);

                // Apply matching filters to social pages query
                if (state) spQuery = spQuery.ilike('location_state', state);
                if (city) spQuery = spQuery.ilike('location_city', `%${city}%`);
                if (type && ['club', 'charity', 'home_game'].includes(type)) {
                    spQuery = spQuery.eq('page_type', type);
                } else if (type && ['poker_club'].includes(type)) {
                    // poker_club maps to club page_type
                    spQuery = spQuery.eq('page_type', 'club');
                } else if (type && !['club', 'charity', 'home_game', 'poker_club'].includes(type)) {
                    // Type filter is for a poker_venues-only type (e.g. 'casino'), skip social pages
                    spQuery = null;
                }
                if (search) spQuery = spQuery?.ilike('name', `%${search}%`);

                if (spQuery) {
                    const { data: socialPages } = await spQuery.limit(200);
                    if (socialPages && socialPages.length > 0) {
                        const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                        const todayIdx = new Date().getDay();
                        const todayKey = DAYS_ORDER[todayIdx];

                        // --- Batch tournament detection ---
                        // Resolve owner_ids → club_ids → tournament counts
                        const ownerIds = [...new Set(socialPages.map(sp => sp.owner_id).filter(Boolean))];
                        let clubsByOwner = {};
                        let tournamentCountByClub = {};
                        if (ownerIds.length > 0) {
                            try {
                                const { data: clubs } = await supabase
                                    .from('clubs')
                                    .select('id, owner_id, name')
                                    .in('owner_id', ownerIds);
                                if (clubs) {
                                    for (const c of clubs) {
                                        if (!clubsByOwner[c.owner_id]) clubsByOwner[c.owner_id] = [];
                                        clubsByOwner[c.owner_id].push(c);
                                    }
                                    const clubIds = clubs.map(c => c.id);
                                    if (clubIds.length > 0) {
                                        const { data: tourneys } = await supabase
                                            .from('tournaments')
                                            .select('club_id')
                                            .in('club_id', clubIds)
                                            .in('status', ['ANNOUNCED', 'RUNNING', 'SCHEDULED'])
                                            .gte('start_time', new Date().toISOString());
                                        if (tourneys) {
                                            for (const t of tourneys) {
                                                tournamentCountByClub[t.club_id] = (tournamentCountByClub[t.club_id] || 0) + 1;
                                            }
                                        }
                                    }
                                }
                            } catch (clubErr) {
                                console.warn('[venues] Club/tournament lookup failed (non-fatal):', clubErr.message);
                            }
                        }

                        // Helper: check if a social page has upcoming tournaments
                        const pageHasTournaments = (sp) => {
                            const ownerClubs = clubsByOwner[sp.owner_id] || [];
                            // Try name match first, then fallback to any club by this owner
                            const matchedClub = ownerClubs.find(c => c.name.toLowerCase() === sp.name.toLowerCase()) || ownerClubs[0];
                            return matchedClub ? (tournamentCountByClub[matchedClub.id] || 0) > 0 : false;
                        };

                        // Helper: extract game types from run_schedule metadata
                        const extractGames = (schedule) => {
                            const games = new Set();
                            for (const dayData of Object.values(schedule)) {
                                if (dayData && dayData.games && Array.isArray(dayData.games)) {
                                    dayData.games.forEach(g => games.add(g));
                                }
                            }
                            return [...games];
                        };

                        // Separate linked vs unlinked pages
                        const linkedPages = socialPages.filter(sp => sp.linked_venue_id);
                        const unlinkedPages = socialPages.filter(sp => !sp.linked_venue_id);

                        // --- Enrich JSON venues that have a linked social page ---
                        for (const sp of linkedPages) {
                            const jsonVenue = venues.find(v => String(v.id) === String(sp.linked_venue_id));
                            if (jsonVenue) {
                                jsonVenue.is_social_page = true;
                                jsonVenue.social_page_id = sp.id;
                                jsonVenue.follower_count = sp.follower_count || jsonVenue.follower_count || 0;
                                jsonVenue.has_tournaments = jsonVenue.has_tournaments || pageHasTournaments(sp);
                                if (sp.avatar_url || (sp.metadata && sp.metadata.logo_url)) {
                                    jsonVenue.profile_photo_url = jsonVenue.profile_photo_url || sp.avatar_url || sp.metadata.logo_url;
                                }
                                // Inherit coordinates from social page geocoding if JSON venue has none
                                if (!jsonVenue.latitude && !jsonVenue.longitude) {
                                    const geocoded = (sp.metadata && sp.metadata.geocoded_locations) || {};
                                    const locStr = sp.location_city + (sp.location_state ? ', ' + sp.location_state : '');
                                    const coords = geocoded[locStr] || geocoded[sp.location_city] || null;
                                    if (coords) {
                                        jsonVenue.latitude = coords.lat;
                                        jsonVenue.longitude = coords.lng;
                                    }
                                }
                                const schedule = (sp.metadata && sp.metadata.run_schedule) || {};
                                const schedGames = extractGames(schedule);
                                if (schedGames.length > 0) {
                                    jsonVenue.games_offered = [...new Set([...(jsonVenue.games_offered || []), ...schedGames])];
                                }
                            }
                        }

                        // --- Map unlinked pages into venue entries ---
                        const mappedPages = [];
                        for (const sp of unlinkedPages) {
                            const geocoded = (sp.metadata && sp.metadata.geocoded_locations) || {};
                            const schedule = (sp.metadata && sp.metadata.run_schedule) || {};
                            const hasTourneys = pageHasTournaments(sp);
                            const allGames = extractGames(schedule);

                            // Determine primary lat/lng from geocoded_locations
                            const primaryLocStr = sp.location_city + (sp.location_state ? ', ' + sp.location_state : '');
                            const primaryCoords = geocoded[primaryLocStr] || geocoded[sp.location_city] || null;

                            // For charities: create one entry per unique geocoded schedule location
                            if (sp.page_type === 'charity' && Object.keys(schedule).length > 0) {
                                const seenLocs = new Set();
                                for (const dayKey of DAYS_ORDER) {
                                    const dayData = schedule[dayKey];
                                    if (!dayData || !dayData.open || !dayData.location) continue;
                                    const locKey = dayData.location.trim();
                                    if (seenLocs.has(locKey)) continue;
                                    seenLocs.add(locKey);

                                    const coords = geocoded[locKey] || null;
                                    mappedPages.push({
                                        id: `sp-${sp.id}-${dayKey}`,
                                        name: sp.name,
                                        city: locKey.split(',')[0]?.trim() || sp.location_city,
                                        state: locKey.split(',')[1]?.trim() || sp.location_state,
                                        venue_type: 'charity',
                                        profile_photo_url: sp.avatar_url,
                                        about: sp.description,
                                        trust_score: null,
                                        is_social_page: true,
                                        social_page_id: sp.id,
                                        follower_count: sp.follower_count || 0,
                                        latitude: coords ? coords.lat : null,
                                        longitude: coords ? coords.lng : null,
                                        games_offered: dayData.games || [],
                                        has_tournaments: hasTourneys,
                                        is_featured: false,
                                        schedule_location: locKey,
                                        schedule_day: dayKey,
                                        is_today: dayKey === todayKey,
                                    });
                                }
                                // If no schedule locations found, still add primary entry
                                if (seenLocs.size === 0) {
                                    mappedPages.push({
                                        id: `sp-${sp.id}`,
                                        name: sp.name,
                                        city: sp.location_city,
                                        state: sp.location_state,
                                        venue_type: 'charity',
                                        profile_photo_url: sp.avatar_url,
                                        about: sp.description,
                                        trust_score: null,
                                        is_social_page: true,
                                        social_page_id: sp.id,
                                        follower_count: sp.follower_count || 0,
                                        latitude: primaryCoords ? primaryCoords.lat : null,
                                        longitude: primaryCoords ? primaryCoords.lng : null,
                                        games_offered: allGames,
                                        has_tournaments: hasTourneys,
                                        is_featured: false,
                                    });
                                }
                            } else {
                                // Clubs and home games: single entry with primary coords
                                mappedPages.push({
                                    id: `sp-${sp.id}`,
                                    name: sp.name,
                                    city: sp.location_city,
                                    state: sp.location_state,
                                    venue_type: sp.page_type === 'club' ? 'poker_club' : sp.page_type,
                                    profile_photo_url: sp.avatar_url || (sp.metadata && sp.metadata.logo_url) || null,
                                    about: sp.description,
                                    trust_score: null,
                                    is_social_page: true,
                                    social_page_id: sp.id,
                                    follower_count: sp.follower_count || 0,
                                    latitude: primaryCoords ? primaryCoords.lat : null,
                                    longitude: primaryCoords ? primaryCoords.lng : null,
                                    games_offered: allGames,
                                    has_tournaments: hasTourneys,
                                    is_featured: false,
                                });
                            }
                        }
                        venues = venues.concat(mappedPages);
                    }
                }
            } catch (spErr) {
                console.warn('[venues] Social pages merge failed (non-fatal):', spErr.message);
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

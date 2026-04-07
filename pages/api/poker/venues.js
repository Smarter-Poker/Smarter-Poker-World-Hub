/**
 * Poker Venues API - Serves ALL verified poker venues (uncapped)
 * Supports filtering, GPS-based search, and daily tournament schedule lookups
 *
 * Query params:
 *   id         - return single venue by numeric ID
 *   state      - filter by state code (e.g., NV, CA) or full name (e.g., Kentucky)
 *   city       - filter by city (case-insensitive partial match)
 *   type       - filter by venue_type (casino, card_room, charity, poker_club)
 *   tournaments - if 'true', only venues with has_tournaments=true
 *   search     - search by name, city, address, or state (case-insensitive)
 *   lat + lng + radius (default 100mi) - GPS-based search with Haversine distance
 *   limit      - max results (default: all, no cap)
 *   featured   - if 'true', only featured venues
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { captureError, addBreadcrumb } from '../../../src/lib/sentry';
import allVenuesData from '../../../data/all-venues.json';
import dailyTournamentData from '../../../data/daily-tournament-schedules.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// --- State abbreviation ↔ full name mapping ---
const STATE_ABBREV_TO_NAME = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
};
const STATE_NAME_TO_ABBREV = Object.fromEntries(
    Object.entries(STATE_ABBREV_TO_NAME).map(([k, v]) => [v.toLowerCase(), k])
);

/** Resolve a search term to a state abbreviation (if it matches a state name) */
function resolveStateAbbrev(term) {
    const upper = term.toUpperCase();
    if (STATE_ABBREV_TO_NAME[upper]) return upper;
    return STATE_NAME_TO_ABBREV[term.toLowerCase()] || null;
}

// --- In-memory cache for JSON venue data with Map index ---
const CACHE_TTL = 60000; // 60 seconds
let _jsonVenueCache = null;
let _jsonVenueCacheTime = 0;
let _venueByIdMap = null;

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
 * Load venues from JSON file data with in-memory cache + ID index
 */
function getJsonVenues() {
    const now = Date.now();
    if (_jsonVenueCache && (now - _jsonVenueCacheTime) < CACHE_TTL) {
        return _jsonVenueCache;
    }
    _jsonVenueCache = allVenuesData?.venues || [];
    _jsonVenueCacheTime = now;
    // Build O(1) lookup Map
    _venueByIdMap = new Map();
    for (const v of _jsonVenueCache) {
        _venueByIdMap.set(String(v.id), v);
    }
    return _jsonVenueCache;
}

/** Get venue by ID in O(1) — returns reference from cached array */
function getVenueById(venueId) {
    if (!_venueByIdMap) getJsonVenues(); // ensure map is built
    return _venueByIdMap.get(String(venueId)) || null;
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
        // Merge card_room into poker_club — they're the same thing
        if (type === 'poker_club') {
            filtered = filtered.filter(v => v.venue_type === 'poker_club' || v.venue_type === 'card_room');
        } else {
            filtered = filtered.filter(v => v.venue_type === type);
        }
    }

    if (tournaments === 'true') {
        filtered = filtered.filter(v => v.has_tournaments === true);
    }

    if (search) {
        const searchLower = search.toLowerCase().trim();
        // Check if search term is a state name/abbreviation
        const searchStateAbbrev = resolveStateAbbrev(search.trim());

        // Handle "City, State" format (e.g., "Chicago, IL" or "Las Vegas, NV")
        const cityStateMatch = search ? search.match(/^([^,]+),\s*(.+)$/) : null;
        if (cityStateMatch) {
            const cityPart = cityStateMatch[1].trim().toLowerCase();
            const statePart = cityStateMatch[2].trim();
            const stateAbbrev = resolveStateAbbrev(statePart);
            filtered = filtered.filter(v => {
                const cityMatch = v.city && v.city.toLowerCase().includes(cityPart);
                const stateMatch = stateAbbrev
                    ? (v.state && v.state.toUpperCase() === stateAbbrev)
                    : (v.state && v.state.toLowerCase().includes(statePart.toLowerCase()));
                // Require both city and state match when "City, State" format is used
                return cityMatch && stateMatch;
            });
        } else {
            filtered = filtered.filter(v =>
                (v.name && v.name.toLowerCase().includes(searchLower)) ||
                (v.city && v.city.toLowerCase().includes(searchLower)) ||
                (v.address && v.address.toLowerCase().includes(searchLower)) ||
                (searchStateAbbrev && v.state && v.state.toUpperCase() === searchStateAbbrev)
            );
        }
    }

    if (featured === 'true') {
        filtered = filtered.filter(v => v.is_featured === true);
    }

    return filtered;
}

export default async function handler(req, res) {
  try {
    // CDN cache: fresh for 120s, serve stale up to 600s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' } });
      }

      try {
          const {
              id,
              state,
              city,
              type,
              venue_type,
              tournaments,
              search,
              lat,
              lng,
              radius = 100,
              limit = 10000,
              featured,
              hasNLH,
              hasPLO,
              hasMixed,
          } = req.query;

          const maxResults = Math.min(parseInt(limit, 10) || 1000, 1000);
          const offset = parseInt(req.query.offset, 10) || 0;
          // Merge 'type' and 'venue_type' so both ?type=casino and ?venue_type=casino work
          const effectiveType = type || venue_type || null;
          let venues = [];

          if (id) {
              // --- Single venue lookup ---
              const numericId = parseInt(id, 10);
              
              if (!isNaN(numericId) && numericId >= 1) {
                  // Numeric ID: standard lookup
                  try {
                      const { data, error } = await getSupabase()
                          .from('poker_venues')
                          .select('*')
                          .eq('id', numericId)
                          .maybeSingle();

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
                  // Non-numeric ID (slug): search by slug/bravo_slug in JSON data
                  const slug = String(id).toLowerCase();
                  const jsonVenues = getJsonVenues();
                  
                  // Build slug variants: original, pa- stripped, clean
                  const slugVariants = [slug];
                  if (slug.startsWith('pa-')) slugVariants.push(slug.slice(3));
                  
                  // Pass 1: Exact slug/bravo_slug match across all variants
                  let slugMatch = null;
                  for (const sv of slugVariants) {
                      slugMatch = jsonVenues.find(v => 
                          (v.slug && v.slug.toLowerCase() === sv) || 
                          (v.bravo_slug && v.bravo_slug.toLowerCase() === sv) ||
                          (v.name && v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === sv)
                      );
                      if (slugMatch) break;
                  }
                  
                  // Pass 2: Normalized name match (decode -amp- → &, strip prefixes)
                  if (!slugMatch) {
                      const cleanSlug = (slug.startsWith('pa-') ? slug.slice(3) : slug);
                      const searchName = cleanSlug
                          .replace(/-amp-/g, ' & ')
                          .replace(/-s-/g, "'s ")
                          .replace(/-/g, ' ')
                          .trim();
                      const searchNorm = searchName.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                      
                      slugMatch = jsonVenues.find(v => {
                          if (!v.name) return false;
                          const vNorm = v.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                          return vNorm === searchNorm;
                      });
                      
                      // Pass 3: Significant word overlap (with false-positive guards)
                      if (!slugMatch) {
                          const stopWords = new Set([
                              'casino', 'resort', 'hotel', 'poker', 'room', 'the', 'and', 'at', 'of', 'in',
                              'bar', 'lounge', 'club', 'card', 'house', 'center', 'spa',
                              'las', 'vegas', 'city', 'park', 'lake', 'valley', 'north', 'south', 'east', 'west',
                              'series', 'classic', 'championship', 'tournament',
                          ]);
                          const seriesPattern = /\b(series|classic|championship|circuit)\b/i;
                          const queryWords = searchNorm.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));
                          if (queryWords.length >= 1) {
                              let bestScore = 0;
                              for (const v of jsonVenues) {
                                  if (!v.name) continue;
                                  // Skip tour/series entries
                                  if (seriesPattern.test(v.name)) continue;
                                  if (v.venue_type === 'series' || v.venue_type === 'tour') continue;
                                  const vNorm = v.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                                  const vWords = vNorm.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));
                                  const shared = queryWords.filter(w => vWords.includes(w)).length;
                                  const score = shared / Math.max(queryWords.length, vWords.length);
                                  const minShared = queryWords.length >= 2 ? 2 : 1;
                                  if (shared >= minShared && score >= 0.6 && score > bestScore) {
                                      bestScore = score;
                                      slugMatch = v;
                                  }
                              }
                          }
                      }
                  }
                  
                  if (slugMatch) {
                      venues = [slugMatch];
                  } else {
                      // Try Supabase text search as last resort
                      try {
                          const cleanSlug = (slug.startsWith('pa-') ? slug.slice(3) : slug);
                          const searchName = cleanSlug
                              .replace(/-amp-/g, ' & ')
                              .replace(/-s-/g, "'s ")
                              .replace(/-/g, ' ');
                          const { data } = await getSupabase()
                              .from('poker_venues')
                              .select('*')
                              .ilike('name', `%${searchName}%`)
                              .limit(1);
                          if (data && data.length > 0) {
                              venues = [data[0]];
                          }
                      } catch (_) { /* silent */ }
                      if (venues.length === 0) {
                          return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Venue not found' } });
                      }
                  }
              }
          } else {
              // --- Venue listing: Supabase-first (live 500+ venue dataset) ---
              let usedSupabase = false;
              try {
                  let q = getSupabase()
                      .from('poker_venues')
                      .select('*')
                      .eq('is_active', true);

                  if (state) q = q.ilike('state', state.length === 2 ? state.toUpperCase() : `%${state}%`);
                  if (city) q = q.ilike('city', `%${city}%`);
                  if (effectiveType) {
                      // Merge card_room into poker_club — they're the same thing
                      if (effectiveType === 'poker_club') {
                          q = q.in('venue_type', ['poker_club', 'card_room']);
                      } else {
                          q = q.eq('venue_type', effectiveType);
                      }
                  } else if (!search && !id) {
                      // Include tours/series when GPS search is active (filtered by radius anyway)
                      // Exclude from non-GPS paginated lists to prevent clutter
                      if (!lat || !lng) {
                          q = q.not('venue_type', 'in', '("tour","series")');
                      }
                  }
                  if (tournaments === 'true') q = q.eq('has_tournaments', true);
                  if (featured === 'true') q = q.eq('is_featured', true);
                  if (search) {
                      const searchStateAbbrev = resolveStateAbbrev(search.trim());
                      const cityStateMatch = search.match(/^([^,]+),\s*(.+)$/);
                      if (cityStateMatch) {
                          const cityPart = cityStateMatch[1].trim();
                          const statePart = cityStateMatch[2].trim();
                          const stateAbbrev = resolveStateAbbrev(statePart);
                          q = q.ilike('city', `%${cityPart}%`);
                          if (stateAbbrev) q = q.ilike('state', stateAbbrev);
                          else q = q.ilike('state', `%${statePart}%`);
                      } else if (searchStateAbbrev) {
                          q = q.ilike('state', searchStateAbbrev);
                      } else {
                          q = q.or(`name.ilike.%${search}%,city.ilike.%${search}%,address.ilike.%${search}%,state.ilike.%${search}%`);
                      }
                  }

                  // No artificial cap — return ALL venues
                  q = q.order('trust_score', { ascending: false, nullsFirst: false }).range(offset, offset + maxResults - 1);
                  const { data: dbVenues, error: dbErr, count: dbCount } = await q;

                  if (!dbErr && dbVenues && dbVenues.length > 0) {
                      venues = dbVenues.filter(v => !v.name?.toLowerCase().includes('harrah') || !v.name?.toLowerCase().includes('joliet'));
                      usedSupabase = true;
                  }
              } catch (dbErr) {
                  console.warn('[venues] Supabase query failed, falling back to JSON:', dbErr.message);
              }

              // JSON fallback if Supabase returned nothing
              if (!usedSupabase) {
                  venues = applyFilters(getJsonVenues(), { state, city, type: effectiveType, tournaments, search, featured })
                      .filter(v => !v.name?.toLowerCase().includes('harrah') || !v.name?.toLowerCase().includes('joliet'));
              }
              venues.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));

              // --- Merge public social pages (clubs, charities, home games) ---
              // Linked pages enrich their parent JSON venue; unlinked pages create new entries
              try {
                  let spQuery = getSupabase()
                      .from('social_pages')
                      .select('id, name, description, avatar_url, page_type, location_city, location_state, follower_count, metadata, linked_venue_id, owner_id')
                      .eq('is_public', true)
                      .not('location_city', 'is', null)
                          .limit(100);

                  // Apply matching filters to social pages query
                  if (state) spQuery = spQuery.ilike('location_state', state)
                      .limit(100);
                  if (city) spQuery = spQuery.ilike('location_city', `%${city}%`)
                      .limit(100);
                  if (effectiveType && ['club', 'charity', 'home_game'].includes(effectiveType)) {
                      spQuery = spQuery.eq('page_type', effectiveType)
                          .limit(100);
                  } else if (effectiveType && ['poker_club'].includes(effectiveType)) {
                      // poker_club maps to club page_type
                      spQuery = spQuery.eq('page_type', 'club')
                          .limit(100);
                  } else if (effectiveType && !['club', 'charity', 'home_game', 'poker_club'].includes(effectiveType)) {
                      // Type filter is for a poker_venues-only type (e.g. 'casino'), skip social pages
                      spQuery = null;
                  }
                  if (search) {
                      const searchAbbrev = resolveStateAbbrev(search);
                      const searchStateName = STATE_ABBREV_TO_NAME[search.toUpperCase()];
                      // Build OR filter: name, city, state (verbatim), plus abbreviation/full-name if resolved
                      let orParts = [`name.ilike.%${search}%`, `location_city.ilike.%${search}%`, `location_state.ilike.%${search}%`];
                      if (searchAbbrev) orParts.push(`location_state.ilike.${searchAbbrev}`);
                      if (searchStateName) orParts.push(`location_state.ilike.${searchStateName}`);
                      spQuery = spQuery?.or(orParts.join(','));
                  }

                  if (spQuery) {
                      const { data: socialPages } = await spQuery.limit(200);
                      if (socialPages && socialPages.length > 0) {
                          const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                          // Extract day in US Eastern Time to prevent Vercel UTC drift
                          const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                          const todayIdx = new Date(localCurrentTime).getDay();
                          const todayKey = DAYS_ORDER[todayIdx];

                          // --- Batch tournament detection ---
                          // Resolve owner_ids → club_ids → tournament counts
                          const ownerIds = [...new Set(socialPages.map(sp => sp.owner_id).filter(Boolean))];
                          let clubsByOwner = {};
                          let tournamentCountByClub = {};
                          if (ownerIds.length > 0) {
                              try {
                                  const { data: clubs } = await getSupabase()
                                      .from('clubs')
                                      .select('id, owner_id, name')
                                      .in('owner_id', ownerIds)
                                          .limit(100);
                                  if (clubs) {
                                      for (const c of clubs) {
                                          if (!clubsByOwner[c.owner_id]) clubsByOwner[c.owner_id] = [];
                                          clubsByOwner[c.owner_id].push(c);
                                      }
                                      const clubIds = clubs.map(c => c.id);
                                      if (clubIds.length > 0) {
                                          const { data: tourneys } = await getSupabase()
                                              .from('tournaments')
                                              .select('club_id')
                                              .in('club_id', clubIds)
                                              .in('status', ['ANNOUNCED', 'RUNNING', 'SCHEDULED'])
                                              .gte('start_time', new Date().toISOString())
                                                  .limit(100);
                                          if (tourneys) {
                                              for (const t of tourneys) {
                                                  tournamentCountByClub[t.club_id] = (tournamentCountByClub[t.club_id] || 0) + 1;
                                              }
                                          }
                                      }
                                  }
                              } catch (clubErr) {
                                  console.warn('[venues] Club/tournament lookup failed (non-fatal):', clubErr.message);
                                  captureError(clubErr, { tags: { api: 'poker-venues', stage: 'tournament-detection' } });
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

                          addBreadcrumb({
                              category: 'poker-venues',
                              message: `Social page merge: ${socialPages.length} total, ${linkedPages.length} linked, ${unlinkedPages.length} unlinked`,
                              data: { total: socialPages.length, linked: linkedPages.length, unlinked: unlinkedPages.length },
                          });

                          // --- Enrich JSON venues that have a linked social page ---
                          const missedLinkedPages = []; // Pages whose linked_venue_id is NOT in JSON
                          for (const sp of linkedPages) {
                              const jsonVenue = getVenueById(sp.linked_venue_id);
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

                                  // Added Charity Date Logic for Linked Pages
                                  if (sp.page_type === 'charity') {
                                      let isOpenToday = false;
                                      let nextEvent = null;
                                      const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                      const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                                      const todayIdx = new Date(localCurrentTime).getDay();
                                      const todayKey = DAYS_ORDER[todayIdx];
                                      
                                      if (schedule[todayKey] && schedule[todayKey].open && schedule[todayKey].location) {
                                          isOpenToday = true;
                                      } else {
                                          for (let i = 1; i <= 7; i++) {
                                              const nextIdx = (todayIdx + i) % 7;
                                              const nextDayStr = DAYS_ORDER[nextIdx];
                                              const nextDayData = schedule[nextDayStr];
                                              if (nextDayData && nextDayData.open && nextDayData.location) {
                                                  const dayLabel = nextDayStr.charAt(0).toUpperCase() + nextDayStr.slice(1);
                                                  nextEvent = {
                                                      day: dayLabel,
                                                      location: nextDayData.location.trim()
                                                  };
                                                  break;
                                              }
                                          }
                                      }
                                      jsonVenue.is_today = isOpenToday;
                                      jsonVenue.next_event = nextEvent;
                                  }
                              } else {
                                  // Linked venue not in JSON dataset — try Supabase poker_venues
                                  missedLinkedPages.push(sp);
                              }
                          }

                          // --- Look up Supabase poker_venues for linked pages not in JSON ---
                          let supabaseVenuesByIdMap = {};
                          if (missedLinkedPages.length > 0) {
                              try {
                                  const missedIds = [...new Set(missedLinkedPages.map(sp => sp.linked_venue_id))];
                                  const { data: pvRows } = await getSupabase()
                                      .from('poker_venues')
                                      .select('id, games_offered, stakes_cash, trust_score, is_featured, has_tournaments, hours_weekday, hours_weekend, poker_tables')
                                      .in('id', missedIds)
                                      .eq('is_active', true)
                                          .limit(100);
                                  if (pvRows) {
                                      for (const pv of pvRows) supabaseVenuesByIdMap[pv.id] = pv;
                                  }
                              } catch (pvErr) {
                                  console.warn('[venues] poker_venues lookup for missed linked pages failed (non-fatal):', pvErr.message);
                                  captureError(pvErr, { tags: { api: 'poker-venues', stage: 'missed-linked-enrichment' } });
                              }
                          }

                          for (const sp of missedLinkedPages) {
                              const pv = supabaseVenuesByIdMap[sp.linked_venue_id];
                              const geocoded = (sp.metadata && sp.metadata.geocoded_locations) || {};
                              const schedule = (sp.metadata && sp.metadata.run_schedule) || {};
                              const hasTourneys = pageHasTournaments(sp) || (pv ? pv.has_tournaments : false);
                              const schedGames = extractGames(schedule);
                              const pvGames = pv ? (pv.games_offered || []) : [];
                              const allGames = [...new Set([...schedGames, ...pvGames])];
                              const primaryLocStr = sp.location_city + (sp.location_state ? ', ' + sp.location_state : '');
                              const primaryCoords = geocoded[primaryLocStr] || geocoded[sp.location_city] || null;

                              // Calculate Charity Open/Next Event Status
                              let isOpenToday = false;
                              let nextEvent = null;
                              let todayLocation = null;
                              if (sp.page_type === 'charity') {
                                  const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                  const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                                  const todayIdx = new Date(localCurrentTime).getDay();
                                  const todayKey = DAYS_ORDER[todayIdx];
                                  if (schedule[todayKey] && schedule[todayKey].open && schedule[todayKey].location) {
                                      isOpenToday = true;
                                      todayLocation = schedule[todayKey].location.trim();
                                  } else {
                                      // Find the next available event date
                                      for (let i = 1; i <= 7; i++) {
                                          const nextIdx = (todayIdx + i) % 7;
                                          const nextDayStr = DAYS_ORDER[nextIdx];
                                          const nextDayData = schedule[nextDayStr];
                                          if (nextDayData && nextDayData.open && nextDayData.location) {
                                              const dayLabel = nextDayStr.charAt(0).toUpperCase() + nextDayStr.slice(1);
                                              nextEvent = {
                                                  day: dayLabel,
                                                  location: nextDayData.location.trim()
                                              };
                                              break;
                                          }
                                      }
                                  }
                              }

                              unlinkedPages.push({
                                  ...sp,
                                  _enrichedFromPokerVenue: pv || null,
                                  _resolvedGames: allGames,
                                  _resolvedTrustScore: pv ? pv.trust_score : null,
                                  _resolvedIsFeatured: pv ? pv.is_featured : false,
                                  _resolvedHasTournaments: hasTourneys,
                                  _resolvedLatitude: primaryCoords ? primaryCoords.lat : null,
                                  _resolvedLongitude: primaryCoords ? primaryCoords.lng : null,
                              });
                          }

                          // --- Map unlinked pages into venue entries ---
                          const mappedPages = [];
                          for (const sp of unlinkedPages) {
                              const geocoded = (sp.metadata && sp.metadata.geocoded_locations) || {};
                              const schedule = (sp.metadata && sp.metadata.run_schedule) || {};
                              const hasTourneys = sp._resolvedHasTournaments != null ? sp._resolvedHasTournaments : pageHasTournaments(sp);
                              const schedGames = sp._resolvedGames || extractGames(schedule);

                              // Determine primary lat/lng from geocoded_locations (or pre-resolved)
                              let primaryLat = sp._resolvedLatitude || null;
                              let primaryLng = sp._resolvedLongitude || null;
                              if (!primaryLat && !primaryLng) {
                                  const primaryLocStr = sp.location_city + (sp.location_state ? ', ' + sp.location_state : '');
                                  const primaryCoords = geocoded[primaryLocStr] || geocoded[sp.location_city] || null;
                                  primaryLat = primaryCoords ? primaryCoords.lat : null;
                                  primaryLng = primaryCoords ? primaryCoords.lng : null;
                              }

                              // Use enriched data when available from poker_venues lookup
                              const trustScore = sp._resolvedTrustScore || null;
                              const isFeatured = sp._resolvedIsFeatured || false;

                              if (sp.page_type === 'charity') {
                                  // Unlinked charities: display if they have an event today OR a future event
                                  if (sp._charityIsOpenToday || sp._charityNextEvent) {
                                      const isOpen = sp._charityIsOpenToday;
                                      const locKey = isOpen ? sp._charityTodayLocation : sp._charityNextEvent.location;
                                      const coords = geocoded[locKey] || null;
                                      
                                      // Inherit the latitude/longitude if missing from coords dictionary
                                      let resolveLat = coords ? coords.lat : primaryLat;
                                      let resolveLng = coords ? coords.lng : primaryLng;

                                      mappedPages.push({
                                          id: `sp-${sp.id}-${todayKey}`,
                                          name: sp.name,
                                          city: locKey.split(',')[0]?.trim() || sp.location_city,
                                          state: locKey.split(',')[1]?.trim() || sp.location_state,
                                          venue_type: 'charity',
                                          profile_photo_url: sp.avatar_url,
                                          about: sp.description,
                                          trust_score: trustScore,
                                          is_social_page: true,
                                          social_page_id: sp.id,
                                          follower_count: sp.follower_count || 0,
                                          latitude: resolveLat,
                                          longitude: resolveLng,
                                          games_offered: schedGames || [],
                                          has_tournaments: hasTourneys,
                                          is_featured: isFeatured,
                                          schedule_location: locKey,
                                          schedule_day: todayKey,
                                          is_today: isOpen,
                                          next_event: sp._charityNextEvent
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
                                      trust_score: trustScore,
                                      is_social_page: true,
                                      social_page_id: sp.id,
                                      follower_count: sp.follower_count || 0,
                                      latitude: primaryLat,
                                      longitude: primaryLng,
                                      games_offered: schedGames,
                                      has_tournaments: hasTourneys,
                                      is_featured: isFeatured,
                                  });
                              }
                          }
                          venues = venues.concat(mappedPages);

                          addBreadcrumb({
                              category: 'poker-venues',
                              message: `Merge complete: ${mappedPages.length} social entries added, ${missedLinkedPages.length} enriched from poker_venues`,
                              data: { mapped: mappedPages.length, missed: missedLinkedPages.length, enriched: Object.keys(supabaseVenuesByIdMap).length },
                          });
                      }
                  }
              } catch (spErr) {
                  console.warn('[venues] Social pages merge failed (non-fatal):', spErr.message);
                  captureError(spErr, { tags: { api: 'poker-venues', stage: 'social-merge' }, level: 'warning' });
              }
          }

          // --- GPS-based distance calculation and filtering ---
          const hasGps = !!(lat && lng);
          if (hasGps) {
              const userLat = parseFloat(lat);
              const userLng = parseFloat(lng);
              const maxRadius = Math.max(0, parseFloat(radius) || 100);

              // Validate GPS coordinates
              if (isNaN(userLat) || isNaN(userLng) || userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
                  return res.status(400).json({ success: false, error: 'Invalid GPS coordinates. lat must be -90 to 90, lng must be -180 to 180.' });
              }

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

              // Filter venues WITH coordinates by radius (allow tours/series to bypass to be filtered client-side via host venues)
              const withinRadius = venues.filter(v => 
                  (v.distance_mi != null && v.distance_mi <= maxRadius) || 
                  ['tour', 'series'].includes(v.venue_type)
              );

              // Sort distance-first
              withinRadius.sort((a, b) => (a.distance_mi ?? 9999) - (b.distance_mi ?? 9999));
              
              // Only include noCoords if no explicit GPS filter was requested OR if they matched explicit search params
              // Since this block is inside hasGps, we drop un-locatable venues from a localized radius search
              venues = withinRadius;
          }

          // --- Single venue by ID: attach daily tournament schedules + venue news ---
          if (id && venues.length > 0) {
              const venue = venues[0];

              // === LIVE DB FIRST: Query Supabase venue_daily_tournaments ===
              let usedLiveData = false;
              try {
                  const { data: liveTourn, error: ltErr } = await getSupabase()
                      .from('venue_daily_tournaments')
                      .select('*')
                      .eq('venue_id', parseInt(id, 10))
                      .eq('is_active', true)
                      .order('day_of_week')
                      .limit(100);

                  if (!ltErr && liveTourn && liveTourn.length > 0) {
                      // Transform flat DB rows into the grouped format the frontend expects
                      // Frontend expects: venue.daily_tournaments = [{ source_url, schedules: [{day_of_week, start_time, buy_in, ...}] }]
                      const sourceUrl = liveTourn[0].source_url || null;
                      venue.daily_tournaments = [{
                          source_url: sourceUrl,
                          schedules: liveTourn.map(t => ({
                              day_of_week: t.day_of_week,
                              start_time: t.start_time,
                              tournament_name: t.tournament_name,
                              buy_in: t.buy_in,
                              rebuy_addon: t.rebuy_addon,
                              starting_stack: t.starting_stack,
                              blind_levels: t.blind_levels,
                              game_type: t.game_type,
                              format: t.format,
                              guaranteed: t.guaranteed,
                          })),
                      }];
                      venue.daily_tournaments_source = sourceUrl;
                      venue.last_scraped = liveTourn[0].last_scraped || null;
                      usedLiveData = true;
                  }
              } catch (dbErr) {
                  console.warn('[venues] Live tournament DB query failed, using static fallback:', dbErr.message);
              }

              // === STATIC JSON FALLBACK ===
              if (!usedLiveData) {
                  const tournamentMatch = findDailyTournaments(venue.name, venue.city, venue.state);
                  if (tournamentMatch) {
                      venue.daily_tournaments = tournamentMatch.schedules || [];
                      venue.daily_tournaments_source = tournamentMatch.source_url || null;
                  } else {
                      venue.daily_tournaments = [];
                  }
              }

              // === VENUE NEWS from Supabase ===
              try {
                  const { data: newsData } = await getSupabase()
                      .from('venue_news')
                      .select('id, title, content, source_url, image_url, published_at, scraped_at')
                      .eq('venue_id', parseInt(id, 10))
                      .eq('is_active', true)
                      .order('scraped_at', { ascending: false })
                      .limit(10);
                  venue.venue_news = newsData || [];
              } catch (newsErr) {
                  venue.venue_news = [];
              }

              // === VENUE GAME SCHEDULES (per-day cash game listings) ===
              try {
                  const SCHED_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
                  const { data: schedData } = await getSupabase()
                      .from('venue_game_schedules')
                      .select('id, day_of_week, game_name, start_time, end_time, notes')
                      .eq('venue_id', parseInt(id, 10))
                      .eq('is_active', true)
                      .order('day_of_week')
                      .order('start_time')
                      .limit(200);
                  if (schedData && schedData.length > 0) {
                      const grouped = {};
                      SCHED_DAYS.forEach(d => { grouped[d] = []; });
                      schedData.forEach(row => {
                          if (grouped[row.day_of_week]) grouped[row.day_of_week].push(row);
                      });
                      venue.game_schedule = grouped;
                  } else {
                      venue.game_schedule = null;
                  }
              } catch (schedErr) {
                  venue.game_schedule = null;
              }

              return res.status(200).json({
                  success: true,
                  data: venue,
                  total: 1,
                  hasGpsData: hasGps,
              });
          }

          // === USER RULE: STRICT SERIES DEDUPLICATION & "RUNNING TODAY" ENFORCEMENT ===
          // (Note: To fix the "missing upcoming tours" bug, we ONLY apply the running-today
          // suppression logic to default venue queries, and BYPASS it when 'tour' or 'series' 
          // are explicitly requested via effectiveType).
          
          if (venues.length > 0 && !['tour', 'series'].includes(effectiveType)) {
              // Decouple node execution time from UTC to standardize "running today" on US timelines
              const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
              const todayIdx = new Date(localCurrentTime).getDay();
              const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
              const todayKey = DAYS_ORDER[todayIdx];
              let activeSeriesIds = new Set();
              
              try {
                  const seriesResultIds = venues.filter(v => ['series', 'tour'].includes(v.venue_type || '')).map(v => v.id);
                  if (seriesResultIds.length > 0) {
                      // We consider a series "running today" if it has an entry for today in venue_daily_tournaments
                      const { data: todaySeriesTournaments } = await getSupabase()
                          .from('venue_daily_tournaments')
                          .select('venue_id')
                          .in('venue_id', seriesResultIds)
                          .eq('day_of_week', todayKey)
                          .eq('is_active', true);
                          
                      if (todaySeriesTournaments) {
                          todaySeriesTournaments.forEach(t => activeSeriesIds.add(t.venue_id));
                      }
                  }
              } catch (e) {
                  // Fallback: If DB query fails, assume no series are running today to be safe
              }

              const stateGroups = {};
              for (const v of venues) {
                  const st = (v.state || '').toLowerCase();
                  if (!stateGroups[st]) stateGroups[st] = [];
                  stateGroups[st].push(v);
              }
              
              let finalVenues = [];
              for (const st in stateGroups) {
                  const group = stateGroups[st];
                  const seriesElements = group.filter(v => ['series', 'tour'].includes(v.venue_type || ''));
                  const validVenues = new Set(group);
                  
                  if (seriesElements.length > 0) {
                      for (const series of seriesElements) {
                          const isRunningToday = activeSeriesIds.has(series.id);
                          
                          if (!isRunningToday) {
                              // Rule 1: Series ONLY shown if running that day.
                              validVenues.delete(series);
                              continue;
                          }

                          // Rule 2: If running, SERIES pops up, NOT the venue.
                          // Identify the base venue to suppress.
                          let coreName = (series.name || '').toLowerCase()
                              .replace(/poker/g, '').replace(/series/g, '').replace(/championship/g, '')
                              .replace(/classic/g, '').replace(/casino/g, '').replace(/resort/g, '')
                              .replace(/hotel/g, '').replace(/room/g, '').trim();
                              
                          if (coreName.length >= 3) {
                              for (const v of group) {
                                  if (v !== series && !['series', 'tour'].includes(v.venue_type || '')) {
                                      let vCore = (v.name || '').toLowerCase()
                                          .replace(/poker/g, '').replace(/casino/g, '').replace(/resort/g, '')
                                          .replace(/hotel/g, '').replace(/room/g, '').replace(/club/g, '').trim();
                                          
                                      if (vCore && coreName && (vCore.includes(coreName) || coreName.includes(vCore))) {
                                          validVenues.delete(v); // Suppress the casino/base venue
                                      }
                                  }
                              }
                          }
                      }
                  }
                  finalVenues.push(...validVenues);
              }
              venues = finalVenues;
          }

          // (Note: Tours/Series active-today post-filter was removed to fix pagination truncation. 
          // They are now excluded from the default query at the SQL level, and correctly pulled 
          // when specifically requested by `effectiveType`).
          // --- Filter by games (NLH, PLO, Mixed) ---
          if (hasNLH === 'true') {
              venues = venues.filter(v => v.games_offered && v.games_offered.includes('NLH'));
          }
          if (hasPLO === 'true') {
              venues = venues.filter(v => v.games_offered && v.games_offered.includes('PLO'));
          }
          if (hasMixed === 'true') {
              venues = venues.filter(v => v.games_offered && v.games_offered.includes('Mixed'));
          }

          // --- Calculate Charity Open/Next Event Status from Scraped Tournaments ---
          const charityVenues = venues.filter(v => v.venue_type === 'charity');
          if (charityVenues.length > 0) {
              try {
                  const charityIds = charityVenues.map(v => v.id).filter(id => typeof id === 'number');
                  const charityNames = charityVenues.map(v => v.name).filter(Boolean);

                  // Run BOTH joins in parallel: ID-based (linked rows) + name-based (unlinked rows where venue_id=null)
                  const [idResult, nameResult] = await Promise.all([
                      charityIds.length > 0
                          ? getSupabase()
                              .from('venue_daily_tournaments')
                              .select('venue_id, venue_name, day_of_week')
                              .in('venue_id', charityIds)
                              .eq('is_active', true)
                          : Promise.resolve({ data: [] }),
                      charityNames.length > 0
                          ? getSupabase()
                              .from('venue_daily_tournaments')
                              .select('venue_id, venue_name, day_of_week')
                              .is('venue_id', null)
                              .in('venue_name', charityNames)
                              .eq('is_active', true)
                          : Promise.resolve({ data: [] }),
                  ]);

                  // Build name→id map for the null-venue_id rows
                  const nameToId = {};
                  charityVenues.forEach(v => { if (v.name) nameToId[v.name] = v.id; });

                  // Stitch venue_id onto name-matched rows
                  const nameRows = (nameResult.data || []).map(t => ({
                      ...t,
                      venue_id: nameToId[t.venue_name] ?? t.venue_id,
                  })).filter(t => t.venue_id);

                  const upcomingTours = [...(idResult.data || []), ...nameRows];
                      
                  if (upcomingTours && upcomingTours.length > 0) {
                      const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                      const todayIdx = new Date(localCurrentTime).getDay();
                      const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                      const todayStr = DAYS[todayIdx];
                      
                      const toursByVenue = {};
                      upcomingTours.forEach(t => {
                          const key = t.venue_id || t.venue_name;
                          if (!toursByVenue[key]) toursByVenue[key] = [];
                          toursByVenue[key].push(t);
                      });
                      
                      venues.forEach(v => {
                          if (v.venue_type !== 'charity') return;
                          
                          const hasTours = toursByVenue[v.id] || toursByVenue[v.name] || [];
                          if (hasTours.length === 0) return; 
                          
                          const todayTour = hasTours.find(t => t.day_of_week.toLowerCase() === todayStr);
                          if (todayTour) {
                              v.is_today = true;
                              v.next_event = null;
                              v.has_tournaments = true;
                              // Enrich is_today with schedule detail for the card
                              v.today_event = {
                                  start_time: todayTour.start_time || null,
                                  buy_in: todayTour.buy_in || null,
                                  location: v.city || 'Local Area',
                                  address: v.address || null,
                                  state: v.state || null,
                              };
                          } else {
                              v.is_today = false;
                              v.has_tournaments = true;
                              // Find closest next day — include schedule detail
                              for (let i = 1; i <= 7; i++) {
                                  const nextIdx = (todayIdx + i) % 7;
                                  const nextDayStr = DAYS[nextIdx];
                                  const nextTour = hasTours.find(t => t.day_of_week.toLowerCase() === nextDayStr);
                                  if (nextTour) {
                                      v.next_event = {
                                          day: nextTour.day_of_week,
                                          days_away: i,
                                          start_time: nextTour.start_time || null,
                                          buy_in: nextTour.buy_in || null,
                                          location: v.city || 'Local Area',
                                          address: v.address || null,
                                          state: v.state || null,
                                      };
                                      break;
                                  }
                              }
                          }
                      });
                  }
              } catch(e) {
                  console.error('Error enriching charity next_event:', e);
              }
          }

          // --- Apply limit and return ---
          const total = venues.length;
          // No cap — return all venues (dataset is manageable size)
          const limited = venues;

          return res.status(200).json({
              success: true,
              data: limited,
              total,
              hasGpsData: hasGps,
              offset,
          });
      } catch (error) {
          console.error('Venues API error:', error);
          captureError(error, {
              tags: { api: 'poker-venues', stage: 'handler' },
              extra: { query: req.query },
          });

          // Last resort: return JSON data unfiltered
          const fallbackVenues = getJsonVenues();
          return res.status(200).json({
              success: true,
              data: fallbackVenues,
              total: fallbackVenues.length,
              hasGpsData: false,
          });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

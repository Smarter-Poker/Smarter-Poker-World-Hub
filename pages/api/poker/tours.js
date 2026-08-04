/**
 * Poker Tours API - Get traveling poker tour information
 * Supports filtering by tour type, region, and search
 * 
 * Data Strategy:
 *   1. Try DB for tour records
 *   2. Always merge with tour-source-registry.json for rich data
 *      (stops_2026, series_2026, typical_buyins, regions, etc.)
 *   3. Fall back to registry-only if DB unavailable
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import tourRegistry from '../../../data/tour-source-registry.json';
import allVenuesData from '../../../data/all-venues.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
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

// Stationary casino series — NOT traveling tours
const STATIONARY_CODES = new Set([
    'VENETIAN', 'WYNN', 'BORGATA', 'SEMINOLE', 'LODGE',
    'COMMERCE', 'BESTBET', 'BAY_101', 'TCH'
]);

// Known tour logo paths (files in /public/images/tours/)
const TOUR_LOGOS = {
    WSOP: '/images/tours/wsop.png',
    WPT: '/images/tours/wpt.png',
    WSOPC: '/images/tours/wsopc.png',
    MSPT: '/images/tours/mspt.png',
    RGPS: '/images/tours/rgps.png',
    PGT: '/images/tours/pgt.jpg',
    NAPT: '/images/tours/napt.png',
    ROUGHRIDER: '/images/tours/roughrider.png',
    FPN: '/images/tours/fpn.png',
    LIPS: '/images/tours/lips.png',
    PAT: '/images/tours/pat.jpg',
    GCPT: '/images/tours/gcpt.jpg',
    CPPT: '/images/tours/cppt.jpg',
    // Stationary venue series
    VENETIAN: '/images/tours/venetian.png',
    WYNN: '/images/tours/wynn.png',
    BORGATA: '/images/tours/borgata.png',
    SEMINOLE: '/images/tours/seminole.png',
    LODGE: '/images/tours/lodge.png',
    COMMERCE: '/images/tours/commerce.png',
    BESTBET: '/images/tours/bestbet.png',
    BAY_101: '/images/tours/bay101.png',
};

// Build tours list from registry (authoritative source for rich data)
function getToursFromRegistry(excludeStationary = false) {
    const tours = [];
    for (const [code, tour] of Object.entries(tourRegistry.tours || {})) {
        if (tour.is_active === false) continue;
        if (excludeStationary && STATIONARY_CODES.has(code)) continue;

        tours.push({
            tour_code: code,
            tour_name: tour.tour_name,
            tour_type: tour.tour_type,
            priority: tour.priority || 3,
            official_website: tour.official_website,
            headquarters: tour.headquarters,
            established: tour.established,
            typical_buyins: tour.typical_buyins,
            regions: tour.regions || [],
            notes: tour.notes,
            series_2026: tour.series_2026 || [],
            stops_2026: tour.stops_2026 || [],
            is_traveling: !STATIONARY_CODES.has(code),
            logo_url: TOUR_LOGOS[code] || null,
        });
    }
    return tours.sort((a, b) => a.priority - b.priority);
}

// Merge DB record with registry data (registry fills gaps)
function mergeWithRegistry(dbTour, registryTour) {
    if (!registryTour) return {
        ...dbTour,
        is_traveling: !STATIONARY_CODES.has(dbTour.tour_code),
        logo_url: TOUR_LOGOS[dbTour.tour_code] || null,
        series_2026: [],
        stops_2026: [],
    };

    return {
        ...dbTour,
        // Prefer DB fields when populated, fall back to registry
        tour_name: dbTour.tour_name || registryTour.tour_name,
        tour_type: dbTour.tour_type || registryTour.tour_type,
        headquarters: dbTour.headquarters || registryTour.headquarters,
        established: dbTour.established_year || dbTour.established || registryTour.established,
        official_website: dbTour.official_website || registryTour.official_website,
        // Always use registry for rich schedule data (DB doesn't have it)
        typical_buyins: registryTour.typical_buyins || null,
        regions: (Array.isArray(dbTour.regions) && dbTour.regions.length > 0)
            ? dbTour.regions
            : registryTour.regions || [],
        notes: dbTour.notes || registryTour.notes,
        series_2026: registryTour.series_2026 || [],
        stops_2026: registryTour.stops_2026 || [],
        priority: registryTour.priority || 3,
        is_traveling: !STATIONARY_CODES.has(dbTour.tour_code),
        // Logo from TOUR_LOGOS map (always inject, DB doesn't have this)
        logo_url: TOUR_LOGOS[dbTour.tour_code] || registryTour.logo_url || null,
    };
}

// Build venue name → ID lookup for cross-linking
function buildVenueNameLookup() {
    const venues = Array.isArray(allVenuesData) ? allVenuesData : allVenuesData.venues || [];
    const lookup = {};
    venues.forEach(v => {
        if (v.name && v.id) {
            lookup[v.name.toLowerCase()] = v.id;
        }
    });
    return lookup;
}

const venueLookup = buildVenueNameLookup();

// Get upcoming series from registry stops/series data
function getUpcomingSeries(tourCode, registryTours) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

    // Registry stop dates are informal ("Apr 2-13", "Feb 22 - Mar 9") and carry no
    // year. Anchor them to the CURRENT year (the old hardcoded 2026 meant every
    // stop parsed as past from Jan 2027 onward) with a rollover heuristic: a date
    // more than ~6 months behind today is assumed to belong to next year.
    const CURRENT_YEAR = today.getFullYear();
    const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

    function rollYearForward(d) {
        if (!d) return d;
        if (today.getTime() - d.getTime() > SIX_MONTHS_MS) {
            d.setFullYear(d.getFullYear() + 1);
        }
        return d;
    }

    // Parse informal dates like "Apr 2-13" or "Feb 22 - Mar 9"
    function parseInformalDate(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split(/\s*[-–]\s*/);
        // An explicit 4-digit year anywhere in the string wins over the heuristic.
        const explicitYearMatch = dateStr.match(/\b(20\d{2})\b/);
        const explicitYear = explicitYearMatch ? parseInt(explicitYearMatch[1], 10) : null;
        const parseOne = (s, fallbackMonth) => {
            if (!s) return null;
            s = s.trim().replace(',', '');
            const m = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?/);
            if (m) {
                const month = MONTHS[m[1]];
                if (month === undefined) return null;
                if (m[3]) return new Date(parseInt(m[3], 10), month, parseInt(m[2]));
                if (explicitYear) return new Date(explicitYear, month, parseInt(m[2]));
                return rollYearForward(new Date(CURRENT_YEAR, month, parseInt(m[2])));
            }
            const dayOnly = s.match(/^(\d{1,2})$/);
            if (dayOnly && fallbackMonth !== undefined) {
                const baseYear = explicitYear || CURRENT_YEAR;
                const d = new Date(baseYear, fallbackMonth, parseInt(dayOnly[1]));
                return explicitYear ? d : rollYearForward(d);
            }
            return null;
        };
        const start = parseOne(parts[0]);
        if (!start) return null;
        let end = start;
        if (parts.length >= 2) {
            end = parseOne(parts[parts.length - 1], start.getMonth()) || start;
            // Range wrapping the new year (e.g. "Dec 28 - Jan 5")
            if (end < start) {
                end.setFullYear(end.getFullYear() + 1);
            }
        }
        return { start, end };
    }

    const results = [];
    const toursToCheck = registryTours || getToursFromRegistry();

    for (const tour of toursToCheck) {
        if (tourCode && tour.tour_code !== tourCode) continue;

        // Combine stops and series
        const allStops = [
            ...(tour.stops_2026 || []).map(s => ({ ...s, tour: tour.tour_code })),
            ...(tour.series_2026 || []).map(s => ({ ...s, tour: tour.tour_code })),
        ];

        for (const stop of allStops) {
            const dates = parseInformalDate(stop.dates);
            if (!dates) continue;
            
            // Include if end date is today or later
            if (dates.end >= today) {
                results.push({
                    ...stop,
                    tour: tour.tour_code,
                    start_date: dates.start.toISOString().split('T')[0],
                    end_date: dates.end.toISOString().split('T')[0],
                    short_name: stop.name || stop.venue || 'Tour Stop',
                });
            }
        }
    }

    return results.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

// ─── Fallback city coordinates for common poker tour locations ───
const CITY_COORDS = {
    'las vegas, nv': { lat: 36.1699, lng: -115.1398 },
    'hollywood, fl': { lat: 26.0112, lng: -80.1495 },
    'atlantic city, nj': { lat: 39.3643, lng: -74.4229 },
    'lincoln, ca': { lat: 38.8916, lng: -121.2930 },
    'durant, ok': { lat: 33.9943, lng: -96.3709 },
    'tampa, fl': { lat: 27.9506, lng: -82.4572 },
    'bell gardens, ca': { lat: 33.9653, lng: -118.1514 },
    'elgin, il': { lat: 42.0354, lng: -88.2826 },
    'lake tahoe, nv': { lat: 39.0968, lng: -120.0324 },
    'tunica, ms': { lat: 34.6846, lng: -90.3829 },
    'biloxi, ms': { lat: 30.3960, lng: -88.8853 },
    'cherokee, nc': { lat: 35.4743, lng: -83.3146 },
    'san diego, ca': { lat: 32.7157, lng: -117.1611 },
    'portland, or': { lat: 45.5155, lng: -122.6789 },
    'council bluffs, ia': { lat: 41.2619, lng: -95.8608 },
    'black hawk, co': { lat: 39.7969, lng: -105.4903 },
    'choctaw, ok': { lat: 35.4976, lng: -97.2687 },
    'shreveport, la': { lat: 32.5252, lng: -93.7502 },
    'new orleans, la': { lat: 29.9511, lng: -90.0715 },
    'kinder, la': { lat: 30.4855, lng: -92.8510 },
    'gulfport, ms': { lat: 30.3674, lng: -89.0928 },
    'marksville, la': { lat: 31.1268, lng: -92.0632 },
    'oklahoma city, ok': { lat: 35.4676, lng: -97.5164 },
    'minneapolis, mn': { lat: 44.9778, lng: -93.2650 },
    'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
    'st. louis, mo': { lat: 38.6270, lng: -90.1994 },
    'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
    'phoenix, az': { lat: 33.4484, lng: -112.0740 },
    'chicago, il': { lat: 41.8781, lng: -87.6298 },
    'detroit, mi': { lat: 42.3314, lng: -83.0458 },
    'bismarck, nd': { lat: 46.8083, lng: -100.7837 },
    'fargo, nd': { lat: 46.8772, lng: -96.7898 },
    'deadwood, sd': { lat: 44.3767, lng: -103.7296 },
    'thackerville, ok': { lat: 33.7918, lng: -97.1303 },
    'gary, in': { lat: 41.5934, lng: -87.3464 },
    'mount pleasant, mi': { lat: 43.5978, lng: -84.7753 },
    'prior lake, mn': { lat: 44.7133, lng: -93.4227 },
    'welch, mn': { lat: 44.5669, lng: -92.7233 },
    'charleston, wv': { lat: 38.3498, lng: -81.6326 },
    'temecula, ca': { lat: 33.4936, lng: -117.1484 },
    'west palm beach, fl': { lat: 26.7153, lng: -80.0534 },
    'jacksonville, fl': { lat: 30.3322, lng: -81.6557 },
    'austin, tx': { lat: 30.2672, lng: -97.7431 },
    'round rock, tx': { lat: 30.5083, lng: -97.6789 },
    'houston, tx': { lat: 29.7604, lng: -95.3698 },
    'san jose, ca': { lat: 37.3382, lng: -121.8863 },
    'commerce, ca': { lat: 33.9975, lng: -118.1597 },
    'bossier city, la': { lat: 32.5160, lng: -93.7321 },
    'fort yates, nd': { lat: 46.0886, lng: -100.6301 },
    'mandan, nd': { lat: 46.8267, lng: -100.8891 },
    'dickinson, nd': { lat: 46.8792, lng: -102.7896 },
    'belcourt, nd': { lat: 48.8411, lng: -99.7457 },
    'philadelphia, pa': { lat: 39.9526, lng: -75.1652 },
    'choctaw, ms': { lat: 32.7693, lng: -89.1170 },
};

function haversineDistance(lat1, lng1, lat2, lng2) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return Infinity;
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// findVenueCoords performs up to four linear scans of the 658-entry all-venues
// array per stop, and it is called once per stop of every tour on every request.
// Memoise on the fields it actually reads — the venue dataset is static per
// deploy, so a repeat lookup can never produce a different answer.
const _venueCoordsCache = new Map();

function findVenueCoords(stop) {
    const _cacheKey = [stop.venue, stop.name, stop.location, stop.city, stop.state]
        .map(v => (v == null ? '' : String(v).toLowerCase()))
        .join('|');
    if (_venueCoordsCache.has(_cacheKey)) return _venueCoordsCache.get(_cacheKey);
    const _result = _findVenueCoordsUncached(stop);
    // Bound the memo so a long-lived lambda cannot grow it without limit.
    if (_venueCoordsCache.size >= 2000) _venueCoordsCache.clear();
    _venueCoordsCache.set(_cacheKey, _result);
    return _result;
}

function _findVenueCoordsUncached(stop) {
    const venueName = (stop.venue || stop.name || '').toLowerCase();
    const location = (stop.location || '').toLowerCase();
    const city = (stop.city || '').toLowerCase();
    const state = (stop.state || '').toLowerCase();

    const locationCity = location.split(',')[0]?.trim().toLowerCase() || '';
    const locationState = location.split(',')[1]?.trim().toLowerCase() || '';

    const arrVenues = Array.isArray(allVenuesData) ? allVenuesData : allVenuesData.venues || [];

    if (arrVenues.length > 0) {
        // 1. Exact name match
        let match = arrVenues.find(v => v.name && v.name.toLowerCase() === venueName && v.latitude);
        if (match) return match;

        // 2. Keyword match
        if (venueName.length > 3) {
            match = arrVenues.find(v => {
                if (!v.name || !v.latitude) return false;
                const n = v.name.toLowerCase();
                return n.includes(venueName) || venueName.includes(n);
            });
            if (match) return match;
        }

        // 3. City/State match
        const c = city || locationCity;
        const s = state || locationState;
        if (c && s) {
            match = arrVenues.find(v =>
                v.latitude &&
                (v.city || '').toLowerCase() === c &&
                (v.state || '').toLowerCase() === s
            );
            if (match) return match;
        }

        // 4. City match
        if (c) {
            match = arrVenues.find(v =>
                v.latitude && (v.city || '').toLowerCase() === c
            );
            if (match) return match;
        }
    }

    // 5. Fallback dictionary (City/State)
    const cityKey = location || ((city || locationCity) + (state || locationState ? ', ' + (state || locationState) : ''));
    if (cityKey) {
        const coords = CITY_COORDS[cityKey.toLowerCase()];
        if (coords) return { latitude: coords.lat, longitude: coords.lng };
    }

    // 6. Fallback dictionary (City only)
    const justCity = locationCity || city;
    if (justCity) {
        for (const [key, coords] of Object.entries(CITY_COORDS || {})) {
            if (key.startsWith(justCity + ',') || key === justCity) {
                return { latitude: coords.lat, longitude: coords.lng };
            }
        }
    }
    return null;
}

export async function getMergedToursData(excludeStationary = false) {
    const registryTours = getToursFromRegistry(excludeStationary);
    const registryByCode = {};
    registryTours.forEach(t => { registryByCode[t.tour_code] = t; });

    let tours = [];
    let source = 'registry';
    try {
        const { data, error } = await getSupabase()
            .from('tour_source_registry')
            .select('*')
            .eq('is_active', true)
            .order('tour_type', { ascending: true })
            .limit(100);

        if (!error && data && data.length > 0) {
            const mergedFromDb = data
                .filter(d => !excludeStationary || !STATIONARY_CODES.has(d.tour_code))
                .map(d => mergeWithRegistry(d, registryByCode[d.tour_code]));

            const dbCodes = new Set(data.map(d => d.tour_code));
            const registryOnly = registryTours.filter(t => !dbCodes.has(t.tour_code));

            tours = [...mergedFromDb, ...registryOnly];
            source = 'merged';
        }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

    if (tours.length === 0) tours = registryTours;
    return { tours, registryTours, source };
}

export async function getAllToursForSSR() {
    const { tours, registryTours } = await getMergedToursData(true); // excludeStationary=true
    let finalTours = tours;
    // Attach upcoming
    const allUpcoming = getUpcomingSeries(null, registryTours);
    const seriesByTour = {};
    allUpcoming.forEach(s => {
        if (!seriesByTour[s.tour]) seriesByTour[s.tour] = [];
        seriesByTour[s.tour].push(s);
    });

    finalTours = finalTours.map(tour => ({
        ...tour,
        upcoming_series: (seriesByTour[tour.tour_code] || []).slice(0, 5),
    }));

    // Default sort by priority
    finalTours.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    return finalTours;
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // This was the only GET in this directory with no Cache-Control header, so
      // every rendered tour card re-ran the whole registry + coordinate build.
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

      try {
          const type = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
          const region = Array.isArray(req.query.region) ? req.query.region[0] : req.query.region;
          const search = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
          const tour_code = Array.isArray(req.query.tour_code) ? req.query.tour_code[0] : req.query.tour_code;
          const include_series = Array.isArray(req.query.include_series) ? req.query.include_series[0] : req.query.include_series;
          const traveling_only = Array.isArray(req.query.traveling_only) ? req.query.traveling_only[0] : req.query.traveling_only;
          const limit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit || 50;
          
          const userLat = parseFloat(Array.isArray(req.query.lat) ? req.query.lat[0] : req.query.lat);
          const userLng = parseFloat(Array.isArray(req.query.lng) ? req.query.lng[0] : req.query.lng);

          const excludeStationary = traveling_only === 'true';

          // Try to get DB tours
          // eslint-disable-next-line prefer-const
          let { tours: toursRaw, registryTours, source } = await getMergedToursData(excludeStationary);
          let tours = toursRaw;

          // ── Narrow the working set FIRST ───────────────────────────────
          // These filters used to run AFTER the per-stop coordinate resolution
          // below, so a single-tour card request (RichTourCard issues one per
          // card rendered) still ran findVenueCoords for every stop of every
          // tour before discarding all but one.

          // Filter by tour type
          if (type) {
              tours = tours.filter(t => t.tour_type === type);
          }

          // Filter by region
          if (region) {
              tours = tours.filter(t =>
                  t.regions?.includes(region) ||
                  t.regions?.includes(region.toUpperCase())
              );
          }

          // Search by name
          if (search) {
              const searchLower = search.toLowerCase();
              tours = tours.filter(t =>
                  t.tour_name?.toLowerCase().includes(searchLower) ||
                  t.tour_code?.toLowerCase().includes(searchLower) ||
                  t.headquarters?.toLowerCase().includes(searchLower)
              );
          }

          // Get specific tour
          if (tour_code) {
              tours = tours.filter(t =>
                  t.tour_code === tour_code.toUpperCase()
              );
          }

          // Upcoming series from registry data. Computed ONCE — it was being
          // built twice per request (fallback-coordinates block + summary stats).
          const allUpcoming = getUpcomingSeries(null, registryTours);

          // Calculate distance if coordinates provided
          if (!isNaN(userLat) && !isNaN(userLng)) {
              tours.forEach(t => {
                  let minDistance = Infinity;
                  let closestCoords = null;
                  const allStops = [...(t.stops_2026 || []), ...(t.series_2026 || [])];
                  for (const stop of allStops) {
                      const coords = findVenueCoords(stop);
                      if (coords && coords.latitude && coords.longitude) {
                          const dist = haversineDistance(userLat, userLng, coords.latitude, coords.longitude);
                          if (dist < minDistance) {
                              minDistance = dist;
                              closestCoords = coords;
                          }
                      }
                  }
                  // Check HQ distance if no stops match
                  if (minDistance === Infinity && t.headquarters) {
                      const hqCoords = findVenueCoords({ location: t.headquarters });
                      if (hqCoords && hqCoords.latitude && hqCoords.longitude) {
                          minDistance = haversineDistance(userLat, userLng, hqCoords.latitude, hqCoords.longitude);
                          closestCoords = hqCoords;
                      }
                  }
                  t.distance_mi = minDistance !== Infinity ? minDistance : null;
                  if (closestCoords) {
                      t.latitude = closestCoords.latitude;
                      t.longitude = closestCoords.longitude;
                  }
              });

              // Sort by distance (tours with distance first, then by priority)
              tours.sort((a, b) => {
                  const distA = a.distance_mi !== null ? a.distance_mi : Infinity;
                  const distB = b.distance_mi !== null ? b.distance_mi : Infinity;
                  if (distA !== distB) return distA - distB;
                  return (a.priority || 99) - (b.priority || 99);
              });
          } else {
              // Sort by priority if no location
              tours.sort((a, b) => (a.priority || 99) - (b.priority || 99));

              // Find fallback coordinates for the map
              const upcomingByTour = {};
              allUpcoming.forEach(s => {
                  if (!upcomingByTour[s.tour]) upcomingByTour[s.tour] = [];
                  upcomingByTour[s.tour].push(s);
              });

              tours.forEach(t => {
                  let fallbackCoords = null;
                  const upcoming = upcomingByTour[t.tour_code] || [];
                  if (upcoming.length > 0) {
                      fallbackCoords = findVenueCoords(upcoming[0]);
                  }
                  if (!fallbackCoords && t.headquarters) {
                      fallbackCoords = findVenueCoords({ location: t.headquarters });
                  }
                  if (fallbackCoords && fallbackCoords.latitude && fallbackCoords.longitude) {
                      t.latitude = fallbackCoords.latitude;
                      t.longitude = fallbackCoords.longitude;
                  }
              });
          }


          // (type / region / search / tour_code filters are applied above,
          // before the coordinate work, and allUpcoming is computed there too.)

          // Attach upcoming series per tour
          if (include_series === 'true') {
              const seriesByTour = {};
              allUpcoming.forEach(s => {
                  if (!seriesByTour[s.tour]) seriesByTour[s.tour] = [];
                  seriesByTour[s.tour].push(s);
              });

              tours = tours.map(tour => ({
                  ...tour,
                  upcoming_series: (seriesByTour[tour.tour_code] || []).slice(0, 5),
              }));
          }

          // Get summary stats
          const seriesCountByTour = {};
          allUpcoming.forEach(s => {
              seriesCountByTour[s.tour] = (seriesCountByTour[s.tour] || 0) + 1;
          });

          return res.status(200).json({
              success: true,
              data: tours.slice(0, Math.min(parseInt(limit, 10) || 50, 100)),
              total: tours.length,
              summary: {
                  total_tours: tours.length,
                  by_type: countByField(tours, 'tour_type'),
                  upcoming_series_count: allUpcoming.length,
                  series_by_tour: seriesCountByTour,
              },
              metadata: {
                  source,
                  last_updated: tourRegistry.metadata?.created || '2026-01-26',
              },
          });

      } catch (error) {
          console.warn('Tours API error:', error);
          const tours = getToursFromRegistry();
          return res.status(200).json({
              success: true,
              data: tours,
              total: tours.length,
              error: 'Tours query error — showing cached data',
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

function countByField(items, field) {
    const counts = {};
    items.forEach(item => {
        const value = item[field] || 'unknown';
        counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
}

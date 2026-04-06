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
    for (const [code, tour] of Object.entries(tourRegistry.tours)) {
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

    // Parse informal dates like "Apr 2-13" or "Feb 22 - Mar 9"
    function parseInformalDate(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split(/\s*[-–]\s*/);
        const parseOne = (s, fallbackMonth) => {
            if (!s) return null;
            s = s.trim().replace(',', '');
            const m = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?/);
            if (m) {
                const month = MONTHS[m[1]];
                if (month === undefined) return null;
                const year = m[3] ? parseInt(m[3]) : 2026;
                return new Date(year, month, parseInt(m[2]));
            }
            const dayOnly = s.match(/^(\d{1,2})$/);
            if (dayOnly && fallbackMonth !== undefined) {
                return new Date(2026, fallbackMonth, parseInt(dayOnly[1]));
            }
            return null;
        };
        const start = parseOne(parts[0]);
        if (!start) return null;
        let end = start;
        if (parts.length >= 2) {
            end = parseOne(parts[parts.length - 1], start.getMonth()) || start;
            if (end < start && !dateStr.includes('2025')) {
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

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const type = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
          const region = Array.isArray(req.query.region) ? req.query.region[0] : req.query.region;
          const search = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
          const tour_code = Array.isArray(req.query.tour_code) ? req.query.tour_code[0] : req.query.tour_code;
          const include_series = Array.isArray(req.query.include_series) ? req.query.include_series[0] : req.query.include_series;
          const traveling_only = Array.isArray(req.query.traveling_only) ? req.query.traveling_only[0] : req.query.traveling_only;
          const limit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit || 50;

          const excludeStationary = traveling_only === 'true';

          // Get registry tours (always available, has rich data)
          const registryTours = getToursFromRegistry(excludeStationary);
          const registryByCode = {};
          registryTours.forEach(t => { registryByCode[t.tour_code] = t; });

          // Try to get DB tours
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
                  // Merge DB with registry data
                  const mergedFromDb = data
                      .filter(d => !excludeStationary || !STATIONARY_CODES.has(d.tour_code))
                      .map(d => mergeWithRegistry(d, registryByCode[d.tour_code]));

                  // Add registry-only tours not in DB
                  const dbCodes = new Set(data.map(d => d.tour_code));
                  const registryOnly = registryTours
                      .filter(t => !dbCodes.has(t.tour_code));

                  tours = [...mergedFromDb, ...registryOnly];
                  source = 'merged';
              }
          } catch (e) {
              // DB not available
          }

          // Fall back to registry-only
          if (tours.length === 0) {
              tours = registryTours;
          }

          // Sort by priority
          tours.sort((a, b) => (a.priority || 99) - (b.priority || 99));

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

          // Get upcoming series from registry data (used for both series-per-tour and summary stats)
          const allUpcoming = getUpcomingSeries(null, registryTours);

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
          console.error('Tours API error:', error);
          const tours = getToursFromRegistry();
          return res.status(200).json({
              success: true,
              data: tours,
              total: tours.length,
              error: 'Tours query error — showing cached data',
          });
      }

  } catch (err) {
    console.error('[API Error]', err);
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

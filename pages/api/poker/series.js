/**
 * Tournament Series API - Serves all 70 tournament series from JSON data
 * Supports filtering by id, upcoming, type, tour, search, date range
 * Tries Supabase DB first, falls back to JSON data file
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import seriesJson from '../../../data/poker-tour-series-2026.json';
import allVenuesData from '../../../data/all-venues.json';
import wsopEvents from '../../../data/wsop-2026-events.json';
import wptEvents from '../../../data/wpt-2026-events.json';
import wsopCEvents from '../../../data/wsopc-2026-events.json';
import msptEvents from '../../../data/mspt-2026-events.json';
import rgpsEvents from '../../../data/rgps-2026-events.json';
import venetianEvents from '../../../data/venetian-2026-events.json';
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

// Map tour codes to their pre-imported event data
const TOUR_EVENT_DATA = {
  WSOP: wsopEvents,
  WPT: wptEvents,
  WSOPC: wsopCEvents,
  MSPT: msptEvents,
  RGPS: rgpsEvents,
  VENETIAN: venetianEvents,
};

// Build venue name → ID lookup for cross-linking
const venuesList = Array.isArray(allVenuesData) ? allVenuesData : allVenuesData.venues || [];
const venueNameLookup = {};
venuesList.forEach(v => {
  if (v.name && v.id) venueNameLookup[v.name.toLowerCase()] = v.id;
});

function findVenueId(venueName) {
  if (!venueName) return null;
  const lower = venueName.toLowerCase();
  if (venueNameLookup[lower]) return venueNameLookup[lower];
  for (const [name, id] of Object.entries(venueNameLookup)) {
    if (lower.indexOf(name) !== -1 || name.indexOf(lower) !== -1) return id;
  }
  return null;
}

/**
 * Map JSON series entries to API objects with numeric IDs
 */
function mapSeriesToApi(seriesArray) {
  return seriesArray.map((s, index) => ({
    id: index + 1,
    series_uid: s.series_uid,
    name: s.name,
    short_name: s.short_name,
    tour: s.tour,
    tour_code: s.tour, // expose tour as tour_code for filtering
    venue: s.venue,
    venue_id: findVenueId(s.venue),
    city: s.city,
    state: s.state,
    start_date: s.start_date,
    end_date: s.end_date,
    total_events: s.total_events,
    main_event_buyin: s.main_event_buyin,
    main_event_guaranteed: s.main_event_guaranteed || null,
    series_type: s.series_type,
    source_url: s.source_url,
    is_featured: s.is_featured,
  }));
}

/**
 * Load events for a specific series from the tour's event data file.
 * Different tour files have different structures:
 *   - WSOP: { metadata, events: [...] } (single series, flat events)
 *   - WPT/Venetian: { metadata, series: [{ series_uid, events }] }
 *   - WSOPC/MSPT/RGPS: { metadata, stops: [{ stop_uid, events }] }
 */
function loadEventsForSeries(series) {
  const tourCode = (series.tour_code || series.tour || '').toUpperCase();
  const eventData = TOUR_EVENT_DATA[tourCode];
  if (!eventData) return null;

  try {
    const seriesUid = series.series_uid;

    // WSOP: flat events array (single series)
    if (tourCode === 'WSOP' && eventData.events) {
      // Check if this series matches the main WSOP event file
      if (seriesUid === 'WSOP-2026' || seriesUid === eventData.metadata?.series_uid) {
        return eventData.events;
      }
      // For other WSOP series (e.g., WSOP Europe), filter by date range
      if (series.start_date && series.end_date) {
        return eventData.events.filter(
          (e) => e.start_date >= series.start_date && e.start_date <= series.end_date
        );
      }
      return null;
    }

    // WPT / Venetian: series array with series_uid
    if (eventData.series) {
      const match = eventData.series.find((s) => s.series_uid === seriesUid);
      return match ? match.events : null;
    }

    // WSOPC / MSPT / RGPS: stops array with stop_uid
    if (eventData.stops) {
      const match = eventData.stops.find((s) => s.stop_uid === seriesUid);
      return match ? match.events : null;
    }

    return null;
  } catch (err) {
    console.error(`Failed to load events for tour ${tourCode}:`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
      const {
        id,
        upcoming,
        type,
        tour,
        search,
        start_date,
        end_date,
        limit = 70,
      } = req.query;

      const parsedLimit = parseInt(limit, 10) || 70;

      // --- Single series by ID ---
      if (id) {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId) || numericId < 1) {
          return res.status(400).json({ success: false, error: 'Invalid id parameter' });
        }

        // Try Supabase first for single series
        let singleSeries = null;
        try {
          const { data, error } = await getSupabase()
            .from('tournament_series')
            .select('*')
            .eq('id', numericId)
            .maybeSingle();

          if (!error && data) {
            singleSeries = data;
          }
        } catch (dbErr) {
          // DB unavailable, fall through to JSON
        }

        // Fall back to JSON data
        if (!singleSeries) {
          const allSeries = mapSeriesToApi(seriesJson.series_2026 || []);
          singleSeries = allSeries.find((s) => s.id === numericId) || null;
        }

        if (!singleSeries) {
          return res.status(404).json({ success: false, error: 'Series not found' });
        }

        // Try to load events for this series
        const events = loadEventsForSeries(singleSeries);
        if (events) {
          singleSeries.events = events;
        }

        return res.status(200).json({
          success: true,
          data: singleSeries,
          total: 1,
        });
      }

      // --- List series with filters ---

      // Try Supabase first
      let seriesData = null;
      try {
        // Query both tournament_series AND poker_series tables for maximum coverage
        let query = getSupabase()
          .from('tournament_series')
          .select('*')
          .order('start_date', { ascending: true })
          .limit(Math.min(parsedLimit, 999));

        if (upcoming === 'true') {
          const today = new Date().toISOString().split('T')[0];
          query = query.gte('start_date', today);
        }

        if (type) {
          query = query.eq('series_type', type);
        }

        if (tour) {
          const safeTour = tour.replace(/[,().]/g, ' ').trim();
          if (safeTour) {
              query = query.or(`tour.ilike.%${safeTour}%,short_name.ilike.%${safeTour}%`);
          }
        }

        if (search) {
          const safeSearch = search.replace(/[,().]/g, ' ').trim();
          if (safeSearch) {
              query = query.or(
                `name.ilike.%${safeSearch}%,short_name.ilike.%${safeSearch}%,venue.ilike.%${safeSearch}%,city.ilike.%${safeSearch}%`
              );
          }
        }

        if (start_date) {
          query = query.gte('start_date', start_date);
        }
        if (end_date) {
          query = query.lte('start_date', end_date);
        }

        const { data, error } = await query;

        // Also fetch from poker_series (which has series_uid for event linking)
        let pokerSeriesData = [];
        try {
          let psQuery = getSupabase()
            .from('poker_series')
            .select('*')
            .order('start_date', { ascending: true })
            .limit(999);

          if (upcoming === 'true') {
            const today = new Date().toISOString().split('T')[0];
            psQuery = psQuery.gte('start_date', today);
          }

          const { data: psData } = await psQuery;
          pokerSeriesData = psData || [];
        } catch (psErr) {
          // poker_series unavailable
        }

        // Merge: combine both, dedup by name
        const mergedMap = new Map();
        if (!error && data) {
          for (const s of data) {
            const key = (s.name || s.series_name || '').toLowerCase();
            mergedMap.set(key, {
              ...s,
              series_uid: s.series_uid || null,
            });
          }
        }
        // Overlay poker_series data (has series_uid)
        for (const ps of pokerSeriesData) {
          const key = (ps.series_name || ps.name || '').toLowerCase();
          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            existing.series_uid = existing.series_uid || ps.series_uid;
          } else {
            mergedMap.set(key, {
              id: ps.id,
              name: ps.series_name || ps.name,
              short_name: ps.tour,
              series_uid: ps.series_uid,
              tour: ps.tour,
              venue: ps.venue_name,
              city: ps.city,
              state: ps.state,
              start_date: ps.start_date,
              end_date: ps.end_date,
              total_events: ps.event_count,
              series_type: (ps.tier === 'A' ? 'major' : ps.tier === 'B' ? 'circuit' : 'regional'),
              source_url: ps.source_url,
            });
          }
        }

        const merged = [...mergedMap.values()].sort((a, b) =>
          (a.start_date || '').localeCompare(b.start_date || '')
        );

        if (merged.length > 0) {
          seriesData = merged;
        }
      } catch (dbErr) {
        // DB unavailable, fall through to JSON
      }

      // Fall back to JSON data
      if (!seriesData) {
        let allSeries = mapSeriesToApi(seriesJson.series_2026 || []);

        // Apply filters
        if (upcoming === 'true') {
          const today = new Date().toISOString().split('T')[0];
          allSeries = allSeries.filter((s) => s.start_date >= today);
        }

        if (type) {
          allSeries = allSeries.filter((s) => s.series_type === type);
        }

        if (tour) {
          const tourLower = tour.toLowerCase();
          allSeries = allSeries.filter(
            (s) =>
              (s.tour && s.tour.toLowerCase().includes(tourLower)) ||
              (s.tour_code && s.tour_code.toLowerCase().includes(tourLower))
          );
        }

        if (search) {
          const searchLower = search.toLowerCase();
          allSeries = allSeries.filter(
            (s) =>
              (s.name && s.name.toLowerCase().includes(searchLower)) ||
              (s.short_name && s.short_name.toLowerCase().includes(searchLower)) ||
              (s.venue && s.venue.toLowerCase().includes(searchLower)) ||
              (s.city && s.city.toLowerCase().includes(searchLower))
          );
        }

        if (start_date) {
          allSeries = allSeries.filter((s) => s.start_date >= start_date);
        }
        if (end_date) {
          allSeries = allSeries.filter((s) => s.start_date <= end_date);
        }

        // Sort by start_date ascending
        allSeries.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

        seriesData = allSeries;
      }

      const total = seriesData.length;
      const limited = seriesData.slice(0, parsedLimit);

      // Enrich each series with events from poker_events table
      try {
        const seriesUids = limited
          .map(s => s.series_uid)
          .filter(Boolean);

        if (seriesUids.length > 0) {
          // Paginated fetch to bypass Supabase 1000-row limit
          let allEvents = [];
          const PAGE = 999;
          for (let page = 0; page < 5; page++) {
            const { data: evtPage } = await getSupabase()
              .from('poker_events')
              .select('*')
              .in('series_uid', seriesUids)
              .order('start_date', { ascending: true })
              .range(page * PAGE, (page + 1) * PAGE - 1);
            if (evtPage && evtPage.length > 0) {
              allEvents = allEvents.concat(evtPage);
              if (evtPage.length < PAGE) break; // no more pages
            } else {
              break;
            }
          }

          if (allEvents && allEvents.length > 0) {
            const eventsBySeries = {};
            for (const evt of allEvents) {
              if (!eventsBySeries[evt.series_uid]) eventsBySeries[evt.series_uid] = [];
              eventsBySeries[evt.series_uid].push(evt);
            }
            for (const s of limited) {
              if (s.series_uid && eventsBySeries[s.series_uid]) {
                s.events = eventsBySeries[s.series_uid];
                s.events_count = eventsBySeries[s.series_uid].length;
              }
            }
          }
        }
      } catch (evtErr) {
        // Events enrichment failed, continue without events
        console.error('Events enrichment error:', evtErr.message);
      }

      // For series without DB events, try JSON fallback
      for (const s of limited) {
        if (!s.events || s.events.length === 0) {
          const jsonEvents = loadEventsForSeries(s);
          if (jsonEvents && jsonEvents.length > 0) {
            s.events = jsonEvents;
            s.events_count = jsonEvents.length;
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: limited,
        total,
      });
    } catch (error) {
      console.error('Series API error:', error);
      // Last resort: return mapped JSON data unsorted
      const fallback = mapSeriesToApi(seriesJson.series_2026 || []);
      return res.status(200).json({
        success: true,
        data: fallback,
        total: fallback.length,
      });
    }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

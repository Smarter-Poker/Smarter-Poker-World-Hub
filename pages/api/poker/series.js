/**
 * Tournament Series API - Serves all 70 tournament series from JSON data
 * Supports filtering by id, upcoming, type, tour, search, date range
 * Tries Supabase DB first, falls back to JSON data file
 */
import { withSentry } from '../../../src/lib/sentry';
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
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';

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
  for (const [name, id] of Object.entries(venueNameLookup || {})) {
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
    logo_url: s.logo_url || null, // BUG FIX: was missing — JSON fallback path lost all logos
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
    console.warn(`Failed to load events for tour ${tourCode}:`, err.message);
    return null;
  }
}

async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // CDN cache: fresh 300s, serve stale up to 600s (series data changes infrequently)
    // Set AFTER method guard so non-GET responses are never cached
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    try {
      let {
        id,
        upcoming,
        type,
        tour,
        search,
        start_date,
        end_date,
        limit = 70,
      } = req.query;

      // BUG FIX: Array Query Injection Vector
      // Protects .replace() and .trim() from throwing TypeErrors if multiple identically named params are passed
      const safeString = (val) => Array.isArray(val) ? val[0] : val;
      id = safeString(id);
      upcoming = safeString(upcoming);
      type = safeString(type);
      tour = safeString(tour);
      search = safeString(search);
      start_date = safeString(start_date);
      end_date = safeString(end_date);
      limit = safeString(limit);

      // [S-P2 FIX] Validate date params — invalid format causes PostgREST cast errors (500).
      // Silently null out any date that isn't a strict YYYY-MM-DD ISO date string.
      const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
      if (start_date && !ISO_DATE.test(start_date)) start_date = null;
      if (end_date && !ISO_DATE.test(end_date)) end_date = null;

      // [API-S1 FIX] Was Math.min(..., 300) — meaning the list endpoint max was 300 even with
      // 999+ series in DB. Raised to 999 to match the actual query range below.
      const parsedLimit = Math.min(parseInt(limit, 10) || 70, 999);

      // --- Single series by ID ---
      // CRITICAL: Must search BOTH tables since list endpoint merges tournament_series
      // AND poker_series. Cards link to real DB IDs from either table.
      if (id) {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId) || numericId < 1) {
          return res.status(400).json({ success: false, error: 'Invalid id parameter' });
        }

        let singleSeries = null;
        try {
          // Search tournament_series first
          const { data: ts, error: tsErr } = await getSupabase()
            .from('tournament_series')
            .select('*')
            .eq('id', numericId)
            .maybeSingle();

          if (!tsErr && ts) {
            if (ts.is_suppressed) {
              return res.status(404).json({ success: false, error: 'Series not found' });
            }
            singleSeries = ts;
          }

          // If not found in tournament_series, check poker_series
          if (!singleSeries) {
            const { data: ps, error: psErr } = await getSupabase()
              .from('poker_series')
              .select('*')
              .eq('id', numericId)
              .maybeSingle();

            if (!psErr && ps) {
              if (ps.is_suppressed) {
                return res.status(404).json({ success: false, error: 'Series not found' });
              }
              // Normalize poker_series fields to match tournament_series shape
              singleSeries = {
                id: ps.id,
                name: ps.series_name || ps.name,
                short_name: ps.tour,
                series_uid: ps.series_uid,
                tour: ps.tour,
                tour_code: ps.tour,
                venue: ps.venue_name,
                venue_id: findVenueId(ps.venue_name),
                city: ps.city,
                state: ps.state,
                start_date: ps.start_date,
                end_date: ps.end_date,
                total_events: ps.event_count,
                main_event_buyin: ps.main_event_buyin,
                main_event_guaranteed: ps.total_guaranteed,
                series_type: ps.tier === 'A' ? 'major' : ps.tier === 'B' ? 'circuit' : 'regional',
                source_url: ps.source_url,
                logo_url: ps.logo_url,
              };
            }
          }
        } catch (dbErr) { console.warn('[App] Handled exception:', dbErr?.message || dbErr); }

        // Fall back to JSON data (only for legacy index-based IDs)
        if (!singleSeries) {
          const allSeries = mapSeriesToApi(seriesJson.series_2026 || []);
          singleSeries = allSeries.find((s) => s.id === numericId) || null;
        }

        if (!singleSeries) {
          return res.status(404).json({ success: false, error: 'Series not found' });
        }

        // Try to load events for this series
        const events = loadEventsForSeries(singleSeries);
        if (events) singleSeries.events = events;

        // Also try DB events enrichment
        if (singleSeries.series_uid && (!singleSeries.events || singleSeries.events.length === 0)) {
          try {
            const { data: evts } = await getSupabase()
              .from('poker_events')
              .select('*')
              .eq('series_uid', singleSeries.series_uid)
              .order('start_date', { ascending: true })
              .limit(200);
            if (evts && evts.length > 0) {
              singleSeries.events = evts;
              singleSeries.events_count = evts.length;
            }
          } catch (e) { console.warn('[App] Handled exception:', e); }
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
          // [S-BUG-1 FIX] .eq('is_suppressed', false) excluded rows where is_suppressed=NULL.
          // Use .or() to match both NULL and false — never serve explicitly suppressed series.
          .or('is_suppressed.is.null,is_suppressed.eq.false')
          .order('start_date', { ascending: true })
          .limit(Math.min(parsedLimit, 999));

        if (upcoming === 'true') {
          const today = getTodayCST(); // Phase 77 — CST anchor: don't drop today's series at 6pm CST
          query = query.gte('start_date', today);
        }

        if (type) {
          query = query.eq('series_type', type);
        }

        if (tour) {
          // Strip ILIKE wildcards to prevent injection
          // [API-S4 FIX] Added [ and ] to sanitization — PostgREST uses [ ] in filter operators.
          // Without stripping them, a crafted tour= param like 'WSOP]' could break the filter chain.
          const safeTour = tour.replace(/[()'",.;%_\\\[\]]/g, ' ').trim().slice(0, 50);
          if (safeTour) {
              query = query.or(`tour.ilike.%${safeTour}%,short_name.ilike.%${safeTour}%`);
          }
        }

        if (search) {
          // Strip ILIKE wildcards to prevent injection
          const safeSearch = search.replace(/[()'",.;%_\\\[\]]/g, ' ').trim().slice(0, 100);
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

        // [S-P1 FIX] Run tournament_series + poker_series queries IN PARALLEL — was sequential.
        // Promise.all reduces API latency by ~80ms (two independent DB round trips → one).
        let psQuery = getSupabase()
          .from('poker_series')
          .select('*')
          // [S-BUG-1 FIX] Same is_suppressed NULL fix for poker_series
          .or('is_suppressed.is.null,is_suppressed.eq.false')
          .order('start_date', { ascending: true })
          .limit(999);

        // BUG FIX: Must apply identical display filters to poker_series or it dumps all 999
        // remaining series into the merged result set, overriding search/tour/upcoming filters.
        if (upcoming === 'true') {
          const today = getTodayCST(); // Phase 77 — CST anchor: don't drop today's series at 6pm CST
          psQuery = psQuery.gte('start_date', today);
        }
        if (type) {
          const tierMap = { major: 'A', circuit: 'B', regional: 'C', 'mid-major': 'C', weekly: 'C' };
          if (tierMap[type]) psQuery = psQuery.eq('tier', tierMap[type]);
        }
        if (tour) {
          const safeTour = tour.replace(/[()'",.;%_\\\[\]]/g, ' ').trim().slice(0, 50);
          if (safeTour) psQuery = psQuery.or(`tour.ilike.%${safeTour}%`);
        }
        if (search) {
          const safeSearch = search.replace(/[()'",.;%_\\\[\]]/g, ' ').trim().slice(0, 100);
          if (safeSearch) {
            psQuery = psQuery.or(
              `name.ilike.%${safeSearch}%,series_name.ilike.%${safeSearch}%,venue_name.ilike.%${safeSearch}%,city.ilike.%${safeSearch}%`
            );
          }
        }
        if (start_date) psQuery = psQuery.gte('start_date', start_date);
        if (end_date) psQuery = psQuery.lte('start_date', end_date);

        const [{ data, error }, { data: psData }] = await Promise.all([query, psQuery]);
        // [B1 FIX] Declare pokerSeriesData here — was missing 'let' causing ReferenceError
        // in strict mode, crashing the try block and falling through to empty JSON fallback.
        let pokerSeriesData = psData || [];

        // Merge: combine both, dedup by series_uid (primary) then name (fallback)
        const mergedMap = new Map();
        const uidMap = new Map(); // track by series_uid to prevent duplicates
        if (!error && data) {
          for (const s of data) {
            const key = (s.name || s.series_name || '').toLowerCase();
            const entry = { ...s, series_uid: s.series_uid || null };
            mergedMap.set(key, entry);
            if (s.series_uid) uidMap.set(s.series_uid, entry);
          }
        }
        // Overlay poker_series data (has series_uid for event linking)
        for (const ps of pokerSeriesData) {
          const uid = ps.series_uid;
          const key = (ps.series_name || ps.name || uid || '').toLowerCase();
          
          // If already exists by series_uid, update it
          if (uid && uidMap.has(uid)) {
            const existing = uidMap.get(uid);
            existing.series_uid = uid;
            if (ps.logo_url) existing.logo_url = ps.logo_url;
            continue;
          }
          
          // If already exists by name, add series_uid
          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key);
            existing.series_uid = existing.series_uid || uid;
            if (ps.logo_url) existing.logo_url = ps.logo_url;
            if (uid) uidMap.set(uid, existing);
            continue;
          }
          
          // New series — add it
          const newEntry = {
            id: ps.id,
            name: ps.series_name || ps.name,
            series_name: ps.series_name || ps.name,
            short_name: ps.tour,
            series_uid: uid,
            tour: ps.tour,
            venue: ps.venue_name,
            venue_name: ps.venue_name,
            city: ps.city,
            state: ps.state,
            start_date: ps.start_date,
            end_date: ps.end_date,
            total_events: ps.event_count,
            event_count: ps.event_count,
            total_guaranteed: ps.total_guaranteed,
            main_event_guaranteed: ps.main_event_guaranteed,
            main_event_buyin: ps.main_event_buyin,
            is_new: ps.event_count === 0 || !ps.event_count,
            series_type: (ps.tier === 'A' ? 'major' : ps.tier === 'B' ? 'circuit' : 'regional'),
            source_url: ps.source_url,
            logo_url: ps.logo_url || null,
          };
          mergedMap.set(uid || key, newEntry);
          if (uid) uidMap.set(uid, newEntry);
        }

        const merged = [...mergedMap.values()].sort((a, b) =>
          (a.start_date || '').localeCompare(b.start_date || '')
        );

        if (merged.length > 0) {
          seriesData = merged;
        }
      } catch (dbErr) { console.warn('[App] Handled exception:', dbErr?.message || dbErr); }

      // Fall back to JSON data if DB returned nothing
      if (!seriesData) {
        // Bug fix: JSON fallback also must exclude suppressed series
        let allSeries = mapSeriesToApi((seriesJson.series_2026 || []).filter(s => !s.is_suppressed));

        // Apply filters
        if (upcoming === 'true') {
          const today = getTodayCST(); // Phase 77 — CST anchor: don't drop today's series at 6pm CST
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
                const seriesVenue = s.venue || s.venue_name || '';
                const seriesVenueId = s.venue_id || null;
                // Propagate series venue to events missing venue_name
                s.events = eventsBySeries[s.series_uid].map(evt => ({
                  ...evt,
                  venue_name: (evt.venue_name && evt.venue_name !== 'Unknown') ? evt.venue_name : seriesVenue,
                  venue_id: evt.venue_id || seriesVenueId,
                }));
                s.events_count = s.events.length;
              }
            }
          }
        }
      } catch (evtErr) { console.warn('[App] Handled exception:', evtErr?.message || evtErr); }

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

      res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
      return res.status(200).json({
        success: true,
        data: limited,
        total,
      });
    } catch (error) {
      console.warn('Series API error:', error);
      // Last resort: return mapped JSON data unsorted
      const fallback = mapSeriesToApi(seriesJson.series_2026 || []);
      res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
      return res.status(200).json({
        success: true,
        data: fallback,
        total: fallback.length,
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default withSentry(handler);

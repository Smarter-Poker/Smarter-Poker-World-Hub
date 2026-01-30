/**
 * Tournament Series API - Serves all 70 tournament series from JSON data
 * Supports filtering by id, upcoming, type, tour, search, date range
 * Tries Supabase DB first, falls back to JSON data file
 */
import { createClient } from '@supabase/supabase-js';
import seriesJson from '../../../data/poker-tour-series-2026.json';
import wsopEvents from '../../../data/wsop-2026-events.json';
import wptEvents from '../../../data/wpt-2026-events.json';
import wsopCEvents from '../../../data/wsopc-2026-events.json';
import msptEvents from '../../../data/mspt-2026-events.json';
import rgpsEvents from '../../../data/rgps-2026-events.json';
import venetianEvents from '../../../data/venetian-2026-events.json';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Map tour codes to their pre-imported event data
const TOUR_EVENT_DATA = {
  WSOP: wsopEvents,
  WPT: wptEvents,
  WSOPC: wsopCEvents,
  MSPT: msptEvents,
  RGPS: rgpsEvents,
  VENETIAN: venetianEvents,
};

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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
        const { data, error } = await supabase
          .from('tournament_series')
          .select('*')
          .eq('id', numericId)
          .single();

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
      let query = supabase
        .from('tournament_series')
        .select('*')
        .order('start_date', { ascending: true })
        .limit(parsedLimit);

      if (upcoming === 'true') {
        const today = new Date().toISOString().split('T')[0];
        query = query.gte('start_date', today);
      }

      if (type) {
        query = query.eq('series_type', type);
      }

      if (tour) {
        query = query.or(`tour.ilike.%${tour}%,tour_code.ilike.%${tour}%`);
      }

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,short_name.ilike.%${search}%,venue.ilike.%${search}%,city.ilike.%${search}%`
        );
      }

      if (start_date) {
        query = query.gte('start_date', start_date);
      }
      if (end_date) {
        query = query.lte('start_date', end_date);
      }

      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        seriesData = data;
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
}

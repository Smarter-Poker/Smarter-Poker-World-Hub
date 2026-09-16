/**
 * Tournament Series API - Serves all 70 tournament series from JSON data
 * Supports filtering by id, upcoming, type, tour, search, date range
 * Tries Supabase DB first, falls back to JSON data file
 */
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { createClient } from '../../../src/lib/supabaseServerClient';
import seriesJson from '../../../data/poker-tour-series-2026.json';
import seriesSourceRegistry from '../../../data/series_source_registry.json';
import allVenuesData from '../../../data/all-venues.json';
import wsopEvents from '../../../data/wsop-2026-events.json';
import wptEvents from '../../../data/wpt-2026-events.json';
import wsopCEvents from '../../../data/wsopc-2026-events.json';
import msptEvents from '../../../data/mspt-2026-events.json';
import rgpsEvents from '../../../data/rgps-2026-events.json';
import venetianEvents from '../../../data/venetian-2026-events.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
  decodeScrapedTournamentText,
  fetchAllRows,
} from '../../../src/lib/poker-near-me/dailyTournamentData.mjs';
import {
  POKER_SERIES_ROUTE_ID_OFFSET,
  fromPokerSeriesRouteId,
  isServableSeriesParentEvidence,
  reconcileTournamentSeriesEvidence,
  toPokerSeriesRouteId,
} from '../../../src/lib/poker-near-me/seriesRouteIdentity.mjs';

const primaryBundledSeries = Array.isArray(seriesJson) ? seriesJson : (seriesJson.series_2026 || []);
const registryBundledSeries = Object.values(seriesSourceRegistry || {}).map((series) => ({
  series_uid: series.series_uid,
  name: series.series_name,
  short_name: series.series_name,
  tour: null,
  venue: null,
  city: null,
  state: null,
  start_date: null,
  end_date: null,
  total_events: series.event_count || 0,
  main_event_buyin: null,
  main_event_guaranteed: null,
  series_type: 'regional',
  source_url: series.source_url || null,
  is_featured: false,
  logo_url: null,
  is_suppressed: false,
}));
const bundledSeries = primaryBundledSeries.length > 0 ? primaryBundledSeries : registryBundledSeries;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * ID NAMESPACING — the list path merges `tournament_series` and `poker_series`,
 * two independent int4 sequences, and used to emit each row's own primary key
 * as `id`. The single-series path resolves an id by trying tournament_series
 * FIRST, so any id present in both tables always returned the tournament_series
 * row — a poker_series card opened a completely different series' detail page.
 *
 * poker_series rows are now emitted with their id offset by this constant, which
 * makes the id unambiguous while keeping it numeric (the detail page also feeds
 * it to /api/poker/results, /api/poker/follow and /api/poker/activity).
 * Ids BELOW the offset keep the legacy resolution order, so existing links and
 * follow/activity rows for tournament_series pages are unaffected.
 */
const SERVABLE_EVENT_QUALITIES = ['scraped_verified', 'scraped_inferred', 'manual_research'];
const SERVABLE_SERIES_QUALITIES = ['scraped_verified', 'scraped_inferred', 'manual_research'];
const SERIES_EVENT_PAGE_SIZE = 1000;
const SERIES_EVENT_MAX_ROWS = 50000;
const SERIES_UID_CHUNK_SIZE = 100;

function decodeSeriesEventPayload(event) {
  if (!event || typeof event !== 'object') return event;
  const eventName = decodeScrapedTournamentText(event.event_name);
  const tournamentName = decodeScrapedTournamentText(event.tournament_name);
  if (!eventName && !tournamentName) return null;
  return {
    ...event,
    event_name: eventName,
    tournament_name: tournamentName,
    venue_name: decodeScrapedTournamentText(event.venue_name),
  };
}

function decodeSeriesPayload(series) {
  if (!series || typeof series !== 'object') return series;
  const name = decodeScrapedTournamentText(series.name);
  const seriesName = decodeScrapedTournamentText(series.series_name);
  if (!name && !seriesName) return null;
  return {
    ...series,
    name,
    series_name: seriesName,
    short_name: decodeScrapedTournamentText(series.short_name),
    venue: decodeScrapedTournamentText(series.venue),
    venue_name: decodeScrapedTournamentText(series.venue_name),
    events: Array.isArray(series.events)
      ? series.events.map(decodeSeriesEventPayload).filter(Boolean)
      : series.events,
  };
}

/**
 * Fetch every eligible event for the requested series identities. PostgREST
 * caps one response at 1,000 rows, and production already exceeds the former
 * five-page ceiling. Any failed or bounded-out chunk returns no rows so a
 * partial national sample can never be reported as complete event counts.
 */
async function fetchPokerEventsForSeries(seriesUids, { includeEvents = false } = {}) {
  const uniqueUids = [...new Set((seriesUids || []).filter(Boolean).map(String))];
  const allRows = [];
  let pagesFetched = 0;

  for (let index = 0; index < uniqueUids.length; index += SERIES_UID_CHUNK_SIZE) {
    const uidChunk = uniqueUids.slice(index, index + SERIES_UID_CHUNK_SIZE);
    const result = await fetchAllRows(
      () => getSupabase()
        .from('poker_events')
        .select(includeEvents ? '*' : 'id, series_uid, event_name, venue_name, start_date')
        .in('series_uid', uidChunk)
        .in('data_quality', SERVABLE_EVENT_QUALITIES)
        // Generic dollar-sign HTML scanning cannot prove which currency value
        // is the buy-in (legacy rows repeatedly promoted guarantees as entry
        // fees). Keep every generic-fallback path private unless a human
        // explicitly verified the row; source-bound extractors remain eligible.
        .or('source.not.in.(html_fallback,cardplayer,venue_subpage,venue_website,bravo_venue,source_url,pdf_fallback),human_verified.eq.true')
        .order('series_uid', { ascending: true })
        .order('start_date', { ascending: true })
        .order('id', { ascending: true }),
      { pageSize: SERIES_EVENT_PAGE_SIZE, maxRows: SERIES_EVENT_MAX_ROWS },
    );
    pagesFetched += result.pagesFetched;
    if (result.error || result.truncated
      || allRows.length + result.rows.length > SERIES_EVENT_MAX_ROWS) {
      return {
        rows: [],
        error: result.error,
        truncated: result.truncated
          || allRows.length + result.rows.length > SERIES_EVENT_MAX_ROWS,
        pagesFetched,
      };
    }
    allRows.push(...result.rows);
  }

  return { rows: allRows, error: null, truncated: false, pagesFetched };
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
    // Carried through so callers can filter AFTER ids are assigned. Filtering the
    // raw array first shifted every id (index+1) and made list ids disagree with
    // the by-id lookup, so clicking a card opened the wrong series.
    is_suppressed: !!s.is_suppressed,
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
        include_events,
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
      include_events = safeString(include_events);

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

        // Namespaced ids are unambiguously poker_series rows (see
        // POKER_SERIES_ROUTE_ID_OFFSET). Below it, keep the legacy resolution order so
        // links minted before this change still resolve.
        const decodedPokerSeriesId = fromPokerSeriesRouteId(numericId);
        const isNamespacedPokerSeries = decodedPokerSeriesId !== null;
        // The namespace boundary itself is not a valid route because source
        // primary keys begin at one.
        if (numericId === POKER_SERIES_ROUTE_ID_OFFSET) {
          return res.status(404).json({ success: false, error: 'Series not found' });
        }
        const pokerSeriesId = isNamespacedPokerSeries ? decodedPokerSeriesId : numericId;

        let singleSeries = null;
        try {
          // Search tournament_series first (skipped for namespaced poker_series ids)
          const { data: ts, error: tsErr } = isNamespacedPokerSeries
            ? { data: null, error: null }
            : await getSupabase()
                .from('tournament_series')
                .select('*')
                .eq('id', numericId)
                .maybeSingle();

          // A legacy numeric id is ambiguous across tournament_series and
          // poker_series. If the precedence table cannot be read, continuing
          // could resolve the same id from poker_series (or the bundled index)
          // and return an entirely different series. Fail closed instead.
          if (tsErr) {
            throw tsErr;
          }

          if (ts) {
            if (!isServableSeriesParentEvidence(ts)) {
              return res.status(404).json({ success: false, error: 'Series not found' });
            }
            singleSeries = { ...ts, source_table: 'tournament_series' };

            // The two historical parent tables overlap. Reconcile metadata only
            // from a newer poker_series observation of the exact same source;
            // the helper preserves this tournament_series route id.
            if (ts.series_uid) {
              const { data: psTwin, error: psTwinError } = await getSupabase()
                .from('poker_series')
                .select('*')
                .eq('series_uid', ts.series_uid)
                .or('is_suppressed.is.null,is_suppressed.eq.false')
                .in('data_quality', SERVABLE_SERIES_QUALITIES)
                .maybeSingle();
              if (psTwinError) throw psTwinError;
              if (psTwin && isServableSeriesParentEvidence(psTwin)) {
                singleSeries = reconcileTournamentSeriesEvidence(singleSeries, psTwin);
              }
            }
          }

          // If not found in tournament_series, check poker_series
          if (!singleSeries) {
            const { data: ps, error: psErr } = await getSupabase()
              .from('poker_series')
              .select('*')
              .eq('id', pokerSeriesId)
              .maybeSingle();

            if (psErr) {
              throw psErr;
            }

            if (ps) {
              if (!isServableSeriesParentEvidence(ps)) {
                return res.status(404).json({ success: false, error: 'Series not found' });
              }
              // Normalize poker_series fields to match tournament_series shape.
              // Echo back the id exactly as the caller sent it so the detail
              // page's follow/activity/results keys stay stable.
              singleSeries = {
                id: numericId,
                source_table: 'poker_series',
                source_id: ps.id,
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
        } catch (dbErr) {
          console.warn('[App] Handled exception:', dbErr?.message || dbErr);
          res.setHeader('Cache-Control', 'private, no-store');
          return res.status(503).json({
            success: false,
            error: 'Series catalog is temporarily unavailable',
          });
        }

        if (!singleSeries) {
          return res.status(404).json({ success: false, error: 'Series not found' });
        }

        let detailDegraded = !singleSeries.source_table;
        const detailWarnings = [];

        // Try to load events for this series
        // Bundled schedules are a fallback for bundled parents only. A
        // source-bound DB parent must derive its count and children from the
        // eligible poker_events read below; otherwise a quarantined DB cohort
        // can be silently revived from an old JSON snapshot.
        const events = singleSeries.source_table ? null : loadEventsForSeries(singleSeries);
        if (events) {
          singleSeries.events = events.map(decodeSeriesEventPayload).filter(Boolean);
          singleSeries.events_count = singleSeries.events.length;
          singleSeries.event_count = singleSeries.events.length;
          singleSeries.total_events = singleSeries.events.length;
        } else if (singleSeries.source_table) {
          singleSeries.events = [];
          singleSeries.events_count = null;
          singleSeries.event_count = null;
          singleSeries.total_events = null;
        }

        // Also try DB events enrichment
        if (singleSeries.series_uid) {
          try {
            const eventResult = await fetchPokerEventsForSeries(
              [singleSeries.series_uid],
              { includeEvents: true },
            );
            if (eventResult.error || eventResult.truncated) {
              detailDegraded = true;
              detailWarnings.push('poker_events_read_incomplete');
              singleSeries.events = [];
              singleSeries.events_count = null;
              singleSeries.event_count = null;
              singleSeries.total_events = null;
            } else if (singleSeries.source_table || eventResult.rows.length > 0) {
              const verifiedEvents = eventResult.rows
                .map(decodeSeriesEventPayload)
                .filter(Boolean);
              singleSeries.events = verifiedEvents;
              // A complete zero-row read is evidence too. Reset every public
              // count so quarantined children cannot survive through a legacy
              // parent's cached total_events value.
              const verifiedEventCount = singleSeries.events.length;
              singleSeries.events_count = verifiedEventCount;
              singleSeries.event_count = verifiedEventCount;
              singleSeries.total_events = verifiedEventCount;
            }
          } catch (e) {
            detailDegraded = true;
            detailWarnings.push('poker_events_read_failed');
            singleSeries.events = [];
            singleSeries.events_count = null;
            singleSeries.event_count = null;
            singleSeries.total_events = null;
            console.warn('[App] Handled exception:', e);
          }
        }

        singleSeries = decodeSeriesPayload(singleSeries);
        if (!singleSeries) {
          res.setHeader('Cache-Control', 'private, no-store');
          return res.status(404).json({ success: false, error: 'Series not found' });
        }
        if (detailDegraded) res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).json({
          success: true,
          data: singleSeries,
          total: 1,
          meta: {
            generatedAt: new Date().toISOString(),
            degraded: detailDegraded,
            source: singleSeries.source_table || 'static_bundle',
            warnings: detailWarnings,
          },
        });
      }

      // --- List series with filters ---

      // Try Supabase first
      let seriesData = null;
      let seriesSource = 'database';
      let degraded = false;
      const sourceWarnings = [];
      try {
        // Query both tournament_series AND poker_series tables for maximum coverage
        let query = getSupabase()
          .from('tournament_series')
          .select('*')
          // [S-BUG-1 FIX] .eq('is_suppressed', false) excluded rows where is_suppressed=NULL.
          // Use .or() to match both NULL and false — never serve explicitly suppressed series.
          .or('is_suppressed.is.null,is_suppressed.eq.false')
          .in('data_quality', SERVABLE_SERIES_QUALITIES)
          .order('start_date', { ascending: true })
          .limit(Math.min(parsedLimit, 999));

        if (upcoming === 'true') {
          const today = getTodayCST(); // Phase 77 — CST anchor: "upcoming" filter doesn't drop today's series at 6pm CST
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
              // tournament_series has name/short_name/venue_name/location — no `tour`,
              // `venue` or `city` columns; filtering on them errored and silently
              // dropped the whole DB branch back to the static JSON file.
              query = query.or(`name.ilike.%${safeTour}%,short_name.ilike.%${safeTour}%`);
          }
        }

        if (search) {
          // Strip ILIKE wildcards to prevent injection
          const safeSearch = search.replace(/[()'",.;%_\\\[\]]/g, ' ').trim().slice(0, 100);
          if (safeSearch) {
              query = query.or(
                `name.ilike.%${safeSearch}%,short_name.ilike.%${safeSearch}%,venue_name.ilike.%${safeSearch}%,location.ilike.%${safeSearch}%`
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
          .in('data_quality', SERVABLE_SERIES_QUALITIES)
          .order('start_date', { ascending: true })
          .limit(999);

        // BUG FIX: Must apply identical display filters to poker_series or it dumps all 999
        // remaining series into the merged result set, overriding search/tour/upcoming filters.
        if (upcoming === 'true') {
          const today = getTodayCST(); // Phase 77 — CST anchor: "upcoming" filter doesn't drop today's series at 6pm CST
          psQuery = psQuery.gte('start_date', today);
        }
        if (type) {
          const tierMap = { major: 'A', circuit: 'B', regional: 'C', 'mid-major': 'C', weekly: 'C' };
          if (tierMap[type]) psQuery = psQuery.eq('tier', tierMap[type]);
        }
        if (tour) {
          const safeTour = tour.replace(/[()'",.;%_\\\[\]]/g, ' ').trim().slice(0, 50);
          // poker_series has tour/series_name/short_name (there is no `name` column)
          if (safeTour) psQuery = psQuery.or(`tour.ilike.%${safeTour}%,series_name.ilike.%${safeTour}%`);
        }
        if (search) {
          const safeSearch = search.replace(/[()'",.;%_\\\[\]]/g, ' ').trim().slice(0, 100);
          if (safeSearch) {
            psQuery = psQuery.or(
              `series_name.ilike.%${safeSearch}%,short_name.ilike.%${safeSearch}%,venue_name.ilike.%${safeSearch}%,city.ilike.%${safeSearch}%`
            );
          }
        }
        if (start_date) psQuery = psQuery.gte('start_date', start_date);
        if (end_date) psQuery = psQuery.lte('start_date', end_date);

        const [{ data, error }, { data: psData, error: psError }] = await Promise.all([query, psQuery]);
        if (error) {
          degraded = true;
          sourceWarnings.push('tournament_series_unavailable');
        }
        if (psError) {
          degraded = true;
          sourceWarnings.push('poker_series_unavailable');
        }
        if (error || psError) {
          res.setHeader('Cache-Control', 'private, no-store');
          return res.status(503).json({
            success: false,
            error: 'Series catalog is temporarily unavailable',
            meta: { degraded: true, warnings: sourceWarnings },
          });
        }
        // [B1 FIX] Declare pokerSeriesData here — was missing 'let' causing ReferenceError
        // in strict mode, crashing the try block and falling through to empty JSON fallback.
        let pokerSeriesData = (psData || []).filter(
          row => isServableSeriesParentEvidence(row),
        );

        // Merge only when the shared UID is backed by exact newer source
        // evidence. A same-name or mismatched-source row is not proof that two
        // independently keyed parents are the same event series.
        const mergedMap = new Map();
        const uidMap = new Map();
        if (!error && data) {
          for (const s of data.filter(row => isServableSeriesParentEvidence(row))) {
            const entry = { ...s, series_uid: s.series_uid || null, source_table: 'tournament_series' };
            mergedMap.set(`tournament_series:${s.id}`, entry);
            if (s.series_uid && !uidMap.has(s.series_uid)) uidMap.set(s.series_uid, entry);
          }
        }
        // Overlay poker_series data (has series_uid for event linking)
        for (const ps of pokerSeriesData) {
          const uid = ps.series_uid;
          // If the UID exists in both tables, reconcile it only when exact
          // source evidence proves both rows describe the same series.
          if (uid && uidMap.has(uid)) {
            const existing = uidMap.get(uid);
            const reconciled = reconcileTournamentSeriesEvidence(existing, ps);
            if (reconciled !== existing) {
              Object.assign(existing, reconciled, { series_uid: uid });
              continue;
            }
          }
          
          // New series — add it. The id is namespaced (see
          // POKER_SERIES_ROUTE_ID_OFFSET) so /api/poker/series?id=<this> cannot
          // resolve to an unrelated tournament_series row with the same int4 pk.
          const newEntry = {
            id: toPokerSeriesRouteId(ps.id),
            source_table: 'poker_series',
            source_id: ps.id,
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
          mergedMap.set(`poker_series:${ps.id}`, newEntry);
          if (uid && !uidMap.has(uid)) uidMap.set(uid, newEntry);
        }

        const merged = [...mergedMap.values()].sort((a, b) =>
          (a.start_date || '').localeCompare(b.start_date || '')
        );

        // A complete zero-row read is authoritative. Bundled files are build
        // snapshots without current provenance and cannot revive parents that
        // the quality filter intentionally withheld.
        seriesData = merged;
      } catch (dbErr) {
        degraded = true;
        sourceWarnings.push('database_query_failed');
        console.warn('[App] Handled exception:', dbErr?.message || dbErr);
      }

      const decodedSeriesData = seriesData.map(decodeSeriesPayload).filter(Boolean);
      const total = decodedSeriesData.length;
      const limited = decodedSeriesData.slice(0, parsedLimit);
      if (seriesSource === 'database') {
        // Parent-maintained totals are not proof of currently servable child
        // rows. Keep them unknown until the complete bounded child scan below
        // establishes an exact count.
        for (const series of limited) {
          series.events_count = null;
          series.event_count = null;
          series.total_events = null;
          series.events = [];
        }
      }
      const sourceLastUpdated = limited.reduce((latest, series) => {
        const candidate = series.updated_at || series.last_scraped || series.created_at || null;
        return candidate && (!latest || candidate > latest) ? candidate : latest;
      }, null);

      // Enrich each series with events from poker_events.
      //
      // The list endpoint used to attach the FULL event row of every event of
      // every series (select('*'), up to 5 x 999 rows) and then fall back to
      // attaching the entire JSON event file for anything still empty — a
      // multi-megabyte body pinned at the edge for 15 minutes by s-maxage=900,
      // for card grids that only render name, dates, venue and event count.
      // Full events are now opt-in via ?include_events=true; the default path
      // fetches only the series_uid column and derives events_count from it.
      const wantEvents = include_events === 'true';
      try {
        const seriesUids = limited
          .map(s => s.series_uid)
          .filter(Boolean);

        if (seriesUids.length > 0) {
          const eventResult = await fetchPokerEventsForSeries(
            seriesUids,
            { includeEvents: wantEvents },
          );
          if (eventResult.error || eventResult.truncated) {
            degraded = true;
            sourceWarnings.push(
              eventResult.truncated
                ? 'poker_events_scan_truncated'
                : 'poker_events_read_failed',
            );
          } else {
            const eventsBySeries = {};
            for (const rawEvent of eventResult.rows) {
              const evt = decodeSeriesEventPayload(rawEvent);
              if (!evt) continue;
              if (!eventsBySeries[evt.series_uid]) eventsBySeries[evt.series_uid] = [];
              eventsBySeries[evt.series_uid].push(evt);
            }
            for (const s of limited) {
              if (s.series_uid) {
                const rows = eventsBySeries[s.series_uid] || [];
                s.events_count = rows.length;
                s.event_count = rows.length;
                s.total_events = rows.length;
                if (wantEvents) {
                  const seriesVenue = s.venue || s.venue_name || '';
                  const seriesVenueId = s.venue_id || null;
                  // Propagate series venue to events missing venue_name
                  s.events = rows.map(evt => decodeSeriesEventPayload({
                    ...evt,
                    venue_name: (evt.venue_name && evt.venue_name !== 'Unknown') ? evt.venue_name : seriesVenue,
                    venue_id: evt.venue_id || seriesVenueId,
                  })).filter(Boolean);
                }
              }
            }
          }
        }
      } catch (evtErr) {
        degraded = true;
        sourceWarnings.push('poker_events_read_failed');
        console.warn('[App] Handled exception:', evtErr?.message || evtErr);
      }

      res.setHeader(
        'Cache-Control',
        degraded ? 'private, no-store' : 'public, s-maxage=900, stale-while-revalidate=86400',
      );
      return res.status(200).json({
        success: true,
        data: limited,
        total,
        meta: {
          generatedAt: new Date().toISOString(),
          lastUpdated: sourceLastUpdated,
          degraded,
          source: seriesSource,
          warnings: sourceWarnings,
        },
      });
    } catch (error) {
      console.warn('Series API error:', error);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(503).json({
        success: false,
        error: 'Series catalog is temporarily unavailable',
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default async function routeHandler(req, res) {
    try {
        return await handler(req, res);
    } catch (error) {
        reportApiError(error, req);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Internal server error',
                ...(process.env.NODE_ENV === 'development' ? { message: error.message } : {}),
            });
        }
    }
}

/**
 * /api/poker/tour-schedule
 * ========================
 * Returns full event-level schedule for one or all tours.
 * Powers the Smarter.Poker Standard tour event display.
 *
 * GET /api/poker/tour-schedule?tour_code=WSOP
 * GET /api/poker/tour-schedule?tour_code=WSOP&stop_name=2026+WSOP+Main+Series
 * GET /api/poker/tour-schedule?tour_code=WSOP&stop=current
 * GET /api/poker/tour-schedule?tour_code=WSOP&stop=next
 * GET /api/poker/tour-schedule?tour_code=WSOP&all_stops=true
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
}


// Smarter.Poker Standard: canonical buy-in color tier system
const BUY_IN_TIER = (amount) => {
  if (!amount) return 'tbd';
  if (amount < 500) return 'value';       // Green: <$500
  if (amount < 1000) return 'low';        // Cyan: $500-$999
  if (amount < 2500) return 'mid';        // Blue: $1K-$2.4K
  if (amount < 10000) return 'midhi';     // Purple: $2.5K-$9.9K
  if (amount < 25000) return 'high';      // Gold: $10K-$24.9K
  if (amount < 100000) return 'super';    // Platinum: $25K-$99.9K
  return 'ultra';                          // Diamond: $100K+
};

// Smarter.Poker Standard: canonical game type normalization
const normalizeGameType = (raw) => {
  if (!raw) return 'NLH';
  const g = raw.trim().toUpperCase();
  const map = {
    'NLHE': 'NLH', 'NLH': 'NLH', 'NO-LIMIT': 'NLH', 'NO LIMIT HOLDEM': 'NLH',
    'PLO': 'PLO', 'POT-LIMIT OMAHA': 'PLO', 'OMAHA': 'PLO',
    'O8': 'O8', 'PLO8': 'O8', 'OMAHA HI-LO': 'O8', 'OMAHA HI/LO': 'O8',
    'HORSE': 'HORSE', 'H.O.R.S.E.': 'HORSE', 'H.O.R.S.E': 'HORSE',
    'STUD': 'STUD', '7-CARD STUD': 'STUD',
    'STUD 8': 'STUD-8', 'STUD HI-LO': 'STUD-8',
    'RAZZ': 'RAZZ',
    'MIXED': 'MIXED', 'EIGHT GAME': 'MIXED', '8-GAME': 'MIXED',
    'LIMIT HE': 'LHE', 'LIMIT HOLDEM': 'LHE', 'LIMIT HOLD\'EM': 'LHE',
    'SHORT DECK': 'SHORT', 'SHORT DECK NLH': 'SHORT',
    '2-7': '2-7', 'LOWBALL': '2-7', 'NL 2-7': '2-7',
    '5-CARD PLO': 'PLO5', 'FIVE CARD PLO': 'PLO5',
  };
  return map[g] || raw.slice(0, 10).toUpperCase();
};

// Smarter.Poker Standard: format money for display
const formatMoney = (amount) => {
  if (!amount && amount !== 0) return 'TBD';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
  return '$' + amount.toLocaleString();
};

/**
 * Midnight "today" anchored to US Eastern rather than the server timezone (UTC on
 * Vercel). Without this, from ~8 PM ET onward the server was already on tomorrow's
 * date and stops ending today were classified as past. Mirrors the America/New_York
 * anchor used by daily-tournaments.getCurrentDay() and series.getTodayCST().
 */
function getTodayEastern() {
    const localTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const d = new Date(localTime);
    // Stop dates parse as UTC midnights, so compare against a UTC midnight too.
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// Determine current and next stop based on today's date
const classifyStops = (events, today) => {
  if (!events?.length) return { current: null, next: null, future: [], past: [] };

  // Group events by stop_name
  const stopMap = {};
  for (const e of events) {
    const key = e.stop_name;
    if (!stopMap[key]) {
      stopMap[key] = {
        stop_name: e.stop_name,
        stop_venue: e.stop_venue,
        stop_city: e.stop_city,
        stop_state: e.stop_state,
        stop_start_date: e.stop_start_date,
        stop_end_date: e.stop_end_date,
        events: [],
      };
    }
    stopMap[key].events.push(e);
  }

  const stops = Object.values(stopMap || {}).sort((a, b) => {
    if (!a.stop_start_date) return 1;
    if (!b.stop_start_date) return -1;
    return new Date(a.stop_start_date) - new Date(b.stop_start_date);
  });

  let current = null, next = null;
  const future = [], past = [];

  for (const stop of stops) {
    // Skip events with no usable start_date. `new Date(null)` is 1970-01-01 —
    // a VALID Date, not NaN — so folding those in pinned min/max to the epoch
    // and classified the stop as long past. Registry-fallback stops carry no
    // dates at all and were all being bucketed as 'past' because of this.
    const eventDates = stop.events
      .map(ev => (ev && ev.start_date ? new Date(ev.start_date) : null))
      .filter(d => d && !isNaN(d.getTime()));
    const minEventDate = eventDates.length ? eventDates.reduce((min, d) => (d < min ? d : min)) : null;
    const maxEventDate = eventDates.length ? eventDates.reduce((max, d) => (d > max ? d : max)) : null;

    const start = stop.stop_start_date ? new Date(stop.stop_start_date) : minEventDate;
    let end = stop.stop_end_date ? new Date(stop.stop_end_date) : maxEventDate;
    if (!end) end = start;

    if (!start) {
      future.push(stop);
      continue;
    }

    if (end >= today && start <= today) {
      current = stop;
    } else if (start > today) {
      if (!next) next = stop;
      else future.push(stop);
    } else {
      past.push(stop);
    }
  }

  return { current, next, future, past };
};

// Build Smarter.Poker Standard event record
const standardizeEvent = (row) => ({
  id: row.id,
  tour_code: row.tour_code,
  stop_name: row.stop_name,
  stop_venue: row.stop_venue || null,
  stop_city: row.stop_city || null,
  stop_state: row.stop_state || null,
  stop_start_date: row.stop_start_date || null,
  stop_end_date: row.stop_end_date || null,

  // Event identity
  event_number: row.event_number || null,
  event_name: row.event_name,
  game_type: normalizeGameType(row.game_type),
  game_type_raw: row.game_type || null,

  // Buy-in (Smarter.Poker Standard: always in whole dollars)
  buy_in: row.buy_in || null,
  buy_in_display: formatMoney(row.buy_in),
  buy_in_tier: BUY_IN_TIER(row.buy_in),
  entry_fee: row.entry_fee || null,
  total_cost: row.buy_in && row.entry_fee ? row.buy_in + row.entry_fee : row.buy_in || null,
  guarantee: row.guarantee || null,
  guarantee_display: formatMoney(row.guarantee),

  // Structure
  starting_chips: row.starting_chips || null,
  starting_chips_display: row.starting_chips ? row.starting_chips.toLocaleString() : 'TBD',
  blind_levels_min: row.blind_levels_min || null,
  late_reg_levels: row.late_reg_levels || null,

  // Timing
  start_date: row.start_date || null,
  start_time: row.start_time || null,
  start_display: row.start_date
    ? new Date(row.start_date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })
    : 'TBD',

  // Flags
  is_main_event: row.is_main_event || false,
  is_multi_day: row.is_multi_day || false,
  re_entry: row.re_entry || false,
  is_high_roller: row.is_high_roller || (row.buy_in >= 25000),
  is_ladies_event: row.is_ladies_event || false,
  is_seniors_event: row.is_seniors_event || false,
  day_1_flights: row.day_1_flights || null,
  notes: row.notes || null,

  // Provenance (source of truth)
  source_url: row.source_url,
  scrape_timestamp: row.scrape_timestamp,
  data_quality: row.data_quality,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Standard read rate limit (this was the only poker API without one)
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  // Array injection guards — Next.js passes ?key[]=val as an array; PostgREST crashes on array input
  const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
  const tour_code = safeQ(req.query.tour_code);
  const stop_name = safeQ(req.query.stop_name);
  const stop = safeQ(req.query.stop);        // 'current', 'next', or undefined = all
  const all_stops = safeQ(req.query.all_stops);   // 'true' = return all stops grouped
  const pdf_detail = safeQ(req.query.pdf_detail);  // 'true' = also fetch from tour_event_details (PDF-extracted)
  const rawLimit = safeQ(req.query.limit);
  const limit = Math.min(parseInt(rawLimit) || 500, 2000);

  if (!tour_code) {
    return res.status(400).json({ error: 'tour_code is required' });
  }

  try {
    const supabase = getSupabase();

    // Query tour_stop_events table
    let query = supabase
      .from('tour_stop_events')
      .select('*')
      .eq('tour_code', tour_code.toUpperCase())
      .order('start_date', { ascending: true })
      .order('event_number', { ascending: true })
      .limit(limit);

    // Guard: treat empty string stop_name as no filter to prevent leaking all events
    // Escape LIKE wildcards to prevent pattern injection attacks
    const stopNameFilter = stop_name && String(stop_name).replace(/[%_]/g, '\\$&').slice(0, 200).trim();
    if (stopNameFilter) {
      query = query.ilike('stop_name', `%${stopNameFilter}%`);
    }

    const { data: rawEvents, error } = await query;

    if (error) throw error;

    // Also query tour_event_details (PDF-extracted data) for this tour
    let pdfEvents = [];
    try {
      let pdfQuery = supabase
        .from('tour_event_details')
        .select('*')
        .eq('tour_code', tour_code.toUpperCase())
        .order('start_date', { ascending: true })
        .order('event_number', { ascending: true })
        .limit(1000);

      if (stopNameFilter) {
        pdfQuery = pdfQuery.ilike('series_name', `%${stopNameFilter.substring(0, 30)}%`);
      }

      const { data: pdfRaw } = await pdfQuery;
      pdfEvents = (pdfRaw || []).map(row => ({
        id: `pdf_${row.id}`,
        tour_code: row.tour_code,
        stop_name: row.series_name || stop_name || tour_code,
        stop_venue: null,
        stop_city: null,
        stop_state: null,
        stop_start_date: row.start_date || null,
        stop_end_date: null,
        event_number: row.event_number || null,
        event_number_raw: row.event_number_raw || null,
        event_name: row.event_name,
        game_type: normalizeGameType(row.game_type),
        buy_in: row.buy_in || null,
        buy_in_display: formatMoney(row.buy_in),
        buy_in_tier: BUY_IN_TIER(row.buy_in),
        entry_fee: null,
        guarantee: row.guaranteed || null,
        guarantee_display: formatMoney(row.guaranteed),
        starting_chips: row.starting_chips || null,
        starting_chips_display: row.starting_chips ? row.starting_chips.toLocaleString() : 'TBD',
        blind_levels_min: row.levels || null,
        start_date: row.start_date || null,
        start_time: row.start_time || null,
        reg_open_time: row.reg_open_time || null,
        start_display: row.start_date
          ? new Date(row.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'TBD',
        date: row.start_date
          ? new Date(row.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null,
        day_of_week: null,
        is_main_event: row.event_type === 'main_event' || /main\s*event/i.test(row.event_name || ''),
        is_multi_day: false,
        re_entry: false,
        is_high_roller: (row.buy_in || 0) >= 25000,
        is_ladies_event: row.event_type === 'ladies',
        is_seniors_event: row.event_type === 'seniors',
        event_type: row.event_type || null,
        source_url: row.pdf_source_url || null,
        scrape_timestamp: row.scraped_at || null,
        data_quality: 'pdf_extracted',
        pdf_source_url: row.pdf_source_url || null,
      }));
    } catch (_pdfErr) { console.warn('[App] Handled exception:', _pdfErr?.message || _pdfErr); }

    const today = getTodayEastern();

    // Standardize DB events
    const dbEvents = (rawEvents || []).map(standardizeEvent);

    // Merge strategy:
    // If DB has structured stop data (tour_stop_events), use it as primary
    // Merge in PDF events that aren't already covered
    let events;
    if (dbEvents.length > 0) {
      // Enrich DB events with PDF timing/chip data.
      //
      // This map used to be keyed on `event_number` ALONE while rawEvents covers
      // every stop of the tour (the query filters on tour_code only unless
      // stop_name is supplied). Circuit tours restart event numbering at each
      // stop, so "Event #1" in Cherokee was being enriched with the start time,
      // chips, blind levels and guarantee scraped from a different stop's PDF —
      // and then relabelled data_quality:'enriched' to advertise it.
      //
      // Key on normalised stop name + event number, with date + event number as
      // a secondary key (the PDF table stores the stop under `series_name`, so
      // the two spellings do not always agree).
      const normStop = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const stopKeyOf = (ev) => `${normStop(ev.stop_name)}#${ev.event_number}`;
      const dateKeyOf = (ev) => {
        const d = String(ev.start_date || ev.stop_start_date || '').slice(0, 10);
        return d ? `${d}#${ev.event_number}` : null;
      };

      const pdfByStop = new Map();
      const pdfByDate = new Map();
      for (const pe of pdfEvents) {
        if (!pe.event_number) continue;
        const sk = stopKeyOf(pe);
        if (!pdfByStop.has(sk)) pdfByStop.set(sk, pe);
        const dk = dateKeyOf(pe);
        if (dk && !pdfByDate.has(dk)) pdfByDate.set(dk, pe);
      }

      events = dbEvents.map(ev => {
        if (!ev.event_number) return ev;
        const dk = dateKeyOf(ev);
        const pdfMatch = pdfByStop.get(stopKeyOf(ev)) || (dk ? pdfByDate.get(dk) : null);
        if (!pdfMatch) return ev;
        return {
          ...ev,
          start_time: ev.start_time || pdfMatch.start_time,
          reg_open_time: pdfMatch.reg_open_time,
          starting_chips: ev.starting_chips || pdfMatch.starting_chips,
          starting_chips_display: ev.starting_chips_display !== 'TBD' ? ev.starting_chips_display : pdfMatch.starting_chips_display,
          blind_levels_min: ev.blind_levels_min || pdfMatch.blind_levels_min,
          guarantee: ev.guarantee || pdfMatch.guarantee,
          guarantee_display: ev.guarantee ? ev.guarantee_display : pdfMatch.guarantee_display,
          data_quality: 'enriched',
        };
      });
      // Append any PDF events not in DB. Same composite key: a bare
      // event_number set discarded genuine PDF events simply because some other
      // stop of the same tour already used that number.
      const dbStopKeys = new Set();
      const dbDateKeys = new Set();
      for (const e of dbEvents) {
        if (!e.event_number) continue;
        dbStopKeys.add(stopKeyOf(e));
        const dk = dateKeyOf(e);
        if (dk) dbDateKeys.add(dk);
      }
      for (const pe of pdfEvents) {
        if (!pe.event_number) continue;
        const dk = dateKeyOf(pe);
        if (dbStopKeys.has(stopKeyOf(pe))) continue;
        if (dk && dbDateKeys.has(dk)) continue;
        events.push(pe);
      }
    } else if (pdfEvents.length > 0) {
      // No DB events — use PDF data directly
      events = pdfEvents;
    } else {
      // Still nothing — fall back to registry
      return returnRegistryFallback(tour_code.toUpperCase(), stop, res, all_stops);
    }

    // Classify stops by date (current/next/future)
    const classified = classifyStops(events, today);

    if (stop === 'current') {
      const stopData = classified.current || classified.next;
      if (!stopData) {
        return res.status(200).json({
          success: true,
          tour_code,
          stop_type: 'none',
          message: 'No current or upcoming stops found',
          events: [],
          data_source: 'database',
        });
      }
      return res.status(200).json({
        success: true,
        tour_code,
        stop_type: classified.current ? 'current' : 'next',
        stop: {
          name: stopData.stop_name,
          venue: stopData.stop_venue,
          city: stopData.stop_city,
          state: stopData.stop_state,
          start_date: stopData.stop_start_date,
          end_date: stopData.stop_end_date,
        },
        events: stopData.events,
        total_events: stopData.events.length,
        next_stop: classified.next ? {
          name: classified.next.stop_name,
          start_date: classified.next.stop_start_date,
        } : null,
        data_source: 'database',
      });
    }

    if (stop === 'next') {
      const stopData = classified.next;
      if (!stopData) {
        return res.status(200).json({
          success: true, tour_code, stop_type: 'none', events: [], data_source: 'database'
        });
      }
      return res.status(200).json({
        success: true,
        tour_code,
        stop_type: 'next',
        stop: {
          name: stopData.stop_name,
          venue: stopData.stop_venue,
          city: stopData.stop_city,
          state: stopData.stop_state,
          start_date: stopData.stop_start_date,
          end_date: stopData.stop_end_date,
        },
        events: stopData.events,
        total_events: stopData.events.length,
        data_source: 'database',
      });
    }

    // Default: return all events grouped by stop
    if (all_stops === 'true') {
      const allStops = [
        ...(classified.current ? [{ ...classified.current, stop_type: 'current' }] : []),
        ...(classified.next ? [{ ...classified.next, stop_type: 'next' }] : []),
        ...classified.future.map(s => ({ ...s, stop_type: 'future' })),
        ...classified.past.map(s => ({ ...s, stop_type: 'past' })),
      ];
      return res.status(200).json({
        success: true,
        tour_code,
        current_stop: classified.current?.stop_name || null,
        next_stop: classified.next?.stop_name || null,
        total_stops: allStops.length,
        total_events: events.length,
        stops: allStops,
        data_source: 'database',
      });
    }

    // Default: return flat list with classification metadata
    return res.status(200).json({
      success: true,
      tour_code,
      current_stop: classified.current?.stop_name || null,
      next_stop: classified.next?.stop_name || null,
      total_events: events.length,
      events,
      data_source: 'database',
    });

  } catch (err) {
    console.warn('[tour-schedule] Error:', err);
    // Fallback to registry data if DB fails
    return returnRegistryFallback(tour_code?.toUpperCase(), stop, res, all_stops);
  }
}

// ── Registry Fallback ─────────────────────────────────────────────────────────
// When DB has no scraped data yet, fall back to the registry JSON
async function returnRegistryFallback(tour_code, stop, res, all_stops) {
  try {
    const registry = require('../../../data/tour-source-registry.json');
    const tour = registry?.tours?.[tour_code];
    if (!tour) {
      return res.status(404).json({ success: false, error: 'Tour not found', tour_code });
    }

    // Build standardized events from series_2026 registry data
    const series = tour.series_2026 || [];
    const today = getTodayEastern();

    const events = series.map((s, idx) => {
      const buyin = s.buyin || null;
      return {
        id: `registry_${tour_code}_${idx}`,
        tour_code,
        stop_name: (tour.stops_2026?.[0]?.name) || `${tour_code} 2026`,
        stop_venue: tour.stops_2026?.[0]?.venue || null,
        stop_city: tour.stops_2026?.[0]?.location?.split(',')[0]?.trim() || null,
        stop_state: tour.stops_2026?.[0]?.location?.split(',')[1]?.trim() || null,
        stop_start_date: null,
        stop_end_date: null,
        event_number: idx + 1,
        event_name: s.name,
        game_type: normalizeGameType(s.game),
        game_type_raw: s.game,
        buy_in: buyin,
        buy_in_display: formatMoney(buyin),
        buy_in_tier: BUY_IN_TIER(buyin),
        entry_fee: null,
        total_cost: buyin,
        guarantee: null,
        guarantee_display: 'TBD',
        starting_chips: null,
        starting_chips_display: 'TBD',
        blind_levels_min: null,
        late_reg_levels: null,
        start_date: null,
        start_time: null,
        start_display: s.dates || 'TBD',
        is_main_event: s.name?.toLowerCase().includes('main event'),
        is_multi_day: false,
        re_entry: false,
        is_high_roller: (buyin || 0) >= 25000,
        is_ladies_event: false,
        is_seniors_event: false,
        day_1_flights: null,
        notes: null,
        source_url: tour.source_urls?.primary || tour.official_website,
        scrape_timestamp: null,
        data_quality: 'pending',
      };
    });

    // Emit the SAME envelope the database path produces.
    //
    // This branch used to return a bare `{ events }` regardless of `stop` or
    // `all_stops`, so RichTourCard (which requests all_stops=true and reads
    // `stops`) rendered an empty stop list and no next-stop banner for every
    // tour with no rows in tour_stop_events / tour_event_details — i.e. exactly
    // the tours this fallback exists to serve. `today` was already being
    // computed above and thrown away, which is the tell that the classification
    // step was dropped.
    const classified = classifyStops(events, today);
    const stopEnvelope = (s) => ({
      name: s.stop_name,
      venue: s.stop_venue,
      city: s.stop_city,
      state: s.stop_state,
      start_date: s.stop_start_date,
      end_date: s.stop_end_date,
    });

    if (all_stops === 'true') {
      const allStops = [
        ...(classified.current ? [{ ...classified.current, stop_type: 'current' }] : []),
        ...(classified.next ? [{ ...classified.next, stop_type: 'next' }] : []),
        ...classified.future.map(s => ({ ...s, stop_type: 'future' })),
        ...classified.past.map(s => ({ ...s, stop_type: 'past' })),
      ];
      return res.status(200).json({
        success: true,
        tour_code,
        data_source: 'registry_fallback',
        message: 'Live schedule not yet scraped — showing registry data',
        current_stop: classified.current?.stop_name || null,
        next_stop: classified.next?.stop_name || null,
        total_stops: allStops.length,
        total_events: events.length,
        stops: allStops,
        events,
      });
    }

    if (stop === 'current' || stop === 'next') {
      // Registry stops carry no dates (the registry only has a free-text
      // `dates` string), so classifyStops can produce neither a current nor a
      // next stop for them. Falling back to the first undated/future stop keeps
      // this branch returning the registry events it has always returned — the
      // alternative is answering `?stop=current` with an empty list on exactly
      // the tours this fallback exists to serve.
      const stopData = stop === 'current'
        ? (classified.current || classified.next || classified.future[0])
        : (classified.next || classified.future[0]);
      if (!stopData) {
        return res.status(200).json({
          success: true,
          tour_code,
          data_source: 'registry_fallback',
          stop_type: 'none',
          message: 'No current or upcoming stops found',
          events: [],
          total_events: 0,
        });
      }
      return res.status(200).json({
        success: true,
        tour_code,
        data_source: 'registry_fallback',
        message: 'Live schedule not yet scraped — showing registry data',
        stop_type: stop === 'current' && classified.current === stopData
          ? 'current'
          : (classified.next === stopData ? 'next' : 'future'),
        stop: stopEnvelope(stopData),
        next_stop: classified.next ? {
          name: classified.next.stop_name,
          start_date: classified.next.stop_start_date,
        } : null,
        events: stopData.events,
        total_events: stopData.events.length,
      });
    }

    return res.status(200).json({
      success: true,
      tour_code,
      data_source: 'registry_fallback',
      message: 'Live schedule not yet scraped — showing registry data',
      current_stop: classified.current?.stop_name || null,
      next_stop: classified.next?.stop_name || null,
      total_events: events.length,
      events,
    });
  } catch (err) {
      try { reportApiError(err, {}); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    return res.status(500).json({ success: false, error: err.message, tour_code });
  }
}

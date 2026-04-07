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

import { getSupabase } from '../../../src/lib/supabaseClient';

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

  const stops = Object.values(stopMap).sort((a, b) => {
    if (!a.stop_start_date) return 1;
    if (!b.stop_start_date) return -1;
    return new Date(a.stop_start_date) - new Date(b.stop_start_date);
  });

  let current = null, next = null;
  const future = [], past = [];

  for (const stop of stops) {
    const start = stop.stop_start_date ? new Date(stop.stop_start_date) : null;
    const end = stop.stop_end_date ? new Date(stop.stop_end_date) : start;

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

  const {
    tour_code,
    stop_name,
    stop,        // 'current', 'next', or undefined = all
    all_stops,   // 'true' = return all stops grouped
    limit = 500,
  } = req.query;

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
      .limit(parseInt(limit));

    if (stop_name) {
      query = query.ilike('stop_name', `%${stop_name}%`);
    }

    const { data: rawEvents, error } = await query;

    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Standardize all event records
    const events = (rawEvents || []).map(standardizeEvent);

    // If no DB data found, fall back to registry JSON
    if (!events.length) {
      return returnRegistryFallback(tour_code.toUpperCase(), stop, res);
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
    console.error('[tour-schedule] Error:', err);
    // Fallback to registry data if DB fails
    return returnRegistryFallback(tour_code?.toUpperCase(), stop, res);
  }
}

// ── Registry Fallback ─────────────────────────────────────────────────────────
// When DB has no scraped data yet, fall back to the registry JSON
async function returnRegistryFallback(tour_code, stop, res) {
  try {
    const registry = require('../../../data/tour-source-registry.json');
    const tour = registry?.tours?.[tour_code];
    if (!tour) {
      return res.status(404).json({ success: false, error: 'Tour not found', tour_code });
    }

    // Build standardized events from series_2026 registry data
    const series = tour.series_2026 || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    return res.status(200).json({
      success: true,
      tour_code,
      data_source: 'registry_fallback',
      message: 'Live schedule not yet scraped — showing registry data',
      total_events: events.length,
      events,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, tour_code });
  }
}

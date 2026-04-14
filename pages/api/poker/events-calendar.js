/**
 * Unified Events Calendar API
 * ============================
 * Aggregates ALL tournament data into a single searchable feed:
 *   1. venue_daily_tournaments (9,697 active) — recurring venue tournaments
 *   2. poker_series (208) — multi-day series with date ranges
 *   3. tour_stop_events (598) + tour_event_details (462) — traveling tour events
 *
 * GET /api/poker/events-calendar
 *   ?day=Monday|Tuesday|...|all         Day filter (recurring tournaments)
 *   ?date=2026-04-18                    Specific date filter
 *   ?dateRange=today|tomorrow|week|weekend|14days
 *   ?state=TX                           State filter
 *   ?city=Houston                       City filter
 *   ?lat=29.7&lng=-95.3&radius=100      GPS + radius (miles)
 *   ?minBuyin=50&maxBuyin=500           Buy-in range
 *   ?gameType=NLH|PLO|Mixed             Game type filter
 *   ?eventType=daily|series|tour|all    Event source filter
 *   ?search=Lodge                       Free text search
 *   ?sort=date|buyin|distance           Sort order
 *   ?offset=0&limit=100                 Pagination
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
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

const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getCurrentDayInfo() {
  const localTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const d = new Date(localTime);
  return {
    dayIndex: d.getDay(),
    dayName: DAYS_ORDER[d.getDay()],
    dateKey: d.toISOString().slice(0, 10),
  };
}

function getDateKey(date) {
  return date.toISOString().slice(0, 10);
}

// Project a recurring day_of_week into actual dates within a range
function projectDayToDate(dayOfWeek, startDate, endDate) {
  const dayLower = (dayOfWeek || '').toLowerCase().trim();
  const dates = [];

  // Handle "Daily" — maps to every day
  const isDaily = dayLower === 'daily';
  const targetDayIdx = isDaily ? -1 : DAYS_ORDER.indexOf(dayLower);

  if (!isDaily && targetDayIdx === -1) return dates;

  const current = new Date(startDate);
  while (current <= endDate) {
    if (isDaily || current.getDay() === targetDayIdx) {
      dates.push(getDateKey(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Haversine distance in miles
function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Normalize game type
function normalizeGameType(raw) {
  if (!raw) return 'NLH';
  const g = raw.trim().toUpperCase();
  const map = {
    'NLHE': 'NLH', 'NLH': 'NLH', 'NO-LIMIT': 'NLH', 'NO LIMIT HOLDEM': 'NLH',
    'HOLDEM': 'NLH', 'HOLD\'EM': 'NLH',
    'PLO': 'PLO', 'POT-LIMIT OMAHA': 'PLO', 'OMAHA': 'PLO',
    'O8': 'O8', 'PLO8': 'O8', 'OMAHA HI-LO': 'O8',
    'HORSE': 'HORSE', 'H.O.R.S.E.': 'HORSE',
    'STUD': 'STUD', '7-CARD STUD': 'STUD',
    'MIXED': 'MIXED', 'EIGHT GAME': 'MIXED', '8-GAME': 'MIXED',
    'LIMIT': 'LHE', 'LIMIT HE': 'LHE', 'LIMIT HOLDEM': 'LHE',
  };
  return map[g] || (g.length <= 10 ? g : g.slice(0, 10));
}

// Parse time string to minutes for sorting
function parseTimeMinutes(timeStr) {
  if (!timeStr) return 720; // default noon
  // Handle HH:MM:SS format
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    const h = parseInt(match24[1]);
    const m = parseInt(match24[2]);
    return h * 60 + m;
  }
  // Handle 12h format: "6:00 PM", "6PM", "6:00pm"
  const match12 = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)/i);
  if (match12) {
    let h = parseInt(match12[1]);
    const m = parseInt(match12[2] || '0');
    const period = match12[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  return 720;
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return null;
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'K';
  return '$' + amount.toLocaleString();
}

export default async function handler(req, res) {
    try {
      if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // CDN cache: Dynamic real-time capability override
      if (req.query._rt) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      }

      if (!applyRateLimit(req, res, LIMITS.read)) return;

    let {
      day,
      date,
      dateRange = '14days',
      state,
      city,
      lat, lng, radius = '100',
      minBuyin, maxBuyin,
      gameType,
      eventType = 'all',
      search,
      sort = 'date',
      offset = '0',
      limit = '100',
    } = req.query;

    // BUG FIX: Array Query Injection Vector
    const safeString = (val) => Array.isArray(val) ? val[0] : val;
    day = safeString(day);
    date = safeString(date);
    dateRange = safeString(dateRange) || '14days';
    state = safeString(state);
    city = safeString(city);
    lat = safeString(lat);
    lng = safeString(lng);
    radius = safeString(radius) || '100';
    minBuyin = safeString(minBuyin);
    maxBuyin = safeString(maxBuyin);
    gameType = safeString(gameType);
    eventType = safeString(eventType) || 'all';
    search = safeString(search);
    sort = safeString(sort) || 'date';
    offset = safeString(offset) || '0';
    limit = safeString(limit) || '100';

    const sb = getSupabase();
    const { dayIndex, dayName, dateKey: todayKey } = getCurrentDayInfo();
    // BUG FIX: Prevent negative offset/limit allowing massive Array.slice() bypasses
    const parsedOffset = Math.max(0, parseInt(offset) || 0);
    const parsedLimit = Math.max(1, Math.min(parseInt(limit) || 100, 500));
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    // BUG FIX: Strictly validate floats to prevent NaN pollution in haversine
    const hasGps = !isNaN(userLat) && !isNaN(userLng);
    const maxRadius = parseFloat(radius) || 100;

    // Determine date range for projection
    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    let rangeEnd = new Date(rangeStart);

    if (date) {
      // Specific date
      // BUG FIX: Prevent RangeError: Invalid time value when given unparseable dates
      const parsedDate = new Date(date + 'T00:00:00');
      if (!isNaN(parsedDate.getTime())) {
        rangeStart.setTime(parsedDate.getTime());
      }
      rangeEnd = new Date(rangeStart);
    } else {
      switch (dateRange) {
        case 'today':
          break; // rangeEnd = rangeStart (same day)
        case 'tomorrow':
          rangeStart.setDate(rangeStart.getDate() + 1);
          rangeEnd = new Date(rangeStart);
          break;
        case 'week':
          rangeEnd.setDate(rangeEnd.getDate() + 6);
          break;
        case 'weekend': {
          // Friday through Sunday
          const daysTillFri = (5 - rangeStart.getDay() + 7) % 7;
          rangeStart.setDate(rangeStart.getDate() + daysTillFri);
          rangeEnd = new Date(rangeStart);
          rangeEnd.setDate(rangeEnd.getDate() + 2);
          break;
        }
        case '30days':
          rangeEnd.setDate(rangeEnd.getDate() + 29);
          break;
        case '14days':
        default:
          rangeEnd.setDate(rangeEnd.getDate() + 13);
          break;
      }
    }

    const rangeStartKey = getDateKey(rangeStart);
    const rangeEndKey = getDateKey(rangeEnd);

    // BUG FIX: declare safeState/safeCity at handler scope (not inside try)
    // so they are visible to all three source query blocks below.
    // Was previously declared as `const` inside the try{} block — a ReferenceError
    // waiting to happen if the venue cache threw before the series/tour queries ran.
    const safeState = state ? state.replace(/[%_\\]/g, '').trim() : null;
    const safeCity  = city  ? city.replace(/[%_\\]/g, '').trim() : null;
    const safeGameType = gameType ? gameType.replace(/[%_\\]/g, '').trim() : null;

    // ──────────────────────────────────────────────────────────────
    // Build venue location cache for distance and state/city lookup
    // ──────────────────────────────────────────────────────────────
    let venueLocations = {};
    try {
      let venueQ = sb.from('poker_venues')
        .select('id, name, city, state, latitude, longitude')
        .eq('is_active', true);
      if (safeState) venueQ = venueQ.ilike('state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
      if (safeCity)  venueQ = venueQ.ilike('city', `%${safeCity}%`);
      const { data: venueRows } = await venueQ.limit(2000);
      if (venueRows) {
        for (const v of venueRows) {
          venueLocations[v.id] = v;
          if (v.name) venueLocations[v.name.toLowerCase()] = v;
        }
      }
    } catch (_) { /* non-fatal */ }

    // Helper: resolve venue info from ID or name
    const getVenueInfo = (venueId, venueName) => {
      return venueLocations[venueId] || venueLocations[venueName?.toLowerCase()] || null;
    };

    // ──────────────────────────────────────────────────────────────
    // SOURCE 1: Daily Tournaments (recurring + dated)
    // ──────────────────────────────────────────────────────────────
    let dailyEvents = [];
    if (eventType === 'all' || eventType === 'daily') {
      try {
        let dq = sb.from('venue_daily_tournaments')
          .select('venue_id, venue_name, day_of_week, start_time, buy_in, game_type, tournament_name, guaranteed, starting_stack, format, event_date, is_recurring')
          .eq('is_active', true)
          .eq('is_suppressed', false);

        if (minBuyin) dq = dq.gte('buy_in', parseInt(minBuyin));
        if (maxBuyin) dq = dq.lte('buy_in', parseInt(maxBuyin));
        
        if (safeGameType && safeGameType !== 'all') {
          dq = dq.ilike('game_type', `%${safeGameType}%`);
        }
        if (search) {
          const s = search.replace(/[()'",;%_\\]/g, '').trim().slice(0, 200);
          if (s) dq = dq.or(`venue_name.ilike.%${s}%,tournament_name.ilike.%${s}%`);
        }

        const { data: dtRows } = await dq.limit(5000);

        if (dtRows) {
          for (const t of dtRows) {
            // BUG FIX: filter out @context / JSON-LD artifacts and invalid tournament names
            const tName = t.tournament_name || '';
            if (tName.startsWith('@') || tName.startsWith('{') || tName.startsWith('[')) continue;

            const venueInfo = getVenueInfo(t.venue_id, t.venue_name);

            // State/city filter at application level (use sanitized values)
            if (safeState && venueInfo?.state?.toUpperCase() !== safeState.toUpperCase()) continue;
            if (safeCity && !venueInfo?.city?.toLowerCase().includes(safeCity.toLowerCase())) continue;

            // GPS/distance filter
            let distanceMi = null;
            if (hasGps) {
              if (venueInfo?.latitude && venueInfo?.longitude) {
                distanceMi = Math.round(haversineMi(userLat, userLng, parseFloat(venueInfo.latitude), parseFloat(venueInfo.longitude)) * 10) / 10;
                if (distanceMi > maxRadius) continue;
              } else {
                continue; // GPS Search Requested: Reject venues with no stored coordinates
              }
            }

            // Project recurring tournaments onto specific dates
            let eventDates = [];
            if (t.event_date) {
              // Specific dated event
              if (t.event_date >= rangeStartKey && t.event_date <= rangeEndKey) {
                eventDates.push(t.event_date);
              }
            } else {
              // Recurring — project day_of_week onto date range
              eventDates = projectDayToDate(t.day_of_week, rangeStart, rangeEnd);
            }

            for (const eDate of eventDates) {
              dailyEvents.push({
                source: 'daily',
                event_date: eDate,
                event_name: tName || (t.buy_in > 0 ? `$${t.buy_in} ${normalizeGameType(t.game_type)}` : `${normalizeGameType(t.game_type)} Tournament`),
                venue_name: t.venue_name,
                venue_id: t.venue_id,
                city: venueInfo?.city || null,
                state: venueInfo?.state || null,
                buy_in: t.buy_in > 0 ? t.buy_in : null,
                buy_in_display: t.buy_in > 0 ? formatMoney(t.buy_in) : null,
                game_type: normalizeGameType(t.game_type),
                guaranteed: t.guaranteed > 0 ? t.guaranteed : null,
                guaranteed_display: t.guaranteed > 0 ? formatMoney(t.guaranteed) : null,
                start_time: t.start_time || null,
                starting_stack: t.starting_stack || null,
                format: t.format || null,
                distance_mi: distanceMi,
                latitude: venueInfo?.latitude ? parseFloat(venueInfo.latitude) : null,
                longitude: venueInfo?.longitude ? parseFloat(venueInfo.longitude) : null,
              });
            }
          }
        }
      } catch (e) {
        console.error('[events-calendar] Daily tournaments error:', e.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // SOURCE 2: Poker Series
    // ──────────────────────────────────────────────────────────────
    let seriesEvents = [];
    if (eventType === 'all' || eventType === 'series') {
      try {
        let sq = sb.from('poker_series')
          .select('id, series_name, venue_name, venue_id, city, state, start_date, end_date, buy_in_min, buy_in_max, main_event_buyin, total_guaranteed, main_event_guaranteed, tour_code, series_type, events_count, is_featured, short_name, logo_url')
          .not('start_date', 'is', null)
          .eq('is_suppressed', false);

        // BUG FIX: use sanitized safeState/safeCity from venue query block above
        if (safeState) sq = sq.ilike('state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
        if (safeCity)  sq = sq.ilike('city', `%${safeCity}%`);
        if (search) {
          const ss = search.replace(/[()'",;%_\\]/g, '').trim().slice(0, 200);
          if (ss) sq = sq.or(`series_name.ilike.%${ss}%,venue_name.ilike.%${ss}%`);
        }

        const { data: seriesRows } = await sq.limit(500);

        if (seriesRows) {
          for (const s of seriesRows) {
            // Check if date range overlaps with our query range
            const sStart = s.start_date || '';
            const sEnd = s.end_date || sStart;
            if (sEnd < rangeStartKey || sStart > rangeEndKey) continue;

            // Buy-in filter (use buy_in_min and buy_in_max)
            if (minBuyin && (s.buy_in_max || 0) < parseInt(minBuyin)) continue;
            if (maxBuyin && (s.buy_in_min || 0) > parseInt(maxBuyin)) continue;

            // GPS distance
            const venueInfo = getVenueInfo(s.venue_id, s.venue_name);
            let distanceMi = null;
            if (hasGps) {
              if (venueInfo?.latitude && venueInfo?.longitude) {
                distanceMi = Math.round(haversineMi(userLat, userLng, parseFloat(venueInfo.latitude), parseFloat(venueInfo.longitude)) * 10) / 10;
                if (distanceMi > maxRadius) continue;
              } else {
                continue; // GPS Search Requested: Reject venues with no stored coordinates
              }
            }

            // Use start_date as the event date
            const eventDate = sStart > rangeStartKey ? sStart : rangeStartKey;

            seriesEvents.push({
              source: 'series',
              event_date: eventDate,
              end_date: sEnd,
              event_name: s.series_name || s.short_name || 'Poker Series',
              venue_name: s.venue_name || null,
              venue_id: s.venue_id || null,
              series_id: s.id,
              city: s.city || venueInfo?.city || null,
              state: s.state || venueInfo?.state || null,
              buy_in: s.main_event_buyin || s.buy_in_min || null,
              buy_in_display: formatMoney(s.main_event_buyin || s.buy_in_min),
              buy_in_range: s.buy_in_min && s.buy_in_max ? `${formatMoney(s.buy_in_min)} - ${formatMoney(s.buy_in_max)}` : null,
              game_type: s.series_type || 'NLH',
              guaranteed: s.total_guaranteed || s.main_event_guaranteed || null,
              guaranteed_display: formatMoney(s.total_guaranteed || s.main_event_guaranteed),
              start_time: null,
              events_count: s.events_count || null,
              tour_code: s.tour_code || null,
              is_featured: s.is_featured || false,
              distance_mi: distanceMi,
              latitude: venueInfo?.latitude ? parseFloat(venueInfo.latitude) : null,
              longitude: venueInfo?.longitude ? parseFloat(venueInfo.longitude) : null,
              logo_url: s.logo_url || null,
            });
          }
        }
      } catch (e) {
        console.error('[events-calendar] Series error:', e.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // SOURCE 3: Tour Stop Events
    // ──────────────────────────────────────────────────────────────
    let tourEvents = [];
    if (eventType === 'all' || eventType === 'tour') {
      try {
        let tq = sb.from('tour_stop_events')
          .select('id, tour_code, stop_name, stop_venue, stop_city, stop_state, event_name, start_date, start_time, buy_in, game_type, guarantee, is_main_event, is_high_roller');

        // BUG FIX: filter inactive/cancelled tour events; sanitize all ILIKE params
        tq = tq.eq('is_active', true);
        if (safeState) tq = tq.ilike('stop_state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
        if (minBuyin) tq = tq.gte('buy_in', parseInt(minBuyin));
        if (maxBuyin) tq = tq.lte('buy_in', parseInt(maxBuyin));
        if (safeGameType && safeGameType !== 'all') tq = tq.ilike('game_type', `%${safeGameType}%`);
        if (search) {
          const ts = search.replace(/[()'",;%_\\]/g, '').trim().slice(0, 200);
          if (ts) tq = tq.or(`event_name.ilike.%${ts}%,stop_name.ilike.%${ts}%,stop_venue.ilike.%${ts}%`);
        }

        const { data: tourRows } = await tq.limit(2000);

        if (tourRows) {
          for (const t of tourRows) {
            // Date filter — only include if start_date is within range (or if no date, include anyway)
            if (t.start_date) {
              if (t.start_date < rangeStartKey || t.start_date > rangeEndKey) continue;
            }

            // City filter
            if (city && !t.stop_city?.toLowerCase().includes(city.toLowerCase())) continue;

            // Distance filter — try to find venue coords
            let distanceMi = null;
            if (hasGps) {
              const venueInfo = getVenueInfo(null, t.stop_venue);
              if (venueInfo?.latitude && venueInfo?.longitude) {
                distanceMi = Math.round(haversineMi(userLat, userLng, parseFloat(venueInfo.latitude), parseFloat(venueInfo.longitude)) * 10) / 10;
                if (distanceMi > maxRadius) continue;
              } else {
                continue; // GPS Search Requested: Reject venues with no stored coordinates
              }
            }

            tourEvents.push({
              source: 'tour',
              event_date: t.start_date || null,
              event_name: t.event_name || t.stop_name || 'Tour Event',
              venue_name: t.stop_venue || null,
              venue_id: null,
              tour_event_id: t.id,
              city: t.stop_city || null,
              state: t.stop_state || null,
              buy_in: t.buy_in || null,
              buy_in_display: formatMoney(t.buy_in),
              game_type: normalizeGameType(t.game_type),
              guaranteed: t.guarantee || null,
              guaranteed_display: formatMoney(t.guarantee),
              start_time: t.start_time || null,
              tour_code: t.tour_code,
              stop_name: t.stop_name,
              is_main_event: t.is_main_event || false,
              is_high_roller: t.is_high_roller || false,
              distance_mi: distanceMi,
            });
          }
        }
      } catch (e) {
        console.error('[events-calendar] Tour events error:', e.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // MERGE + DEDUP + SORT
    // ──────────────────────────────────────────────────────────────
    let allEvents = [...dailyEvents, ...seriesEvents, ...tourEvents];

    // Dedup: same venue + same date + same time + same buy_in = duplicate
    const seenKeys = new Set();
    allEvents = allEvents.filter(e => {
      const key = [
        (e.venue_name || '').toLowerCase().trim(),
        e.event_date || '',
        (e.start_time || '').toLowerCase().trim(),
        (e.buy_in || 0).toString(),
      ].join('|');
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    // Sort
    switch (sort) {
      case 'buyin':
        allEvents.sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
        break;
      case 'buyin_desc':
        allEvents.sort((a, b) => (b.buy_in || 0) - (a.buy_in || 0));
        break;
      case 'distance':
        allEvents.sort((a, b) => (a.distance_mi ?? 99999) - (b.distance_mi ?? 99999));
        break;
      case 'time':
        allEvents.sort((a, b) => parseTimeMinutes(a.start_time) - parseTimeMinutes(b.start_time));
        break;
      case 'date':
      default:
        allEvents.sort((a, b) => {
          const dateComp = (a.event_date || 'zzzz').localeCompare(b.event_date || 'zzzz');
          if (dateComp !== 0) return dateComp;
          return parseTimeMinutes(a.start_time) - parseTimeMinutes(b.start_time);
        });
        break;
    }

    const totalCount = allEvents.length;
    const paginatedEvents = allEvents.slice(parsedOffset, parsedOffset + parsedLimit);

    // Build date summary for calendar view
    const dateCountMap = {};
    for (const e of allEvents) {
      if (e.event_date) {
        dateCountMap[e.event_date] = (dateCountMap[e.event_date] || 0) + 1;
      }
    }

    // Stats
    const buyIns = allEvents.map(e => e.buy_in).filter(b => b != null && b > 0);
    const gameTypes = {};
    allEvents.forEach(e => { gameTypes[e.game_type || 'Unknown'] = (gameTypes[e.game_type || 'Unknown'] || 0) + 1; });
    const sourceCounts = { daily: dailyEvents.length, series: seriesEvents.length, tour: tourEvents.length };

    return res.status(200).json({
      success: true,
      events: paginatedEvents,
      total: totalCount,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore: parsedOffset + parsedLimit < totalCount,
      dateRange: { start: rangeStartKey, end: rangeEndKey },
      dateCounts: dateCountMap,
      stats: {
        sources: sourceCounts,
        totalBeforeDedup: dailyEvents.length + seriesEvents.length + tourEvents.length,
        avgBuyin: buyIns.length > 0 ? Math.round(buyIns.reduce((s, b) => s + b, 0) / buyIns.length) : 0,
        minBuyin: buyIns.length > 0 ? Math.min(...buyIns) : 0,
        maxBuyin: buyIns.length > 0 ? Math.max(...buyIns) : 0,
        byGameType: gameTypes,
      },
    });
  } catch (err) {
    console.error('[events-calendar] Fatal error:', err);
    return res.status(200).json({
      success: false,
      error: err.message,
      events: [],
      total: 0,
      dateCounts: {},
      stats: {},
    });
  }
}

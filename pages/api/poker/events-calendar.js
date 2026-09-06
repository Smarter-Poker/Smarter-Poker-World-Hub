/**
 * Unified Events Calendar API
 * ============================
 * Aggregates ALL tournament data into a single searchable feed:
 *   1. venue_daily_tournaments (9,697 active) — recurring venue tournaments
 *   2. poker_series (208) — multi-day series with date ranges
 *   3. tour_stop_events (598) + tour_event_details (462) — traveling tour events
 *   4. public Commander home-game tournaments
 *
 * GET /api/poker/events-calendar
 *   ?day=Monday|Tuesday|...|all         Day filter (recurring tournaments)
 *   ?date=2026-04-18                    Specific date filter
 *   ?dateRange=today|tomorrow|week|weekend|14days|30days|60days|90days|180days|365days
 *   ?state=TX                           State filter
 *   ?city=Houston                       City filter
 *   ?lat=29.7&lng=-95.3&radius=100      GPS + radius (miles)
 *   ?minBuyin=50&maxBuyin=500           Buy-in range
 *   ?gameType=NLH|PLO|Mixed             Game type filter
 *   ?eventType=daily|series|tour|home_game|all    Event source filter
 *   ?search=Lodge                       Free text search
 *   ?sort=date|buyin|distance           Sort order
 *   ?offset=0&limit=100                 Pagination
 *   ?calMonth=2026-08                   Load all events for a specific calendar month (YYYY-MM)
 */

import { withSentry } from '../../../src/lib/sentry';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
  fetchAllRows,
  isValidIsoDate,
  isValidIsoMonth,
} from '../../../src/lib/poker-near-me/dailyTournamentData.mjs';

// Hoisted out of getVenueInfo's inner loop — this used to run twice per
// candidate comparison on the hot path.
const VENUE_NOISE_WORDS = /\b(casino|resort|hotel|poker|room|card)\b/g;
function stripVenueWords(s) {
  return (s || '').replace(VENUE_NOISE_WORDS, '').trim().replace(/\s+/g, ' ');
}

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // [EC1 FIX] Warn if falling back to anon key — anon key means RLS applies and rows may be silently filtered.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[events-calendar] WARNING: SUPABASE_SERVICE_ROLE_KEY missing - using anon key; RLS will apply and some rows may be silently filtered.');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// For ranges beyond this many days, recurring daily events are shown as
// "next occurrence only" (one row per unique tournament) to avoid millions
// of projected rows.
const SMART_AGG_THRESHOLD = 30;
const CALENDAR_SOURCE_MAX_ROWS = 50000;

function getCurrentDayInfo() {
  const localTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const d = new Date(localTime);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    dayIndex: d.getDay(),
    dayName: DAYS_ORDER[d.getDay()],
    dateKey: `${yyyy}-${mm}-${dd}`,
  };
}

function getDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Project recurring day_of_week onto actual dates in [startDate, endDate].
 * For wide ranges (> SMART_AGG_THRESHOLD days), returns only the FIRST
 * occurrence to prevent billions of rows.
 */
function projectDayToDate(dayOfWeek, startDate, endDate, smartAgg = false) {
  const dayLower = (dayOfWeek || '').toLowerCase().trim();
  const dates = [];

  const isDaily = dayLower === 'daily';
  const targetDayIdx = isDaily ? -1 : DAYS_ORDER.indexOf(dayLower);

  if (!isDaily && targetDayIdx === -1) return dates;

  const current = new Date(startDate);
  while (current <= endDate) {
    if (isDaily || current.getDay() === targetDayIdx) {
      dates.push(getDateKey(current));
      // In smart-aggregation mode, only return the NEXT single occurrence
      if (smartAgg) break;
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Haversine distance in miles
function haversineMi(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null || isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return Infinity;
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

function parseTimeMinutes(timeStr) {
  if (!timeStr) return 720;
  timeStr = String(timeStr).trim();
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    const h = parseInt(match24[1]);
    const m = parseInt(match24[2]);
    return h * 60 + m;
  }
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

// TIME FLOOR GUARD — mirrors daily-tournaments.js. The scraper produces
// 12 AM / 1 AM artifact rows that are not real tournaments; that feed hides
// them, this one used to render them as genuine morning events.
const SUSPICIOUS_TIME_FLOOR_MINUTES = 600; // 10:00 AM

/**
 * Strict start-time parser: minutes since midnight, or -1 when the value is
 * absent/TBD/unparseable. Distinct from parseTimeMinutes(), which defaults
 * unparseable values to noon and so cannot be used for the floor guard.
 */
function parseStartTimeStrict(timeStr) {
  if (!timeStr) return -1;
  const t = String(timeStr).trim();
  let m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const mn = parseInt(m[2], 10);
    const p = (m[3] || '').toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    if (h > 23 || mn > 59) return -1;
    return h * 60 + mn;
  }
  m = t.match(/^(\d{1,2})\s*([AP]M)$/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const p = m[2].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    if (h > 23) return -1;
    return h * 60;
  }
  return -1;
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return null;
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'K';
  return '$' + amount.toLocaleString();
}

// In-memory cache to massively speed up page loads for identical non-realtime queries
const routeCache = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds

async function handler(req, res) {
    try {
      if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // CDN cache: Dynamic real-time capability override
      if (req.query._rt) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        
        // Memory Cache Check
        const cacheKey = JSON.stringify(req.query);
        if (routeCache.has(cacheKey)) {
          const cached = routeCache.get(cacheKey);
          if (Date.now() - cached.time < CACHE_TTL_MS) {
            return res.status(200).json(cached.data);
          }
        }
      }

      if (!applyRateLimit(req, res, LIMITS.read)) return;

    let {
      day,
      date,
      dateRange = '30days',
      state,
      city,
      lat, lng, radius = '100',
      minBuyin, maxBuyin,
      gameType,
      eventType = 'all',
      search,
      sort = 'date',
      offset = '0',
      limit = '200',
      calMonth,  // YYYY-MM — loads all events for a specific calendar month
    } = req.query;

    // BUG FIX: Array Query Injection Vector
    const safeString = (val) => Array.isArray(val) ? val[0] : val;
    day = safeString(day);
    date = safeString(date);
    dateRange = safeString(dateRange) || '30days';
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
    limit = safeString(limit) || '200';
    calMonth = safeString(calMonth);

    if (date && !isValidIsoDate(date)) {
      return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD date' });
    }
    if (calMonth && !isValidIsoMonth(calMonth)) {
      return res.status(400).json({ success: false, error: 'calMonth must be a valid YYYY-MM month' });
    }
    if (date && calMonth) {
      return res.status(400).json({ success: false, error: 'Use either date or calMonth, not both' });
    }

    const sb = getSupabase();
    const { dayIndex, dayName, dateKey: todayKey } = getCurrentDayInfo();
    const parsedOffset = Math.max(0, parseInt(offset) || 0);
    // Month and range feeds stay bounded, while an explicit date drill-down
    // may return the full day so the calendar count and opened list reconcile.
    const responseLimit = date ? 10000 : 1000;
    const parsedLimit = Math.max(1, Math.min(parseInt(limit) || 200, responseLimit));
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const hasGps = !isNaN(userLat) && !isNaN(userLng);
    const hasExplicitRadius = hasGps && req.query.radius != null;
    const maxRadius = parseFloat(radius) || 100;

    // Determine date range for projection
    const localTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const rangeStart = new Date(localTime);
    rangeStart.setHours(0, 0, 0, 0);
    let rangeEnd = new Date(rangeStart);

    // calMonth override: load the entire calendar month specified
    if (calMonth) {
      const [cy, cm] = calMonth.split('-').map(Number);
      rangeStart.setFullYear(cy, cm - 1, 1);
      rangeEnd = new Date(cy, cm, 0); // last day of the month
    } else if (date) {
      // [EC5 FIX] Was 'T00:00:00' which creates a local-timezone datetime.
      // Server TZ may differ from user's TZ; dates near midnight shift by hours.
      // Parse as 'T12:00:00Z' (noon UTC) then extract UTC components to avoid any offset drift.
      const parsedDate = new Date(date + 'T12:00:00Z');
      if (!isNaN(parsedDate.getTime())) {
        rangeStart.setFullYear(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate());
      }
      rangeEnd = new Date(rangeStart);
    } else {
      switch (dateRange) {
        case 'today':
          break;
        case 'tomorrow':
          rangeStart.setDate(rangeStart.getDate() + 1);
          rangeEnd = new Date(rangeStart);
          break;
        case 'week':
          rangeEnd.setDate(rangeEnd.getDate() + 6);
          break;
        case 'weekend': {
          const daysTillFri = (5 - rangeStart.getDay() + 7) % 7;
          rangeStart.setDate(rangeStart.getDate() + daysTillFri);
          rangeEnd = new Date(rangeStart);
          rangeEnd.setDate(rangeEnd.getDate() + 2);
          break;
        }
        case '14days':
          rangeEnd.setDate(rangeEnd.getDate() + 13);
          break;
        case '30days':
          rangeEnd.setDate(rangeEnd.getDate() + 29);
          break;
        case '60days':
          rangeEnd.setDate(rangeEnd.getDate() + 59);
          break;
        case '90days':
          rangeEnd.setDate(rangeEnd.getDate() + 89);
          break;
        case '180days':
          rangeEnd.setDate(rangeEnd.getDate() + 179);
          break;
        case '365days':
          rangeEnd.setDate(rangeEnd.getDate() + 364);
          break;
        default:
          rangeEnd.setDate(rangeEnd.getDate() + 29);
          break;
      }
    }

    const rangeStartKey = getDateKey(rangeStart);
    const rangeEndKey = getDateKey(rangeEnd);

    // Calculate range length in days (for smart aggregation)
    const rangeDays = Math.round((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1;
    const useSmartAgg = rangeDays > SMART_AGG_THRESHOLD;

    // [EC6 FIX] Added [ and ] to state/city/gameType sanitization.
    // PostgREST uses [ in filter operator syntax — same injection vector fixed in series.js.
    const safeState = state ? state.replace(/[%_\\\[\]]/g, '').trim() : null;
    const safeCity  = city  ? city.replace(/[%_\\\[\]]/g, '').trim() : null;
    const safeGameType = gameType ? gameType.replace(/[%_\\\[\]]/g, '').trim() : null;

    // ──────────────────────────────────────────────────────────────
    // Build venue location cache for distance and state/city lookup
    // ──────────────────────────────────────────────────────────────
    let venueLocations = {};
    let venueNamesList = [];
    // Per-source degradation flags. A failed PostgREST query used to be
    // indistinguishable from "no tournaments anywhere": the loops destructured
    // only `{ data }`, so an error produced `undefined`, the loop broke, and the
    // response still said success:true / total:0.
    const sourceDegraded = { venues: false, daily: false, series: false, tour: false, home: false };
    try {
      const buildVenueQuery = () => {
        let query = sb.from('poker_venues')
          .select('id, name, city, state, latitude, longitude, logo_url, venue_type')
          .eq('is_active', true)
          .order('id', { ascending: true });
        if (safeState) query = query.ilike('state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
        if (safeCity) query = query.ilike('city', `%${safeCity}%`);
        return query;
      };
      const venueResult = await fetchAllRows(buildVenueQuery, { maxRows: CALENDAR_SOURCE_MAX_ROWS });
      if (venueResult.error || venueResult.truncated) {
        sourceDegraded.venues = true;
        console.warn('[events-calendar] poker_venues incomplete:', venueResult.error?.message || `exceeded ${CALENDAR_SOURCE_MAX_ROWS} rows`);
      } else {
        for (const v of venueResult.rows) {
          venueLocations[v.id] = v;
          if (v.name) {
            const cleanName = v.name.toLowerCase().trim();
            venueLocations[cleanName] = v;
            venueNamesList.push({ name: cleanName, venue: v, stripped: stripVenueWords(cleanName) });
          }
        }
      }
    } catch (_) {
      sourceDegraded.venues = true;
      console.warn('[App] Handled exception:', _?.message || _);
    }

    // Index the stripped venue names once. `getVenueInfo` is called once per
    // tournament row (up to 10,000) and once per series row; on a direct-lookup
    // miss it used to linearly scan up to 3,000 venues and re-run the strip
    // regex on the candidate name inside that loop — tens of millions of regex
    // operations per uncached request. Exact stripped-name hits are now a hash
    // lookup; only the genuinely partial matches fall through to a scan, and
    // that scan no longer recomputes anything.
    const strippedIndex = new Map();
    for (const vf of venueNamesList) {
      if (vf.stripped && vf.stripped.length > 3 && !strippedIndex.has(vf.stripped)) {
        strippedIndex.set(vf.stripped, vf.venue);
      }
    }

    const getVenueInfo = (venueId, venueName) => {
      const vNameClean = venueName ? venueName.toLowerCase().trim() : null;
      if (venueLocations[venueId]) return venueLocations[venueId];
      if (vNameClean && venueLocations[vNameClean]) return venueLocations[vNameClean];

      // Fuzzy fallback match for when tournament venue_name omits suffixes like "Las Vegas"
      if (vNameClean && vNameClean.length > 3) {
        const s1 = stripVenueWords(vNameClean);
        if (s1.length > 3) {
          const exact = strippedIndex.get(s1);
          if (exact) return exact;
          for (const vf of venueNamesList) {
            const s2 = vf.stripped;
            if (s2 && s2.length > 3 && (s1.includes(s2) || s2.includes(s1))) {
              return vf.venue;
            }
          }
        }
      }
      return null;
    };

    // ──────────────────────────────────────────────────────────────
    // SOURCE 1: Daily Tournaments (recurring + dated)
    // ──────────────────────────────────────────────────────────────
    let dailyEvents = [];
    if (eventType === 'all' || eventType === 'daily') {
      try {
        const buildDailyQuery = () => {
          let query = sb.from('venue_daily_tournaments')
            // `is_recurring` was selected but never read; recurrence is
            // recomputed below as `!t.event_date`.
            .select('id, venue_id, venue_name, day_of_week, start_time, buy_in, game_type, tournament_name, guaranteed, starting_stack, format, event_date, scrape_timestamp')
            .eq('is_active', true)
            .in('data_quality', ['scraped_verified', 'scraped_inferred', 'manual_research'])
            .or('is_suppressed.is.null,is_suppressed.eq.false')
            .order('id', { ascending: true });
          if (minBuyin) query = query.gte('buy_in', parseInt(minBuyin));
          if (maxBuyin) query = query.lte('buy_in', parseInt(maxBuyin));
          if (safeGameType && safeGameType !== 'all') query = query.ilike('game_type', `%${safeGameType}%`);
          if (search) {
            const s = search.replace(/[()'"`,;%_\\]/g, '').trim().slice(0, 200);
            if (s) query = query.or(`venue_name.ilike.%${s}%,tournament_name.ilike.%${s}%`);
          }
          return query;
        };
        const dailyResult = await fetchAllRows(buildDailyQuery, { maxRows: CALENDAR_SOURCE_MAX_ROWS });
        const dtRows = dailyResult.error || dailyResult.truncated ? [] : dailyResult.rows;
        if (dailyResult.error || dailyResult.truncated) {
          sourceDegraded.daily = true;
          console.warn('[events-calendar] venue_daily_tournaments incomplete:', dailyResult.error?.message || `exceeded ${CALENDAR_SOURCE_MAX_ROWS} rows`);
        }

        if (dtRows) {
          for (const t of dtRows) {
            const tName = t.tournament_name || '';
            if (tName.startsWith('@') || tName.startsWith('{') || tName.startsWith('[')) continue;

            // Drop pre-10AM scraper artifacts (keep TBD/unparseable times),
            // matching the daily-tournaments feed.
            const startMins = parseStartTimeStrict(t.start_time);
            if (startMins >= 0 && startMins < SUSPICIOUS_TIME_FLOOR_MINUTES) continue;

            const venueInfo = getVenueInfo(t.venue_id, t.venue_name);

            if (safeState && venueInfo?.state?.toUpperCase() !== safeState.toUpperCase()) continue;
            if (safeCity && !venueInfo?.city?.toLowerCase().includes(safeCity.toLowerCase())) continue;

            let distanceMi = null;
            if (hasGps && venueInfo?.latitude && venueInfo?.longitude) {
              distanceMi = Math.round(haversineMi(userLat, userLng, parseFloat(venueInfo.latitude), parseFloat(venueInfo.longitude)) * 10) / 10;
              if (distanceMi > maxRadius) continue;
            } else if (hasExplicitRadius && !(venueInfo?.latitude && venueInfo?.longitude)) {
              continue;
            }

            let eventDates = [];
            if (t.event_date) {
              if (t.event_date >= rangeStartKey && t.event_date <= rangeEndKey) {
                eventDates.push(t.event_date);
              }
            } else {
              // For long ranges: show only first occurrence per recurring tournament
              eventDates = projectDayToDate(t.day_of_week, rangeStart, rangeEnd, useSmartAgg);
            }

            for (const eDate of eventDates) {
              dailyEvents.push({
                source: 'daily',
                source_event_id: t.id,
                daily_tournament_id: t.id,
                event_date: eDate,
                is_recurring: !t.event_date,  // flag for display
                recurrence_label: !t.event_date && useSmartAgg ? (t.day_of_week || 'Weekly') : null,
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
                logo_url: venueInfo?.logo_url || null,
                // Charity events are stored in venue_daily_tournaments alongside
                // casino dailies (the charity scrapers write here; the separate
                // charity_events_schedule table is empty and write-orphaned).
                // Tag them so the UI can filter/badge without a second source.
                is_charity: (venueInfo?.venue_type || '').toLowerCase().includes('charity'),
                // PROVENANCE: surface scrape freshness so the calendar can flag rows
                // that have not been re-verified recently, mirroring live-tables.js.
                // Unknown timestamp is treated as stale (do not imply freshness we lack).
                last_verified: t.scrape_timestamp || null,
                is_stale: t.scrape_timestamp
                  ? (Date.now() - new Date(t.scrape_timestamp).getTime()) > 30 * 24 * 60 * 60 * 1000
                  : true,
              });
            }
          }
        }
      } catch (e) {
        sourceDegraded.daily = true;
        console.warn('[events-calendar] Daily tournaments error:', e.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // SOURCE 2: Poker Series
    // ──────────────────────────────────────────────────────────────
    let seriesEvents = [];
    if (eventType === 'all' || eventType === 'series') {
      try {
        const buildSeriesQuery = () => {
          let query = sb.from('poker_series')
            .select('id, series_name, venue_name, venue_id, city, state, start_date, end_date, buy_in_min, buy_in_max, main_event_buyin, total_guaranteed, main_event_guaranteed, tour_code, series_type, events_count, is_featured, short_name, logo_url, scrape_timestamp')
            .not('start_date', 'is', null)
            .or('is_suppressed.is.null,is_suppressed.eq.false')
            .order('id', { ascending: true });
          if (safeState) query = query.ilike('state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
          if (safeCity) query = query.ilike('city', `%${safeCity}%`);
          if (safeGameType && safeGameType !== 'all') query = query.ilike('series_type', `%${safeGameType}%`);
          if (search) {
            const ss = search.replace(/[()'"`,;%_\\]/g, '').trim().slice(0, 200);
            if (ss) query = query.or(`series_name.ilike.%${ss}%,venue_name.ilike.%${ss}%`);
          }
          return query;
        };
        const seriesResult = await fetchAllRows(buildSeriesQuery, { maxRows: CALENDAR_SOURCE_MAX_ROWS });
        const seriesRows = seriesResult.error || seriesResult.truncated ? [] : seriesResult.rows;
        if (seriesResult.error || seriesResult.truncated) {
          sourceDegraded.series = true;
          console.warn('[events-calendar] poker_series incomplete:', seriesResult.error?.message || `exceeded ${CALENDAR_SOURCE_MAX_ROWS} rows`);
        }

        if (seriesRows) {
          for (const s of seriesRows) {
            const sStart = s.start_date || '';
            const sEnd = s.end_date || sStart;
            if (sEnd < rangeStartKey || sStart > rangeEndKey) continue;

            const resolvedMax = s.buy_in_max != null ? s.buy_in_max : s.buy_in_min;
            const resolvedMin = s.buy_in_min != null ? s.buy_in_min : s.buy_in_max;
            if (minBuyin && (resolvedMax || 0) < parseInt(minBuyin)) continue;
            if (maxBuyin && (resolvedMin || 0) > parseInt(maxBuyin)) continue;

            const venueInfo = getVenueInfo(s.venue_id, s.venue_name);
            let distanceMi = null;
            if (hasGps && venueInfo?.latitude && venueInfo?.longitude) {
              distanceMi = Math.round(haversineMi(userLat, userLng, parseFloat(venueInfo.latitude), parseFloat(venueInfo.longitude)) * 10) / 10;
              if (distanceMi > maxRadius) continue;
            } else if (hasExplicitRadius && !(venueInfo?.latitude && venueInfo?.longitude)) {
              continue;
            }

            // Calculate the valid overlapping date range between the search window and the series window
            const curStart = new Date(sStart + 'T12:00:00Z');
            const curEnd = new Date(sEnd + 'T12:00:00Z');
            const rStartDate = new Date(rangeStartKey + 'T12:00:00Z');
            const rEndDate = new Date(rangeEndKey + 'T12:00:00Z');
            
            const loopStart = curStart < rStartDate ? rStartDate : curStart;
            const loopEnd = curEnd > rEndDate ? rEndDate : curEnd;

            const datesToPush = [];
            let cDate = new Date(loopStart);
            while (cDate <= loopEnd) {
              datesToPush.push(getDateKey(cDate));
              cDate.setDate(cDate.getDate() + 1);
              // Safety limit to prevent memory blowout if data issue (e.g. 5 year long series)
              if (datesToPush.length > 90) break;
            }

            for (const dk of datesToPush) {
              seriesEvents.push({
                source: 'series',
                source_event_id: s.id,
                event_date: dk,
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
                // Freshness contract (same pattern as daily tournaments):
                // series data with no recent re-verification is flagged, not hidden.
                last_verified: s.scrape_timestamp || null,
                is_stale: s.scrape_timestamp
                  ? (Date.now() - new Date(s.scrape_timestamp).getTime()) > 14 * 24 * 60 * 60 * 1000
                  : true,
              });
            }
          }
        }
      } catch (e) {
        sourceDegraded.series = true;
        console.warn('[events-calendar] Series error:', e.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // SOURCE 3: Tour Stop Events
    // ──────────────────────────────────────────────────────────────
    let tourEvents = [];
    if (eventType === 'all' || eventType === 'tour') {
      try {
        const buildTourQuery = () => {
          let query = sb.from('tour_stop_events')
            .select('id, tour_code, stop_name, stop_venue, stop_city, stop_state, event_name, start_date, start_time, buy_in, game_type, guarantee, is_main_event, is_high_roller, scrape_timestamp')
            .order('id', { ascending: true });
          if (safeState) query = query.ilike('stop_state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
          if (minBuyin) query = query.gte('buy_in', parseInt(minBuyin));
          if (maxBuyin) query = query.lte('buy_in', parseInt(maxBuyin));
          if (safeGameType && safeGameType !== 'all') query = query.ilike('game_type', `%${safeGameType}%`);
          if (search) {
            const ts = search.replace(/[()'"`,;%_\\]/g, '').trim().slice(0, 200);
            if (ts) query = query.or(`event_name.ilike.%${ts}%,stop_name.ilike.%${ts}%,stop_venue.ilike.%${ts}%`);
          }
          return query;
        };
        const tourResult = await fetchAllRows(buildTourQuery, { maxRows: CALENDAR_SOURCE_MAX_ROWS });
        const tourRows = tourResult.error || tourResult.truncated ? [] : tourResult.rows;
        if (tourResult.error || tourResult.truncated) {
          sourceDegraded.tour = true;
          console.warn('[events-calendar] tour_stop_events incomplete:', tourResult.error?.message || `exceeded ${CALENDAR_SOURCE_MAX_ROWS} rows`);
        }

        if (tourRows) {
          for (const t of tourRows) {
            if (t.start_date) {
              if (t.start_date < rangeStartKey || t.start_date > rangeEndKey) continue;
            }

            if (safeCity && !t.stop_city?.toLowerCase().includes(safeCity.toLowerCase())) continue;

            let distanceMi = null;
            if (hasGps) {
              const venueInfo = getVenueInfo(null, t.stop_venue);
              if (venueInfo?.latitude && venueInfo?.longitude) {
                distanceMi = Math.round(haversineMi(userLat, userLng, parseFloat(venueInfo.latitude), parseFloat(venueInfo.longitude)) * 10) / 10;
                if (distanceMi > maxRadius) continue;
              } else if (hasExplicitRadius) {
                continue;
              }
            }

            tourEvents.push({
              source: 'tour',
              source_event_id: t.id,
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
              last_verified: t.scrape_timestamp || null,
              is_stale: t.scrape_timestamp
                ? (Date.now() - new Date(t.scrape_timestamp).getTime()) > 14 * 24 * 60 * 60 * 1000
                : true,
            });
          }
        }
      } catch (e) {
        sourceDegraded.tour = true;
        console.warn('[events-calendar] Tour events error:', e.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // MERGE + DEDUP + SORT
    // ──────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────
    // SOURCE 4: Home Games (public tournament-format games)
    // Same visibility contract as daily-tournaments.js Phase 20: public,
    // active groups only; 45-day activity cutoff; approximate coords only —
    // never a host's real address.
    // ──────────────────────────────────────────────────────────────
    let homeEvents = [];
    if (eventType === 'all' || eventType === 'home_game') {
      try {
        const HG_INACTIVITY_MS = 45 * 24 * 60 * 60 * 1000;
        const buildHomeGameQuery = () => sb
          .from('commander_home_games')
          .select(`id, title, game_type, stakes, buyin_min, buyin_max, scheduled_date, start_time,
                   max_players, rsvp_yes, status, format, neighborhood, approximate_lat, approximate_lng,
                   group:commander_home_groups!inner ( id, club_code, name, city, state,
                     profile_photo_url, is_private, is_active, last_activity_at, created_at,
                     visibility_override_until )`)
          .eq('format', 'tournament')
          .in('status', ['scheduled', 'in_progress'])
          .gte('scheduled_date', rangeStartKey)
          .lte('scheduled_date', rangeEndKey)
          .eq('group.is_private', false)
          .eq('group.is_active', true)
          .order('id', { ascending: true });
        const homeResult = await fetchAllRows(buildHomeGameQuery, { maxRows: CALENDAR_SOURCE_MAX_ROWS });
        const hgRows = homeResult.error || homeResult.truncated ? [] : homeResult.rows;
        if (homeResult.error || homeResult.truncated) {
          sourceDegraded.home = true;
          console.warn('[events-calendar] home games incomplete:', homeResult.error?.message || `exceeded ${CALENDAR_SOURCE_MAX_ROWS} rows`);
        } else {
          const nowMs = Date.now();
          for (const hg of hgRows || []) {
            const g = hg.group;
            if (!g || g.is_private || !g.is_active) continue;
            const lastActive = Math.max(
              g.last_activity_at ? Date.parse(g.last_activity_at) : 0,
              g.created_at ? Date.parse(g.created_at) : 0);
            const overrideMs = g.visibility_override_until ? Date.parse(g.visibility_override_until) : 0;
            if (nowMs - lastActive > HG_INACTIVITY_MS && overrideMs < nowMs) continue;

            if (safeState && (g.state || '').toUpperCase() !== safeState.toUpperCase()) continue;
            if (safeCity && !(g.city || '').toLowerCase().includes(safeCity.toLowerCase())) continue;

            let distanceMi = null;
            const hLat = hg.approximate_lat, hLng = hg.approximate_lng;
            if (hasGps && hLat != null && hLng != null) {
              distanceMi = Math.round(haversineMi(userLat, userLng, parseFloat(hLat), parseFloat(hLng)) * 10) / 10;
              if (distanceMi > maxRadius) continue;
            } else if (hasExplicitRadius && (hLat == null || hLng == null)) {
              continue;
            }
            if (minBuyin && !(hg.buyin_min >= parseInt(minBuyin))) continue;
            if (maxBuyin && hg.buyin_min != null && hg.buyin_min > parseInt(maxBuyin)) continue;

            homeEvents.push({
              source: 'home_game',
              source_event_id: hg.id,
              event_date: hg.scheduled_date,
              event_name: hg.title || 'Home Game Tournament',
              venue_name: g.name || 'Private Home Game',
              venue_id: null,
              home_game_id: hg.id,
              club_code: g.club_code || null,
              city: g.city || null,
              state: g.state || null,
              neighborhood: hg.neighborhood || null,
              buy_in: hg.buyin_min || null,
              buy_in_display: hg.buyin_min ? formatMoney(hg.buyin_min) : null,
              buy_in_range: hg.buyin_min && hg.buyin_max && hg.buyin_max !== hg.buyin_min
                ? `${formatMoney(hg.buyin_min)} - ${formatMoney(hg.buyin_max)}` : null,
              game_type: normalizeGameType(hg.game_type),
              start_time: hg.start_time || null,
              max_players: hg.max_players || null,
              rsvp_yes: hg.rsvp_yes || 0,
              distance_mi: distanceMi,
              latitude: hLat != null ? parseFloat(hLat) : null,
              longitude: hLng != null ? parseFloat(hLng) : null,
              logo_url: g.profile_photo_url || null,
            });
          }
        }
      } catch (e) {
        sourceDegraded.home = true;
        console.warn('[events-calendar] Home games error:', e.message);
      }
    }

    let allEvents = [...dailyEvents, ...seriesEvents, ...tourEvents, ...homeEvents];

    // [EC-DAY FIX] The documented ?day= filter was parsed but never applied —
    // callers asking for Monday got every weekday back. Filter the projected
    // dates by weekday (noon-UTC anchor so the date never drifts a day).
    const requestedDayIdx = day && day !== 'all'
      ? DAYS_ORDER.indexOf(String(day).toLowerCase().trim())
      : -1;
    if (requestedDayIdx >= 0) {
      allEvents = allEvents.filter(e => {
        if (!e.event_date) return false;
        const d = new Date(`${e.event_date}T12:00:00Z`);
        if (isNaN(d.getTime())) return false;
        return d.getUTCDay() === requestedDayIdx;
      });
    }

    // Dedup repeated projections of the same source entity only. Distinct
    // source records can legitimately share venue, date, time, buy-in, and game
    // type, so a visual signature must never erase one of them.
    const seenKeys = new Set();
    allEvents = allEvents.filter(e => {
      const stableId = e.source_event_id || e.daily_tournament_id || e.series_id
        || e.tour_event_id || e.home_game_id || null;
      const key = stableId
        ? [e.source || 'unknown', String(stableId), e.event_date || ''].join('|')
        : [
            e.source || 'unknown',
            (e.event_name || '').toLowerCase().trim(),
            (e.venue_name || '').toLowerCase().trim(),
            e.event_date || '',
            (e.start_time || '').toLowerCase().trim(),
            String(e.buy_in || 0),
            (e.game_type || '').toLowerCase().trim(),
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

    // Build date summary for calendar view (uses ALL events, not just paginated)
    const dateCountMap = {};
    for (const e of allEvents) {
      if (e.event_date) {
        dateCountMap[e.event_date] = (dateCountMap[e.event_date] || 0) + 1;
      }
    }

    // Stats — single pass. `Math.min(...buyIns)` / `Math.max(...buyIns)` spread
    // an array that reaches tens of thousands of entries on the default 30-day
    // range (each 'Daily' row projects to 30 dates), which can blow the argument
    // limit with 'RangeError: Maximum call stack size exceeded' and turn the
    // whole calendar into a 500.
    let buyInCount = 0;
    let buyInSum = 0;
    let buyInMin = 0;
    let buyInMax = 0;
    const gameTypes = {};
    for (const e of allEvents) {
      const b = e.buy_in;
      if (b != null && b > 0) {
        if (buyInCount === 0) { buyInMin = b; buyInMax = b; }
        else {
          if (b < buyInMin) buyInMin = b;
          if (b > buyInMax) buyInMax = b;
        }
        buyInCount++;
        buyInSum += b;
      }
      const gt = e.game_type || 'Unknown';
      gameTypes[gt] = (gameTypes[gt] || 0) + 1;
    }
    const sourceCounts = { daily: 0, series: 0, tour: 0, home_game: 0 };
    for (const event of allEvents) {
      if (Object.prototype.hasOwnProperty.call(sourceCounts, event.source)) {
        sourceCounts[event.source] += 1;
      }
    }

    const responsePayload = {
      success: true,
      events: paginatedEvents,
      total: totalCount,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore: parsedOffset + parsedLimit < totalCount,
      dateRange: { start: rangeStartKey, end: rangeEndKey },
      rangeDays,
      useSmartAgg,
      dateCounts: dateCountMap,
      stats: {
        sources: sourceCounts,
        // True when a source's query actually errored, so the UI can say
        // "tournaments unavailable" instead of "no results".
        degraded: sourceDegraded,
        totalBeforeDedup: dailyEvents.length + seriesEvents.length + tourEvents.length + homeEvents.length,
        avgBuyin: buyInCount > 0 ? Math.round(buyInSum / buyInCount) : 0,
        minBuyin: buyInCount > 0 ? buyInMin : 0,
        maxBuyin: buyInCount > 0 ? buyInMax : 0,
        byGameType: gameTypes,
      },
    };

    // A degraded body must not be pinned at the edge or in the process cache —
    // it would keep serving a partial feed long after the DB recovered.
    const isDegraded = Object.values(sourceDegraded).some(Boolean);
    if (isDegraded) {
      res.setHeader('Cache-Control', 'no-store');
    }

    // Store in node-memory cache if not explicitly avoiding it
    if (!req.query._rt && !isDegraded) {
      const cacheKey = JSON.stringify(req.query);
      routeCache.set(cacheKey, { time: Date.now(), data: responsePayload });
      
      // Cleanup cache if it grows too large (prevent memory leak)
      if (routeCache.size > 200) {
        const oldestKey = routeCache.keys().next().value;
        routeCache.delete(oldestKey);
      }
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[events-calendar] Fatal error:', err);
    // [EC7 FIX] Was res.status(200) — returning 200 for fatal errors lets Vercel CDN
    // cache the error response (s-maxage=60) and serve it to hundreds of users.
    // Changed to 500 so CDN treats it as non-cacheable and clients can't accidentally
    // mistake a cached error body for valid data.
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      events: [],
      total: 0,
      dateCounts: {},
      stats: {},
    });
  }
}

export default withSentry(handler);

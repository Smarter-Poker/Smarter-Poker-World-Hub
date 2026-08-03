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
 *   ?dateRange=today|tomorrow|week|weekend|14days|30days|60days|90days|180days|365days
 *   ?state=TX                           State filter
 *   ?city=Houston                       City filter
 *   ?lat=29.7&lng=-95.3&radius=100      GPS + radius (miles)
 *   ?minBuyin=50&maxBuyin=500           Buy-in range
 *   ?gameType=NLH|PLO|Mixed             Game type filter
 *   ?eventType=daily|series|tour|all    Event source filter
 *   ?search=Lodge                       Free text search
 *   ?sort=date|buyin|distance           Sort order
 *   ?offset=0&limit=100                 Pagination
 *   ?calMonth=2026-08                   Load all events for a specific calendar month (YYYY-MM)
 */

import { withSentry } from '../../../src/lib/sentry';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // [EC1 FIX] Warn if falling back to anon key — anon key means RLS applies and rows may be silently filtered.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[events-calendar] WARNING: SUPABASE_SERVICE_ROLE_KEY missing — using anon key; RLS will apply and some rows may be silently filtered.');
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

function formatMoney(amount) {
  if (!amount && amount !== 0) return null;
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1) + 'K';
  return '$' + amount.toLocaleString();
}

/**
 * Parse a start_time to minutes-since-midnight, or null when unparseable.
 * Unlike parseTimeMinutes (which defaults to 720 = noon) this never invents a
 * time — the time-floor guard must not suppress rows whose time it cannot read.
 */
function parseTimeMinutesStrict(timeStr) {
  if (!timeStr) return null;
  const t = String(timeStr).trim();
  const toMinutes = (hStr, mStr, pStr) => {
    let h = parseInt(hStr, 10);
    const mn = parseInt(mStr || '0', 10);
    const p = (pStr || '').toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return h * 60 + mn;
  };
  // HH:MM:SS optional AM/PM
  let m = t.match(/^(\d{1,2}):(\d{2}):\d{2}\s*([AP]M)?$/i);
  if (m) return toMinutes(m[1], m[2], m[3]);
  // HH:MM optional AM/PM
  m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (m) return toMinutes(m[1], m[2], m[3]);
  // Bare hour with AM/PM: "7PM", "10 AM", "1 PM"
  m = t.match(/^(\d{1,2})\s*([AP]M)$/i);
  if (m) return toMinutes(m[1], '0', m[2]);
  return null;
}

// Must match daily-tournaments.js SUSPICIOUS_TIME_FLOOR_MINUTES. Both public
// surfaces read venue_daily_tournaments; when only one applied the guard, rows
// deliberately hidden as scraper artifacts on one page appeared on the other.
const SUSPICIOUS_TIME_FLOOR_MINUTES = 600; // 10:00 AM
// Must match the data_quality allowlist daily-tournaments.js gates on.
const ALLOWED_DATA_QUALITY = 'scraped_verified';

// In-memory cache to massively speed up page loads for identical non-realtime queries
const routeCache = new Map();
const CACHE_TTL_MS = 60000; // 60 seconds
const CACHE_MAX_ENTRIES = 50;

/**
 * Build a cache key from a NORMALIZED subset of params.
 * JSON.stringify(req.query) keyed on raw query order and full-precision GPS,
 * so every distinct lat/lng pair pinned another full payload in memory.
 */
function buildCacheKey(query) {
  const pick = (k) => {
    const v = Array.isArray(query[k]) ? query[k][0] : query[k];
    return v === undefined || v === null ? '' : String(v);
  };
  const round = (k) => {
    const n = parseFloat(pick(k));
    return isNaN(n) ? '' : n.toFixed(2); // ~1km buckets
  };
  return [
    'day', 'date', 'dateRange', 'state', 'city', 'radius', 'minBuyin', 'maxBuyin',
    'gameType', 'eventType', 'search', 'sort', 'offset', 'limit', 'calMonth',
  ].map(pick).concat([round('lat'), round('lng')]).join('|');
}

/** Drop expired entries, then trim to the size cap (oldest first). */
function pruneRouteCache() {
  const now = Date.now();
  for (const [key, entry] of routeCache) {
    if (now - entry.time >= CACHE_TTL_MS) routeCache.delete(key);
  }
  while (routeCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = routeCache.keys().next().value;
    if (oldestKey === undefined) break;
    routeCache.delete(oldestKey);
  }
}

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
        const cacheKey = buildCacheKey(req.query);
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

    const sb = getSupabase();
    const { dayIndex, dayName, dateKey: todayKey } = getCurrentDayInfo();
    const parsedOffset = Math.max(0, parseInt(offset) || 0);
    // Raise max from 500 → 1000 so wide date ranges return enough results
    const parsedLimit = Math.max(1, Math.min(parseInt(limit) || 200, 1000));
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
    if (calMonth && /^\d{4}-\d{2}$/.test(calMonth)) {
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
    try {
      // [EC4 FIX] Was .limit(2000) — Supabase project cap is 1000 rows/query.
      // Paginate across up to 3 pages (3,000 venues) to handle full venue table.
      let venueQ = sb.from('poker_venues')
        .select('id, name, city, state, latitude, longitude, logo_url')
        .eq('is_active', true);
      if (safeState) venueQ = venueQ.ilike('state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
      if (safeCity)  venueQ = venueQ.ilike('city', `%${safeCity}%`);
      // Paginate: 3 pages × 1000 = 3000 rows ceiling
      for (let page = 0; page < 3; page++) {
        const { data: venueRows } = await venueQ.range(page * 1000, (page + 1) * 1000 - 1);
        if (!venueRows || venueRows.length === 0) break;
        for (const v of venueRows) {
          venueLocations[v.id] = v;
          if (v.name) {
            const cleanName = v.name.toLowerCase().trim();
            venueLocations[cleanName] = v;
            venueNamesList.push({ name: cleanName, venue: v });
          }
        }
        if (venueRows.length < 1000) break; // no more pages
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    const getVenueInfo = (venueId, venueName) => {
      const vNameClean = venueName ? venueName.toLowerCase().trim() : null;
      if (venueLocations[venueId]) return venueLocations[venueId];
      if (vNameClean && venueLocations[vNameClean]) return venueLocations[vNameClean];
      
      // Fuzzy fallback match for when tournament venue_name omits suffixes like "Las Vegas"
      if (vNameClean && vNameClean.length > 3) {
        const stripWords = (s) => s.replace(/\b(casino|resort|hotel|poker|room|card)\b/g, '').trim().replace(/\s+/g, ' ');
        const s1 = stripWords(vNameClean);
        
        if (s1.length > 3) {
          for (const vf of venueNamesList) {
            const s2 = stripWords(vf.name);
            if (s2.length > 3 && (s1.includes(s2) || s2.includes(s1))) {
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
    let suppressedPre10am = 0;
    if (eventType === 'all' || eventType === 'daily') {
      try {
        // Same gates daily-tournaments.js applies. Without the data_quality
        // allowlist, rows the stale sweep demoted (data_quality='stale') but left
        // is_active=true were published here as real events, so the two public
        // surfaces disagreed about the same row.
        let dq = sb.from('venue_daily_tournaments')
          .select('venue_id, venue_name, day_of_week, start_time, buy_in, game_type, tournament_name, guaranteed, starting_stack, format, event_date, is_recurring, data_quality, last_scraped')
          .eq('is_active', true)
          .eq('data_quality', ALLOWED_DATA_QUALITY)
          .or('is_suppressed.is.null,is_suppressed.eq.false');

        if (minBuyin) dq = dq.gte('buy_in', parseInt(minBuyin));
        if (maxBuyin) dq = dq.lte('buy_in', parseInt(maxBuyin));
        
        if (safeGameType && safeGameType !== 'all') {
          dq = dq.ilike('game_type', `%${safeGameType}%`);
        }
        if (search) {
          const s = search.replace(/[()'"`,;%_\\]/g, '').trim().slice(0, 200);
          if (s) dq = dq.or(`venue_name.ilike.%${s}%,tournament_name.ilike.%${s}%`);
        }

        // [EC3 FIX] Was .limit(5000) but Supabase project-level cap is 1000 rows per query.
        // With 9,697 active tournaments, .limit(5000) silently returned only 1000 — 89.7% lost.
        // Paginate across up to 10 pages (10,000 row ceiling) to retrieve all active tournaments.
        let allDtRows = [];
        for (let page = 0; page < 10; page++) {
          const { data: pageRows } = await dq.range(page * 1000, (page + 1) * 1000 - 1);
          if (!pageRows || pageRows.length === 0) break;
          allDtRows = allDtRows.concat(pageRows);
          if (pageRows.length < 1000) break; // no more pages
        }
        const dtRows = allDtRows;

        if (dtRows) {
          for (const t of dtRows) {
            const tName = t.tournament_name || '';
            if (tName.startsWith('@') || tName.startsWith('{') || tName.startsWith('[')) continue;

            // TIME FLOOR GUARD (mirrors daily-tournaments.js): a start_time before
            // 10:00 AM is a scraper parse artifact (12 AM / 1 AM / 2 AM). Rows whose
            // time cannot be parsed at all are kept, exactly as on the other surface.
            const startMins = parseTimeMinutesStrict(t.start_time);
            if (startMins !== null && startMins < SUSPICIOUS_TIME_FLOOR_MINUTES) {
              suppressedPre10am++;
              continue;
            }

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
              });
            }
          }
        }
      } catch (e) {
        console.warn('[events-calendar] Daily tournaments error:', e.message);
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
          // [EC-API-BUG-1 FIX] .eq('is_suppressed', false) silently excluded rows where
          // is_suppressed = NULL (field never set). Use .or() to match both NULL and false,
          // same pattern as venue_daily_tournaments at line 326.
          .or('is_suppressed.is.null,is_suppressed.eq.false');

        if (safeState) sq = sq.ilike('state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
        if (safeCity)  sq = sq.ilike('city', `%${safeCity}%`);
        if (safeGameType && safeGameType !== 'all') sq = sq.ilike('series_type', `%${safeGameType}%`);
        if (search) {
          const ss = search.replace(/[()'"`,;%_\\]/g, '').trim().slice(0, 200);
          if (ss) sq = sq.or(`series_name.ilike.%${ss}%,venue_name.ilike.%${ss}%`);
        }

        // For series we always want ALL within range — no smart-agg needed (series aren't recurring)
        // [EC2 FIX] Was .limit(1000) — switched to .range(0,999) for consistency with series.js fix.
        // poker_series currently has 208 rows, but will grow. Range is explicit about intent.
        const { data: seriesRows } = await sq.range(0, 999);

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
              });
            }
          }
        }
      } catch (e) {
        console.warn('[events-calendar] Series error:', e.message);
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

        // [EC8 FIX] Removed .eq('is_active', true) — tour_stop_events doesn't have an is_active column
        // This was throwing an uncaught DB error and silently preventing any tour events from loading.
        if (safeState) tq = tq.ilike('stop_state', safeState.length === 2 ? safeState.toUpperCase() : `%${safeState}%`);
        if (minBuyin) tq = tq.gte('buy_in', parseInt(minBuyin));
        if (maxBuyin) tq = tq.lte('buy_in', parseInt(maxBuyin));
        if (safeGameType && safeGameType !== 'all') tq = tq.ilike('game_type', `%${safeGameType}%`);
        if (search) {
          const ts = search.replace(/[()'"`,;%_\\]/g, '').trim().slice(0, 200);
          if (ts) tq = tq.or(`event_name.ilike.%${ts}%,stop_name.ilike.%${ts}%,stop_venue.ilike.%${ts}%`);
        }

        // [B1 FIX] Was .limit(2000) — Supabase project cap is 1000 rows/query.
        // Paginate across up to 2 pages (2000 row ceiling) to retrieve all active tour events.
        let allTourRows = [];
        for (let page = 0; page < 2; page++) {
          const { data: trPage } = await tq.range(page * 1000, (page + 1) * 1000 - 1);
          if (!trPage || trPage.length === 0) break;
          allTourRows = allTourRows.concat(trPage);
          if (trPage.length < 1000) break;
        }
        const tourRows = allTourRows;

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
        console.warn('[events-calendar] Tour events error:', e.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // MERGE + DEDUP + SORT
    // ──────────────────────────────────────────────────────────────
    let allEvents = [...dailyEvents, ...seriesEvents, ...tourEvents];

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

    // Dedup: same venue + same date + same time + same buy_in
    const seenKeys = new Set();
    allEvents = allEvents.filter(e => {
      const key = [
        (e.venue_name || '').toLowerCase().trim(),
        e.event_date || '',
        (e.start_time || '').toLowerCase().trim(),
        (e.buy_in || 0).toString(),
        (e.game_type || '').toLowerCase().trim()
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

    // Stats
    const buyIns = allEvents.map(e => e.buy_in).filter(b => b != null && b > 0);
    const gameTypes = {};
    allEvents.forEach(e => { gameTypes[e.game_type || 'Unknown'] = (gameTypes[e.game_type || 'Unknown'] || 0) + 1; });
    const sourceCounts = { daily: dailyEvents.length, series: seriesEvents.length, tour: tourEvents.length };

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
        // Rows hidden by the shared pre-10AM scraper-artifact guard, so the loss
        // is visible rather than only appearing as a smaller total.
        suppressed_pre10am: suppressedPre10am,
        data_quality_filter: ALLOWED_DATA_QUALITY,
        totalBeforeDedup: dailyEvents.length + seriesEvents.length + tourEvents.length,
        avgBuyin: buyIns.length > 0 ? Math.round(buyIns.reduce((s, b) => s + b, 0) / buyIns.length) : 0,
        minBuyin: buyIns.length > 0 ? Math.min(...buyIns) : 0,
        maxBuyin: buyIns.length > 0 ? Math.max(...buyIns) : 0,
        byGameType: gameTypes,
      },
    };

    // Store in node-memory cache if not explicitly avoiding it
    if (!req.query._rt) {
      const cacheKey = buildCacheKey(req.query);
      routeCache.set(cacheKey, { time: Date.now(), data: responsePayload });
      // Evict expired entries every insert and hold a hard size cap. The old
      // code removed exactly ONE entry above 200, so ~200 full payloads (up to
      // 1000 events each) stayed resident per serverless instance and TTL
      // expiry never freed anything.
      pruneRouteCache();
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
      error: err.message,
      events: [],
      total: 0,
      dateCounts: {},
      stats: {},
    });
  }
}

export default withSentry(handler);

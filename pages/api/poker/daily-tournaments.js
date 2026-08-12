/**
 * Daily Tournaments API
 *
 * Source: venue_daily_tournaments table (324+ venues, 4,500+ records)
 * Live-scraped data by tournament-schedule-daemon (72h cycle)
 *
 * Endpoints:
 *   GET /api/poker/daily-tournaments - Get daily tournament schedules
 *   GET /api/poker/daily-tournaments?day=Monday - Filter by day
 *   GET /api/poker/daily-tournaments?state=TX - Filter by state
 *   GET /api/poker/daily-tournaments?venue=Lodge - Search by venue name
 */
import { withSentry } from '../../../src/lib/sentry';
import { createClient } from '../../../src/lib/supabaseServerClient';
import tournamentVenues from '../../../data/tournament-venues.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// Any tournament starting before 10:00 AM is treated as a data quality error
// (scraper artifacts produce 12 AM / 1 AM times that don't exist in reality).
// Flagged records are suppressed from the public API response — NOT deleted from the DB.
const SUSPICIOUS_TIME_FLOOR_MINUTES = 600; // 10:00 AM

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Get current day of week
function getCurrentDay() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    return days[new Date(localCurrentTime).getDay()];
}

function parseTime(timeStr) {
    if (!timeStr) return -1;
    const t = timeStr.trim();
    // HH:MM:SS optional AM/PM
    let m = t.match(/^(\d{1,2}):(\d{2}):\d{2}\s*([AP]M)?$/i);
    if (m) {
        let h = parseInt(m[1]), mn = parseInt(m[2]), p = (m[3] || '').toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + mn;
    }
    // HH:MM optional AM/PM
    m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
    if (m) {
        let h = parseInt(m[1]), mn = parseInt(m[2]), p = (m[3] || '').toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + mn;
    }
    // Bare hour with AM/PM: "7PM", "10 AM", "1 PM"
    m = t.match(/^(\d{1,2})\s*([AP]M)$/i);
    if (m) {
        let h = parseInt(m[1]), p = m[2].toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60;
    }
    return -1;
}

// Map an exact YYYY-MM-DD date to its weekday name (timezone-safe: noon UTC anchor)
function getDayNameForDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const clean = dateStr.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
    const d = new Date(`${clean}T12:00:00Z`);
    if (isNaN(d.getTime())) return null;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getUTCDay()];
}

// Map day string "Monday" to "2026-04-13" upcoming date
function getNextDateForDay(targetDay) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetIdx = days.findIndex(d => d.toLowerCase() === (targetDay || '').toLowerCase());
    if (targetIdx === -1) return null;
    
    // Use target local timezone identical to the db's logic
    const str = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const now = new Date(str);
    const currentIdx = now.getDay();
    
    let daysToAdd = targetIdx - currentIdx;
    if (daysToAdd < 0) {
        daysToAdd += 7; // Get next occurrence within the 7-day future window
    }
    
    now.setDate(now.getDate() + daysToAdd);
    
    // Output precisely YYYY-MM-DD
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function handler(req, res) {
  try {
    // CDN cache: Dynamic response cache conditionally overriding for websocket refreshes
    if (req.method === 'GET') {
      if (req.query._rt) {
        // Break 120s Edge Cache bounds when `useVenueRealtime` is asserting live mutations
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      }
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const {
              day: _day,
              exact_date: _exact_date,
              state: _state,
              venue: _venue,
              type: _type,
              minBuyin: _minBuyin,
              maxBuyin: _maxBuyin,
              game_type: _game_type,
              minGuaranteed: _minGuaranteed,
              sort: _sort = 'time',
              venue_id: _venue_id,
              limit: _limit = 999
          } = req.query;

          // [B1 FIX] Guard against array injection — Next.js parses ?day[]=A&day[]=B as an array.
          // Pass to ilike as [object Array] which silently breaks the filter.
          const safeStr = (v) => Array.isArray(v) ? v[0] : v;
          const day = safeStr(_day);
          const exact_date = safeStr(_exact_date);
          const state = safeStr(_state);
          const venue = safeStr(_venue);
          const type = safeStr(_type);
          const minBuyin = safeStr(_minBuyin);
          const maxBuyin = safeStr(_maxBuyin);
          const game_type = safeStr(_game_type);
          const minGuaranteed = safeStr(_minGuaranteed);
          const sort = safeStr(_sort) || 'time';
          const venue_id = safeStr(_venue_id);
          const limit = safeStr(_limit) || 999;

          // Try to get tournaments from database first
          let query = getSupabase()
              .from('venue_daily_tournaments')
              .select(`
                  id,
                  venue_id,
                  venue_name,
                  day_of_week,
                  start_time,
                  buy_in,
                  game_type,
                  format,
                  guaranteed,
                  tournament_name,
                  rebuy_addon,
                  starting_stack,
                  blind_levels,
                  level_duration_minutes,
                  late_registration,
                  structure_sheet_url,
                  parent_tournament_id,
                  source_url,
                  last_scraped,
                  is_active
              `)
              .eq('is_active', true)
              .or('is_suppressed.is.null,is_suppressed.eq.false')
              .in('data_quality', ['scraped_verified', 'scraped_inferred'])
              .order('buy_in', { ascending: true });

          // Filter by day — use ilike for case-insensitive matching
          // (DB has mixed-case day_of_week values: 'saturday', 'MONDAY', 'Daily', etc.)
          let targetDay = getCurrentDay();
          // [B6 FIX] When exact_date is provided (calendar mode), skip day_of_week filter
          // on venue_daily_tournaments — we want ALL recurring ('Daily') events plus any
          // matching date-specific records. Day filter would incorrectly exclude 'Daily' rows.
          const hasExactDate = !!exact_date;
          // [DT-1 FIX] Strip PostgREST injection chars from targetDay including [ ] ' " ; before
          // interpolating it into the .or() filter string. PostgREST uses [ in operator syntax.
          if (!hasExactDate && day !== 'all') {
              targetDay = (day || getCurrentDay()).replace(/[%_\\,().\[\]'"`;]/g, '').trim().slice(0, 20);
              if (!targetDay) targetDay = getCurrentDay();
              query = query.or(`day_of_week.ilike.${targetDay},day_of_week.ilike.daily`);
          } else if (hasExactDate) {
              // [B6 FIX v2] Calendar mode: the weekday must come from the REQUESTED date,
              // not from today — otherwise 2026-08-01 (a Saturday) was filtered with
              // today's weekday and showed the wrong recurring tournaments.
              const dayFromExactDate = getDayNameForDate(exact_date);
              targetDay = (day || dayFromExactDate || getCurrentDay()).replace(/[%_\\,().\[\]'"`;]/g, '').trim().slice(0, 20) || getCurrentDay();
              query = query.or(`day_of_week.ilike.${targetDay},day_of_week.ilike.daily`);
          }

          // Filter by exact venue ID — must be a valid integer to prevent cast errors
          if (venue_id) {
              const parsedVenueId = parseInt(venue_id, 10);
              if (!isNaN(parsedVenueId) && parsedVenueId > 0) {
                  query = query.eq('venue_id', parsedVenueId);
              }
          }

          // Filter by venue name — strip SQL ILIKE wildcards and injection chars to prevent wildcard injection
          // [A2 FIX] Added single-quote to character class — O'Brien-style names were passing through unsanitized
          if (venue) {
              const safeVenue = venue.replace(/[,().%_\\'";]/g, '').trim().slice(0, 100);
              if (safeVenue) {
                  query = query.ilike('venue_name', `%${safeVenue}%`);
              }
          }

          // Filter by game type — strip SQL ILIKE wildcards
          if (game_type && game_type !== 'all') {
              const safeGameType = game_type.replace(/[()'",.;%_\\]/g, '').trim().slice(0, 50);
              if (safeGameType) query = query.ilike('game_type', `%${safeGameType}%`);
          }

          // Filter by minimum guaranteed prize
          if (minGuaranteed) {
              query = query.gte('guaranteed', parseInt(minGuaranteed, 10) || 0);
          }

          // Filter by buy-in range
          if (minBuyin) {
              query = query.gte('buy_in', parseInt(minBuyin, 10) || 0);
          }
          if (maxBuyin) {
              query = query.lte('buy_in', parseInt(maxBuyin, 10) || 100000);
          }

          // [B2 FIX v2] Use .range(0, 4999) to bypass Supabase project-level max_rows=1000 cap.
          // .limit() alone is bounded by the project setting; .range() uses the Range header
          // which PostgREST serves up to the specified ceiling regardless of the project default.
          const rawLimit = parseInt(limit, 10);
          const parsedLimit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 999, 1), 5000);
          // The fetch ceiling deliberately stays at 5000 rather than tracking
          // `limit`: the state/type/time-floor filters below run in JS (state is
          // resolved from poker_venues, not a column on this table), so narrowing
          // the fetch to the requested page size would make `?state=IL&limit=50`
          // miss Illinois venues that sort past the first 50 nationwide rows.
          query = query.range(0, 4999); // Bypasses Supabase 1000-row project limit

          const { data: dbTournaments, error } = await query;

          // [P3-A FIX] Harden exact_date sanitization — enforce strict YYYY-MM-DD
          let targetDateStr = getNextDateForDay(targetDay);
          if (exact_date) {
              const cleanDate = exact_date.replace(/[,()_%'"]/g, '').trim().slice(0, 10);
              if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
                  targetDateStr = cleanDate;
              }
          }

          // [P2-C FIX] Run charity + tour queries IN PARALLEL — was sequential (2 round trips).
          // Promise.all reduces API latency by ~50ms on every page load.
          const safeStateParam = state ? state.replace(/[()'",.;%_\\]/g, '').trim().slice(0, 50) : null;

          // NOTE: no .eq('is_active', true) here — charity_events_schedule has no such
          // column, so the filter made PostgREST error out and silently drop every row.
          // data_quality='scraped_verified' already gates freshness.
          let charityQuery = getSupabase()
              .from('charity_events_schedule')
              .select('*')
              .eq('data_quality', 'scraped_verified')
              .limit(100);
          // Multi-day charity events carry start_date AND end_date. Matching on
          // start_date alone made a series that runs Aug 4-8 visible only on
          // Aug 4 — it silently vanished from the feed on every other day it was
          // still running. Use a range overlap instead.
          // targetDateStr is validated as strict YYYY-MM-DD above, so it is safe
          // to interpolate into the PostgREST filter.
          if (targetDateStr) {
              charityQuery = charityQuery
                  .lte('start_date', targetDateStr)
                  // A NULL end_date means single-day, so it must still match only
                  // its own start_date — otherwise every old open-ended row would
                  // reappear on every future date.
                  .or(`end_date.gte.${targetDateStr},and(end_date.is.null,start_date.eq.${targetDateStr})`);
          }
          if (safeStateParam) charityQuery = charityQuery.ilike('state', safeStateParam);

          // Same as above: poker_tour_series_events has no is_active column.
          let toursQuery = getSupabase()
              .from('poker_tour_series_events')
              .select('*')
              .eq('data_quality', 'scraped_verified')
              .limit(200);
          if (targetDateStr) toursQuery = toursQuery.eq('event_date', targetDateStr);
          if (safeStateParam) toursQuery = toursQuery.ilike('state', safeStateParam);

          const [charityResult, toursResult] = await Promise.all([
              charityQuery,
              toursQuery,
          ]);
          const dbCharityEvents = charityResult?.data;
          const dbToursEvents = toursResult?.data;
          // Surface (but don't fail on) charity/tour query errors — these were silently discarded
          if (charityResult?.error) {
              console.warn('[daily-tournaments] charity_events_schedule query error (non-fatal):', charityResult.error.message);
          }
          if (toursResult?.error) {
              console.warn('[daily-tournaments] poker_tour_series_events query error (non-fatal):', toursResult.error.message);
          }

          let tournaments = [];
          let rawCount = 0;
          let dedupedCount = 0;

          if (!error && dbTournaments && dbTournaments.length > 0) {
              rawCount = dbTournaments.length;
              
              // ═══════════════════════════════════════════════════════════
              // DEDUP LAYER: Remove duplicate tournaments from multiple scrape runs
              // Key: venue_name + start_time + normalized_game_type + buy_in
              // First occurrence wins (ordered by buy_in ascending from query)
              // ═══════════════════════════════════════════════════════════
              const seenKeys = new Set();
              const dedupedTournaments = [];
              for (const t of dbTournaments) {
                  // Normalize game type for deduplication
                  let normGame = (t.game_type || t.tournament_name || 'nlh').toLowerCase().trim();
                  if (normGame.includes('nlh') || normGame.includes('no limit') || normGame.includes('holdem') || normGame.includes("hold'em")) {
                      normGame = 'nlh';
                  } else if (normGame.includes('plo') || normGame.includes('omaha')) {
                      normGame = 'omaha';
                  } else if (normGame.includes('mixed') || normGame.includes('horse')) {
                      normGame = 'mixed';
                  }
                  
                  const key = [
                      (t.venue_name || '').toLowerCase().trim(),
                      // Removed day_of_week which caused 'Daily' vs 'Tuesday' to both show up
                      (t.start_time || '').toLowerCase().trim(),
                      normGame,
                      (t.buy_in || 0).toString()
                  ].join('|');
                  
                  if (!seenKeys.has(key)) {
                      seenKeys.add(key);
                      dedupedTournaments.push(t);
                  } else {
                      dedupedCount++;
                  }
              }
              
              // ═══════════════════════════════════════════════════════════
              // FLIGHT CLUSTERING LAYER: Group multi-flights / recurring days
              // ═══════════════════════════════════════════════════════════
              const clusteredTournaments = [];
              const groupMap = new Map();
              
              for (const t of dedupedTournaments) {
                  let clusterKey = t.parent_tournament_id || null;
                  
                  if (!clusterKey && t.tournament_name) {
                      const name = t.tournament_name.toLowerCase();
                      const hasFlight = name.match(/\b(flight[s]?\s*[a-z0-9]+|day\s*1[a-z]?)\b/i);
                      if (hasFlight) {
                          const baseName = name.replace(/\b(flight[s]?\s*[a-z0-9]+|day\s*1[a-z]?)\b/gi, '').trim();
                          clusterKey = `heuristic_${t.venue_id}_${t.buy_in}_${baseName}`;
                      }
                  }
                  
                  if (clusterKey) {
                      if (!groupMap.has(clusterKey)) {
                          groupMap.set(clusterKey, {
                              ...t,
                              is_clustered: true,
                              flights: [t]
                          });
                      } else {
                          groupMap.get(clusterKey).flights.push(t);
                      }
                  } else {
                      clusteredTournaments.push(t);
                  }
              }
              
              for (const group of groupMap.values()) {
                  if (group.flights.length > 1) {
                      group.flights.sort((a,b) => parseTime(a.start_time) - parseTime(b.start_time));
                      clusteredTournaments.push(group);
                  } else {
                      clusteredTournaments.push(group.flights[0]); // Don't cluster singletons
                  }
              }
              
              // Enrich with venue data.
              //
              // data/tournament-venues.json only carries ~206 venues while
              // venue_daily_tournaments spans 324+, so every tournament whose
              // venue_name was not an exact lowercase match in that file got
              // state:null — and the ?state= filter further down then deleted it.
              // State-filtered queries silently omitted venues that exist in the
              // DB, and groupByState bucketed them as 'Unknown'.
              //
              // poker_venues is now the primary source for state/city (resolved by
              // the numeric venue_id the rows already carry); the static file is
              // only a fallback for rows with no venue_id.
              const venueMap = new Map();
              tournamentVenues.venues.forEach(v => {
                  venueMap.set(v.name.toLowerCase(), v);
              });

              const dbVenueInfoById = new Map();
              const clusterVenueIds = [...new Set(
                  clusteredTournaments
                      .map(t => t.venue_id)
                      .filter(vid => vid != null && !isNaN(Number(vid)) && Number(vid) > 0)
                      .map(vid => Number(vid))
              )];
              if (clusterVenueIds.length > 0) {
                  try {
                      const CHUNK = 300;
                      for (let i = 0; i < clusterVenueIds.length; i += CHUNK) {
                          const { data: pvRows } = await getSupabase()
                              .from('poker_venues')
                              .select('id, state, city')
                              .in('id', clusterVenueIds.slice(i, i + CHUNK));
                          (pvRows || []).forEach(v => dbVenueInfoById.set(Number(v.id), v));
                      }
                  } catch (pvErr) {
                      console.warn('[daily-tournaments] poker_venues state/city resolve failed (non-fatal):', pvErr?.message || pvErr);
                  }
              }

              tournaments = clusteredTournaments.map(t => {
                  const venueInfo = venueMap.get(t.venue_name?.toLowerCase()) || {};
                  const dbInfo = dbVenueInfoById.get(Number(t.venue_id)) || {};
                  return {
                      ...t,
                      state: dbInfo.state || venueInfo.state || null,
                      city: dbInfo.city || venueInfo.city || null,
                      venueType: venueInfo.type || 'Unknown',
                      pokerAtlasUrl: venueInfo.pokerAtlasUrl || t.source_url
                  };
              });
          }
          if (error) {
              console.warn('[daily-tournaments] venue_daily_tournaments query error (non-fatal):', error.message);
          }

          // NOTE: charity / tour-series / home-game integration and the state+type
          // filters run REGARDLESS of whether venue_daily_tournaments returned rows.
          // They used to be nested inside the "has DB tournaments" branch, so a day
          // with zero venue tournaments dropped every charity, tour stop and home game.
          // Integrate charity events dynamically FIRST
          if (dbCharityEvents && dbCharityEvents.length > 0) {
              dbCharityEvents.forEach(c => {
                  tournaments.push({
                      id: `charity_${c.id}`,
                      venue_id: `charity_${c.id}`,
                      venue_name: c.charity_name,
                      venueType: 'Charity',
                      day_of_week: c.start_date, // Mapped for sorting/fallback
                      // No real start time is scraped for charity events — emit null (TBD)
                      // instead of an invented 12:00 PM that users read as a real time.
                      start_time: c.start_time || null,
                      buy_in: 0, // Or extract if available
                      game_type: 'NLH',
                      format: c.event_description,
                      guaranteed: 0,
                      tournament_name: c.charity_name + " Event",
                      source_url: c.source_url,
                      state: c.state,
                      city: c.location_address, // Use address as locator
                      pokerAtlasUrl: c.source_url
                  });
              });
          }
          
          // Integrate traveling tours and series events dynamically FIRST
          if (dbToursEvents && dbToursEvents.length > 0) {
              dbToursEvents.forEach(e => {
                  tournaments.push({
                      id: `tour_event_${e.id}`,
                      venue_id: `tour_event_${e.id}`,
                      venue_name: e.venue_name || e.event_name,
                      venueType: 'Tournament Series',
                      day_of_week: e.event_date,
                      // Same as charity: null means "TBD" to the frontend (parseTime -> -1).
                      start_time: e.start_time || null,
                      buy_in: e.buy_in || 0,
                      game_type: 'NLH', // General mapping
                      format: e.tour_code + " Event",
                      guaranteed: e.guaranteed || 0,
                      tournament_name: e.event_name,
                      source_url: e.source_url,
                      state: e.state,
                      city: e.location_address, // Use address as locator
                      pokerAtlasUrl: e.source_url
                  });
              });
          }

          // ═══════════════════════════════════════════════════════════
          //  PHASE 20 — HOME GAME TOURNAMENT UNION
          // ═══════════════════════════════════════════════════════════
          //
          // Dan's directive: "Home-game tournaments should surface in
          // Daily Tournaments pages."
          //
          // Uses the Phase 16B `format` column on commander_home_games
          // (values 'cash'|'tournament') and the Phase 18 activity filter
          // on commander_home_groups (last_activity_at / created_at /
          // visibility_override_until).
          //
          // STRICT RULES:
          //   1. Only format='tournament' home games surface here
          //   2. Only scheduled_date = targetDateStr — home games are
          //      one-off events on specific dates, not recurring "Daily"
          //      tournaments. A home game set for Apr 25 appears only
          //      when the user views Apr 25.
          //   3. Parent group MUST be public + active + pass the 45-day
          //      activity filter. Dan's explicit clarification: "Auto-
          //      scheduled tournaments do NOT count as activity." So
          //      the group itself needs recent human engagement for
          //      its future tournaments to surface.
          //   4. status must be 'scheduled' or 'in_progress' — not
          //      'cancelled' or 'completed'
          //
          // Follows the same read-time UNION pattern Phase 19 uses for
          // /api/poker/venues (no cross-table FK writes; home groups
          // stay in their own schema island).
          try {
              const HG_INACTIVITY_DAYS = 45;
              const hgInactivityCutoff = new Date(
                  Date.now() - HG_INACTIVITY_DAYS * 24 * 60 * 60 * 1000
              ).toISOString();
              const hgNow = new Date().toISOString();

              let hgQuery = getSupabase()
                  .from('commander_home_games')
                  .select(`
                      id,
                      title,
                      description,
                      game_type,
                      stakes,
                      buyin_min,
                      buyin_max,
                      scheduled_date,
                      start_time,
                      max_players,
                      rsvp_yes,
                      status,
                      format,
                      neighborhood,
                      approximate_lat,
                      approximate_lng,
                      group:commander_home_groups!inner (
                          id,
                          name,
                          city,
                          state,
                          latitude,
                          longitude,
                          profile_photo_url,
                          is_private,
                          is_active,
                          last_activity_at,
                          created_at,
                          visibility_override_until
                      )
                  `)
                  .eq('format', 'tournament')
                  .in('status', ['scheduled', 'in_progress'])
                  .eq('scheduled_date', targetDateStr)
                  .eq('group.is_private', false)
                  .eq('group.is_active', true);

              const { data: dbHomeGameTourneys, error: hgErr } = await hgQuery;
              if (hgErr) {
                  console.warn('[daily-tournaments] Home game UNION query error (non-fatal):', hgErr.message);
              } else if (dbHomeGameTourneys && dbHomeGameTourneys.length > 0) {
                  // Apply the 45-day activity filter client-side (PostgREST
                  // won't do compound OR across the joined table reliably).
                  const cutoffMs = Date.parse(hgInactivityCutoff);
                  const nowMs    = Date.parse(hgNow);
                  const activeHomeGames = dbHomeGameTourneys.filter((hg) => {
                      const g = hg.group;
                      if (!g || g.is_private || !g.is_active) return false;
                      const lastActivityMs = g.last_activity_at ? Date.parse(g.last_activity_at) : 0;
                      const createdAtMs    = g.created_at        ? Date.parse(g.created_at)        : 0;
                      const overrideMs     = g.visibility_override_until ? Date.parse(g.visibility_override_until) : 0;
                      return lastActivityMs >= cutoffMs
                          || createdAtMs    >= cutoffMs
                          || overrideMs     >  nowMs;
                  });

                  // Optional state filter (applied the same way charity/
                  // tour filters are applied below — but safer to apply
                  // it at push-time here using the joined group's state).
                  const filteredByState = safeStateParam
                      ? activeHomeGames.filter((hg) =>
                          (hg.group?.state || '').toUpperCase() === safeStateParam.toUpperCase()
                      )
                      : activeHomeGames;

                  filteredByState.forEach((hg) => {
                      const g = hg.group || {};
                      // Map buyin to the shape charity/tour events use
                      const buyIn = hg.buyin_min || 0;

                      // start_time in commander_home_games is stored as
                      // a time-of-day string like "19:00" (24-hour). The
                      // rest of this endpoint uses "7:00 PM" format.
                      // Best-effort conversion — fall back to the raw
                      // value if parse fails.
                      let displayStartTime = hg.start_time || '7:00 PM';
                      try {
                          if (typeof hg.start_time === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(hg.start_time)) {
                              const [hStr, mStr] = hg.start_time.split(':');
                              const h = parseInt(hStr, 10);
                              const m = parseInt(mStr, 10) || 0;
                              const period = h >= 12 ? 'PM' : 'AM';
                              const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                              displayStartTime = `${h12}:${String(m).padStart(2, '0')} ${period}`;
                          }
                      } catch { /* fall back to raw */ }

                      tournaments.push({
                          id:                `home_game_${hg.id}`,
                          venue_id:          `home_game_${g.id || hg.id}`,  // string, distinguishable from int venue_ids
                          venue_name:        g.name || 'Home Game',
                          venueType:         'Home Game',
                          day_of_week:       hg.scheduled_date,
                          start_time:        displayStartTime,
                          buy_in:            buyIn,
                          game_type:         (hg.game_type || 'NLH').toUpperCase(),
                          format:            hg.title || 'Home Tournament',
                          guaranteed:        0,
                          tournament_name:   hg.title || `${g.name || 'Home Game'} Tournament`,
                          source_url:        null,  // Populated by discover /home-games/{slug} on frontend
                          state:             g.state,
                          city:              g.city,
                          logo_url:          g.profile_photo_url || null,
                          is_home_game:      true,                           // extra UI signal
                          home_group_id:     g.id,                           // for deep-linking to /home-games/{slug}
                          rsvp_yes:          hg.rsvp_yes || 0,
                          max_players:       hg.max_players,
                          pokerAtlasUrl:     null,
                      });
                  });
              }
          } catch (hgIntegrationErr) {
              console.warn('[daily-tournaments] Home game UNION failed (non-fatal):', hgIntegrationErr?.message || hgIntegrationErr);
          }
          // ═══════════════════════════════════════════════════════════
          //  END PHASE 20
          // ═══════════════════════════════════════════════════════════

          // Filter by state if provided (Ensures Charity/Tours are caught)
          if (state) {
              tournaments = tournaments.filter(t =>
                  t.state?.toUpperCase() === state.toUpperCase()
              );
          }

          // Filter by venue type (Ensures Charity/Tours are cleanly routed)
          if (type) {
              tournaments = tournaments.filter(t =>
                  t.venueType?.toLowerCase().includes(type.toLowerCase())
              );
          }


          // ═══════════════════════════════════════════════════════════
          // TIME FLOOR GUARD: Suppress pre-10 AM tournaments (data quality errors)
          // Scraper artifacts produce 12 AM / 1 AM / 2 AM times that don't exist.
          // These are flagged for manual review and hidden from the public feed.
          // ═══════════════════════════════════════════════════════════
          // ZERO-INDEX BUG FIX: Catch 12:00 AM artifacts returning '0'. Missing values return '-1' explicitly.
          const suspiciousCount = tournaments.filter(t => {
              const mins = parseTime(t.start_time);
              return mins >= 0 && mins < SUSPICIOUS_TIME_FLOOR_MINUTES;
          }).length;
          if (suspiciousCount > 0) {
              console.warn(`[daily-tournaments] Suppressed ${suspiciousCount} pre-10AM records — flagged for manual review`);
          }
          tournaments = tournaments.filter(t => {
              const mins = parseTime(t.start_time);
              // Keep: Unparseable/TBD (-1) AND times >= 10:00 AM (600 mins)
              return mins < 0 || mins >= SUSPICIOUS_TIME_FLOOR_MINUTES;
          });

          // ═══════════════════════════════════════════════════════════
          // VENUE LOGO ENRICHMENT: Batch-fetch logo_url from poker_venues
          // Attach to each tournament so the frontend can render venue logos
          // ═══════════════════════════════════════════════════════════
          const numericVenueIds = [...new Set(
              tournaments
                  .map(t => t.venue_id)
                  .filter(id => id && !isNaN(Number(id)) && Number(id) > 0)
                  .map(id => Number(id))
          )];
          if (numericVenueIds.length > 0) {
              try {
                  const { data: venueLogos } = await getSupabase()
                      .from('poker_venues')
                      .select('id, logo_url, profile_photo_url')
                      .in('id', numericVenueIds);
                  if (venueLogos && venueLogos.length > 0) {
                      const logoMap = new Map();
                      venueLogos.forEach(v => logoMap.set(v.id, v.logo_url || v.profile_photo_url || null));
                      tournaments = tournaments.map(t => ({
                          ...t,
                          // Keep any logo already set (home games carry the group's photo);
                          // Number('home_game_<uuid>') is NaN, which used to null them out.
                          logo_url: logoMap.get(Number(t.venue_id)) || t.logo_url || null,
                      }));
                  }
              } catch (logoErr) {
                  console.warn('[daily-tournaments] Logo batch-fetch failed (non-fatal):', logoErr.message);
              }
          }

          // Sort by chosen field
          if (sort === 'buyin') {
              tournaments.sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
          } else if (sort === 'guaranteed') {
              tournaments.sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));
          } else {
              // Default: sort by time. parseTime returns -1 for null/TBD start
              // times (charity + tour-series rows deliberately emit null), which
              // used to float every TBD event above the 10 AM tournaments.
              // Sort them last instead.
              const timeKey = (t) => {
                  const mins = parseTime(t.start_time);
                  return mins < 0 ? Number.MAX_SAFE_INTEGER : mins;
              };
              tournaments.sort((a, b) => timeKey(a) - timeKey(b));
          }

          // Apply `limit` ONCE, before the groupings are derived. Previously the
          // slice was applied only to `tournaments` while byTimeSlot / byState /
          // stats were built over the full untruncated set — the same objects
          // appeared up to three times in one (CDN-cached) body and stats.total
          // reported a number the paginating client could never reach.
          tournaments = tournaments.slice(0, parsedLimit);

          // Group by time slot
          const byTimeSlot = groupByTimeSlot(tournaments);

          // Coverage stats derived from the data actually being served, rather
          // than from constants frozen inside data/tournament-venues.json (which
          // under-reported the venue count by a third and advertised a
          // months-old refresh timestamp on a 72h scrape cycle).
          const distinctVenues = new Set(
              tournaments.map(t => (t.venue_id != null ? String(t.venue_id) : (t.venue_name || ''))).filter(Boolean)
          ).size;
          let lastUpdated = null;
          for (const t of tournaments) {
              if (t.last_scraped && (!lastUpdated || t.last_scraped > lastUpdated)) lastUpdated = t.last_scraped;
          }

          return res.status(200).json({
              success: true,
              day: targetDay,
              totalVenues: distinctVenues,
              lastUpdated,
              tournaments,
              byTimeSlot,
              byState: groupByState(tournaments),
              stats: {
                  total: tournaments.length,
                  venueCount: new Set(tournaments.map(t => t.venue_name)).size,
                  avgBuyin: tournaments.length > 0
                      ? Math.round(tournaments.reduce((sum, t) => sum + (t.buy_in || 0), 0) / tournaments.length)
                      : 0,
                  byType: countByField(tournaments, 'venueType'),
                  byGameType: countByField(tournaments, 'game_type'),
                  dedup: {
                      raw_db_rows: rawCount,
                      duplicates_removed: dedupedCount,
                      suspicious_pre10am_suppressed: suspiciousCount,
                      charity_events: (dbCharityEvents || []).length,
                      tour_events: (dbToursEvents || []).length,
                  }
              }
          });

      } catch (error) {
          console.warn('Daily tournaments API error:', error);
          // [DT-2 FIX] Return 500 so CDN does NOT cache this error as a valid 200 response.
          // The outer catch prevents crashing — this inner catch handles query-level failures.
          return res.status(500).json({
              success: false,
              error: 'Daily tournaments query failed',
              tournaments: [],
              byTimeSlot: { morning: [], afternoon: [], evening: [], tbd: [] },
              byState: {},
              stats: { total: 0 }
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
// NOTE: generateFallbackSchedule was removed — only real scraped data is served


function groupByTimeSlot(tournaments) {
    const slots = {
        morning: [],   // Before 12pm
        afternoon: [], // 12pm - 5pm
        evening: [],   // 5pm+
        tbd: []        // No published start time
    };

    tournaments.forEach(t => {
        const time = parseTime(t.start_time);
        // parseTime returns -1 for null/unparseable times. Charity events and
        // tour-series events deliberately emit start_time:null to mean TBD, and
        // those were all being presented to the user as morning tournaments.
        if (time < 0) slots.tbd.push(t);
        else if (time < 720) slots.morning.push(t);
        else if (time < 1020) slots.afternoon.push(t);
        else slots.evening.push(t);
    });

    return slots;
}

function groupByState(tournaments) {
    const byState = {};
    tournaments.forEach(t => {
        const state = t.state || 'Unknown';
        if (!byState[state]) byState[state] = [];
        byState[state].push(t);
    });
    return byState;
}

function countByField(tournaments, field) {
    const counts = {};
    tournaments.forEach(t => {
        const value = t[field] || 'Unknown';
        counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
}

export default withSentry(handler);

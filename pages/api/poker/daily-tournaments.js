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
import { createClient } from '../../../src/lib/supabaseServerClient';
import tournamentVenues from '../../../data/tournament-venues.json';
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

// Get current day of week
function getCurrentDay() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const localCurrentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    return days[new Date(localCurrentTime).getDay()];
}

// Parse time string to sortable number (handles: "7:30 PM", "19:30", "7PM", "7:30pm")
function parseTime(timeStr) {
    if (!timeStr) return 0;
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
    return 0;
}

export default async function handler(req, res) {
  try {
    // CDN cache: fresh for 120s, serve stale up to 600s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const {
              day,
              state,
              venue,
              type,      // Card Room, Casino, Charity
              minBuyin,
              maxBuyin,
              game_type, // NLH, PLO, Mixed, etc.
              minGuaranteed, // minimum guaranteed prize pool
              sort = 'time', // time, buyin, guaranteed
              venue_id,      // new param for exact matching
              limit = 999
          } = req.query;

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
                  source_url,
                  last_scraped,
                  is_active
              `)
              .eq('is_active', true)
              .eq('data_quality', 'scraped_verified')
              .order('buy_in', { ascending: true });

          // Filter by day — use ilike for case-insensitive matching
          // (DB has mixed-case day_of_week values: 'saturday', 'MONDAY', 'Daily', etc.)
          let targetDay = getCurrentDay();
          if (day !== 'all') {
              // BUG FIX: strip ILIKE wildcards from day param before interpolation
              targetDay = (day || getCurrentDay()).replace(/[%_\\,().]/g, '').trim().slice(0, 20);
              // ilike handles: Saturday / saturday / SATURDAY all correctly
              query = query.or(`day_of_week.ilike.${targetDay},day_of_week.ilike.daily`);
          }

          // Filter by exact venue ID — must be a valid integer to prevent cast errors
          if (venue_id) {
              const parsedVenueId = parseInt(venue_id, 10);
              if (!isNaN(parsedVenueId) && parsedVenueId > 0) {
                  query = query.eq('venue_id', parsedVenueId);
              }
          }

          // Filter by venue name — strip SQL ILIKE wildcards (% _) to prevent wildcard injection
          if (venue) {
              const safeVenue = venue.replace(/[,().%_\\]/g, ' ').trim().slice(0, 100);
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

          // Fetch all matching rows (no artificial cap — dedup handles volume)
          const parsedLimit = parseInt(limit, 10) || 999;
          query = query.limit(999); // Fetch all for dedup, limit applied after

          const { data: dbTournaments, error } = await query;
          
          // Also fetch active charity events from charity_events_schedule
          let charityQuery = getSupabase()
              .from('charity_events_schedule')
              .select('*')
              .eq('data_quality', 'scraped_verified')
              .eq('is_active', true)  // BUG FIX: was missing is_active filter
              .limit(100);
              
          if (state) {
              const safeState = state.replace(/[()'",.;%_\\]/g, '').trim().slice(0, 50);
              if (safeState) charityQuery = charityQuery.ilike('state', safeState);
          }
          const { data: dbCharityEvents } = await charityQuery;
          
          // Fetch active poker tour series events happening on the target day
          let toursQuery = getSupabase()
              .from('poker_tour_series_events')
              .select('*')
              .eq('data_quality', 'scraped_verified')
              .eq('is_active', true)  // BUG FIX: was missing is_active filter
              .limit(200);
              
          if (state) {
              const safeState = state.replace(/[()'",.;%_\\]/g, '').trim().slice(0, 50);
              if (safeState) toursQuery = toursQuery.ilike('state', safeState);
          }
          const { data: dbToursEvents } = await toursQuery;

          let tournaments = [];
          let rawCount = 0;
          let dedupedCount = 0;

          if (!error && dbTournaments && dbTournaments.length > 0) {
              rawCount = dbTournaments.length;
              
              // ═══════════════════════════════════════════════════════════
              // DEDUP LAYER: Remove duplicate tournaments from multiple scrape runs
              // Key: venue_name + start_time + game_type (normalized, case-insensitive)
              // First occurrence wins (ordered by buy_in ascending from query)
              // ═══════════════════════════════════════════════════════════
              const seenKeys = new Set();
              const dedupedTournaments = [];
              for (const t of dbTournaments) {
                  const key = [
                      (t.venue_name || '').toLowerCase().trim(),
                      (t.day_of_week || '').toLowerCase().trim(),
                      (t.start_time || '').toLowerCase().trim(),
                      (t.game_type || 'nlh').toLowerCase().trim(),
                      (t.buy_in || 0).toString()
                  ].join('|');
                  if (!seenKeys.has(key)) {
                      seenKeys.add(key);
                      dedupedTournaments.push(t);
                  } else {
                      dedupedCount++;
                  }
              }
              
              // Enrich with venue data from source of truth
              const venueMap = new Map();
              tournamentVenues.venues.forEach(v => {
                  venueMap.set(v.name.toLowerCase(), v);
              });

              tournaments = dedupedTournaments.map(t => {
                  const venueInfo = venueMap.get(t.venue_name?.toLowerCase()) || {};
                  return {
                      ...t,
                      state: venueInfo.state || null,
                      city: venueInfo.city || null,
                      venueType: venueInfo.type || 'Unknown',
                      pokerAtlasUrl: venueInfo.pokerAtlasUrl || t.source_url
                  };
              });

              // Filter by state if provided
              if (state) {
                  tournaments = tournaments.filter(t =>
                      t.state?.toUpperCase() === state.toUpperCase()
                  );
              }

              // Filter by venue type
              if (type) {
                  tournaments = tournaments.filter(t =>
                      t.venueType?.toLowerCase().includes(type.toLowerCase())
                  );
              }
              
              // Integrate charity events dynamically
              if (dbCharityEvents && dbCharityEvents.length > 0) {
                  dbCharityEvents.forEach(c => {
                      tournaments.push({
                          id: `charity_${c.id}`,
                          venue_id: `charity_${c.id}`,
                          venue_name: c.charity_name,
                          venueType: 'Charity Room',
                          day_of_week: c.start_date, // Mapped for sorting/fallback
                          start_time: '12:00 PM', // Default
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
              
              // Integrate traveling tours and series events dynamically
              if (dbToursEvents && dbToursEvents.length > 0) {
                  dbToursEvents.forEach(e => {
                      tournaments.push({
                          id: `tour_event_${e.id}`,
                          venue_id: `tour_event_${e.id}`,
                          venue_name: e.venue_name || e.event_name,
                          venueType: 'Tournament Series',
                          day_of_week: e.event_date,
                          start_time: '11:00 AM', // Default
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
          } else {
              // No database data available — return empty (never generate fake data)
              tournaments = [];
          }

          // Sort by chosen field
          if (sort === 'buyin') {
              tournaments.sort((a, b) => (a.buy_in || 0) - (b.buy_in || 0));
          } else if (sort === 'guaranteed') {
              tournaments.sort((a, b) => (b.guaranteed || 0) - (a.guaranteed || 0));
          } else {
              // Default: sort by time
              tournaments.sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
          }

          // Group by time slot
          const byTimeSlot = groupByTimeSlot(tournaments);

          return res.status(200).json({
              success: true,
              day: targetDay,
              totalVenues: tournamentVenues.metadata.totalVenues,
              lastUpdated: tournamentVenues.metadata.lastUpdated,
              tournaments: tournaments.slice(0, parsedLimit),
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
                      charity_events: (dbCharityEvents || []).length,
                      tour_events: (dbToursEvents || []).length,
                  }
              }
          });

      } catch (error) {
          console.error('Daily tournaments API error:', error);
          // Return 200 with empty array — NEVER 500 (would crash fetchAllData Promise.all)
          return res.status(200).json({
              success: false,
              error: 'Daily tournaments query failed',
              tournaments: [],
              byTimeSlot: { morning: [], afternoon: [], evening: [] },
              byState: {},
              stats: { total: 0 }
          });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
// NOTE: generateFallbackSchedule was removed — only real scraped data is served


function groupByTimeSlot(tournaments) {
    const slots = {
        morning: [],   // Before 12pm
        afternoon: [], // 12pm - 5pm
        evening: []    // 5pm+
    };

    tournaments.forEach(t => {
        const time = parseTime(t.start_time);
        if (time < 720) slots.morning.push(t);
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

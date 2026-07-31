/**
 * API: /api/poker/game-predictions
 * Returns per-game-type predictions for a venue based on historical live data.
 * Shows typical open times, peak days, and textual predictions.
 *
 * Query params:
 *   venue_id  - numeric venue ID (required)
 *   venue     - venue name filter (alternative to venue_id)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { gameShortLabel } from '../../../src/components/poker-near-me/normalize-game';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(h) {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// State -> IANA timezone (same table the DailyTournamentsPanel uses client-side).
const IANA_TZ = {
  'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
  'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
  'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
  'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Denver',
  'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
  'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago',
  'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York',
  'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
  'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago',
  'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York',
  'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York',
  'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago',
  'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York',
  'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
  'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York',
  'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York',
  'WI': 'America/Chicago', 'WY': 'America/Denver',
};

/**
 * Bucket a snapshot by the VENUE's local hour/day rather than UTC — otherwise a
 * 7 PM PT peak is reported as 2 AM and Friday nights are attributed to Saturday.
 */
function getLocalParts(value, timeZone) {
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return null;
  try {
    const local = new Date(dt.toLocaleString('en-US', { timeZone }));
    if (!isNaN(local.getTime())) return { hour: local.getHours(), day: local.getDay() };
  } catch (_tzErr) { /* fall through to UTC */ }
  return { hour: dt.getUTCHours(), day: dt.getUTCDay() };
}

/**
 * Resolve a numeric venue_id to its poker_venues row.
 * The documented `venue_id` param is numeric, but the history filter matched it
 * against bravo_slug ('pa-bellagio'), so id-based lookups never matched anything
 * and users saw "not enough historical data" instead of their venue.
 *
 * Returns { row, error }. `error` set means the LOOKUP itself failed — the
 * caller must not report that as "no such venue" (a 404 for a database outage
 * tells the client to stop retrying a venue that actually exists).
 */
async function resolveVenueById(supabase, venueId) {
  const idNum = parseInt(venueId, 10);
  if (isNaN(idNum) || idNum < 1 || !/^\d+$/.test(String(venueId))) return { row: null, error: null };
  try {
    const { data, error } = await supabase
      .from('poker_venues')
      .select('id, name, state')
      .eq('id', idNum)
      .maybeSingle();
    if (error) {
      console.warn('game-predictions: venue lookup failed:', error.message);
      return { row: null, error: error.message || 'venue lookup failed' };
    }
    return { row: data || null, error: null };
  } catch (lookupErr) {
    console.warn('game-predictions: venue lookup threw:', lookupErr.message);
    return { row: null, error: lookupErr.message || 'venue lookup threw' };
  }
}

/** Best-effort venue timezone from poker_venues.state; defaults to Eastern. */
async function resolveVenueTimezone(supabase, venueId, venueName) {
  try {
    const idNum = parseInt(venueId, 10);
    if (!isNaN(idNum) && idNum > 0) {
      const { data } = await supabase
        .from('poker_venues')
        .select('state')
        .eq('id', idNum)
        .maybeSingle();
      const st = (data?.state || '').toUpperCase();
      if (IANA_TZ[st]) return IANA_TZ[st];
    }
  } catch (_err) { /* try by name */ }

  if (venueName) {
    try {
      const { data } = await supabase
        .from('poker_venues')
        .select('state')
        .ilike('name', `%${venueName}%`)
        .limit(1)
        .maybeSingle();
      const st = (data?.state || '').toUpperCase();
      if (IANA_TZ[st]) return IANA_TZ[st];
    } catch (_err) { /* default below */ }
  }

  return 'America/New_York';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
  const venue_id = safeQ(req.query.venue_id);
  const venue = safeQ(req.query.venue);
  // Strip LIKE wildcards + injection chars from both params before filter construction
  const safeVenueId = venue_id ? venue_id.replace(/[()'\",.;%_\\]/g, '').trim().slice(0, 100) : null;
  const safeVenue = venue ? venue.replace(/[()'\",.;%_\\]/g, '').trim().slice(0, 100) : null;

  if (!safeVenueId && !safeVenue) {
    return res.status(400).json({ success: false, error: 'venue_id or venue name required' });
  }

  try {
    const supabase = getSupabase();
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

    // Resolve a numeric venue_id to a real venue before querying history.
    const numericVenueId = safeVenueId && /^\d+$/.test(safeVenueId);
    const venueLookup = numericVenueId
      ? await resolveVenueById(supabase, safeVenueId)
      : { row: null, error: null };
    if (numericVenueId && venueLookup.error) {
      // The venue may well exist — the lookup broke. Never answer 404 for that.
      try { reportApiError(new Error(`game-predictions venue lookup failed: ${venueLookup.error}`), req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({
        success: false,
        degraded: true,
        error: 'Venue lookup failed',
        details: venueLookup.error,
        predictions: [],
        summary: null,
      });
    }
    const venueRow = venueLookup.row;
    if (numericVenueId && !venueRow) {
      // Distinguish "unknown venue id" from "venue exists but has no history".
      return res.status(404).json({
        success: false,
        error: `No venue found for venue_id ${safeVenueId}`,
        predictions: [],
        summary: null,
      });
    }

    // Query per-game history from game_live_history (the additive table).
    // Supabase caps a query at 1000 rows regardless of .limit(), so page with .range().
    const buildQuery = () => {
      let q = supabase
        .from('game_live_history')
        .select('venue_name, game_type, stakes, tables, waiting, snapshot_time')
        .gte('snapshot_time', fourWeeksAgo)
        .order('snapshot_time', { ascending: true });

      if (venueRow?.name) {
        // Numeric venue_id resolved to a real venue — join on its name.
        const safeName = String(venueRow.name).replace(/[%_]/g, '\\$&').slice(0, 120);
        q = q.ilike('venue_name', `%${safeName}%`);
      } else if (safeVenueId) {
        // Non-numeric id: treat it as a bravo_slug, which is what it actually is.
        q = q.or(`bravo_slug.eq.${safeVenueId},bravo_slug.ilike.%${safeVenueId}%`);
      } else if (safeVenue) {
        q = q.ilike('venue_name', `%${safeVenue}%`);
      }
      return q;
    };

    const HISTORY_PAGE_SIZE = 1000;
    const HISTORY_MAX_PAGES = 10;
    let data = [];
    let error = null;
    let historyTruncated = false;
    for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
      const { data: pageRows, error: pageErr } = await buildQuery()
        .range(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE - 1);
      if (pageErr) { error = pageErr; break; }
      if (!pageRows || pageRows.length === 0) break;
      data = data.concat(pageRows);
      if (pageRows.length < HISTORY_PAGE_SIZE) break;
      if (page === HISTORY_MAX_PAGES - 1) {
        historyTruncated = true;
        console.warn(`game-predictions: history page ceiling (${HISTORY_MAX_PAGES * HISTORY_PAGE_SIZE}) reached — analysis is partial`);
      }
    }
    if (error) {
      if (error.code === '42P01' || error.code === '42703') {
        // Table or column doesn't exist yet — graceful empty state
        console.warn('game-predictions: game_live_history not ready yet. Returning empty state.');
        return res.status(200).json({ success: true, predictions: [], message: 'Game history data populating. Check back soon.' });
      }
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Not enough historical data. Predictions will be available after 7+ days of tracking.',
        predictions: [],
        summary: null,
      });
    }

    // Group by game type (bucketed in the venue's local time, not UTC)
    const gameTypeBuckets = {};
    const venueTz = (venueRow && IANA_TZ[(venueRow.state || '').toUpperCase()])
      || await resolveVenueTimezone(supabase, safeVenueId, safeVenue || data[0]?.venue_name);

    data.forEach(row => {
      const parts = getLocalParts(row.snapshot_time, venueTz);
      if (!parts) return;
      const { hour, day } = parts;
      const gameType = gameShortLabel(row.game_type || 'Unknown');
      const tables = row.tables || 1;

      if (!gameTypeBuckets[gameType]) {
        gameTypeBuckets[gameType] = {
          hourCounts: {},
          dayCounts: {},
          totalSnapshots: 0,
          stakesSet: new Set(),
        };
      }

      const bucket = gameTypeBuckets[gameType];
      bucket.totalSnapshots++;
      if (row.stakes) bucket.stakesSet.add(row.stakes);

      // Track hour frequency
      if (!bucket.hourCounts[hour]) bucket.hourCounts[hour] = { tables: 0, count: 0 };
      bucket.hourCounts[hour].tables += tables;
      bucket.hourCounts[hour].count++;

      // Track day frequency
      if (!bucket.dayCounts[day]) bucket.dayCounts[day] = { tables: 0, count: 0 };
      bucket.dayCounts[day].tables += tables;
      bucket.dayCounts[day].count++;
    });

    // Build predictions for each game type
    const predictions = Object.entries(gameTypeBuckets || {}).map(([gameType, bucket]) => {
      // Find peak hour
      const hourEntries = Object.entries(bucket.hourCounts || {})
        .map(([h, v]) => ({ hour: parseInt(h), avgTables: v.tables / v.count, frequency: v.count }))
        .sort((a, b) => b.frequency - a.frequency);

      // Find peak day
      const dayEntries = Object.entries(bucket.dayCounts || {})
        .map(([d, v]) => ({ day: parseInt(d), avgTables: v.tables / v.count, frequency: v.count }))
        .sort((a, b) => b.frequency - a.frequency);

      const peakHour = hourEntries[0] || null;
      const peakDay = dayEntries[0] || null;
      const quietHour = hourEntries[hourEntries.length - 1] || null;

      // Confidence based on data points (more data = higher confidence)
      const confidence = Math.min(Math.round((bucket.totalSnapshots / 50) * 100), 100);

      // Build typical open time range
      const activeHours = hourEntries.filter(h => h.frequency >= 2).map(h => h.hour).sort((a, b) => a - b);
      const openRange = activeHours.length >= 2
        ? `${formatHour(activeHours[0])} \u2013 ${formatHour(activeHours[activeHours.length - 1])}`
        : null;

      // Textual prediction
      const prediction = peakDay && peakHour
        ? `${gameType} typically peaks on ${DAY_NAMES[peakDay.day]}s around ${formatHour(peakHour.hour)}`
        : `${gameType} has been spotted ${bucket.totalSnapshots} time(s) in the last 4 weeks`;

      // Peak days as sorted list
      const peakDays = dayEntries.slice(0, 3).map(d => DAY_SHORT[d.day]);

      return {
        game_type: gameType,
        stakes: [...bucket.stakesSet].slice(0, 5),
        typical_open_time: peakHour ? formatHour(peakHour.hour) : null,
        typical_open_range: openRange,
        peak_days: peakDays,
        peak_hour: peakHour ? { hour: peakHour.hour, label: formatHour(peakHour.hour), avg_tables: Math.round(peakHour.avgTables * 10) / 10 } : null,
        quiet_hour: quietHour ? { hour: quietHour.hour, label: formatHour(quietHour.hour) } : null,
        confidence,
        data_points: bucket.totalSnapshots,
        prediction,
      };
    }).sort((a, b) => b.data_points - a.data_points);

    // Overall summary
    const totalDataPoints = data.length;
    const topGame = predictions[0];
    const summary = topGame
      ? {
          best_time: topGame.peak_days[0] && topGame.typical_open_time
            ? `${topGame.peak_days[0]} at ${topGame.typical_open_time}`
            : null,
          most_popular_game: topGame.game_type,
          data_quality: totalDataPoints >= 100 ? 'Excellent' : totalDataPoints >= 30 ? 'Good' : 'Limited',
        }
      : null;

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      success: true,
      venue_id: safeVenueId || null,
      venue_name: venueRow?.name || null,
      venue_filter: safeVenue || null,
      period: '28 days',
      timezone: venueTz,
      truncated: historyTruncated,
      data_points: totalDataPoints,
      predictions,
      summary,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Game predictions error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

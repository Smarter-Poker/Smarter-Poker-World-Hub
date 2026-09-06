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
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import {
  PNM_TRUTH_CONTRACT_VERSION,
  QUALIFIED_OBSERVED_SOURCES,
  historicalCoverage,
  tableCountFromRow,
} from '../../../src/lib/poker-near-me/dataTruth';

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
  if (!applyRateLimit(req, res, LIMITS.read)) return;

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

    // Resolve a NUMERIC venue_id to the venue's name before filtering.
    //
    // The filter used to be `bravo_slug.eq.<venue_id>,bravo_slug.ilike.%<venue_id>%`
    // while the only caller (BestTimeToGoWidget) passes a numeric poker_venues id.
    // bravo_slug is a slug string, so `bravo_slug = '123'` never matched — the
    // endpoint always returned the "not enough historical data" state — and the
    // ilike half could match any unrelated slug containing that digit run and
    // attribute another venue's history to this one.
    let resolvedVenueName = safeVenue;
    let resolvedVenueState = null;
    const numericVenueId = safeVenueId && /^\d+$/.test(safeVenueId) ? parseInt(safeVenueId, 10) : null;
    if (numericVenueId) {
      const { data: venueRow } = await supabase
        .from('poker_venues')
        .select('id, name, state')
        .eq('id', numericVenueId)
        .maybeSingle();
      if (!venueRow?.name) {
        return res.status(200).json({
          success: true,
          message: 'Verified observed history is not available for this venue yet.',
          predictions: [],
          summary: null,
          data_mode: 'none',
          data_basis: 'positive_observed_tables',
          truth_contract_version: PNM_TRUTH_CONTRACT_VERSION,
        });
      }
      resolvedVenueName = venueRow.name;
      resolvedVenueState = (venueRow.state || '').toUpperCase() || null;
    }

    // Query per-game history from game_live_history (the additive table).
    // Ordered DESC so the row cap discards the OLDEST snapshots, not the newest —
    // ascending + .limit() meant that once a venue exceeded the cap inside the
    // 28-day window the prediction was built entirely from the stalest data and
    // stopped responding to current traffic.
    let query = supabase
      .from('game_live_history')
      .select('venue_name, game_type, stakes, tables, waiting, source, batch_id, snapshot_time')
      .gte('snapshot_time', fourWeeksAgo)
      .in('source', QUALIFIED_OBSERVED_SOURCES)
      .gt('tables', 0)
      .order('snapshot_time', { ascending: false });

    if (resolvedVenueName) {
      const likeSafe = resolvedVenueName.replace(/[%_\\]/g, '').trim().slice(0, 100);
      if (likeSafe) query = query.ilike('venue_name', likeSafe);
    } else if (safeVenueId) {
      // Non-numeric venue_id: treat it as a literal bravo_slug. Exact match only —
      // the old `ilike %slug%` half matched unrelated venues.
      query = query.eq('bravo_slug', safeVenueId);
    }

    const { data, error } = await query.limit(5000);
    if (error) {
      if (error.code === '42P01' || error.code === '42703') {
        // Table or column doesn't exist yet — graceful empty state
        console.warn('game-predictions: game_live_history not ready yet. Returning empty state.');
        return res.status(200).json({
          success: true,
          predictions: [],
          summary: null,
          data_mode: 'none',
          data_basis: 'positive_observed_tables',
          truth_contract_version: PNM_TRUTH_CONTRACT_VERSION,
          message: 'Verified game history is not available yet.',
        });
      }
      throw error;
    }

    const coverage = historicalCoverage(data);
    if (!coverage.sufficientForPrediction) {
      return res.status(200).json({
        success: true,
        message: 'Predictions require positive observed tables across at least 7 distinct days.',
        predictions: [],
        summary: null,
        data_mode: 'none',
        data_basis: 'positive_observed_tables',
        data_points: coverage.dataPoints,
        observed_days: coverage.observedDays,
        truth_contract_version: PNM_TRUTH_CONTRACT_VERSION,
      });
    }
    const historyData = coverage.qualifiedRows;

    // Group by game type (bucketed in the venue's local time, not UTC)
    const gameTypeBuckets = {};
    const venueTz = resolvedVenueState && IANA_TZ[resolvedVenueState]
      ? IANA_TZ[resolvedVenueState]
      : await resolveVenueTimezone(supabase, safeVenueId, resolvedVenueName || historyData[0]?.venue_name);

    historyData.forEach(row => {
      const parts = getLocalParts(row.snapshot_time, venueTz);
      if (!parts) return;
      const { hour, day } = parts;
      const gameType = gameShortLabel(row.game_type || 'Unknown');
      const tables = tableCountFromRow(row);

      if (!gameTypeBuckets[gameType]) {
        gameTypeBuckets[gameType] = {
          hourCounts: {},
          dayCounts: {},
          totalSnapshots: 0,
          stakesSet: new Set(),
          observedDates: new Set(),
        };
      }

      const bucket = gameTypeBuckets[gameType];
      bucket.totalSnapshots++;
      if (row.stakes) bucket.stakesSet.add(row.stakes);
      bucket.observedDates.add(new Date(row.snapshot_time).toISOString().slice(0, 10));

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
        .sort((a, b) => b.avgTables - a.avgTables || b.frequency - a.frequency);

      // Find peak day
      const dayEntries = Object.entries(bucket.dayCounts || {})
        .map(([d, v]) => ({ day: parseInt(d), avgTables: v.tables / v.count, frequency: v.count }))
        .sort((a, b) => b.avgTables - a.avgTables || b.frequency - a.frequency);

      const peakHour = hourEntries[0] || null;
      const peakDay = dayEntries[0] || null;
      const quietHour = hourEntries[hourEntries.length - 1] || null;

      // Confidence based on data points (more data = higher confidence)
      const confidence = Math.min(Math.round((bucket.observedDates.size / 28) * 100), 95);

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
        observed_days: bucket.observedDates.size,
        data_basis: 'positive_observed_tables',
        prediction,
      };
    }).sort((a, b) => b.data_points - a.data_points);

    // Overall summary
    const totalDataPoints = historyData.length;
    const topGame = predictions[0];
    const summary = topGame
      ? {
          best_time: topGame.peak_days[0] && topGame.typical_open_time
            ? `${topGame.peak_days[0]} at ${topGame.typical_open_time}`
            : null,
          most_popular_game: topGame.game_type,
          data_quality: coverage.observedDays >= 21 ? 'Excellent' : coverage.observedDays >= 14 ? 'Good' : 'Limited',
        }
      : null;

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      success: true,
      venue_id: safeVenueId || null,
      venue_filter: safeVenue || null,
      period: '28 days',
      timezone: venueTz,
      data_points: totalDataPoints,
      observed_days: coverage.observedDays,
      data_mode: 'observed_history',
      data_basis: 'positive_observed_tables',
      truth_contract_version: PNM_TRUTH_CONTRACT_VERSION,
      predictions,
      summary,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Game predictions error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

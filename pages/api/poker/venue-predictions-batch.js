/**
 * API: /api/poker/venue-predictions-batch
 * Returns compact prediction summaries for multiple venues in a single request.
 * Designed for the Poker Near Me venue card list — avoids N+1 API calls.
 *
 * Query params:
 *   venue_ids  - comma-separated venue IDs (max 50)
 *
 * Response shape per venue:
 *   { venue_id, best_time, quiet_hours, game_eta[], peak_days[], data_quality, has_data }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { gameShortLabel } from '../../../src/components/poker-near-me/normalize-game';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

/**
 * Analyze a set of snapshot rows and produce a compact prediction summary.
 */
function analyzeVenueData(rows) {
  if (!rows || rows.length === 0) return null;

  // === Aggregate by game type ===
  const gameTypeBuckets = {};
  const hourCounts = {};  // Global hour aggregation for quiet/peak hours
  const dayCounts = {};   // Global day aggregation

  rows.forEach(row => {
    const dt = new Date(row.snapshot_time);
    const hour = dt.getUTCHours();
    const day = dt.getUTCDay();
    const gameType = gameShortLabel(row.game_type || 'Unknown');
    const tables = row.tables || 1;

    // Global hour/day tracking
    if (!hourCounts[hour]) hourCounts[hour] = { count: 0, tables: 0 };
    hourCounts[hour].count++;
    hourCounts[hour].tables += tables;

    if (!dayCounts[day]) dayCounts[day] = { count: 0, tables: 0 };
    dayCounts[day].count++;
    dayCounts[day].tables += tables;

    // Per-game tracking
    if (!gameTypeBuckets[gameType]) {
      gameTypeBuckets[gameType] = { hourCounts: {}, dayCounts: {}, totalSnapshots: 0 };
    }
    const bucket = gameTypeBuckets[gameType];
    bucket.totalSnapshots++;
    if (!bucket.hourCounts[hour]) bucket.hourCounts[hour] = { count: 0, tables: 0 };
    bucket.hourCounts[hour].count++;
    bucket.hourCounts[hour].tables += tables;
    if (!bucket.dayCounts[day]) bucket.dayCounts[day] = { count: 0, tables: 0 };
    bucket.dayCounts[day].count++;
    bucket.dayCounts[day].tables += tables;
  });

  // === Peak time (global) ===
  const peakHourEntries = Object.entries(hourCounts || {})
    .map(([h, v]) => ({ hour: parseInt(h), freq: v.count }))
    .sort((a, b) => b.freq - a.freq);
  const peakDayEntries = Object.entries(dayCounts || {})
    .map(([d, v]) => ({ day: parseInt(d), freq: v.count }))
    .sort((a, b) => b.freq - a.freq);

  const bestHour = peakHourEntries[0] || null;
  const bestDay = peakDayEntries[0] || null;
  const best_time = bestDay && bestHour
    ? `${DAY_SHORT[bestDay.day]} at ${formatHour(bestHour.hour)}`
    : null;

  // === Peak days (top 3) ===
  const peak_days = peakDayEntries.slice(0, 3).map(d => DAY_SHORT[d.day]);

  // === Day activity scores for mini bar chart (7 values, 0-100) ===
  const maxDayFreq = Math.max(...Object.values(dayCounts || {}).map(d => d.count), 1);
  const day_scores = [];
  for (let d = 0; d < 7; d++) {
    const dc = dayCounts[d];
    day_scores.push(dc ? Math.round((dc.count / maxDayFreq) * 100) : 0);
  }

  // === Quiet hours analysis ===
  // Find contiguous blocks of low activity
  const quietThreshold = peakHourEntries.length > 4
    ? peakHourEntries[Math.floor(peakHourEntries.length * 0.7)]?.freq || 0
    : 0;

  // Identify quiet days (bottom 40% of day frequency)
  const quietDayThreshold = peakDayEntries.length > 3
    ? peakDayEntries[Math.floor(peakDayEntries.length * 0.6)]?.freq || 0
    : 0;
  const quietDays = peakDayEntries
    .filter(d => d.freq <= quietDayThreshold)
    .map(d => d.day)
    .sort((a, b) => a - b);

  // Identify quiet hours (bottom 40%)
  const quietHours = peakHourEntries
    .filter(h => h.freq <= quietThreshold)
    .map(h => h.hour)
    .sort((a, b) => a - b);

  let quiet_hours = null;
  if (quietDays.length > 0 && quietHours.length > 0) {
    // Build natural language: "Mon-Wed before 4 PM"
    const dayRanges = buildDayRanges(quietDays);
    const hourDesc = describeQuietHours(quietHours);
    if (dayRanges && hourDesc) {
      quiet_hours = `${dayRanges} ${hourDesc}`;
    }
  } else if (quietHours.length > 0) {
    quiet_hours = describeQuietHours(quietHours);
  }

  // === Game-specific ETA (non-NLH predictions) ===
  const game_eta = [];
  Object.entries(gameTypeBuckets || {}).forEach(([gameType, bucket]) => {
    if (bucket.totalSnapshots < 5) return; // Need minimum data
    const gamePeakDays = Object.entries(bucket.dayCounts || {})
      .map(([d, v]) => ({ day: parseInt(d), freq: v.count }))
      .sort((a, b) => b.freq - a.freq);
    const gamePeakHours = Object.entries(bucket.hourCounts || {})
      .map(([h, v]) => ({ hour: parseInt(h), freq: v.count }))
      .sort((a, b) => b.freq - a.freq);

    if (gamePeakDays.length > 0 && gamePeakHours.length > 0) {
      const confidence = Math.min(Math.round((bucket.totalSnapshots / 50) * 100), 100);
      // Only include non-NLH game ETAs on cards (NLH is always running)
      // But always include if it's the only game type
      const isOnlyGame = Object.keys(gameTypeBuckets || {}).length === 1;
      if (gameType !== 'NLH' || isOnlyGame) {
        game_eta.push({
          game: gameType,
          label: `Usually opens ${DAY_SHORT[gamePeakDays[0].day]} ${formatHour(gamePeakHours[0].hour)}`,
          confidence,
        });
      }
    }
  });
  // Sort by confidence desc, limit to 2 for card display
  game_eta.sort((a, b) => b.confidence - a.confidence);

  // === Data quality ===
  const totalPoints = rows.length;
  const data_quality = totalPoints >= 100 ? 'Excellent' : totalPoints >= 30 ? 'Good' : 'Limited';

  return {
    best_time,
    quiet_hours,
    game_eta: game_eta.slice(0, 2),
    peak_days,
    day_scores,
    data_quality,
    data_points: totalPoints,
    has_data: true,
  };
}

/**
 * Convert array of day indices [1,2,3] into "Mon-Wed"
 */
function buildDayRanges(days) {
  if (days.length === 0) return null;
  if (days.length === 1) return DAY_SHORT[days[0]] + 's';

  // Check if contiguous
  let isContiguous = true;
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] !== 1) { isContiguous = false; break; }
  }

  if (isContiguous && days.length >= 2) {
    return `${DAY_SHORT[days[0]]}-${DAY_SHORT[days[days.length - 1]]}`;
  }
  return days.map(d => DAY_SHORT[d]).join(', ');
}

/**
 * Convert array of quiet hours into natural language description.
 */
function describeQuietHours(hours) {
  if (hours.length === 0) return null;
  // Find the dominant pattern
  const morningHours = hours.filter(h => h < 12);
  const afternoonHours = hours.filter(h => h >= 12 && h < 17);
  const eveningHours = hours.filter(h => h >= 17);

  if (morningHours.length > afternoonHours.length && morningHours.length > eveningHours.length) {
    const maxMorning = Math.max(...morningHours);
    return `before ${formatHour(maxMorning + 1)}`;
  }
  if (afternoonHours.length > 0 && morningHours.length > 0) {
    return `before ${formatHour(Math.max(...afternoonHours) + 1)}`;
  }
  if (eveningHours.length > morningHours.length) {
    return `after ${formatHour(Math.min(...eveningHours))}`;
  }
  // Default: use first and last
  return `${formatHour(hours[0])}-${formatHour(hours[hours.length - 1])}`;
}

// Cache the venue ID→name map from static JSON (loaded once per cold start)
let _venueIdToName = null;
function getVenueIdToNameMap() {
  if (_venueIdToName) return _venueIdToName;
  try {
    const fs = require('fs');
    const path = require('path');
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'all-venues.json');
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const venues = raw.venues || raw.data || raw || [];
    _venueIdToName = {};
    (Array.isArray(venues) ? venues : []).forEach(v => {
      if (v.id && v.name) _venueIdToName[v.id] = v.name;
    });
  } catch (e) {
    console.warn('venue-predictions-batch: failed to load all-venues.json:', e.message);
    _venueIdToName = {};
  }
  return _venueIdToName;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
  const venue_ids = safeQ(req.query.venue_ids);
  if (!venue_ids) {
    return res.status(400).json({ success: false, error: 'venue_ids required (comma-separated)' });
  }

  const ids = venue_ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (ids.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid venue IDs provided' });
  }

  try {
    const supabase = getSupabase();
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

    // Resolve venue IDs → names from static JSON (same source as frontend)
    const idToNameMap = getVenueIdToNameMap();
    const nameToId = {};
    const venueNamesArray = [];

    ids.forEach(id => {
      const intId = parseInt(id, 10);
      const name = idToNameMap[intId];
      if (name) {
        nameToId[name.toLowerCase()] = intId;
        venueNamesArray.push(name);
      }
    });

    if (venueNamesArray.length === 0) {
      return res.status(200).json({ success: true, predictions: {} });
    }

    // Fetch history for all these venues by name from game_live_history
    let historyData = [];
    // Batch in chunks of 20 venue names to avoid query limits
    for (let i = 0; i < venueNamesArray.length; i += 20) {
      const batch = venueNamesArray.slice(i, i + 20);
      const { data, error } = await supabase
        .from('game_live_history')
        .select('venue_name, game_type, tables, waiting, snapshot_time')
        .gte('snapshot_time', fourWeeksAgo)
        .in('venue_name', batch)
        .order('snapshot_time', { ascending: true })
        .limit(10000);

      if (error) {
        if (error.code === '42P01' || error.code === '42703') {
          // Table not ready — return empty state for all
          const predictions = {};
          ids.forEach(id => { predictions[id] = { has_data: false }; });
          return res.status(200).json({ success: true, predictions });
        }
        console.warn('venue-predictions-batch: history query error:', error.message);
        continue;
      }
      if (data) historyData = historyData.concat(data);
    }

    // Group history by venue ID
    const byVenue = {};
    historyData.forEach(row => {
      const venueName = (row.venue_name || '').toLowerCase();
      const venueId = nameToId[venueName];
      if (!venueId) return;
      if (!byVenue[venueId]) byVenue[venueId] = [];
      byVenue[venueId].push(row);
    });

    // Analyze each venue
    const predictions = {};
    ids.forEach(id => {
      const intId = parseInt(id, 10);
      const rows = byVenue[intId];
      if (!rows || rows.length < 5) {
        predictions[id] = { has_data: false };
        return;
      }
      const analysis = analyzeVenueData(rows);
      predictions[id] = analysis || { has_data: false };
      if (analysis) predictions[id].venue_id = intId;
    });

    // Cache aggressively — this data updates slowly
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      success: true,
      predictions,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('venue-predictions-batch error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


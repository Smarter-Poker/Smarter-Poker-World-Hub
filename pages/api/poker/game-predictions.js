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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { venue_id, venue } = req.query;
  const safeVenueId = venue_id ? venue_id.replace(/[()'",.;]/g, '').trim() : null;
  const safeVenue = venue ? venue.replace(/[()'",.;]/g, '').trim() : null;

  if (!safeVenueId && !safeVenue) {
    return res.status(400).json({ success: false, error: 'venue_id or venue name required' });
  }

  try {
    const supabase = getSupabase();
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

    // Query per-game history from game_live_history (the additive table)
    let query = supabase
      .from('game_live_history')
      .select('venue_name, game_type, stakes, tables, waiting, snapshot_time')
      .gte('snapshot_time', fourWeeksAgo)
      .order('snapshot_time', { ascending: true });

    if (safeVenueId) {
      // Match by bravo_slug pattern for venue_id
      query = query.or(`bravo_slug.eq.${safeVenueId},bravo_slug.ilike.%${safeVenueId}%`);
    } else if (safeVenue) {
      query = query.ilike('venue_name', `%${safeVenue}%`);
    }

    const { data, error } = await query.limit(10000);
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

    // Group by game type
    const gameTypeBuckets = {};

    data.forEach(row => {
      const dt = new Date(row.snapshot_time);
      const hour = dt.getUTCHours();
      const day = dt.getUTCDay();
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
    const predictions = Object.entries(gameTypeBuckets).map(([gameType, bucket]) => {
      // Find peak hour
      const hourEntries = Object.entries(bucket.hourCounts)
        .map(([h, v]) => ({ hour: parseInt(h), avgTables: v.tables / v.count, frequency: v.count }))
        .sort((a, b) => b.frequency - a.frequency);

      // Find peak day
      const dayEntries = Object.entries(bucket.dayCounts)
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
      venue_id: venue_id || null,
      venue_filter: venue || null,
      period: '28 days',
      data_points: totalDataPoints,
      predictions,
      summary,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('Game predictions error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * API: /api/poker/peak-activity
 * Returns peak activity analysis per venue from venue_live_history.
 * Shows busiest hours, busiest days, and optimal visit times.
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
  const venue = safeQ(req.query.venue);
  const venue_id = safeQ(req.query.venue_id);
  const game_type = safeQ(req.query.game_type);
  const safeVenue = venue ? venue.replace(/[()'",.;%_\\]/g, '').trim().slice(0, 100) : null;
  const safeVenueId = venue_id ? venue_id.replace(/[()'",.;%_\\]/g, '').trim().slice(0, 100) : null;
  const safeGameType = game_type ? game_type.replace(/[()'",.;%_\\]/g, '').trim().slice(0, 50) : null;
  
  // CDN cache: fresh for 5min, serve stale up to 10min
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  
  try {
    const supabase = getSupabase();
    
    // Get last 14 days of history
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    
    let data, error;
    
    // If game_type is specified, use game_live_history for per-game heatmaps
    if (game_type) {
      let query = supabase
        .from('game_live_history')
        .select('venue_name, game_type, tables, snapshot_time')
        .gte('snapshot_time', twoWeeksAgo)
        .order('snapshot_time', { ascending: true });
      
      if (safeVenueId) {
        query = query.or(`bravo_slug.eq.${safeVenueId},bravo_slug.ilike.%${safeVenueId}%`);
      } else if (safeVenue) {
        query = query.ilike('venue_name', `%${safeVenue}%`);
      }
      
      const result = await query.limit(5000);
      data = result.data;
      error = result.error;
      
      // Filter by the canonical game type and map columns to match expected shape
      if (data) {
        data = data
          .filter(row => gameShortLabel(row.game_type || '') === game_type)
          .map(row => ({
            venue_name: row.venue_name,
            total_tables: row.tables || 0,
            snapshot_time: row.snapshot_time,
          }));
      }
    } else {
      // Default: use venue_live_history (aggregate venue-level data)
      let query = supabase
        .from('venue_live_history')
        .select('venue_name, total_tables, snapshot_time')
        .gte('snapshot_time', twoWeeksAgo)
        .order('snapshot_time', { ascending: true });
      
      if (safeVenueId) {
        query = query.eq('venue_id', parseInt(safeVenueId, 10));
      } else if (safeVenue) {
        query = query.ilike('venue_name', `%${safeVenue}%`);
      }
      
      const result = await query.limit(5000);
      data = result.data;
      error = result.error;
    }
    
    if (error) {
      // Handle missing table gracefully
      if (error.code === '42P01' || error.code === '42703') {
        console.warn('Peak activity: table not ready yet:', error.message);
        return res.status(200).json({ 
          message: 'Historical data not available yet.',
          heatmap: [],
          peak_hours: [],
          peak_days: [],
        });
      }
      console.warn('Peak activity query failed:', error.message);
      return res.status(200).json({ 
        message: 'Historical data not available yet.',
        heatmap: [],
        peak_hours: [],
        peak_days: [],
      });
    }
    
    if (!data || data.length === 0) {
      return res.status(200).json({ 
        message: 'Not enough historical data yet. Heatmap will populate within 24-48 hours.',
        heatmap: [],
        peak_hours: [],
        peak_days: [],
      });
    }
    
    // Build hour-of-day / day-of-week aggregation
    const hourBuckets = {}; // { hour: { totalTables, count } }
    const dayBuckets = {};  // { day: { totalTables, count } }
    const heatmap = {};     // { "day-hour": { totalTables, count } }
    
    data.forEach(row => {
      const dt = new Date(row.snapshot_time);
      const hour = dt.getUTCHours();
      const day = dt.getUTCDay();
      const tables = row.total_tables || 0;
      
      // Hour buckets
      if (!hourBuckets[hour]) hourBuckets[hour] = { totalTables: 0, count: 0 };
      hourBuckets[hour].totalTables += tables;
      hourBuckets[hour].count += 1;
      
      // Day buckets  
      if (!dayBuckets[day]) dayBuckets[day] = { totalTables: 0, count: 0 };
      dayBuckets[day].totalTables += tables;
      dayBuckets[day].count += 1;
      
      // Heatmap (day x hour)
      const key = `${day}-${hour}`;
      if (!heatmap[key]) heatmap[key] = { totalTables: 0, count: 0 };
      heatmap[key].totalTables += tables;
      heatmap[key].count += 1;
    });
    
    // Calculate averages
    const peakHours = Object.entries(hourBuckets)
      .map(([hour, b]) => ({
        hour: parseInt(hour),
        label: formatHour(parseInt(hour)),
        avg_tables: Math.round(b.totalTables / b.count * 10) / 10,
        samples: b.count,
      }))
      .sort((a, b) => b.avg_tables - a.avg_tables);
    
    const peakDays = Object.entries(dayBuckets)
      .map(([day, b]) => ({
        day: parseInt(day),
        label: DAY_NAMES[parseInt(day)],
        avg_tables: Math.round(b.totalTables / b.count * 10) / 10,
        samples: b.count,
      }))
      .sort((a, b) => b.avg_tables - a.avg_tables);
    
    // Full heatmap grid (7 days x 24 hours)
    const heatmapGrid = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const key = `${d}-${h}`;
        const bucket = heatmap[key];
        heatmapGrid.push({
          day: d,
          day_label: DAY_NAMES[d],
          hour: h,
          hour_label: formatHour(h),
          avg_tables: bucket ? Math.round(bucket.totalTables / bucket.count * 10) / 10 : 0,
          samples: bucket?.count || 0,
        });
      }
    }

    // Find max for normalization
    const maxAvg = Math.max(...heatmapGrid.map(c => c.avg_tables), 1);
    heatmapGrid.forEach(c => {
      c.intensity = Math.round((c.avg_tables / maxAvg) * 100);
    });
    
    // Best time to visit
    const bestSlot = peakHours[0];
    const bestDay = peakDays[0];
    
    res.status(200).json({
      venue_filter: safeVenue || safeVenueId || 'all',
      data_points: data.length,
      period: '14 days',
      peak_hours: peakHours.slice(0, 6),
      peak_days: peakDays,
      heatmap: heatmapGrid,
      best_time: bestSlot ? `${bestDay?.label || 'Weekend'} at ${bestSlot.label}` : null,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Peak activity error:', err);
    res.status(500).json({ error: err.message });
  }
}

function formatHour(h) {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

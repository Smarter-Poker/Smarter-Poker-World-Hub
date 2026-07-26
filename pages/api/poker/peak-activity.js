/**
 * API: /api/poker/peak-activity
 * Returns peak activity analysis per venue from venue_live_history.
 * Shows busiest hours, busiest days, and optimal visit times.
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
 * Bucket a timestamp by the VENUE's local hour/day instead of UTC.
 * Snapshots are stored in UTC; bucketing them with getUTCHours() reported a
 * Las Vegas 7 PM peak as 2 AM and pushed Friday nights onto Saturday.
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
async function resolveVenueTimezone(supabase, venueName) {
  if (!venueName) return 'America/New_York';
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
  return 'America/New_York';
}

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
        // venue_live_history is keyed on bravo_slug — it has no venue_id column,
        // so the old .eq('venue_id', parseInt(...)) always errored (and NaN'd on slugs).
        query = query.or(`bravo_slug.eq.${safeVenueId},bravo_slug.ilike.%${safeVenueId}%`);
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
    
    // Bucket in venue-local time (falls back to Eastern for multi-venue queries)
    const venueTz = await resolveVenueTimezone(supabase, safeVenue || data[0]?.venue_name);

    data.forEach(row => {
      const parts = getLocalParts(row.snapshot_time, venueTz);
      if (!parts) return;
      const { hour, day } = parts;
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
    const peakHours = Object.entries(hourBuckets || {})
      .map(([hour, b]) => ({
        hour: parseInt(hour),
        label: formatHour(parseInt(hour)),
        avg_tables: Math.round(b.totalTables / b.count * 10) / 10,
        samples: b.count,
      }))
      .sort((a, b) => b.avg_tables - a.avg_tables);
    
    const peakDays = Object.entries(dayBuckets || {})
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
      timezone: venueTz,
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

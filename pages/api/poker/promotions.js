import { createClient } from '../../../src/lib/supabaseServerClient';
import allVenuesData from '../../../data/all-venues.json';
import tourSeriesData from '../../../data/poker-tour-series-2026.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Build lookup maps for page names
function buildNameLookups() {
  const venueNames = {};
  (Array.isArray(allVenuesData) ? allVenuesData : allVenuesData.venues || []).forEach(v => {
    if (v.id) venueNames[String(v.id)] = v.name || v.venue_name || 'Venue';
    if (v.slug) venueNames[v.slug] = v.name || v.venue_name || 'Venue';
  });
  const tourNames = {};
  const seriesNames = {};

  // Handle tours — can be an object dictionary { WSOP: {...}, WPT: {...} } or an array
  const toursRaw = tourSeriesData.tours;
  if (toursRaw && typeof toursRaw === 'object' && !Array.isArray(toursRaw)) {
    // Dictionary format: keys are tour codes
    Object.entries(toursRaw).forEach(([code, t]) => {
      tourNames[code] = t.name || t.tour_name || code;
      // Handle nested series inside tours
      if (t.series && Array.isArray(t.series)) {
        t.series.forEach(s => {
          if (s.id) seriesNames[String(s.id)] = s.name || s.short_name || 'Series';
        });
      }
    });
  } else {
    // Array format (legacy)
    const tourList = Array.isArray(tourSeriesData) ? tourSeriesData : (toursRaw || tourSeriesData.data || []);
    (Array.isArray(tourList) ? tourList : []).forEach(t => {
      if (t.type === 'tour' || t.tour_code) {
        var key = t.id || t.tour_code || t.code;
        if (key) tourNames[String(key)] = t.name || t.tour_name || 'Tour';
      }
      if (t.type === 'series' || t.series_id) {
        var key2 = t.id || t.series_id;
        if (key2) seriesNames[String(key2)] = t.name || t.series_name || t.short_name || 'Series';
      }
      if (t.series && Array.isArray(t.series)) {
        t.series.forEach(s => {
          if (s.id) seriesNames[String(s.id)] = s.name || s.short_name || 'Series';
        });
      }
    });
  }

  // Handle series_2026 key (top-level series array)
  const seriesArr = tourSeriesData.series_2026 || tourSeriesData.series || [];
  if (Array.isArray(seriesArr)) {
    seriesArr.forEach(s => {
      var key = s.id || s.series_id;
      if (key) seriesNames[String(key)] = s.name || s.series_name || s.short_name || 'Series';
    });
  }

  return { venueNames, tourNames, seriesNames };
}

function lookupPageName(lookups, pageType, pageId) {
  var id = String(pageId);
  if (pageType === 'venue') return lookups.venueNames[id] || null;
  if (pageType === 'tour') return lookups.tourNames[id] || null;
  if (pageType === 'series') return lookups.seriesNames[id] || null;
  return null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
};

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { page_type, page_id, limit = '50', offset = '0' } = req.query;
    const limitNum = parseInt(limit, 10);
    const offsetNum = parseInt(offset, 10);

    let query = supabase
      .from('page_activity')
      .select('*')
      .eq('activity_type', 'promotion')
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (page_type && page_type !== 'all') {
      query = query.eq('page_type', page_type)
          .limit(100);
    }
    if (page_id) {
      query = query.eq('page_id', page_id)
          .limit(100);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching promotions:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Also fetch page_notifications with type 'promotion'
    let notifQuery = supabase
      .from('page_notifications')
      .select('*')
      .eq('notification_type', 'promotion')
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (page_type && page_type !== 'all') {
      notifQuery = notifQuery.eq('page_type', page_type)
          .limit(100);
    }
    if (page_id) {
      notifQuery = notifQuery.eq('page_id', page_id)
          .limit(100);
    }

    const { data: notifData, error: notifError } = await notifQuery;

    if (notifError) {
      console.error('Error fetching promotion notifications:', notifError);
    }

    // Build name lookups for enrichment
    const lookups = buildNameLookups();

    // Combine and sort by created_at
    const promotions = [
      ...(data || []).map(a => ({
        id: 'activity-' + a.id,
        page_type: a.page_type,
        page_id: a.page_id,
        page_name: lookupPageName(lookups, a.page_type, a.page_id),
        title: null,
        content: a.content,
        source: 'activity',
        created_at: a.created_at,
      })),
      ...(notifData || []).map(n => ({
        id: 'notif-' + n.id,
        page_type: n.page_type,
        page_id: n.page_id,
        page_name: lookupPageName(lookups, n.page_type, n.page_id),
        title: n.title,
        content: n.message,
        source: 'notification',
        created_at: n.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({
      success: true,
      promotions: promotions.slice(0, limitNum),
      total: promotions.length,
    });
  } catch (err) {
    console.error('Promotions API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

import { createClient } from '../../../src/lib/supabaseServerClient';
import allVenuesData from '../../../data/all-venues.json';
import tourSeriesData from '../../../data/poker-tour-series-2026.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
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
    Object.entries(toursRaw || {}).forEach(([code, t]) => {
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



export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET, OPTIONS', headers: 'Content-Type, x-user-id' })) return;
try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const page_type = safeQ(req.query.page_type);
      const page_id = safeQ(req.query.page_id);
      const rawLimit = safeQ(req.query.limit) || '30';
      const rawOffset = safeQ(req.query.offset) || '0';
      const limitNum = Math.min(parseInt(rawLimit, 10) || 30, 100);
      const offsetNum = Math.min(parseInt(rawOffset, 10) || 0, 5000);

      // PAGINATION: two independent sources are merged, sorted and sliced, so
      // each source must be read from row 0 up to the END of the requested page
      // — not from `offset`. Applying the same offset to both dropped every item
      // that sorted into page 1 from one source and page 2 from the other, so
      // those rows were never returned at all. The trailing `.limit(100)` calls
      // also silently clobbered `.range()` whenever page_type/page_id was
      // supplied, which is why a caller asking for limit=200 got at most 100.
      const mergeWindow = Math.min(offsetNum + limitNum, 1000); // PostgREST per-response ceiling

      let query = getSupabase()
        .from('page_activity')
        .select('*')
        .eq('activity_type', 'promotion')
        .order('created_at', { ascending: false })
        .range(0, mergeWindow - 1);

      let countQuery = getSupabase()
        .from('page_activity')
        .select('id', { count: 'exact', head: true })
        .eq('activity_type', 'promotion');

      if (page_type && page_type !== 'all') {
        query = query.eq('page_type', page_type);
        countQuery = countQuery.eq('page_type', page_type);
      }
      if (page_id) {
        query = query.eq('page_id', page_id);
        countQuery = countQuery.eq('page_id', page_id);
      }

      const { data, error } = await query;

      if (error) {
        console.warn('Error fetching promotions:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }

      // Also fetch page_notifications with type 'promotion'
      let notifQuery = getSupabase()
        .from('page_notifications')
        .select('*')
        .eq('notification_type', 'promotion')
        .order('created_at', { ascending: false })
        .range(0, mergeWindow - 1);

      let notifCountQuery = getSupabase()
        .from('page_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('notification_type', 'promotion');

      if (page_type && page_type !== 'all') {
        notifQuery = notifQuery.eq('page_type', page_type);
        notifCountQuery = notifCountQuery.eq('page_type', page_type);
      }
      if (page_id) {
        notifQuery = notifQuery.eq('page_id', page_id);
        notifCountQuery = notifCountQuery.eq('page_id', page_id);
      }

      const { data: notifData, error: notifError } = await notifQuery;

      if (notifError) {
        console.warn('Error fetching promotion notifications:', notifError);
      }

      // Exact row counts so a client knows when to stop paging. `total` used to
      // be the size of the merged PAGE, which never told the caller anything.
      let totalCount = null;
      try {
        const [{ count: actCount }, { count: nCount }] = await Promise.all([countQuery, notifCountQuery]);
        totalCount = (actCount || 0) + (nCount || 0);
      } catch (countErr) {
        console.warn('[promotions] exact count failed (non-fatal):', countErr?.message || countErr);
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

      const pagedPromotions = promotions.slice(offsetNum, offsetNum + limitNum);

      return res.status(200).json({
        success: true,
        promotions: pagedPromotions,
        total: totalCount != null ? totalCount : promotions.length,
        offset: offsetNum,
        limit: limitNum,
      });
    } catch (err) {
      console.warn('Promotions API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

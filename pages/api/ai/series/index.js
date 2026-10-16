import { createClient } from '../../../../src/lib/supabaseServerClient';

/**
 * Public AI Agent Poker Tournament Series API
 * GET /api/ai/series?query=WSOP&state=NV&limit=20
 *
 * Clean, structured series search optimized for AI agents and chat assistants.
 */
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');

  const { query, state, limit = '20' } = req.query;
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  try {
    let q = getSupabase()
      .from('tournament_series')
      .select('id, name, venue_name, city, state, start_date, end_date, total_events, main_event_buyin, main_event_guaranteed')
      .order('id', { ascending: false })
      .limit(parsedLimit);

    if (state) {
      q = q.ilike('state', String(state).trim());
    }

    if (query) {
      const term = `%${String(query).trim()}%`;
      q = q.or(`name.ilike.${term},venue_name.ilike.${term},city.ilike.${term}`);
    }

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const series = (data || []).map((s) => {
      const sid = String(s.id);
      const ogParams = new URLSearchParams({
        id: sid,
        name: s.name || '',
        venue: s.venue_name || '',
        city: s.city || '',
        state: s.state || '',
        events: s.total_events ? String(s.total_events) : '',
        buyin: s.main_event_buyin ? String(s.main_event_buyin) : '',
        guarantee: s.main_event_guaranteed ? String(s.main_event_guaranteed) : '',
      });

      return {
        id: sid,
        name: s.name,
        venueName: s.venue_name,
        city: s.city,
        state: s.state,
        startDate: s.start_date,
        endDate: s.end_date,
        totalEvents: s.total_events || 0,
        mainEventBuyin: s.main_event_buyin,
        mainEventGuaranteed: s.main_event_guaranteed,
        url: `https://smarter.poker/hub/series/${encodeURIComponent(sid)}`,
        ogImageUrl: `https://smarter.poker/api/og/series-card?${ogParams.toString()}`,
      };
    });

    return res.status(200).json({
      success: true,
      count: series.length,
      data: series,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

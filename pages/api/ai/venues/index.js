import { createClient } from '../../../../src/lib/supabaseServerClient';

/**
 * Public AI Agent Venues API
 * GET /api/ai/venues?query=Bellagio&state=NV&city=Las+Vegas&limit=20
 *
 * Clean, structured endpoint optimized for tool-calling agents, ChatGPT actions,
 * and autonomous LLM search bots without browser cookies or session overhead.
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

  const { query, state, city, limit = '20' } = req.query;
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  try {
    let q = getSupabase()
      .from('poker_venues')
      .select('id, name, venue_type, city, state, address, phone, tables_count, logo_url')
      .order('name', { ascending: true })
      .limit(parsedLimit);

    if (state) {
      q = q.ilike('state', String(state).trim());
    }

    if (city) {
      q = q.ilike('city', `%${String(city).trim()}%`);
    }

    if (query) {
      const term = `%${String(query).trim()}%`;
      q = q.or(`name.ilike.${term},city.ilike.${term},address.ilike.${term}`);
    }

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const venues = (data || []).map((v) => {
      const vid = String(v.id);
      const ogParams = new URLSearchParams({
        id: vid,
        name: v.name || '',
        city: v.city || '',
        state: v.state || '',
        type: v.venue_type || '',
        tables: v.tables_count ? String(v.tables_count) : '',
      });

      return {
        id: vid,
        name: v.name,
        venueType: v.venue_type,
        city: v.city,
        state: v.state,
        address: v.address,
        phone: v.phone,
        tablesCount: v.tables_count,
        url: `https://smarter.poker/hub/venues/${encodeURIComponent(vid)}`,
        ogImageUrl: `https://smarter.poker/api/og/venue-card?${ogParams.toString()}`,
      };
    });

    return res.status(200).json({
      success: true,
      count: venues.length,
      data: venues,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

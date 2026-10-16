import { createClient } from '../../../../src/lib/supabaseServerClient';

/**
 * Public AI Agent Venue Detail API
 * GET /api/ai/venues/[id]
 *
 * Detailed venue retrieval for AI agents and chat assistants.
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

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing venue ID' });
  }

  try {
    const isNumeric = /^\d+$/.test(String(id).trim());
    let query = getSupabase()
      .from('poker_venues')
      .select('id, name, venue_type, city, state, address, phone, tables_count, about, website, logo_url');

    if (isNumeric) {
      query = query.eq('id', parseInt(id, 10));
    } else {
      query = query.eq('id', String(id).trim());
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    const vid = String(data.id);
    const ogParams = new URLSearchParams({
      id: vid,
      name: data.name || '',
      city: data.city || '',
      state: data.state || '',
      type: data.venue_type || '',
      tables: data.tables_count ? String(data.tables_count) : '',
    });

    const venue = {
      id: vid,
      name: data.name,
      venueType: data.venue_type,
      city: data.city,
      state: data.state,
      address: data.address,
      phone: data.phone,
      tablesCount: data.tables_count,
      description: data.about || null,
      website: data.website || null,
      url: `https://smarter.poker/hub/venues/${encodeURIComponent(vid)}`,
      ogImageUrl: `https://smarter.poker/api/og/venue-card?${ogParams.toString()}`,
    };

    return res.status(200).json({
      success: true,
      data: venue,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * API: /api/poker/live-tables
 * Returns live table data from Smarter.Poker Intelligence.
 * Data is refreshed every 15 minutes by autonomous daemons.
 *
 * Query params:
 *   ?venue=slug       — Filter by specific bravo_slug
 *   ?search=term      — Search venue names (fuzzy ilike)
 *   ?list=true        — Return venue name list only (for search dropdown)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const { venue, search, list } = req.query;

    // Mode 1: Return searchable venue list (name + slug only)
    if (list === 'true') {
      const { data, error } = await supabase
        .from('venue_live_tables')
        .select('bravo_slug, venue_name')
        .order('venue_name')
        .limit(10000);

      if (error) {
        console.error('Live tables list error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      // Deduplicate by bravo_slug
      const seen = new Set();
      const venues = [];
      for (const row of (data || [])) {
        if (!seen.has(row.bravo_slug)) {
          seen.add(row.bravo_slug);
          venues.push({ slug: row.bravo_slug, name: row.venue_name });
        }
      }

      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ venues });
    }

    // Mode 2: Get live games for specific venue(s)
    let query = supabase
      .from('venue_live_tables')
      .select('*')
      .order('scrape_timestamp', { ascending: false });

    if (venue) {
      query = query.eq('bravo_slug', venue);
    } else if (search) {
      query = query.ilike('venue_name', `%${search}%`);
    }

    const { data, error } = await query.limit(10000);

    if (error) {
      console.error('Live tables query error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }

    // Group by venue
    const grouped = {};
    for (const row of (data || [])) {
      const slug = row.bravo_slug;
      if (!grouped[slug]) {
        grouped[slug] = {
          venue_name: row.venue_name,
          bravo_slug: slug,
          last_updated: row.scrape_timestamp,
          games: [],
        };
      }
      grouped[slug].games.push({
        game: row.game_name,
        tables_running: row.tables_running,
        players_waiting: row.players_waiting,
        source: row.source || 'bravo',
        buyin: row.buyin_range || null,
        runs: row.runs_schedule || null,
        data_quality: row.data_quality || null,
      });
    }

    const venues = Object.values(grouped);
    const totalTables = venues.reduce(
      (sum, v) => sum + v.games.reduce((s, g) => s + (g.tables_running || 0), 0), 0
    );
    const totalWaiting = venues.reduce(
      (sum, v) => sum + v.games.reduce((s, g) => s + (g.players_waiting || 0), 0), 0
    );

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      metadata: {
        venues_with_live_data: venues.length,
        total_tables_running: totalTables,
        total_players_waiting: totalWaiting,
        data_source: 'Smarter.Poker Intelligence',
        refresh_interval: '15 minutes',
        last_scrape: data?.[0]?.scrape_timestamp || null,
      },
      venues,
    });
  } catch (err) {
    console.error('Live tables API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

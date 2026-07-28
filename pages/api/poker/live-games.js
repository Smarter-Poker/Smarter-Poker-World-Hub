import { createClient } from '../../../src/lib/supabaseServerClient';
import allVenuesData from '../../../data/all-venues.json';
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

// Build venue name lookup (live_games.venue_id is TEXT)
const venuesList = Array.isArray(allVenuesData) ? allVenuesData : allVenuesData.venues || [];
const venueNameMap = {};
venuesList.forEach(v => { if (v.id && v.name) venueNameMap[String(v.id)] = v.name; });

function enrichGamesWithVenue(games) {
  return (games || []).map(g => ({
    ...g,
    venue_name: venueNameMap[String(g.venue_id)] || 'Unknown Venue',
  }));
}



export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET, POST, PUT, DELETE, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    try {
      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      if (req.method === 'POST') {
        // Require JWT for writes
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for live game reports' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        /* removed duplicate authUser */
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { venue_id, game_type, stakes, table_count, wait_time, notes } = req.body;
        const user_id = authUser.id;

        if (!venue_id || !game_type || !stakes) {
          return res.status(400).json({ success: false, error: 'Missing required fields: venue_id, game_type, stakes' });
        }

        const venueIdNum = parseInt(venue_id, 10);
        if (isNaN(venueIdNum) || venueIdNum < 1) {
          return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

        const insertData = {
          venue_id: String(venueIdNum),
          user_id,
          game_type,
          stakes,
          table_count: table_count || 1,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        };
        if (wait_time !== undefined && wait_time !== null) {
          insertData.wait_time = wait_time;
        }
        if (notes !== undefined && notes !== null) {
          insertData.notes = notes;
        }

        const { data, error } = await getSupabase()
          .from('live_games')
          .insert(insertData)
          .select()
          .maybeSingle();

        if (error) {
          console.warn('Error creating live game:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        return res.status(201).json({ success: true, game: data });
      }

      if (req.method === 'GET') {
        // Live game lists change slowly — safe to cache 60s at the CDN edge.
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        const venue_id = safeQ(req.query.venue_id);
        const active = safeQ(req.query.active);
        const game_type = safeQ(req.query.game_type);
        const now = new Date().toISOString();

        // Active games for a specific venue
        if (venue_id) {
          const venueIdNum = parseInt(venue_id, 10);
          if (isNaN(venueIdNum) || venueIdNum < 1) {
            return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
          }

          let query = getSupabase()
            .from('live_games')
            .select('*')
            .eq('venue_id', String(venueIdNum))
            .gt('expires_at', now)
            .order('created_at', { ascending: false })
                .limit(100);

          if (game_type) {
            query = query.eq('game_type', game_type)
                .limit(100);
          }

          const { data, error } = await query;

          if (error) {
            console.warn('Error fetching live games:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, games: enrichGamesWithVenue(data) });
        }

        // All active games grouped by venue
        if (active === 'true') {
          let query = getSupabase()
            .from('live_games')
            .select('*')
            .gt('expires_at', now)
            .order('created_at', { ascending: false })
                .limit(100);

          if (game_type) {
            query = query.eq('game_type', game_type)
                .limit(100);
          }

          const { data, error } = await query;

          if (error) {
            console.warn('Error fetching active games:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          // Enrich with venue names and group by venue_id
          const enriched = enrichGamesWithVenue(data);
          const grouped = {};
          enriched.forEach((game) => {
            if (!grouped[game.venue_id]) {
              grouped[game.venue_id] = [];
            }
            grouped[game.venue_id].push(game);
          });

          return res.status(200).json({ success: true, venues: grouped });
        }

        return res.status(400).json({ success: false, error: 'venue_id or active=true is required' });
      }

      if (req.method === 'DELETE') {
        // Require JWT for deletes — use authenticated user ID, not query param
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for deleting games' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const delUser = authData?.user;
        if (delAuthErr || !delUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const game_id = safeQ(req.query.game_id);

        if (!game_id) {
          return res.status(400).json({ success: false, error: 'game_id is required' });
        }

        const { data, error } = await getSupabase()
          .from('live_games')
          .delete()
          .eq('id', game_id)
          .eq('user_id', delUser.id)
          .select();

        if (error) {
          console.warn('Error deleting live game:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        if (!data || data.length === 0) {
          return res.status(404).json({ success: false, error: 'Game not found or not owned by user' });
        }

        return res.status(200).json({ success: true, deleted: data[0] });
      }

      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    } catch (err) {
      console.warn('Live games API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
};

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { venue_id, user_id, game_type, stakes, table_count, wait_time, notes } = req.body;

      if (!venue_id || !user_id || !game_type || !stakes) {
        return res.status(400).json({ success: false, error: 'Missing required fields: venue_id, user_id, game_type, stakes' });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

      const insertData = {
        venue_id,
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

      const { data, error } = await supabase
        .from('live_games')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error creating live game:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(201).json({ success: true, game: data });
    }

    if (req.method === 'GET') {
      const { venue_id, active, game_type } = req.query;
      const now = new Date().toISOString();

      // Active games for a specific venue
      if (venue_id) {
        let query = supabase
          .from('live_games')
          .select('*')
          .eq('venue_id', venue_id)
          .gt('expires_at', now)
          .order('created_at', { ascending: false });

        if (game_type) {
          query = query.eq('game_type', game_type);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching live games:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, games: data || [] });
      }

      // All active games grouped by venue
      if (active === 'true') {
        let query = supabase
          .from('live_games')
          .select('*')
          .gt('expires_at', now)
          .order('created_at', { ascending: false });

        if (game_type) {
          query = query.eq('game_type', game_type);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching active games:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        // Group by venue_id
        const grouped = {};
        (data || []).forEach((game) => {
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
      const { game_id, user_id } = req.query;

      if (!game_id || !user_id) {
        return res.status(400).json({ success: false, error: 'game_id and user_id are required' });
      }

      const { data, error } = await supabase
        .from('live_games')
        .delete()
        .eq('id', game_id)
        .eq('user_id', user_id)
        .select();

      if (error) {
        console.error('Error deleting live game:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ success: false, error: 'Game not found or not owned by user' });
      }

      return res.status(200).json({ success: true, deleted: data[0] });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Live games API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

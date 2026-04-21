/**
 * GET /api/games/[slug]
 * Returns game data from game_registry table
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
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

export default async function handler(req, res) {
  try {
      const { slug } = req.query;

      if (!slug) {
          return res.status(400).json({ error: 'Missing slug parameter' });
      }

      try {
          const { data: game, error } = await getSupabase()
              .from('game_registry')
              .select('*')
              .eq('slug', slug)
              .maybeSingle();

          if (error || !game) {
              // Try by ID as fallback
              const { data: gameById } = await getSupabase()
                  .from('game_registry')
                  .select('*')
                  .eq('id', slug)
                  .maybeSingle();

              if (!gameById) {
                  return res.status(404).json({ error: 'Game not found', slug });
              }

              return res.status(200).json(gameById);
          }

          return res.status(200).json(game);

      } catch (err) {
          console.error('Error fetching game:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

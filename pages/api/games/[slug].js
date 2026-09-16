/**
 * GET /api/games/[slug]
 * Returns game data from game_registry table
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getGameById } from '../../../src/data/TRAINING_LIBRARY';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
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
                  // 2026-07-19 AUDIT FIX (E2E defect D6): the 107 training games
                  // live in TRAINING_LIBRARY, not the game_registry table — every
                  // LevelSelector load 404'd here. Serve the library entry in the
                  // same shape LevelSelector expects.
                  const libraryGame = getGameById(slug);
                  if (libraryGame) {
                      return res.status(200).json({
                          id: libraryGame.id,
                          title: libraryGame.name,
                          slug: libraryGame.id,
                          category: libraryGame.category,
                          engine_type: libraryGame.tags?.includes('gto')
                              ? 'PIO'
                              : libraryGame.category === 'PSYCHOLOGY'
                                ? 'SCENARIO'
                                : 'PIO',
                          source: 'training_library',
                      });
                  }
                  return res.status(404).json({ error: 'Game not found', slug });
              }

              return res.status(200).json(gameById);
          }

          return res.status(200).json(game);

      } catch (err) {
          console.warn('Error fetching game:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

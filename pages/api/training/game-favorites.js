/**
 * API: Training Game Favorites — Durable Per-User Starred Drills
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/training/game-favorites         -> { success: true, favorites: string[] }
 * POST   /api/training/game-favorites         -> body: { gameId } (idempotent add)
 * DELETE /api/training/game-favorites         -> body: { gameId } (idempotent remove)
 *
 * Security & Honesty Invariants:
 *   - JWT-only authentication via getServerUserWithFallback (no x-user-id fallback)
 *   - Canonical gameId validation against TRAINING_LIBRARY
 *   - Database failures always return HTTP 503 (never 200 with success: false)
 */

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { TRAINING_LIBRARY } from '../../../src/data/TRAINING_LIBRARY';

const CANONICAL_GAME_IDS = new Set(TRAINING_LIBRARY.map((g) => g.id));

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return _supabase;
}

export default async function handler(req, res) {
  try {
    withTiming(res);

    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (req.method === 'POST' || req.method === 'DELETE') {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader?.startsWith('Bearer ')) {
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
      if (!authErr && authUser?.id) userId = authUser.id;
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
      res.setHeader('Vary', 'Authorization');

      const { data, error } = await getSupabase()
        .from('training_game_favorites')
        .select('game_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.warn('[TrainingGameFavorites] Query error:', error.message);
        return res.status(503).json({
          success: false,
          error: 'Favorites are temporarily unavailable. Please retry.',
          code: 'TRAINING_FAVORITES_PERSISTENCE_UNAVAILABLE',
          retryable: true,
        });
      }

      const favorites = (data || [])
        .map((row) => row.game_id)
        .filter((id) => CANONICAL_GAME_IDS.has(id));

      return res.status(200).json({ success: true, favorites });
    }

    const bodySize = JSON.stringify(req.body || {}).length;
    if (bodySize > 2048) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    const gameId = sanitizeParam(req.body?.gameId, 80);
    if (!gameId || !CANONICAL_GAME_IDS.has(gameId)) {
      return res.status(400).json({ success: false, error: 'A valid canonical gameId is required' });
    }

    if (req.method === 'POST') {
      const { data: saved, error } = await getSupabase()
        .from('training_game_favorites')
        .upsert(
          { user_id: userId, game_id: gameId },
          { onConflict: 'user_id,game_id' },
        )
        .select('game_id')
        .maybeSingle();

      if (error || !saved?.game_id) {
        console.warn('[TrainingGameFavorites] Save error:', error?.message || 'row missing');
        return res.status(503).json({
          success: false,
          error: 'Favorite could not be saved. Please retry.',
          code: 'TRAINING_FAVORITES_PERSISTENCE_UNAVAILABLE',
          retryable: true,
        });
      }

      return res.status(200).json({ success: true, action: 'added', gameId: saved.game_id });
    }

    // DELETE
    const { error } = await getSupabase()
      .from('training_game_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('game_id', gameId);

    if (error) {
      console.warn('[TrainingGameFavorites] Delete error:', error.message);
      return res.status(503).json({
        success: false,
        error: 'Favorite could not be removed. Please retry.',
        code: 'TRAINING_FAVORITES_PERSISTENCE_UNAVAILABLE',
        retryable: true,
      });
    }

    return res.status(200).json({ success: true, action: 'removed', gameId });
  } catch (err) {
    reportApiError(err, req, { endpoint: '/api/training/game-favorites' });
    return res.status(503).json({
      success: false,
      error: 'Favorites service temporarily unavailable.',
      code: 'TRAINING_FAVORITES_PERSISTENCE_UNAVAILABLE',
      retryable: true,
    });
  }
}

/**
 * GET /api/training/progress
 * Returns user's training progress for a game
 * BUG #284 FIX: Was accepting userId from query params (IDOR).
 * Now uses JWT auth to enforce identity.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { getLevel } from '../../../src/config/LevelRegistry';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
const DEFAULT_PROGRESS = {
    current_level: 1,
    highest_level_unlocked: 1,
    health_chips: 100,
    total_hands_played: 0,
    total_correct: 0,
    total_rounds_completed: 0,
    levels: {}
};

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'GET only' });
      }

      const gameId = sanitizeParam(req.query.gameId, 100);

      // Auth: require JWT, use authenticated user ID (not query param)
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(200).json(DEFAULT_PROGRESS); // Anonymous = defaults

      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(200).json(DEFAULT_PROGRESS);

      const userId = user.id; // From JWT, not query param

      try {
          // ═══ 2026-07-19 AUDIT FIX (wave-1 regression sweep) ═══
          // This endpoint read `god_mode_user_session` — a table NOTHING writes
          // anymore — and never returned the `levels` map LevelSelector expects
          // (`progressData.levels`), so every game permanently showed
          // "Not Attempted / 0 levels completed" no matter how much you played.
          // Rebuild from the tables save-progress.js actually writes:
          // training_level_history (per-attempt rows) + training_progress.
          const [historyResult, progressResult] = await Promise.all([
              getSupabase()
                  .from('training_level_history')
                  .select('level, accuracy_percentage, passed, questions_answered, questions_correct')
                  .eq('user_id', userId)
                  .eq('game_id', gameId)
                  .order('created_at', { ascending: false })
                  .limit(500),
              getSupabase()
                  .from('training_progress')
                  .select('level, hands_played, correct_answers, total_answers, best_streak')
                  .eq('user_id', userId)
                  .eq('game_id', gameId)
                  .maybeSingle(),
          ]);

          const history = historyResult.data || [];
          const prog = progressResult.data || null;

          // Build per-level map: attempts, high score, completion
          const levels = {};
          let highestPassed = 0;
          history.forEach(h => {
              const key = `level_${h.level}`;
              if (!levels[key]) levels[key] = { attempts: 0, highScore: 0, completed: false };
              levels[key].attempts += 1;
              levels[key].highScore = Math.max(levels[key].highScore, Math.round(h.accuracy_percentage || 0));
              if (h.passed) {
                  levels[key].completed = true;
                  highestPassed = Math.max(highestPassed, h.level);
              }
          });

          if (history.length === 0 && !prog) {
              return res.status(200).json(DEFAULT_PROGRESS);
          }

          const currentLevel = prog?.level || Math.min(12, highestPassed + 1) || 1;
          const currentLevelDef = getLevel(currentLevel);
          return res.status(200).json({
              current_level: currentLevel,
              highest_level_unlocked: Math.min(12, highestPassed + 1),
              health_chips: 100,
              total_hands_played: prog?.hands_played || 0,
              total_correct: prog?.correct_answers || 0,
              total_rounds_completed: history.length,
              best_streak: prog?.best_streak || 0,
              levels,
              levelMeta: currentLevelDef ? {
                  name: currentLevelDef.name,
                  tier: currentLevelDef.tier,
                  masteryThreshold: currentLevelDef.masteryThreshold,
                  diamondMultiplier: currentLevelDef.diamondMultiplier,
                  accentColor: currentLevelDef.accentColor,
              } : null,
          });

      } catch (err) {
          console.warn('Error fetching progress:', err);
          return res.status(200).json(DEFAULT_PROGRESS);
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

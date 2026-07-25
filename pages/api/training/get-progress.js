/**
 * API: Get User Training Progress
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches user progress for all games or a specific game
 * 
 * GET /api/training/get-progress?userId=xxx&gameId=xxx (optional)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
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
export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // BUG #246 FIX: Require JWT auth
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

      try {
          const gameId = sanitizeParam(req.query.gameId, 100);
          // BUG FIX: was reading userId from query and validating it — unnecessary IDOR surface;
          // always use JWT identity directly
          const userId = _authUser.id;

          // If gameId is provided, fetch progress for that game only
          if (gameId) {
              const { data, error } = await getSupabase()
                  .from('training_progress')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('game_id', gameId)
                  .maybeSingle();

              if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                  console.warn('Error fetching game progress:', error);
                  return res.status(500).json({ success: false, error: 'Failed to fetch progress' });
              }

              return res.status(200).json({
                  success: true,
                  progress: data || null
              });
          }

          // Fetch all progress for user
          const { data, error } = await getSupabase()
              .from('training_progress')
              .select('*')
              .eq('user_id', userId)
              .order('last_played_at', { ascending: false })
              .limit(100);

          if (error) {
              console.warn('Error fetching all progress:', error);
              return res.status(500).json({ success: false, error: 'Failed to fetch progress' });
          }

          // Calculate overall stats
          // Fail-safe column fallbacks: rows are written with total_answers /
          // correct_answers; older rows may carry the legacy column names.
          const getMastery = (p) => p.mastery_percentage ?? (p.total_answers > 0 ? Math.round((p.correct_answers / p.total_answers) * 100) : 0);
          const totalGamesPlayed = (data || []).length;
          const totalGamesMastered = (data || []).filter(p => getMastery(p) === 100).length
          const totalQuestionsAnswered = (data || []).reduce((sum, p) => sum + (p.total_answers ?? p.total_questions_answered ?? 0), 0);
          const totalCorrect = (data || []).reduce((sum, p) => sum + (p.correct_answers ?? p.total_correct ?? 0), 0);
          const overallAccuracy = totalQuestionsAnswered > 0
              ? Math.round((totalCorrect / totalQuestionsAnswered) * 100)
              : 0;
          const bestStreak = Math.max(...(data || []).map(p => p.best_streak || 0), 0);

          return res.status(200).json({
              success: true,
              progress: data,
              stats: {
                  totalGamesPlayed,
                  totalGamesMastered,
                  totalQuestionsAnswered,
                  totalCorrect,
                  overallAccuracy,
                  bestStreak
              }
          });

      } catch (error) {
          console.warn('Error in get-progress:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

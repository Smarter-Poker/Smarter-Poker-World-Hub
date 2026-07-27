/**
 * JARVIS TRAINING RECOMMENDATIONS API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Analyzes user's training history to recommend games targeting weak areas
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { TRAINING_LIBRARY } from '../../../src/data/TRAINING_LIBRARY';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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

// 2026-07-19 AUDIT FIX: catalog was 13 hardcoded ids with underscores
// ('cash_001') that never matched real game ids ('cash-001', 'mtt-001', ...)
// written by jarvis_training_sessions — so history matching silently no-op'd
// and every user looked like a new user. Build the catalog from the real
// 100+ game TRAINING_LIBRARY instead.
const difficultyLabel = (d) => (d <= 2 ? 'beginner' : d === 3 ? 'intermediate' : 'advanced');
const TRAINING_GAMES = (TRAINING_LIBRARY || []).map((g) => ({
    id: g.id,
    name: g.name,
    category: (g.category || 'CASH').toLowerCase(),
    difficulty: difficultyLabel(g.difficulty || 3),
}));

export default async function handler(req, res) {
  try {
      withTiming(res);
      // CDN cache: fresh for 300s, serve stale up to 3600s
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
      }

      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // BUG #246 FIX: Require JWT auth
      const supabase = getSupabase();
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG FIX: was reading userId from query — IDOR; use JWT identity
      const userId = _authUser.id;

      try {
          // Fetch user's training history
          const { data: sessions } = await supabase
              .from('jarvis_training_sessions')
              .select('game_id, accuracy, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(100);

          if (!sessions || sessions.length === 0) {
              // New user - recommend beginner games
              const beginnerGames = TRAINING_GAMES
                  .filter(g => g.difficulty === 'beginner')
                  .slice(0, 3);

              return res.status(200).json({
                  success: true,
                  isNewUser: true,
                  recommendations: beginnerGames.map(g => ({
                      ...g,
                      reason: 'Great starting point for new players'
                  })),
                  message: "Welcome! Here are some beginner-friendly games to get started."
              });
          }

          // Analyze performance by category
          const categoryStats = {};
          const gameAccuracy = {};

          sessions.forEach(session => {
              const game = TRAINING_GAMES.find(g => g.id === session.game_id);
              if (!game) return;

              // Track by category
              if (!categoryStats[game.category]) {
                  categoryStats[game.category] = { total: 0, correct: 0 };
              }
              categoryStats[game.category].total++;
              categoryStats[game.category].correct += session.accuracy / 100;

              // Track by game
              if (!gameAccuracy[session.game_id]) {
                  gameAccuracy[session.game_id] = [];
              }
              gameAccuracy[session.game_id].push(session.accuracy);
          });

          // Calculate category accuracy
          const categoryAccuracy = Object.entries(categoryStats || {}).map(([category, data]) => ({
              category,
              accuracy: Math.round((data.correct / data.total) * 100),
              sessions: data.total
          }));

          // Identify weak categories (< 75% accuracy OR < 5 sessions)
          const weakCategories = categoryAccuracy
              .filter(c => c.accuracy < 75 || c.sessions < 5)
              .sort((a, b) => a.accuracy - b.accuracy);

          // Find untried categories
          const triedCategories = new Set(categoryAccuracy.map(c => c.category));
          const untriedCategories = [...new Set(TRAINING_GAMES.map(g => g.category))]
              .filter(c => !triedCategories.has(c));

          // Build recommendations
          const recommendations = [];

          // Priority 1: Games in weak categories
          if (weakCategories.length > 0) {
              const weakCat = weakCategories[0];
              const gamesInWeakCat = TRAINING_GAMES
                  .filter(g => g.category === weakCat.category)
                  .filter(g => {
                      const avgAcc = gameAccuracy[g.id]
                          ? gameAccuracy[g.id].reduce((a, b) => a + b, 0) / gameAccuracy[g.id].length
                          : null;
                      return avgAcc === null || avgAcc < 80;
                  });

              gamesInWeakCat.slice(0, 2).forEach(g => {
                  recommendations.push({
                      ...g,
                      reason: `Your ${g.category} accuracy is ${weakCat.accuracy}% - let's improve it!`,
                      priority: 1
                  });
              });
          }

          // Priority 2: Untried categories
          if (untriedCategories.length > 0 && recommendations.length < 4) {
              const untriedCat = untriedCategories[0];
              const gamesInUntried = TRAINING_GAMES
                  .filter(g => g.category === untriedCat && g.difficulty === 'beginner');

              gamesInUntried.slice(0, 1).forEach(g => {
                  recommendations.push({
                      ...g,
                      reason: `You haven't tried ${g.category} training yet - expand your skills!`,
                      priority: 2
                  });
              });
          }

          // Priority 3: Games they've played but could improve
          if (recommendations.length < 4) {
              Object.entries(gameAccuracy || {}).forEach(([gameId, accuracies]) => {
                  if (recommendations.length >= 4) return;
                  const avgAcc = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
                  if (avgAcc < 85 && avgAcc >= 50) {
                      const game = TRAINING_GAMES.find(g => g.id === gameId);
                      if (game && !recommendations.find(r => r.id === gameId)) {
                          recommendations.push({
                              ...game,
                              reason: `Your average accuracy is ${Math.round(avgAcc)}% - aim for 90%+!`,
                              priority: 3
                          });
                      }
                  }
              });
          }

          // Generate Jarvis message
          let message = "Based on your training history, I recommend focusing on these areas:";
          if (weakCategories.length > 0) {
              message = `I noticed your ${weakCategories[0].category} game could use work. Let's sharpen those skills!`;
          } else if (recommendations.length === 0) {
              message = "You're doing great! Keep up the consistent practice.";
          }

          return res.status(200).json({
              success: true,
              isNewUser: false,
              recommendations: recommendations.slice(0, 4),
              weakCategories: weakCategories.slice(0, 3),
              categoryAccuracy,
              totalSessions: sessions.length,
              message
          });

      } catch (error) {
          console.warn('[Recommendations] Error:', error.message);
          return res.status(500).json({ success: false, error: 'Failed to generate recommendations' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

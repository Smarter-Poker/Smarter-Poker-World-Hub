/**
 * 🏆 TRAINING LEADERBOARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Daily/weekly/all-time rankings for training performance
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, clampPagination, withTiming } from '../../../src/utils/trainingApiUtils';
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
      // CDN cache: fresh for 30s, serve stale up to 120s
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
      }

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      const supabase = getSupabase();

      // Require JWT auth for write operations
      if (req.method !== 'GET') {
          const _token = req.headers.authorization?.replace('Bearer ', '');
          if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
          const { data: authData, error: _authErr } = await supabase.auth.getUser(_token);
          const _authUser = authData?.user;
          if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
          if (req.body) req.body.userId = _authUser.id;
      }

      // POST: Update leaderboard entry after session
      if (req.method === 'POST') {
          const bodySize = JSON.stringify(req.body || {}).length;
          if (bodySize > 10240) return res.status(413).json({ success: false, error: 'Request body too large' });
          const { userId, accuracy, questionsAnswered, questionsCorrect, bestStreak, gameId, gtowScore } = req.body;
          const isPerfectRound = accuracy === 100;

          // GTOW Score is the new metric for XP. Default to accuracy if not provided by older games
          const earnedXp = gtowScore !== undefined ? gtowScore : (accuracy || 0);

          if (!userId) {
              return res.status(400).json({ success: false, error: 'userId required' });
          }

          try {
              const now = new Date();
              const periods = [
                  { type: 'daily', key: now.toISOString().split('T')[0] },
                  { type: 'weekly', key: `${now.getFullYear()}-W${Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7).toString().padStart(2, '0')}` },
                  { type: 'monthly', key: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}` },
                  { type: 'alltime', key: 'alltime' }
              ];

              // Upsert entry for each period
              for (const period of periods) {
                  const { data: existing } = await supabase
                      .from('training_leaderboard')
                      .select('id, sessions_completed, questions_answered, questions_correct, best_streak, perfect_rounds, total_xp')
                      .eq('user_id', userId)
                      .eq('period_type', period.type)
                      .eq('period_key', period.key)
                      .maybeSingle();

                  if (existing) {
                      const newTotal = existing.questions_answered + questionsAnswered;
                      const newCorrect = existing.questions_correct + questionsCorrect;
                      const { error: err_training_leaderboard_iyx6f } = await supabase
                        .from('training_leaderboard')
                        .update({
                              sessions_completed: existing.sessions_completed + 1,
                              questions_answered: newTotal,
                              questions_correct: newCorrect,
                              accuracy: newTotal > 0 ? Math.round((newCorrect / newTotal) * 100) : 0,
                              best_streak: Math.max(existing.best_streak || 0, bestStreak || 0),
                              perfect_rounds: (existing.perfect_rounds || 0) + (isPerfectRound ? 1 : 0),
                              total_xp: (existing.total_xp || 0) + earnedXp,
                              updated_at: new Date().toISOString()
                          })
                          .eq('id', existing.id);
                      if (err_training_leaderboard_iyx6f) console.warn('[Supabase] Silent mutation failed in training_leaderboard:', err_training_leaderboard_iyx6f.message);
                  } else {
                      const { error: err_training_leaderboard_sql0n } = await supabase
                        .from('training_leaderboard')
                        .insert({
                              user_id: userId,
                              period_type: period.type,
                              period_key: period.key,
                              sessions_completed: 1,
                              questions_answered: questionsAnswered,
                              questions_correct: questionsCorrect,
                              accuracy: questionsAnswered > 0 ? Math.round((questionsCorrect / questionsAnswered) * 100) : 0,
                              best_streak: bestStreak || 0,
                              perfect_rounds: isPerfectRound ? 1 : 0,
                              total_xp: earnedXp
                          });
                      if (err_training_leaderboard_sql0n) console.warn('[Supabase] Silent mutation failed in training_leaderboard:', err_training_leaderboard_sql0n.message);
                  }
              }

              return res.status(200).json({ success: true, message: 'Leaderboard updated' });
          } catch (error) {
              console.warn('[Leaderboard] Update error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to update leaderboard' });
          }
      }

      // GET: Fetch leaderboard
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { period: rawPeriod = 'daily', limit: rawLimit = '20', gameId: rawGameId } = req.query;
      const period = ['daily', 'weekly', 'monthly', 'alltime'].includes(rawPeriod) ? rawPeriod : 'daily';
      const gameId = rawGameId ? sanitizeParam(rawGameId, 100) : null;
      const { limit: boundedLimit } = clampPagination(rawLimit, 1);

      try {
          // Calculate period key
          const now = new Date();
          let periodKey;

          switch (period) {
              case 'daily':
                  periodKey = now.toISOString().split('T')[0]; // 2026-02-02
                  break;
              case 'weekly':
                  const weekNum = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7);
                  periodKey = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
                  break;
              case 'monthly':
                  periodKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                  break;
              case 'alltime':
                  periodKey = 'alltime';
                  break;
              default:
                  periodKey = now.toISOString().split('T')[0];
          }

          // Fetch leaderboard - use left join to handle missing profiles
          const { data: leaderboard, error } = await supabase
              .from('training_leaderboard')
              .select(`
                  user_id,
                  sessions_completed,
                  questions_answered,
                  questions_correct,
                  accuracy,
                  total_xp,
                  best_streak
              `)
              .eq('period_type', period)
              .eq('period_key', periodKey)
              .order('accuracy', { ascending: false })
              .order('total_xp', { ascending: false })
              .limit(boundedLimit);

          if (error) throw error;

          // Fetch profiles separately for any entries
          const userIds = (leaderboard || []).map(e => e.user_id);
          let profilesMap = {};

          if (userIds.length > 0) {
              const { data: profiles } = await supabase
                  .from('profiles')
                  .select('id, username, avatar_url')
                  .in('id', userIds);

              profilesMap = (profiles || []).reduce((acc, p) => {
                  acc[p.id] = p;
                  return acc;
              }, {});
          }

          // Format response with rankings
          const rankings = (leaderboard || []).map((entry, index) => ({
              rank: index + 1,
              userId: entry.user_id,
              username: profilesMap[entry.user_id]?.username || 'Anonymous',
              avatarUrl: profilesMap[entry.user_id]?.avatar_url,
              accuracy: entry.accuracy,
              sessionsCompleted: entry.sessions_completed,
              questionsCorrect: entry.questions_correct,
              totalXp: entry.total_xp,
              bestStreak: entry.best_streak
          }));

          return res.status(200).json({
              success: true,
              period,
              periodKey,
              leaderboard: rankings,
              timestamp: new Date().toISOString()
          });

      } catch (error) {
          console.warn('[Leaderboard] Error:', error.message);
          return res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

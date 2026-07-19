/**
 * 🏆 UPDATE LEADERBOARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Updates user's leaderboard stats after completing a training session
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withRetry } from '../../../src/lib/supabaseRetry';
import { withTiming } from '../../../src/utils/trainingApiUtils';
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
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      // Require JWT auth for write operations
      const supabase = getSupabase();
      if (req.method !== 'GET') {
          const _token = req.headers.authorization?.replace('Bearer ', '');
          if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
          const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
          const _authUser = authData?.user;
          if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
          if (req.body) req.body.userId = _authUser.id;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240) return res.status(413).json({ success: false, error: 'Request body too large' });

      const {
          userId,
          questionsAnswered,
          questionsCorrect,
          accuracy,
          xpEarned,
          bestStreak = 0
      } = req.body;

      if (!userId) {
          return res.status(400).json({ success: false, error: 'userId required' });
      }

      try {
          const now = new Date();

          // Calculate period keys
          const dailyKey = now.toISOString().split('T')[0];
          const weekNum = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7);
          const weeklyKey = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
          const monthlyKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

          const periods = [
              { type: 'daily', key: dailyKey },
              { type: 'weekly', key: weeklyKey },
              { type: 'monthly', key: monthlyKey },
              { type: 'alltime', key: 'alltime' }
          ];

          // Update all periods in parallel (each period is independent)
          const results = await Promise.allSettled(periods.map(async (period) => {
              // Check if entry exists
              const { data: existing } = await withRetry(
                  () => supabase
                      .from('training_leaderboard')
                      .select('id, sessions_completed, questions_answered, questions_correct, best_streak')
                      .eq('user_id', userId)
                      .eq('period_type', period.type)
                      .eq('period_key', period.key)
                      .maybeSingle(),
                  { label: `UpdateLB:select:${period.type}` }
              );

              if (existing) {
                  // Update existing entry
                  const newTotal = existing.questions_answered + questionsAnswered;
                  const newCorrect = existing.questions_correct + questionsCorrect;
                  const newAccuracy = newTotal > 0 ? (newCorrect / newTotal * 100).toFixed(2) : 0;

                  await withRetry(
                      () => supabase
                          .from('training_leaderboard')
                          .update({
                              sessions_completed: existing.sessions_completed + 1,
                              questions_answered: newTotal,
                              questions_correct: newCorrect,
                              // 2026-07-19 AUDIT FIX: total_xp column does not exist
                              // (XP removed) — writing it failed every update silently.
                              accuracy: newAccuracy,
                              best_streak: Math.max(existing.best_streak, bestStreak),
                              updated_at: new Date().toISOString()
                          })
                          .eq('id', existing.id),
                      { label: `UpdateLB:update:${period.type}` }
                  );
              } else {
                  // Create new entry
                  await withRetry(
                      () => supabase
                          .from('training_leaderboard')
                          .insert({
                              user_id: userId,
                              period_type: period.type,
                              period_key: period.key,
                              sessions_completed: 1,
                              questions_answered: questionsAnswered,
                              questions_correct: questionsCorrect,
                              accuracy,
                              best_streak: bestStreak
                          }),
                      { label: `UpdateLB:insert:${period.type}` }
                  );
              }
          }));

          // Log any failures (non-blocking — partial success is fine)
          const failures = results.filter(r => r.status === 'rejected');
          if (failures.length > 0) {
              console.warn(`[UpdateLeaderboard] ${failures.length}/4 period updates failed:`,
                  failures.map(f => f.reason?.message || f.reason));
          }

          return res.status(200).json({
              success: true,
              message: 'Leaderboard updated for all periods'
          });

      } catch (error) {
          console.warn('[UpdateLeaderboard] Error:', error.message);
          return res.status(500).json({ success: false, error: 'Failed to update leaderboard' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

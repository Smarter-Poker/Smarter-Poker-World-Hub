import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🧠 JARVIS USER INSIGHTS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes training data to provide personalized insights and leak patterns
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

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

const VERIFIED_ATTEMPT_SELECT = 'training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)';

function numberOrZero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function scoredCounts(session) {
    const total = Number(session?.hands_played);
    const correct = Number(session?.correct_count);
    if (!Number.isFinite(total) || total <= 0) return null;
    if (!Number.isFinite(correct) || correct < 0 || correct > total) return null;
    return { total, correct };
}

export function summarizeVerifiedTrainingPerformance(sessions = []) {
    const scoredSessions = sessions
        .map((session) => ({ session, counts: scoredCounts(session) }))
        .filter((entry) => entry.counts !== null);
    const totalQuestions = scoredSessions.reduce((sum, entry) => sum + entry.counts.total, 0);
    const totalCorrect = scoredSessions.reduce((sum, entry) => sum + entry.counts.correct, 0);
    const gameStats = scoredSessions.reduce((acc, { session, counts }) => {
        const gameId = String(session.game_id || '').trim();
        if (!gameId) return acc;
        if (!acc[gameId]) {
            acc[gameId] = {
                gameName: session.game_name || gameId,
                sessions: 0,
                correct: 0,
                total: 0,
                highestLevel: 0,
            };
        }
        acc[gameId].sessions += 1;
        acc[gameId].correct += counts.correct;
        acc[gameId].total += counts.total;
        acc[gameId].highestLevel = Math.max(acc[gameId].highestLevel, numberOrZero(session.level));
        return acc;
    }, {});

    return {
        scoredSessions,
        totalQuestions,
        totalCorrect,
        overallAccuracy: totalQuestions > 0
            ? Number(((totalCorrect / totalQuestions) * 100).toFixed(1))
            : null,
        gamePerformance: Object.entries(gameStats).map(([gameId, stats]) => ({
            gameId,
            gameName: stats.gameName,
            sessions: stats.sessions,
            accuracy: Number(((stats.correct / stats.total) * 100).toFixed(1)),
            highestLevel: stats.highestLevel,
        })).sort((a, b) => b.sessions - a.sessions),
    };
}

function sessionDurationSeconds(session) {
    const history = Array.isArray(session?.hand_history) ? session.hand_history : [];
    const times = history
        .map((entry) => Date.parse(entry?.timestamp || entry?.answeredAt || entry?.answered_at || ''))
        .filter(Number.isFinite);
    if (times.length < 2) return null;
    return Math.max(0, Math.round((Math.max(...times) - Math.min(...times)) / 1000));
}

function buildPositionLeaks(sessions) {
    const positions = {};
    for (const session of sessions) {
        const stats = session?.position_stats && typeof session.position_stats === 'object'
            ? session.position_stats
            : {};
        for (const [position, values] of Object.entries(stats)) {
            const total = numberOrZero(values?.total);
            const correct = numberOrZero(values?.correct);
            const mistakes = Math.max(0, total - correct);
            if (mistakes <= 0) continue;
            const key = String(position || 'Unknown').toUpperCase();
            if (key === 'UNKNOWN' || key === 'UNK') continue;
            positions[key] = (positions[key] || 0) + mistakes;
        }
    }
    return Object.entries(positions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([position, count]) => ({ leak: `${position} Play`, position, count }));
}

export default async function handler(req, res) {
  try {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Vary', 'Authorization');
      const supabase = getSupabase();

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ── Auth: JWT required — userId derived from token, not query ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      /* removed duplicate authUser */
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = authUser.id; // Trust JWT, not query string

      try {
          // Canonical Training projections only. Legacy Jarvis tables accepted
          // browser-authored uploads and are not evidence of completed play.
          const { data: recentSessions, error: sessionsError } = await supabase
              .from('training_sessions')
              .select(`game_id, game_name, hands_played, correct_count, accuracy, best_streak, level, position_stats, classification_counts, hand_history, attempt_id, created_at, ${VERIFIED_ATTEMPT_SELECT}`)
              .eq('user_id', userId)
              .eq('training_attempts.user_id', userId)
              .eq('training_attempts.status', 'completed')
              .not('attempt_id', 'is', null)
              .eq('training_attempts.practice_only', false)
              .order('created_at', { ascending: false })
              .limit(100);
          if (sessionsError) {
              throw new Error(`Verified training sessions unavailable: ${sessionsError.message}`);
          }

          // Get streak info
          const { data: streak, error: streakError } = await supabase
              .from('training_streaks')
              .select('current_streak:authority_current_streak, longest_streak:authority_longest_streak, last_training_date:authority_last_training_date, streak_start_date:authority_streak_start_date')
              .eq('user_id', userId)
              .maybeSingle();
          if (streakError) throw new Error(`Training streak unavailable: ${streakError.message}`);

          // Get achievements count
          const { count: achievementCount, error: achievementsError } = await supabase
              .from('training_user_achievements')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId);
          if (achievementsError) {
              throw new Error(`Training achievements unavailable: ${achievementsError.message}`);
          }

          // Analyze patterns from sessions
          const sessions = recentSessions || [];
          const {
              scoredSessions,
              totalQuestions,
              totalCorrect,
              overallAccuracy,
              gamePerformance,
          } = summarizeVerifiedTrainingPerformance(sessions);

          // Weak positions are derived from server-projected position_stats.
          // classification_counts describes result severity, not a poker leak,
          // so it must not be relabelled as a specific strategic diagnosis.
          const topLeaks = buildPositionLeaks(sessions);

          // Calculate weekly progress
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const thisWeekSessions = scoredSessions
              .filter(({ session }) => new Date(session.created_at) > weekAgo);
          const measuredDurations = thisWeekSessions
              .map(({ session }) => sessionDurationSeconds(session))
              .filter(Number.isFinite);
          const timeSpentSeconds = measuredDurations.length > 0
              ? measuredDurations.reduce((sum, seconds) => sum + seconds, 0)
              : null;
          const weeklyProgress = {
              sessions: thisWeekSessions.length,
              questions: thisWeekSessions.reduce((sum, entry) => sum + entry.counts.total, 0),
              correct: thisWeekSessions.reduce((sum, entry) => sum + entry.counts.correct, 0),
              timeSpent: timeSpentSeconds,
              timeSpentSeconds,
              durationSessions: measuredDurations.length,
          };

          // Generate insights
          const insights = [];

          if (topLeaks.length > 0) {
              insights.push({
                  type: 'leak',
                  icon: '🔍',
                  title: 'Top Leak Pattern',
                  message: `Your most common mistake is "${topLeaks[0].leak}" - focus on this area to improve quickly.`
              });
          }

          if (streak?.current_streak >= 3) {
              insights.push({
                  type: 'streak',
                  icon: '🔥',
                  title: 'Streak Power',
                  message: `You're on a ${streak.current_streak}-day streak! Consistency is key to mastery.`
              });
          }

          const strongGames = gamePerformance.filter(g => g.accuracy >= 90);
          if (strongGames.length > 0) {
              insights.push({
                  type: 'strength',
                  icon: '💪',
                  title: 'Strong Area',
                  message: `You're crushing ${strongGames[0].gameName} with ${strongGames[0].accuracy}% accuracy!`
              });
          }

          const weakGames = gamePerformance.filter(g => g.accuracy < 70 && g.sessions >= 2);
          if (weakGames.length > 0) {
              insights.push({
                  type: 'focus',
                  icon: '📚',
                  title: 'Focus Area',
                  message: `${weakGames[0].gameName} needs work - consider reviewing the fundamentals.`
              });
          }

          // ─── Bankroll Data Enrichment ───
          let bankrollSummary = null;
          let bankrollUnavailable = false;
          try {
              // Get recent bankroll entries for this user
              const { data: bankrollEntries, error: bankrollError } = await supabase
                  .from('bankroll_ledger')
                  .select('net_result, category, start_time, end_time, entry_date, stakes')
                  .eq('user_id', userId)
                  .eq('is_revision', false)
                  .order('entry_date', { ascending: false })
                  .limit(100);
              if (bankrollError) throw bankrollError;

              if (bankrollEntries && bankrollEntries.length > 0) {
                  // Accounting-only categories: never count as sessions
                  const ACCT = new Set(['expense', 'deposit', 'withdrawal', 'receipt']);
                  const gamblingEntries = bankrollEntries.filter(e => !ACCT.has(e.category));
                  const totalNet = gamblingEntries.reduce((s, e) => s + (e.net_result || 0), 0);
                  const pokerEntries = bankrollEntries.filter(e =>
                      e.category === 'poker_cash' || e.category === 'poker_mtt'
                  );
                  const winCount = pokerEntries.filter(e => (e.net_result || 0) > 0).length;
                  let totalHours = 0;
                  pokerEntries.forEach(e => {
                      if (e.start_time && e.end_time) {
                          totalHours += (new Date(e.end_time) - new Date(e.start_time)) / 3600000;
                      }
                  });

                  // Monthly P/L (last 30 days)
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  const monthlyEntries = bankrollEntries.filter(e =>
                      new Date(e.entry_date) >= thirtyDaysAgo
                  );
                  const monthlyPL = monthlyEntries.reduce((s, e) => s + (e.net_result || 0), 0);

                  // Trend (last 5 sessions)
                  const last5 = pokerEntries.slice(0, 5);
                  const last5Net = last5.reduce((s, e) => s + (e.net_result || 0), 0);
                  const recentTrend = last5Net > 0 ? 'upswing' : last5Net < -500 ? 'downswing' : 'stable';

                  // Get location stats (top/worst)
                  const { data: locationStats, error: locationError } = await supabase
                      .from('bankroll_ledger')
                      .select('location_id, net_result, bankroll_locations(name)')
                      .eq('user_id', userId)
                      .eq('is_revision', false)
                      .not('location_id', 'is', null)
                          .limit(500);
                  if (locationError) throw locationError;

                  const locMap = {};
                  (locationStats || []).forEach(e => {
                      const lid = e.location_id;
                      if (!locMap[lid]) locMap[lid] = { name: e.bankroll_locations?.name || 'Unknown', net: 0 };
                      locMap[lid].net += e.net_result || 0;
                  });
                  const locArr = Object.values(locMap || {}).sort((a, b) => b.net - a.net);

                  bankrollSummary = {
                      totalSessions: gamblingEntries.length,
                      pokerSessions: pokerEntries.length,
                      totalNet,
                      monthlyPL,
                      hourlyRate: totalHours > 0 ? Math.round(totalNet / totalHours) : 0,
                      winRate: pokerEntries.length > 0 ? Math.round((winCount / pokerEntries.length) * 100) : 0,
                      recentTrend,
                      topVenue: locArr[0] || null,
                      worstVenue: locArr.length > 0 ? locArr[locArr.length - 1] : null,
                  };
              }
          } catch (bankrollErr) {
              console.warn('[JarvisInsights] Bankroll enrichment failed:', bankrollErr.message);
              bankrollUnavailable = true;
          }

          return res.status(200).json({
              success: true,
              partial: bankrollUnavailable,
              unavailableSources: bankrollUnavailable ? ['bankroll'] : [],
              insights: {
                  overview: {
                      totalSessions: sessions.length,
                      totalQuestions,
                      totalCorrect,
                      overallAccuracy,
                      currentStreak: streak?.current_streak || 0,
                      longestStreak: streak?.longest_streak || 0,
                      achievementsUnlocked: achievementCount || 0
                  },
                  weeklyProgress,
                  topLeaks,
                  gamePerformance,
                  personalizedInsights: insights,
                  jarvisAdvice: topLeaks.length > 0
                      ? `Focus on your ${topLeaks[0].leak} to address the largest verified position error count.`
                      : gamePerformance.length > 0
                          ? 'No position-specific weakness is supported by the current sample. Continue training to expand the evidence.'
                          : 'Complete a scored Training session to unlock personalized insights.',
                  bankroll: bankrollSummary,
              }
          });

      } catch (error) {
          console.warn('[JarvisInsights] Error:', error.message);
          return res.status(503).json({
              success: false,
              unavailable: true,
              code: 'JARVIS_VERIFIED_TRAINING_INSIGHTS_UNAVAILABLE',
              error: 'Verified training insights are temporarily unavailable',
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

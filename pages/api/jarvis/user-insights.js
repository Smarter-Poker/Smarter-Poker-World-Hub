import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🧠 JARVIS USER INSIGHTS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes training data to provide personalized insights and leak patterns
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;


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
          // Get user's training profile
          const { data: profile } = await supabase
              .from('jarvis_user_training_profile')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();

          // Get recent sessions for analysis
          const { data: recentSessions } = await supabase
              .from('jarvis_training_sessions')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(20);

          // Get streak info
          const { data: streak } = await supabase
              .from('training_streaks')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();

          // Get achievements count
          const { count: achievementCount } = await supabase
              .from('training_user_achievements')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId);

          // Analyze patterns from sessions
          const sessions = recentSessions || [];
          const totalQuestions = sessions.reduce((sum, s) => sum + (s.questions_answered || 0), 0);
          const totalCorrect = sessions.reduce((sum, s) => sum + (s.questions_correct || 0), 0);
          const avgAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions * 100).toFixed(1) : 0;

          // Analyze leaks
          const allLeaks = sessions.flatMap(s => s.leaks_detected || []);
          const leakCounts = allLeaks.reduce((acc, leak) => {
              acc[leak] = (acc[leak] || 0) + 1;
              return acc;
          }, {});
          const topLeaks = Object.entries(leakCounts || {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([leak, count]) => ({ leak, count }));

          // Analyze game performance
          const gameStats = sessions.reduce((acc, s) => {
              if (!acc[s.game_id]) {
                  acc[s.game_id] = {
                      gameName: s.game_name,
                      sessions: 0,
                      correct: 0,
                      total: 0,
                      highestLevel: 0
                  };
              }
              acc[s.game_id].sessions++;
              acc[s.game_id].correct += s.questions_correct || 0;
              acc[s.game_id].total += s.questions_answered || 0;
              acc[s.game_id].highestLevel = Math.max(acc[s.game_id].highestLevel, s.level || 0);
              return acc;
          }, {});

          const gamePerformance = Object.entries(gameStats || {}).map(([id, stats]) => ({
              gameId: id,
              gameName: stats.gameName,
              sessions: stats.sessions,
              accuracy: stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(1) : 0,
              highestLevel: stats.highestLevel
          })).sort((a, b) => b.sessions - a.sessions);

          // Calculate weekly progress
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const thisWeekSessions = sessions.filter(s => new Date(s.created_at) > weekAgo);
          const weeklyProgress = {
              sessions: thisWeekSessions.length,
              questions: thisWeekSessions.reduce((sum, s) => sum + (s.questions_answered || 0), 0),
              correct: thisWeekSessions.reduce((sum, s) => sum + (s.questions_correct || 0), 0),
              timeSpent: thisWeekSessions.reduce((sum, s) => sum + (s.time_spent_seconds || 0), 0)
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

          const strongGames = gamePerformance.filter(g => parseFloat(g.accuracy) >= 90);
          if (strongGames.length > 0) {
              insights.push({
                  type: 'strength',
                  icon: '💪',
                  title: 'Strong Area',
                  message: `You're crushing ${strongGames[0].gameName} with ${strongGames[0].accuracy}% accuracy!`
              });
          }

          const weakGames = gamePerformance.filter(g => parseFloat(g.accuracy) < 70 && g.sessions >= 2);
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
          try {
              // Get recent bankroll entries for this user
              const { data: bankrollEntries } = await supabase
                  .from('bankroll_ledger')
                  .select('net_result, category, start_time, end_time, entry_date, stakes')
                  .eq('user_id', userId)
                  .eq('is_revision', false)
                  .order('entry_date', { ascending: false })
                  .limit(100);

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
                  const { data: locationStats } = await supabase
                      .from('bankroll_ledger')
                      .select('location_id, net_result, bankroll_locations(name)')
                      .eq('user_id', userId)
                      .eq('is_revision', false)
                      .not('location_id', 'is', null)
                          .limit(500);

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
          }

          return res.status(200).json({
              success: true,
              insights: {
                  overview: {
                      totalSessions: profile?.total_sessions || sessions.length,
                      totalQuestions: profile?.total_questions || totalQuestions,
                      totalCorrect: profile?.total_correct || totalCorrect,
                      overallAccuracy: avgAccuracy,
                      currentStreak: streak?.current_streak || 0,
                      longestStreak: streak?.longest_streak || 0,
                      achievementsUnlocked: achievementCount || 0
                  },
                  weeklyProgress,
                  topLeaks,
                  gamePerformance,
                  personalizedInsights: insights,
                  jarvisAdvice: insights.length > 0
                      ? `Focus on your ${topLeaks[0]?.leak || 'fundamentals'} to see the biggest improvement.`
                      : 'Keep training to unlock personalized insights!',
                  bankroll: bankrollSummary,
              }
          });

      } catch (error) {
          console.warn('[JarvisInsights] Error:', error.message);
          return res.status(500).json({ success: false, error: 'Failed to generate insights' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
